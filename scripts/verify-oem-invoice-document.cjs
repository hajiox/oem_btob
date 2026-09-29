/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const assert = require('node:assert/strict')
function load(file) {
  const source = fs.readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', output)(name => load(path.resolve(path.dirname(file), name + '.ts')), loaded, loaded.exports)
  return loaded.exports
}
const { invoiceTotals } = load(path.resolve('src/lib/oem-invoices-shared.ts'))
const { invoiceDocument } = load(path.resolve('src/lib/oem-invoice-document.ts'))
const deposit = invoiceTotals('deposit', 100000, 6000, 0)
assert.deepEqual(deposit, { netTotal: 106000, tax8: 8000, tax10: 600, grossTotal: 114600, amountDue: 57300 })
const balance = invoiceTotals('balance', 110000, 6000, 0, 57300)
assert.equal(balance.amountDue, 68100)
assert.equal(invoiceTotals('deposit', 101, 11, 0).amountDue, 60)
for (const bad of [-1, NaN, Infinity, 1.5, 100000001]) assert.throws(() => invoiceTotals('deposit', bad, 0, 0))
assert.throws(() => invoiceTotals('balance', 100, 0, 0, 200))
assert.throws(() => invoiceTotals('deposit', 0, 0, 0))
const invoice = { invoice_number: 'INV-TEST', snapshot: { ...balance, taxable8: 110000, taxable10: 6000, nonTaxable: 0, depositReceived: 57300, version: 1, stage: 'balance', demo: true,
  companyName: '<script>bad()</script>', contactName: 'テスト', email: 'test@example.invalid', issuedDate: '2026-09-29', dueDate: '2026-10-10', orderNumber: 'TEST', description: '試験\n食品 & 包装',
  issuer: { name: '発行会社', address: '日本', email: 'test@example.invalid', registrationNumber: '', bankName: '銀行', branchName: '支店', accountType: '普通', accountNumber: '0000000', accountHolder: 'テスト' } } }
const html = invoiceDocument(invoice, 'nonce-test')
assert(html.includes('¥68,100') && html.includes('¥-57,300'))
assert(html.includes('&lt;script&gt;bad()&lt;/script&gt;') && !html.includes('<script>bad()'))
assert(html.includes('試験\n食品 &amp; 包装'))
assert(html.includes('動作テスト用の見本') && html.includes('noindex,nofollow,noarchive'))
assert(!html.includes('登録番号：'))
assert(html.includes('@media print') && !/<(?:img|iframe)\b|src="https?:/i.test(html))
assert(invoiceDocument(invoice, 'n', true).includes('キャンセル済み'))
console.log('Invoice arithmetic + document: 18 boundary/escaping/print checks passed')
