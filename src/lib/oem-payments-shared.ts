export type PaymentStage = 'deposit' | 'balance'

export type PaymentPlan = {
  id: string
  order_id: string
  stage: PaymentStage
  expected_amount: number
  due_date: string | null
  payer_name: string
  updated_at: string
  invoiced?: boolean
}

export type PaymentReceipt = {
  id: string
  plan_id: string
  amount: number
  paid_on: string
  payer_name: string
  note: string
  confirmed_by: string
  created_at: string
}

export type PaymentData = { plans: PaymentPlan[]; receipts: PaymentReceipt[] }

export type PaymentAlert = {
  order_id: string | null
  lead_id: string
  order_number: string
  company_name: string
  stage: PaymentStage | 'trial' | 'trial-extra'
  expected_amount: number | null
  received_amount: number
  due_date: string | null
  kind: 'unconfigured' | 'waiting' | 'overdue' | 'excess'
  trial_id?: string
  trial_status?: 'awaiting_payment' | 'paid' | 'void'
  invoice_number?: string
  invoice_url?: string
}
