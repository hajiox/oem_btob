/* eslint-disable @typescript-eslint/no-require-imports */
// Read-only accounting CSV validation. This script never mutates Supabase.
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
const actionSource = fs.readFileSync('src/actions/oemDocuments.ts', 'utf8')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const assert = (value, message) => { if (!value) throw new Error(message) }
function loadAccounting() {
  const source = fs.readFileSync('src/lib/oem-accounting-csv.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(`(function(mod,exports){${code}\n})(mod,mod.exports)`, { mod, console })
  return mod.exports
}
function env(name) {
  const text = fs.readFileSync('.env.local', 'utf8'); const line = text.split(/\r?\n/).find(row => row.startsWith(`${name}=`)); if (!line) return undefined
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n/g, '')
}
async function main() {
  const { accountantDateRange, accountantCsvCell, accountantCsv } = loadAccounting()
  assert(accountantDateRange('2026-09-30', '2026-10-01').since === '2026-09-29T15:00:00.000Z', 'JST start boundary')
  assert(accountantDateRange('2026-09-30', '2026-10-01').until === '2026-10-01T15:00:00.000Z', 'JST inclusive end boundary')
  for (const value of ['2026-02-30', '2026-13-01', 'bad']) { let failed = false; try { accountantDateRange(value) } catch { failed = true } assert(failed, `invalid actual date rejected: ${value}`) }
  let failed = false; try { accountantDateRange('2026-10-02', '2026-10-01') } catch { failed = true } assert(failed, 'start after end rejected')
  for (const value of ['=SUM(A1:A2)', '+cmd', '-cmd', '@cmd', '  =cmd', '\t=cmd', '\n=cmd']) assert(accountantCsvCell(value).startsWith('"\''), `formula/leading-control escaped: ${JSON.stringify(value)}`)
  assert(accountantCsvCell('a"b') === '"a""b"', 'CSV quote escaping')
  const csv = accountantCsv([['date', '=1+1'], ['2026-10-01', 'x']]); assert(csv.startsWith('\uFEFF') && csv.endsWith('\r\n') && csv.includes('\r\n'), 'BOM and CRLF')
  assert(actionSource.includes(".eq('leads.page_id', OEM_ACCOUNTING_PAGE)") && actionSource.includes(".eq('oem_payment_plans.oem_orders.leads.page_id', OEM_ACCOUNTING_PAGE)") && actionSource.includes(".eq('oem_orders.leads.page_id', OEM_ACCOUNTING_PAGE)"), 'stable OEM page filters')
  assert(actionSource.includes("oem_trial_prepayment_invoices") && actionSource.includes("oem_trial_prepayment_receipts") && actionSource.includes("'試作費請求'") && actionSource.includes("'試作費銀行入金'") && actionSource.includes("'trial'"), 'trial prepayment accounting rows are wired')
  const paymentSource=fs.readFileSync('src/actions/oemPayments.ts','utf8')
  assert(paymentSource.includes("count: 'exact'") && paymentSource.includes('snapshot.dueDate') && paymentSource.includes('received_amount'), 'trial alert aggregation, total count and due date are wired')
  const url = env('NEXT_PUBLIC_SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY'); assert(url && key, 'Supabase readonly credentials configured')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const invoice = await supabase.from('oem_invoices').select('id,invoice_number,stage,snapshot,issued_at,lifecycle_status,leads!inner(page_id)').eq('leads.page_id', PAGE).order('issued_at', { ascending: true }).order('id', { ascending: true }).range(0, 0)
  assert(!invoice.error, `invoice readonly join: ${invoice.error?.message || ''}`)
  const receipts = await supabase.from('oem_payment_receipts').select('id,amount,paid_on,oem_payment_plans!inner(order_id,stage,oem_orders!inner(order_number,leads!inner(company_name,page_id)))').eq('oem_payment_plans.oem_orders.leads.page_id', PAGE).order('paid_on', { ascending: true }).order('id', { ascending: true }).range(0, 0)
  assert(!receipts.error, `receipt readonly nested join: ${receipts.error?.message || ''}`)
  const cash = await supabase.from('oem_settlement_cash').select('id,order_id,direction,amount,happened_on,oem_orders!inner(order_number,leads!inner(company_name,page_id))').eq('oem_orders.leads.page_id', PAGE).order('happened_on', { ascending: true }).order('id', { ascending: true }).range(0, 0)
  assert(!cash.error, `cash readonly nested join: ${cash.error?.message || ''}`)
  const trialInvoices = await supabase.from('oem_trial_prepayment_invoices').select('id,invoice_number,snapshot,issued_at,lifecycle_status,oem_trial_prepayments!inner(status),leads!inner(company_name,page_id)').eq('leads.page_id', PAGE).order('issued_at', { ascending: true }).order('id', { ascending: true }).range(0, 0)
  assert(!trialInvoices.error, `trial invoice readonly join: ${trialInvoices.error?.message || ''}`)
  const trialReceipts = await supabase.from('oem_trial_prepayment_receipts').select('id,amount,paid_on,oem_trial_prepayments!inner(gross_amount,lead_id,oem_trial_prepayment_invoices(invoice_number),leads!inner(company_name,page_id))').eq('oem_trial_prepayments.leads.page_id', PAGE).order('paid_on', { ascending: true }).order('id', { ascending: true }).range(0, 0)
  assert(!trialReceipts.error, `trial receipt readonly nested join: ${trialReceipts.error?.message || ''}`)
  const trialAlerts=await supabase.from('oem_trial_prepayments').select('id,lead_id,gross_amount,status,created_at,leads!inner(company_name,page_id),oem_trial_prepayment_invoices!inner(id,invoice_number,lifecycle_status,snapshot),oem_trial_prepayment_receipts(amount)', {count:'exact'}).eq('leads.page_id',PAGE).eq('status','awaiting_payment').order('created_at').order('id').range(0,0)
  assert(!trialAlerts.error, `trial alert readonly join: ${trialAlerts.error?.message || ''}`)
  const activeTrialInvoices=await supabase.from('oem_trial_prepayment_invoices').select('id,prepayment_id,lead_id,invoice_number,snapshot,issued_at,lifecycle_status,oem_trial_prepayments!inner(status)').neq('oem_trial_prepayments.status','void').range(0,0)
  assert(!activeTrialInvoices.error, `active trial invoice readonly join: ${activeTrialInvoices.error?.message || ''}`)
  const extraInvoices=await supabase.from('oem_additional_trial_payments').select('id,invoice_number,snapshot,status,created_at,leads!inner(company_name,page_id)').eq('leads.page_id',PAGE).order('created_at').order('id').range(0,0)
  assert(!extraInvoices.error, `additional trial invoice readonly join: ${extraInvoices.error?.message || ''}`)
  const extraReceipts=await supabase.from('oem_additional_trial_payment_receipts').select('id,amount,paid_on,oem_additional_trial_payments!inner(invoice_number,leads!inner(company_name,page_id))').eq('oem_additional_trial_payments.leads.page_id',PAGE).order('paid_on').order('id').range(0,0)
  assert(!extraReceipts.error, `additional trial receipt readonly nested join: ${extraReceipts.error?.message || ''}`)
  const extraAlerts=await supabase.from('oem_additional_trial_payments').select('id,lead_id,gross_amount,status,invoice_number,snapshot,created_at,leads!inner(company_name,page_id),oem_additional_trial_payment_receipts(amount)', {count:'exact'}).eq('leads.page_id',PAGE).eq('status','awaiting_payment').order('created_at').order('id').range(0,0)
  assert(!extraAlerts.error, `additional trial alert readonly join: ${extraAlerts.error?.message || ''}`)
  assert(actionSource.includes("'追加試作費請求'") && actionSource.includes("'追加試作費銀行入金'") && paymentSource.includes("stage: 'trial-extra'"), 'additional trial accounting and alerts are wired')
  console.log(`OEM accounting CSV verification: passed (JST inclusive bounds, date validation, formula/control escaping, BOM/CRLF, stable OEM filters, readonly invoice/receipt/cash/trial joins)`)
}
main().catch(error => { console.error('OEM accounting CSV verification failed:', error.message); process.exitCode = 1 })
