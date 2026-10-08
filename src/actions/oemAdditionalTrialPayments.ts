'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { additionalTrialInvoiceUrl } from '@/lib/oem-additional-trial-invoices'
import type { AdditionalTrialPaymentData } from '@/lib/oem-additional-trial-payments-shared'

const fail = (e: unknown, fallback: string): { success: false; error: string } => ({ success: false, error: e instanceof MailError ? e.message : fallback })

function dateValue(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

async function paymentFor(id: string) {
  const { data, error } = await adminClient.from('oem_additional_trial_payments').select('id,lead_id').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  await requireOemMailLead(data.lead_id)
  return data
}

export async function getOemAdditionalTrialPayments(leadId: string) {
  try {
    await requireMailAdmin()
    const lead = await requireOemMailLead(leadId)
    const { data: payments, error } = await adminClient
      .from('oem_additional_trial_payments')
      .select('id,trial_id,lead_id,prepayment_id,taxable_amount,tax_amount,gross_amount,status,invoice_number,snapshot,created_at,paid_at,void_reason')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    const ids = (payments || []).map(payment => payment.id)
    const { data: receipts, error: receiptError } = ids.length
      ? await adminClient.from('oem_additional_trial_payment_receipts').select('id,payment_id,request_id,amount,paid_on,payer_name,note,confirmed_by,created_at').in('payment_id', ids).order('created_at', { ascending: true })
      : { data: [], error: null }
    if (receiptError) throw receiptError
    const byPayment = new Map<string, NonNullable<typeof receipts>>()
    for (const receipt of receipts || []) byPayment.set(receipt.payment_id, [...(byPayment.get(receipt.payment_id) || []), receipt])
    const result = (payments || []).map(payment => ({
      ...payment,
      invoiceUrl: payment.status === 'void' ? '' : additionalTrialInvoiceUrl(payment.id),
      receipts: byPayment.get(payment.id) || [],
    })) as AdditionalTrialPaymentData[]
    return { success: true as const, payments: result }
  } catch (e) {
    return { ...fail(e, '追加試作請求情報を取得できませんでした。'), payments: [] as AdditionalTrialPaymentData[] }
  }
}

export async function recordOemAdditionalTrialReceipt(paymentId: string, input: { requestId: string; amount: number; paidOn: string; payerName: string; note?: string }) {
  let attempted = false
  try {
    const user = await requireMailAdmin()
    const id = uuid(paymentId)
    const payment = await paymentFor(id)
    if (!payment) return { success: false, error: '追加試作請求が見つかりません。' }
    const requestId = uuid(input?.requestId)
    const amount = input?.amount
    const paidOn = dateValue(input?.paidOn)
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const payer = typeof input?.payerName === 'string' ? input.payerName.trim() : ''
    const note = typeof input?.note === 'string' ? input.note.trim() : ''
    if (!paidOn || paidOn > today || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000 || !payer || payer.length > 300 || note.length > 2000) return { success: false, error: '入金記録の入力内容を確認してください。' }
    attempted = true
    const { data, error } = await adminClient.rpc('record_oem_additional_trial_receipt', { p_payment_id: id, p_actor: user.id, p_request_id: requestId, p_amount: amount, p_paid_on: paidOn, p_payer_name: payer, p_note: note || '' })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '入金記録の入力内容を確認してください。', forbidden: '追加試作の入金を記録できません。', not_found: '追加試作請求が見つかりません。', overpayment: '過入金は記録できません。', state: 'この追加試作請求は入金記録の対象外です。', conflict: '同じ送信IDが別内容で使用されています。' }
    if (!['paid', 'partial', 'duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '入金記録を保存できませんでした。' }
    revalidatePath('/admin/dashboard')
    return { success: true, status: row.result, receivedAmount: Number(row.received_amount), expectedAmount: Number(row.expected_amount) }
  } catch (e) {
    return { ...fail(e, '追加試作の入金記録を保存できませんでした。'), uncertain: attempted }
  }
}

export async function voidOemAdditionalTrialPayment(paymentId: string, reason: string) {
  try {
    const user = await requireMailAdmin()
    const id = uuid(paymentId)
    const payment = await paymentFor(id)
    if (!payment) return { success: false, error: '追加試作請求が見つかりません。' }
    const why = typeof reason === 'string' ? reason.trim() : ''
    const { data, error } = await adminClient.rpc('void_oem_additional_trial_payment', { p_payment_id: id, p_actor: user.id, p_reason: why })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (row?.result !== 'void') return { success: false, error: '未入金の追加試作請求だけ無効化できます。' }
    revalidatePath('/admin/dashboard')
    return { success: true }
  } catch (e) {
    return fail(e, '追加試作請求を無効化できませんでした。')
  }
}
