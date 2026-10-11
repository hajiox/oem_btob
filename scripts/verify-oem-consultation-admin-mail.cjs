/* Local consultation receipt, admin rendering and reply contract checks. No live sends. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(file, aliases = {}) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const mod = new Module(require.resolve('../package.json'))
  mod.filename = path.resolve(file); mod.paths = Module._nodeModulePaths(process.cwd())
  mod.require = id => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : require(id)
  mod._compile(out, mod.filename)
  return mod.exports
}
const chain = result => {
  const query = {}
  for (const method of ['select', 'eq', 'neq', 'order', 'is', 'limit']) query[method] = () => query
  query.single = query.maybeSingle = () => Promise.resolve(result)
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return query
}

;(async () => {
  const pricing = load('src/lib/oem-offer-pricing.ts')
  const pages = { email_from_name: '会津ブランド館', email_from_address: 'from@example.invalid', admin_notification_email: 'admin@example.invalid', customer_email_subject: 'CUSTOM_QUOTE_SUBJECT', admin_email_subject: 'CUSTOM_QUOTE_ADMIN', customer_email_intro: 'CUSTOM_QUOTE_INTRO', customer_email_closing: 'CUSTOM_QUOTE_CLOSING', admin_email_intro: 'CUSTOM_QUOTE_ADMIN_INTRO' }
  const mail = load('src/lib/oem-mail.ts', { '@/lib/supabase/admin': { adminClient: { from: () => chain({ data: pages, error: null }) } }, '@/lib/oem-offer-pricing': pricing, resend: { Resend: class { constructor() { throw new Error('Live mail must not be constructed') } } } })
  const input = { pageId: 'oem-page', companyName: '<会社>', contactName: '担当&名', email: 'buyer@example.invalid', phone: '', notes: '<script>x</script>\n任意補足', estimatedTotalPrice: null, intakeKind: 'consultation', consultationTheme: 'まずは相談<&>', selectedOptions: [{ question: '商品', answer: '未定' }, { question: '受付区分', answer: '相談のみ・見積未算定' }] }
  const consultation = await mail.buildOemMailPayloads(input)
  for (const payload of [consultation.customer, consultation.admin]) {
    assert.match(payload.subject, /相談/)
    assert.match(payload.subject, /未算定/)
    assert.match(payload.html, /相談のみ・見積未算定/)
    assert.match(payload.html, /試作への承諾、費用の請求、製造発注は行われません/)
    assert.match(payload.html, /まずは相談&lt;&amp;&gt;/)
    assert.match(payload.html, /&lt;script&gt;x&lt;\/script&gt;<br>任意補足/)
    assert.doesNotMatch(payload.html, /¥|￥|0円|CUSTOM_QUOTE|製造概算|全額先入金/)
  }
  assert.equal(consultation.customer.to, input.email)
  assert.equal(consultation.customer.replyTo, pages.email_from_address)
  assert.equal(consultation.admin.to, pages.admin_notification_email)
  assert.equal(consultation.admin.replyTo, input.email)
  const quote = await mail.buildOemMailPayloads({ ...input, intakeKind: 'quote', estimatedTotalPrice: 46000 })
  assert.equal(quote.customer.subject, pages.customer_email_subject)
  assert.equal(quote.admin.subject, pages.admin_email_subject)
  assert.match(quote.customer.html, /製造概算：¥46,000/)
  assert.match(quote.customer.html, /CUSTOM_QUOTE_INTRO/)
  assert.match(quote.customer.html, /CUSTOM_QUOTE_CLOSING/)
  await assert.rejects(() => mail.buildOemMailPayloads({ ...input, intakeKind: 'quote' }), /mail_estimate_invalid/)
  await assert.rejects(() => mail.buildOemMailPayloads({ ...input, estimatedTotalPrice: 0 }), /mail_estimate_invalid/)
  assert.equal(pricing.getOemManufacturingEstimate({ estimated_total_price: null, selected_options: [{ question: '商品小計(税抜)', answer: '¥50,000' }, { question: '送料・発送梱包手数料(税抜・1注文につき)', answer: '¥6,000' }] }), undefined, 'uncalculated amounts must not be inferred from a line item')
  assert.equal(pricing.getOemManufacturingEstimate({ intake_kind: 'consultation', estimated_total_price: 0, selected_options: [] }), undefined)
  assert.equal(pricing.getOemManufacturingEstimate({ intake_kind: 'quote', estimated_total_price: 46000, selected_options: [] }), 46000)

  const leaf = name => props => React.createElement('div', { 'data-component': name, ...(name === 'OemOrderPanel' ? { 'data-estimate': props.estimatedTotalPrice == null ? 'uncalculated' : String(props.estimatedTotalPrice) } : {}) })
  let expanded = false, workflowsOpen = false, hookIndex = 0
  const adminAliases = {
    react: { ...React, useState: initial => [hookIndex++ === 0 ? expanded : hookIndex === 3 ? workflowsOpen : initial, () => {}] },
    '@/actions/dashboard': { deleteLead: () => { throw new Error('Must not mutate a lead') } },
    '@/lib/oem-quote-validation': { OEM_PAGE_ID: 'oem-page' },
  }
  for (const name of ['LeadStatusSelect', 'OemLeadCasePanel', 'OemMailPanel', 'OemConversationPanel', 'OemOrderPanel', 'OemTrialPanel']) adminAliases[`./${name}`] = { [name]: leaf(name) }
  const { LeadRow } = load('src/components/admin/LeadRow.tsx', adminAliases)
  const lead = { id: 'lead', page_id: 'oem-page', intake_kind: 'consultation', consultation_theme: 'undecided', company_name: 'Fixture', contact_name: 'Tester', email: input.email, phone: null, notes: '任意補足', selected_options: input.selectedOptions, estimated_total_price: null, status: 'new', created_at: '2026-10-11T00:00:00.000Z', updated_at: '', followupAt: null, followupOverdue: false, mailAttention: false }
  const renderLead = row => { hookIndex = 0; return renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null, React.createElement(LeadRow, { lead: row })))) }
  const closed = renderLead(lead)
  assert.match(closed, /相談のみ・見積未算定/)
  assert.doesNotMatch(closed, /¥0|￥0/)
  expanded = true
  const receipt = renderLead(lead)
  assert.match(receipt, /ご相談の受付内容/)
  assert.match(receipt, /data-component="OemMailPanel"/)
  assert.match(receipt, /data-component="OemConversationPanel"/)
  assert.doesNotMatch(receipt, /data-component="OemOrderPanel"|data-component="OemTrialPanel"/)
  workflowsOpen = true
  const opened = renderLead(lead)
  assert.match(opened, /data-component="OemOrderPanel" data-estimate="uncalculated"/)
  assert.match(opened, /data-component="OemTrialPanel"/)
  workflowsOpen = false
  const quoteRow = renderLead({ ...lead, intake_kind: 'quote', estimated_total_price: 46000 })
  assert.match(quoteRow, /¥46,000/)
  assert.match(quoteRow, /data-component="OemOrderPanel" data-estimate="46000"/)

  const shared = load('src/lib/oem-order-shared.ts')
  const templates = load('src/lib/oem-reply-templates.ts', { '@/lib/oem-conversations': { mailSubject: subject => subject }, '@/lib/oem-offer-pricing': pricing, '@/lib/oem-order-shared': shared })
  const replyLead = { id: 'lead', email: input.email, company_name: 'Fixture', contact_name: 'Tester' }
  const baseContext = { lead: replyLead, intakeKind: 'consultation', consultationOnly: true, order: null, fulfillment: null, plans: [], receiptTotals: { deposit: 0, balance: 0 }, settlement: null, cashNet: 0, ledgerReceived: 0, settlementRemaining: null, legacyCancellation: false, draft: null, inbound: null, question: '', sourceSubject: null, warnings: [], selectedOptions: [{ question: '相談テーマ', answer: 'まずは相談したい' }] }
  for (const id of ['acknowledge', 'trial', 'payment', 'progress', 'shipping', 'settlement']) {
    const reply = templates.buildReplyTemplate(baseContext, id)
    assert.match(reply.text, /相談のみ・見積未算定/)
    assert.doesNotMatch(reply.text, /先入金|¥|￥|0円/)
    assert(reply.facts.some(fact => fact.includes('概算見積未算定')))
  }
  const afterOrder = templates.buildReplyTemplate({ ...baseContext, consultationOnly: false, order: { id: 'order', status: 'issued', formal_quote_amount: 50000, deposit_amount: 25000, final_amount: null } }, 'payment')
  assert(afterOrder.facts.includes('正式見積額（税別）：¥50,000'), 'formal business steps remain available after a consultation')

  let prepayment = null, prepaymentError = null
  const db = { from: table => {
    const values = { leads: { selected_options: baseContext.selectedOptions, intake_kind: 'consultation', consultation_theme: 'undecided' }, oem_orders: [], oem_conversation_drafts: null, oem_conversation_messages: [], oem_trial_prepayments: prepayment }
    assert(Object.hasOwn(values, table), `unexpected table ${table}`)
    return chain({ data: values[table], error: table === 'oem_trial_prepayments' ? prepaymentError : null })
  } }
  const context = load('src/lib/oem-reply-context.ts', { 'server-only': {}, '@/lib/supabase/admin': { adminClient: db }, '@/lib/oem-terms': { OEM_TERMS_VERSION: 'mock' }, '@/lib/oem-reply-assist-shared': { replyTemplateId: id => id }, '@/lib/oem-reply-templates': templates })
  const beforeTrial = await context.prepareReplyContext(replyLead, 'payment')
  assert.match(beforeTrial.text, /相談のみ・見積未算定/)
  prepayment = { id: 'prepayment', status: 'awaiting_payment', gross_amount: 11000 }
  const afterTrial = await context.prepareReplyContext(replyLead, 'payment')
  assert.match(afterTrial.text, /試作前払いの請求額（税込）：¥11,000/)
  assert.doesNotMatch(afterTrial.text, /5,500|5,000/)
  const trialReply = await context.prepareReplyContext(replyLead, 'trial')
  assert.match(trialReply.text, /試作前払いの請求額（税込）：¥11,000/)
  assert.notEqual(beforeTrial.contextSnapshot, afterTrial.contextSnapshot, 'separate trial billing invalidates an old consultation reply snapshot')
  prepaymentError = new Error('mock unavailable')
  await assert.rejects(() => context.prepareReplyContext(replyLead, 'payment'), /試作前払いの状態/)
  console.log('OEM consultation admin/mail checks: PASS (uncalculated receipt, escaped fields, quote preservation, admin visibility, explicit business controls, reply facts and lifecycle snapshots; no live sends)')
})().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
