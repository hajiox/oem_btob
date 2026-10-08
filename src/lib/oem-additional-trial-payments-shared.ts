import type { TrialPrepaymentSnapshot } from './oem-trial-payments-shared'

export type AdditionalTrialPayment = {
  id: string
  trial_id: string
  lead_id: string
  prepayment_id: string
  taxable_amount: number
  tax_amount: number
  gross_amount: number
  status: 'awaiting_payment' | 'paid' | 'void'
  invoice_number: string
  snapshot: TrialPrepaymentSnapshot
  created_at: string
  paid_at: string | null
  void_reason: string | null
}
export type AdditionalTrialReceipt = {
  id: string
  payment_id: string
  request_id: string
  amount: number
  paid_on: string
  payer_name: string
  note: string | null
  confirmed_by: string
  created_at: string
}
export type AdditionalTrialPaymentData = AdditionalTrialPayment & {
  invoiceUrl: string
  receipts: AdditionalTrialReceipt[]
}
