const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const ReactDOMServer = require('react-dom/server')

const root = path.resolve(__dirname, '..')
const panelPath = path.join(root, 'src', 'components', 'admin', 'OemAdditionalTrialPaymentPanel.tsx')
const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === '@/actions/oemAdditionalTrialPayments') return { recordOemAdditionalTrialReceipt: async () => ({ success: true }), voidOemAdditionalTrialPayment: async () => ({ success: true }) }
  if (request === './OemPaymentPanel') return { PAYMENT_CHANGED: 'oem-payment-changed' }
  return originalLoad.call(this, request, parent, isMain)
}

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function transpile(module, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs }, fileName: filename }).outputText
    module._compile(output, filename)
  }
}

const { OemAdditionalTrialPaymentPanel } = require(panelPath)
const base = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', trial_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', lead_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', prepayment_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', taxable_amount: 3000, tax_amount: 300, gross_amount: 3300, invoice_number: 'EXTRA-20261008-ABCDEFG1', snapshot: {}, created_at: '2026-10-08T00:00:00.000Z', paid_at: null, void_reason: null, invoiceUrl: 'https://example.test/invoice', receipts: [] }
function render(overrides) { return ReactDOMServer.renderToStaticMarkup(React.createElement(OemAdditionalTrialPaymentPanel, { payment: { ...base, ...overrides }, onChanged: async () => {} })) }
function assert(condition, message) { if (!condition) throw new Error(message) }

const awaiting = render({ status: 'awaiting_payment' })
assert(awaiting.includes('税別3,000円（税込3,300円）'), 'awaiting must show 3,000 net / 3,300 gross')
assert(awaiting.includes('お支払期限は請求書をご確認ください。'), 'awaiting must show invoice due-date guidance')
assert(awaiting.includes('銀行明細で入金日・金額・名義を確認しました'), 'awaiting must show bank-confirmation checkbox')
assert(/<button[^>]*disabled[^>]*>[^<]*入金確認を記録/.test(awaiting), 'receipt button must be disabled before bank confirmation/input')
assert(awaiting.includes('顧客用請求書URLを表示'), 'awaiting must show invoice URL')

const partial = render({ status: 'awaiting_payment', receipts: [{ id: 'r1', payment_id: base.id, request_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', amount: 1000, paid_on: '2026-10-08', payer_name: 'テスト', note: '', confirmed_by: 'admin', created_at: '2026-10-08T00:00:00.000Z' }] })
assert(partial.includes('入金合計：1,000円'), 'partial must show received amount')
assert(!partial.includes('未入金の追加試作請求を取り下げ'), 'partial payment must not show void button')

const paid = render({ status: 'paid', paid_at: '2026-10-08T01:00:00.000Z', receipts: [{ id: 'r1', payment_id: base.id, request_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', amount: 3300, paid_on: '2026-10-08', payer_name: 'テスト', note: '', confirmed_by: 'admin', created_at: '2026-10-08T00:00:00.000Z' }] })
assert(paid.includes('入金確認済み'), 'paid must show paid state')
assert(!paid.includes('銀行明細で入金日・金額・名義を確認しました'), 'paid must not show receipt form')
assert(!paid.includes('入金確認を記録'), 'paid must not show receipt button')

const voided = render({ status: 'void', invoiceUrl: '', void_reason: '重複請求のため取り下げ' })
assert(voided.includes('取り下げ済み・URL無効'), 'void must show invalid URL state')
assert(voided.includes('理由：重複請求のため取り下げ'), 'void must show reason')
assert(!voided.includes('顧客用請求書URLを表示'), 'void must not show invoice URL')

console.log(JSON.stringify({ success: true, fixtures: ['awaiting', 'partial', 'paid', 'void'], assertions: 14 }))
