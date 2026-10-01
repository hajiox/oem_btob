import type { PaymentStage } from './oem-payments-shared'

export type InvoiceIssuer = {
  name: string; address: string; email: string; registrationNumber: string
  bankName: string; branchName: string; accountType: string; accountNumber: string; accountHolder: string
}
export type InvoiceInput = {
  requestId: string; stage: PaymentStage; dueDate: string; description: string
  taxable8: number; taxable10: number; nonTaxable: number; issuer: InvoiceIssuer
}
export type InvoiceSnapshot = {
  version: 1; orderNumber: string; stage: PaymentStage; companyName: string; contactName: string; email: string
  issuedDate: string; dueDate: string; description: string; issuer: InvoiceIssuer
  taxable8: number; taxable10: number; nonTaxable: number; tax8: number; tax10: number
  netTotal: number; grossTotal: number; depositReceived: number; amountDue: number; demo: boolean
}
export type OemInvoice = {
  id: string; order_id: string; lead_id: string; plan_id: string; stage: PaymentStage
  invoice_number: string; snapshot: InvoiceSnapshot; issued_at: string
  send_request_id: string; mail_status?: string | null
  lifecycle_status?: 'active' | 'superseded' | 'void'; void_reason?: string
  voided_at?: string | null; superseded_by?: string | null; revision_of?: string | null; revision_no?: number
}
export type InvoiceResult = { success: boolean; error?: string; message?: string; uncertain?: boolean; invoice?: OemInvoice }
export const INVOICE_CHANGED = 'oem-invoice-changed'
export const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`

export function invoiceTotals(stage: PaymentStage, taxable8: number, taxable10: number, nonTaxable: number, depositReceived = 0) {
  const values = [taxable8, taxable10, nonTaxable, depositReceived]
  if (values.some(v => !Number.isSafeInteger(v) || v < 0 || v > 100_000_000)) throw new Error('金額は0〜1億円の整数で入力してください')
  const netTotal = taxable8 + taxable10 + nonTaxable
  const tax8 = Math.floor(taxable8 * 8 / 100), tax10 = Math.floor(taxable10 * 10 / 100)
  const grossTotal = netTotal + tax8 + tax10
  const amountDue = stage === 'deposit' ? Math.floor(grossTotal / 2) : grossTotal - depositReceived
  if (netTotal < 1 || grossTotal > 100_000_000 || amountDue <= 0) throw new Error('請求額は1円以上が必要です。精算・返金が必要な案件は個別に確認してください')
  return { netTotal, tax8, tax10, grossTotal, amountDue }
}

export type InvoiceRevisionInput = {
  invoiceId: string; requestId: string; stage: PaymentStage; amountDue: number
  issuer?: Partial<InvoiceIssuer>; description?: string; dueDate?: string
}
