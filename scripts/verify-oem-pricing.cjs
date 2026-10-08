/* Executable OEM pricing regression checks. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const sourceRoot = path.join(root, 'src')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const previousTsLoader = Module._extensions['.ts']
const previousResolver = Module._resolveFilename
const previousLoader = Module._load
Module._extensions['.ts'] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText
  mod._compile(output, filename)
}
Module._resolveFilename = function resolve(request, parent, isMain, options) {
  if (request.startsWith('@/')) request = path.join(sourceRoot, request.slice(2))
  return previousResolver.call(this, request, parent, isMain, options)
}
Module._load = function load(request, parent, isMain) {
  if (request === '@/lib/supabase/admin') {
    const page = { email_from_name: 'Fixture', email_from_address: 'fixture@example.invalid', admin_notification_email: 'admin@example.invalid', customer_email_subject: 'fixture', admin_email_subject: 'fixture', customer_email_intro: '', customer_email_closing: '', admin_email_intro: '' }
    return { adminClient: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: page, error: null }) }) }) }) } }
  }
  return previousLoader.call(this, request, parent, isMain)
}
const loadTs = relative => require(path.join(root, relative))

;(async () => {
try {
  const validation = loadTs('src/lib/oem-quote-validation.ts')
  const pricing = loadTs('src/lib/oem-offer-pricing.ts')
  assert.equal(pricing.OEM_NORMAL_OFFER_VALUE, 50000)
  assert.equal(pricing.OEM_INITIAL_OFFER_FEE, 5000)
  assert.equal(pricing.OEM_ADDITIONAL_TRIAL_FEE, 3000)
  assert.equal(validation.SHIPPING_PACKING_FEE, 6000)

  const product = (id, basePrice, name = 'fixture') => ({ id, page_id: validation.OEM_PAGE_ID, is_visible: true, name, base_price: basePrice, base_price_type: 'fixed' })
  const option = (id, questionId, label, priceModifier, goToEstimate = false) => ({ id, question_id: questionId, label, price_modifier: priceModifier, price_modifier_type: 'fixed', go_to_estimate: goToEstimate, next_step_id: null })
  const radio = (id, label, priceModifier) => ({ id: `q-${id}`, question_text: id, input_type: 'radio', is_required: true, order_index: 0, depends_on_option_id: null, options: [option(`o-${id}`, `q-${id}`, label, priceModifier)] })
  const snapshot = (p, questions) => ({ product: p, steps: [{ id: `s-${p.id}`, product_id: p.id, page_id: validation.OEM_PAGE_ID, is_visible: true, order_index: 0, questions }] })
  const run = (p, questions, answers) => validation.validateOemQuote(snapshot(p, questions), answers)

  const curry = run(product('c0000001-0000-0000-0000-000000000001', 100, 'fixture curry'), [radio('packaging', 'standard', 0)], { 'q-packaging': 'o-packaging' })
  assert.equal(curry.error, undefined)
  assert.deepEqual({ subtotal: curry.subtotal, offerFee: curry.offerFee, total: curry.total, quantity: curry.quantity }, { subtotal: 40000, offerFee: 5000, total: 46000, quantity: 400 })

  const ramen = run(product('c0000001-0000-0000-0000-000000000002', 120, 'fixture ramen'), [radio('packaging', 'standard', 0)], { 'q-packaging': 'o-packaging' })
  assert.equal(ramen.error, undefined)
  assert.deepEqual({ subtotal: ramen.subtotal, offerFee: ramen.offerFee, total: ramen.total, quantity: ramen.quantity, quantityUnit: ramen.quantityUnit }, { subtotal: 48000, offerFee: 5000, total: 54000, quantity: 400, quantityUnit: 'セット' })

  const teaProduct = product('c0000001-0000-0000-0000-000000000006', 0, 'fixture tea')
  const teaQuestions = [
    { id: 'q-supply', question_text: '原料をご支給いただけますか？', input_type: 'radio', is_required: true, order_index: 0, depends_on_option_id: null, options: [option('o-supply', 'q-supply', 'ある', 0)] },
    { id: 'q-name', question_text: '原料名', input_type: 'text', is_required: true, order_index: 1, depends_on_option_id: null, options: [] },
    { id: 'q-plan', question_text: '製造・包装プラン', input_type: 'radio', is_required: true, order_index: 2, depends_on_option_id: null, options: [option('o-plan', 'q-plan', '50包×100袋（5000包）', 2500)] },
  ]
  const tea = run(teaProduct, teaQuestions, { 'q-supply': 'o-supply', 'q-name': '桑の葉', 'q-plan': 'o-plan' })
  assert.equal(tea.error, undefined)
  assert.deepEqual({ subtotal: tea.subtotal, offerFee: tea.offerFee, total: tea.total, quantity: tea.quantity, quantityUnit: tea.quantityUnit }, { subtotal: 250000, offerFee: 5000, total: 256000, quantity: 100, quantityUnit: '袋' })

  assert.match(String(run(product('invalid', 100), [radio('x', 'x', 0)], { 'q-x': 'o-x' }).error), /商品を確認できません/)
  assert.match(String(run(product('c0000001-0000-0000-0000-000000000001', 100), [radio('x', 'x', 0)], { 'q-x': 'o-x', tampered: '999999' }).error), /現在の経路にない回答/)
  assert.match(String(run(teaProduct, teaQuestions, { 'q-supply': 'o-supply', 'q-name': '桑の葉', 'q-plan': 'o-plan', 'tampered-total': '999999' }).error), /現在の経路にない回答/)

  const calculated = pricing.calculateOemQuoteTotals({ subtotal: 40000, offerFee: pricing.OEM_INITIAL_OFFER_FEE, shippingFee: validation.SHIPPING_PACKING_FEE })
  assert.equal(calculated.subtotal, 40000)
  assert.equal(calculated.offerFee, 5000)
  assert.equal(calculated.total, 46000)
  assert.equal(calculated.trialTax, 500)
  assert.equal(calculated.trialGross, 5500)
  assert.equal(calculated.projectNetTotal, 51000)
  assert.equal(calculated.shippingFee, 6000)
  assert.deepEqual(pricing.calculateOemQuoteTotals({ subtotal: 40000, offerFee: 0, shippingFee: 6000 }), { subtotal: 40000, offerFee: 0, shippingFee: 6000, total: 46000, trialTax: 0, trialGross: 0, projectNetTotal: 46000 })
  for (const quote of [curry, ramen, tea]) {
    assert.equal(quote.total, quote.subtotal + 6000)
    assert.equal(quote.trialGross, 5500)
    assert.equal(quote.projectNetTotal, quote.total + 5000)
  }
  const oldRows = [{ question: '商品小計(税抜)', answer: '¥40,000' }, { question: '送料・発送梱包手数料(税抜・1注文につき)', answer: '¥6,000' }, { question: '試作・表示・簡易デザイン費(税抜・初回特典適用)', answer: '¥5,000' }]
  const oldLead = { estimated_total_price: 51000, selected_options: oldRows }
  assert.equal(pricing.getOemManufacturingEstimate(oldLead), 46000)
  assert.equal(oldLead.estimated_total_price, 51000, 'historical estimate stays intact')
  assert.equal(pricing.getOemManufacturingEstimate({ estimated_total_price: 51000, selected_options: [oldRows[2]] }), 46000)
  assert.equal(pricing.getOemManufacturingEstimate({ estimated_total_price: 46000, selected_options: [{ question: '試作費（別途先入金・税抜・初回特典）', answer: '¥5,000' }] }), 46000, 'new separate trial must not be subtracted twice')
  assert.equal(pricing.getOemManufacturingEstimate({ estimated_total_price: 46000, selected_options: null }), 46000)
  assert.match(read('src/components/OemQuoteResult.tsx'), /const unitCost = Math\.ceil\(productSubtotal \/ safeQuantity\)/)
  assert.match(read('src/components/InteractiveForm.tsx'), /const unitCost = Math\.ceil\(productSubtotal \/ \(oemQuantity \|\| 1\)\)/)

  const mail = loadTs('src/lib/oem-mail.ts')
  const mailPayloads = await mail.buildOemMailPayloads({ pageId: validation.OEM_PAGE_ID, companyName: 'Fixture', contactName: 'Tester', email: 'fixture@example.invalid', phone: '', notes: '', estimatedTotalPrice: 46000, offerFee: 5000, selectedOptions: [{ question: '試作費（別途先入金・税抜・初回特典）', answer: '¥5,000' }, { question: '送料', answer: '¥6,000' }] })
  for (const payload of [mailPayloads.customer, mailPayloads.admin]) {
    assert.match(payload.html, /5,000/)
    assert.match(payload.html, /6,000/)
    assert.match(payload.html, /特殊食材/)
  }
  assert.match(read('src/actions/publicForm.ts'), /offerFee/)
  const terms = loadTs('src/lib/oem-terms.ts')
  assert.match(terms.OEM_TERMS_BODY, /特殊食材/)
  assert.match(read('src/lib/oem-offer-pricing.ts'), /OEM_SPECIAL_INGREDIENT_NOTE/)
  console.log('OEM pricing runtime regression passed: curry/ramen/tea fixtures, offer and shipping arithmetic, tampered answers, invalid product, shared calculator, and special-ingredient wording.')
} finally {
  Module._extensions['.ts'] = previousTsLoader
  Module._resolveFilename = previousResolver
  Module._load = previousLoader
}
})().catch(error => { console.error(error); process.exitCode = 1 })
