/* Read-only OEM quote-validator security/contract verification. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

const PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
const TEA_ID = 'c0000001-0000-0000-0000-000000000006'
const FEE = 6000
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(x => x.includes('='))
  .map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, '')] }))

function loadValidator() {
  const source = fs.readFileSync('src/lib/oem-quote-validation.ts', 'utf8')
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(require.resolve('../package.json'))
  mod.filename = require('path').resolve('src/lib/oem-quote-validation.ts')
  mod.paths = Module._nodeModulePaths(process.cwd())
  mod._compile(out, mod.filename)
  return mod.exports
}

async function snapshot() {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: products, error: pe } = await db.from('products').select('*').eq('page_id', PAGE_ID).order('order_index')
  assert.ifError(pe)
  const result = []
  for (const product of products || []) {
    const { data: steps, error: se } = await db.from('form_steps').select('*').eq('page_id', PAGE_ID).eq('product_id', product.id).eq('is_visible', true).order('order_index')
    assert.ifError(se)
    const stepIds = (steps || []).map(s => s.id)
    const { data: questions, error: qe } = stepIds.length ? await db.from('form_questions').select('*').in('step_id', stepIds).order('order_index') : { data: [], error: null }
    assert.ifError(qe)
    const questionIds = (questions || []).map(q => q.id)
    const { data: options, error: oe } = questionIds.length ? await db.from('form_options').select('*').in('question_id', questionIds).order('order_index') : { data: [], error: null }
    assert.ifError(oe)
    result.push({ product, steps: (steps || []).map(s => ({ ...s, questions: (questions || []).filter(q => q.step_id === s.id).map(q => ({ ...q, options: (options || []).filter(o => o.question_id === q.id) })) })) })
  }
  return result
}

function enumerate(snapshot) {
  const ordered = [...snapshot.steps].sort((a, b) => a.order_index - b.order_index)
  const paths = []
  function visit(index, answers, selected) {
    if (index >= ordered.length) { paths.push(answers); return }
    const step = ordered[index]
    const questions = [...step.questions].sort((a, b) => a.order_index - b.order_index)
    function questionAt(qi, nextAnswers, nextSelected) {
      if (qi >= questions.length) {
        const go = questions.flatMap(q => q.options).find(o => nextSelected.has(o.id) && o.go_to_estimate)
        if (go) { paths.push(nextAnswers); return }
        const jump = questions.flatMap(q => q.options).find(o => nextSelected.has(o.id) && o.next_step_id)?.next_step_id
        const target = jump ? ordered.findIndex(s => s.id === jump) : -1
        visit(target >= 0 ? target : index + 1, nextAnswers, nextSelected)
        return
      }
      const q = questions[qi]
      if (q.depends_on_option_id && !nextSelected.has(q.depends_on_option_id)) return questionAt(qi + 1, nextAnswers, nextSelected)
      if (['text', 'textarea', 'number'].includes(q.input_type)) {
        // The public UI has one optional textarea path (blank); required text
        // questions have the supplied ingredient branch only.
        const values = q.input_type === 'textarea' ? [''] : ['raw ingredient']
        for (const value of values) questionAt(qi + 1, { ...nextAnswers, [q.id]: value }, nextSelected)
        return
      }
      for (const option of q.options) questionAt(qi + 1, { ...nextAnswers, [q.id]: option.id }, new Set([...nextSelected, option.id]))
    }
    questionAt(0, answers, selected)
  }
  visit(0, {}, new Set())
  return paths
}

function expected(snapshot, answers) {
  const rows = snapshot.steps.flatMap(s => s.questions).flatMap(q => {
    const v = answers[q.id]; const ids = Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
    return ids.map(id => q.options.find(o => o.id === id)).filter(Boolean)
  })
  const tea = snapshot.product.id === TEA_ID
  const quantity = tea ? (rows.some(o => o.label.includes('100袋')) ? 100 : 400) : 400
  const base = snapshot.product.base_price * quantity
  const modifiers = rows.reduce((sum, o) => sum + o.price_modifier * quantity, 0)
  return { quantity, subtotal: base + modifiers, total: base + modifiers + FEE }
}

function assertReject(fn, label) { const r = fn(); assert('error' in r, `${label}: expected rejection`) }

async function runSubmitMocks(snapshots, all) {
  const inserted = []; const sent = []
  const rows = { products: snapshots.map(x => x.product), form_steps: snapshots.flatMap(x => x.steps), form_questions: snapshots.flatMap(x => x.steps.flatMap(s => s.questions)), form_options: snapshots.flatMap(x => x.steps.flatMap(s => s.questions.flatMap(q => q.options))), pages: [] }
  function query(table) {
    let filtered = rows[table] || []; const q = { select() { return q }, eq(k, v) { filtered = filtered.filter(x => x[k] === v); return q }, in(k, v) { filtered = filtered.filter(x => v.includes(x[k])); return q }, order(k) { filtered = [...filtered].sort((a, b) => (a[k] ?? 0) - (b[k] ?? 0)); return q }, single() { return Promise.resolve({ data: filtered[0] || null, error: filtered[0] ? null : { message: 'not found' } }) }, then(resolve, reject) { return Promise.resolve({ data: filtered, error: null }).then(resolve, reject) } }; return q
  }
  const fakeDb = { from(table) { if (table === 'leads') return { insert(values) { inserted.push(...values); return Promise.resolve({ error: null }) } }; return query(table) } }
  const fakeResend = { Resend: class { constructor() {} get emails() { return { send: async payload => { sent.push(payload); return { data: { id: 'mock' }, error: null } } } } } }
  const oldResend = require.cache[require.resolve('resend')]; require.cache[require.resolve('resend')] = { exports: fakeResend }
  const source = ts.transpileModule(fs.readFileSync('src/actions/publicForm.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(require.resolve('../package.json')); mod.filename = require('path').resolve('src/actions/publicForm.ts'); mod.paths = Module._nodeModulePaths(process.cwd())
  const helper = loadValidator(); mod.require = id => id === '@/lib/supabase/server' ? { createClient: async () => fakeDb } : id === '@/lib/oem-quote-validation' ? helper : id === 'resend' ? fakeResend : require(id)
  mod._compile(source, mod.filename); const { submitLead } = mod.exports
  const candidate = all.find(x => x.s.product.id !== TEA_ID && x.s.product.id === 'c0000001-0000-0000-0000-000000000001') || all[0]
  const exp = expected(candidate.s, candidate.answers)
  const common = { pageId: PAGE_ID, companyName: '<会社>', contactName: '担当&名', email: 'buyer@example.com', phone: '', selectedOptions: [{ question: '偽装', answer: '偽装価格', type: 'text' }], estimatedTotalPrice: exp.total, quoteProductId: candidate.s.product.id, rawAnswers: candidate.answers, notes: '<script>alert(1)</script>' }
  const ok = await submitLead(common); assert.equal(ok.success, true, 'valid mocked submit rejected'); assert.equal(inserted.length, 1)
  const lead = inserted[0]; assert.equal(lead.estimated_total_price, exp.total); assert(lead.selected_options.some(x => x.question === '商品')); assert(!lead.selected_options.some(x => x.answer === '偽装価格')); assert.equal(sent.length, 2); assert(sent.every(x => !x.html.includes('<script>alert(1)</script>'))); assert(sent.some(x => x.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')))
  const teaCase = all.find(x => x.s.product.id === TEA_ID && Object.values(x.answers).some(v => typeof v === 'string' && v.includes('202')))
  assert(teaCase, 'tea valid path missing')
  const teaExp = expected(teaCase.s, teaCase.answers)
  const teaResult = await submitLead({ ...common, quoteProductId: TEA_ID, rawAnswers: teaCase.answers, estimatedTotalPrice: teaExp.total, selectedOptions: [] })
  assert.equal(teaResult.success, true, 'valid tea mocked submit rejected')
  const teaLead = inserted[1]; assert.equal(teaLead.estimated_total_price, teaExp.total); assert(teaLead.selected_options.some(x => x.question === 'OEM製造数' && String(x.answer).includes(String(teaExp.quantity))))
  const before = inserted.length; const reject = async (data, label) => { const r = await submitLead({ ...common, ...data }); assert.equal(r.success, false, `${label}: accepted`); assert.equal(inserted.length, before, `${label}: inserted before rejection`) }
  await reject({ email: 'bad-email' }, 'bad email'); await reject({ quoteProductId: 'foreign-product' }, 'bad product'); await reject({ pageId: 'foreign-page' }, 'bad page'); await reject({ estimatedTotalPrice: exp.total + 1 }, 'mismatched total'); await reject({ rawAnswers: {} }, 'incomplete path')
  if (oldResend) require.cache[require.resolve('resend')] = oldResend; else delete require.cache[require.resolve('resend')]
  console.log('submitLead mocked integration: PASS (insert/email captured in memory only)')
}

;(async () => {
  const { validateOemQuote, validateContactInfo } = loadValidator()
  const snapshots = await snapshot()
  const all = []
  for (const s of snapshots) {
    const paths = enumerate(s)
    console.log(`${s.product.name}: ${paths.length} reachable UI paths`)
    for (const answers of paths) {
      // Tea's "ない" branch intentionally has no quote route and is tested
      // below as a rejection case, not as a valid UI path.
      if (s.product.id === TEA_ID) {
        const supply = s.steps.flatMap(x => x.questions).find(x => x.question_text.includes('原料をご支給'))
        const no = supply.options.find(o => o.label === 'ない')?.id
        if (answers[supply.id] === no) continue
      }
      const out = validateOemQuote(s, answers)
      assert(!('error' in out), `${s.product.name}: valid UI path rejected: ${out.error}`)
      const exp = expected(s, answers)
      assert.equal(out.quantity, exp.quantity)
      assert.equal(out.subtotal, exp.subtotal)
      assert.equal(out.total, exp.total)
      all.push({ s, answers })
    }
  }
  assert.equal(all.length, 94, `Expected 94 valid paths, found ${all.length}`)

  const base = all[0]
  const fail = (answers, label) => assertReject(() => validateOemQuote(base.s, answers), label)
  fail({}, 'required omission')
  const q = base.s.steps.flatMap(s => s.questions).find(x => x.is_required && x.input_type === 'radio')
  fail({ [q.id]: '' }, 'blank radio')
  fail({ ['unknown-question']: 'x' }, 'unknown question ID')
  fail({ [q.id]: 'unknown-option' }, 'unknown option ID')
  fail({ [q.id]: ['unknown-option'] }, 'radio array / unknown option')
  fail({ [q.id]: [q.options[0].id, q.options[1].id] }, 'multiple radio answers')
  fail({ [q.id]: 42 }, 'wrong answer type')
  const textCase = all.find(x => x.s.steps.flatMap(s => s.questions).some(q => q.input_type === 'text' && x.answers[q.id] !== undefined))
  assert(textCase, 'enumeration must include a supplied-material text branch')
  const textQ = textCase.s.steps.flatMap(s => s.questions).find(q => q.input_type === 'text')
  assertReject(() => validateOemQuote(textCase.s, { ...textCase.answers, [textQ.id]: '   ' }), 'blank required text')
  assertReject(() => validateOemQuote(textCase.s, { ...textCase.answers, [textQ.id]: 123 }), 'wrong text answer type')
  const foreign = { ...base.s, product: { ...base.s.product, page_id: 'foreign-page' } }
  assertReject(() => validateOemQuote(foreign, base.answers), 'foreign page product')
  assertReject(() => validateOemQuote({ ...base.s, product: { ...base.s.product, is_visible: false } }, base.answers), 'hidden product')
  assertReject(() => validateOemQuote({ ...base.s, steps: [] }, {}), 'empty steps')

  const tea = snapshots.find(s => s.product.id === TEA_ID)
  const teaSupply = tea.steps.flatMap(s => s.questions).find(q => q.question_text.includes('原料をご支給'))
  const noTea = { [teaSupply.id]: teaSupply.options.find(o => o.label === 'ない').id }
  assertReject(() => validateOemQuote(tea, noTea), 'tea none')
  assert.equal(validateContactInfo({ companyName: 'A', contactName: 'B', email: 'a@example.com' }), null)
  assert.notEqual(validateContactInfo({ companyName: 'A', contactName: 'B', email: 'not-an-email' }), null)
  assert.notEqual(validateContactInfo({ companyName: 'A', contactName: 'B', email: 'a@example.com', phone: 123 }), null)
  await runSubmitMocks(snapshots, all)
  console.log(`OEM security checks: PASS (${all.length} valid paths; no DB writes/submission/email)`)
})().catch(error => { console.error('OEM security checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
