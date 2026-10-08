'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import type { PaymentAlert, PaymentData, PaymentPlan, PaymentReceipt, PaymentStage } from '@/lib/oem-payments-shared'
import { trialPrepaymentInvoiceUrl } from '@/lib/oem-trial-prepayment-invoices'

type Result = { success: boolean; error?: string; message?: string; uncertain?: boolean }
function fail(error: unknown, fallback: string): Result { return { success: false, error: error instanceof MailError ? error.message : fallback } }
function dateValue(value: unknown): string | null {
  if (value === null || value === '') return null
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '__invalid__'
}

async function orderFor(id: unknown) {
  const orderId = uuid(id)
  const { data, error } = await adminClient.from('oem_orders').select('id,lead_id').eq('id', orderId).single()
  if (error || !data) throw new MailError('正式発注が見つかりません。', 404)
  await requireOemMailLead(data.lead_id)
  return data
}

export async function getOemPayments(orderId: string): Promise<{ success: boolean; error?: string; data?: PaymentData }> {
  try {
    await requireMailAdmin(); const order = await orderFor(orderId)
    const { data: plans, error: planError } = await adminClient.from('oem_payment_plans').select('id,order_id,stage,expected_amount,due_date,payer_name,updated_at').eq('order_id', order.id).order('stage')
    if (planError) throw planError
    const planIds = (plans || []).map(row => row.id)
    const { data: receipts, error: receiptError } = planIds.length
      ? await adminClient.from('oem_payment_receipts').select('id,plan_id,amount,paid_on,payer_name,note,confirmed_by,created_at').in('plan_id', planIds).order('created_at', { ascending: true })
      : { data: [], error: null }
    if (receiptError) throw receiptError
    const { data: invoices, error: invoiceError } = await adminClient.from('oem_invoices').select('plan_id').eq('order_id', order.id)
    if (invoiceError) throw invoiceError
    return { success: true, data: { plans: (plans || []).map(plan => ({ ...plan, invoiced: invoices.some(invoice => invoice.plan_id === plan.id) })) as PaymentPlan[], receipts: (receipts || []) as PaymentReceipt[] } }
  } catch (error) { return { ...fail(error, '入金情報を取得できませんでした') } }
}

export async function saveOemPaymentPlan(orderId: string, input: { stage: PaymentStage; expectedAmount: number; dueDate: string | null; payerName: string; expectedUpdatedAt?: string }): Promise<Result> {
  try {
    const user = await requireMailAdmin(); const order = await orderFor(orderId)
    const stage = input?.stage; const amount = Number(input?.expectedAmount); const dueDate = dateValue(input?.dueDate)
    const payerName = typeof input?.payerName === 'string' ? input.payerName.trim() : ''
    if (stage !== 'deposit' && stage !== 'balance') return { success: false, error: '入金段階が不正です' }
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) return { success: false, error: '請求額を1円〜1億円の整数で入力してください' }
    if (dueDate === '__invalid__') return { success: false, error: '支払期限はYYYY-MM-DDで入力してください' }
    if (payerName.length > 200) return { success: false, error: '支払人名は200文字以内で入力してください' }
    const { data, error } = await adminClient.rpc('save_oem_payment_plan', { p_order_id: order.id, p_stage: stage, p_expected_amount: amount, p_due_date: dueDate, p_payer_name: payerName, p_expected_updated_at: input?.expectedUpdatedAt || null, p_actor: user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { conflict: '他の管理者が更新しました。最新情報を読み込んでください', receipt_exists: '入金記録済みの請求額は変更できません', state: '現在の発注状態ではこの入金予定を設定できません', invalid: '入金予定の入力内容を確認してください' }
    if (row?.result !== 'saved') return { success: false, error: messages[row?.result] || '入金予定を保存できませんでした' }
    revalidatePath('/admin/dashboard'); return { success: true, message: '入金予定を保存しました' }
  } catch (error) { return fail(error, '入金予定を保存できませんでした') }
}

export async function recordOemPayment(planId: string, input: { requestId: string; amount: number; paidOn: string; payerName: string; note: string }): Promise<Result> {
  try {
    const user = await requireMailAdmin(); const id = uuid(planId)
    const { data: plan, error: planError } = await adminClient.from('oem_payment_plans').select('id,order_id').eq('id', id).single()
    if (planError || !plan) return { success: false, error: '入金予定が見つかりません' }
    await orderFor(plan.order_id)
    const requestId = uuid(input?.requestId); const amount = Number(input?.amount); const paidOn = dateValue(input?.paidOn); const payerName = typeof input?.payerName === 'string' ? input.payerName.trim() : ''; const note = typeof input?.note === 'string' ? input.note.trim() : ''
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000 || !paidOn || paidOn === '__invalid__') return { success: false, error: '入金額・入金日は正しく入力してください' }
    if (payerName.length < 1 || payerName.length > 200 || note.length > 2000) return { success: false, error: '入金者名・備考の入力内容を確認してください' }
    const { data, error } = await adminClient.rpc('record_oem_payment_receipt', { p_plan_id: id, p_request_id: requestId, p_amount: amount, p_paid_on: paidOn, p_payer_name: payerName, p_note: note, p_confirmed_by: user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '入金内容を確認してください', state: '現在の発注状態では入金を確認できません', not_found: '入金予定が見つかりません', conflict: '送信IDが重複しています' }
    if (!['accepted', 'duplicate', 'partial', 'excess'].includes(row?.result)) return { success: false, error: messages[row?.result] || '入金を記録できませんでした' }
    revalidatePath('/admin/dashboard'); return { success: true, message: row.message }
  } catch (error) {
    if (error instanceof MailError) return fail(error, '入金を記録できませんでした')
    return { success: false, error: '入金処理の結果を確認できませんでした。同じ送信IDで再確認してください', uncertain: true }
  }
}

export async function getOemPaymentAlerts(): Promise<{ success: boolean; error?: string; items: PaymentAlert[]; total: number }> {
  try {
    await requireMailAdmin()
    const [{ data, error }, { data: trials, error: trialError, count: trialCount }] = await Promise.all([
      adminClient.rpc('get_oem_payment_alerts', { p_limit: 100, p_offset: 0 }),
      adminClient.from('oem_trial_prepayments').select('id,lead_id,gross_amount,status,created_at,leads!inner(company_name,page_id),oem_trial_prepayment_invoices!inner(id,invoice_number,lifecycle_status,snapshot),oem_trial_prepayment_receipts(amount)', { count: 'exact' }).eq('leads.page_id', '35e7d402-0443-4703-94a4-fc2873b8f933').eq('status', 'awaiting_payment').order('created_at', { ascending: true }).order('id', { ascending: true }).range(0, 99),
    ])
    if (error) throw error; if (trialError) throw trialError
    const rows = (Array.isArray(data) ? data : []) as Array<PaymentAlert & { total_count: number }>
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const trialItems: PaymentAlert[] = (trials || []).map(row => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads
      const invoice = Array.isArray(row.oem_trial_prepayment_invoices) ? row.oem_trial_prepayment_invoices[0] : row.oem_trial_prepayment_invoices
      const snapshot = invoice?.snapshot && typeof invoice.snapshot === 'object' ? invoice.snapshot as Record<string, unknown> : {}
      const received = (Array.isArray(row.oem_trial_prepayment_receipts) ? row.oem_trial_prepayment_receipts : []).reduce((sum: number, receipt: { amount?: unknown }) => sum + (Number.isSafeInteger(Number(receipt.amount)) ? Number(receipt.amount) : 0), 0)
      const dueDate = typeof snapshot.dueDate === 'string' ? snapshot.dueDate : null
      return { order_id: null, lead_id: row.lead_id, order_number: '', company_name: lead?.company_name || '', stage: 'trial', expected_amount: row.gross_amount, received_amount: received, due_date: dueDate, kind: dueDate && dueDate < today ? 'overdue' : 'waiting', trial_id: row.id, trial_status: row.status, invoice_number: invoice?.invoice_number, invoice_url: invoice?.id ? trialPrepaymentInvoiceUrl(invoice.id) : undefined }
    })
    return { success: true, items: [...trialItems, ...rows.map(row => { const { total_count, ...item } = row; void total_count; return item })], total: Number(trialCount || 0) + Number(rows[0]?.total_count || 0) }
  } catch (error) { return { ...fail(error, '入金アラートを取得できませんでした'), items: [], total: 0 } }
}
