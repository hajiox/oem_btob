'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, hashMail, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { sendConversation } from '@/lib/oem-conversations'
import { invoiceUrl } from '@/lib/oem-invoices'
import { invoiceTotals } from '@/lib/oem-invoices-shared'
import type { InvoiceInput, InvoiceIssuer, InvoiceResult, OemInvoice } from '@/lib/oem-invoices-shared'
import type { PaymentStage } from '@/lib/oem-payments-shared'
import { getOemSettlementData } from './oemSettlements'

type GetResult = { success: boolean; error?: string; invoices: OemInvoice[]; depositReceived: number; issuer?: InvoiceIssuer }
const fail = (error: unknown, fallback: string) => ({ success: false, error: error instanceof MailError ? error.message : fallback })
function dateValue(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return date.toISOString().slice(0, 10) === value ? value : null
}
function issuerValue(value: unknown): InvoiceIssuer | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const keys = ['name','address','email','bankName','branchName','accountType','accountNumber','accountHolder']
  if (keys.some(k => typeof v[k] !== 'string' || !(v[k] as string).trim())) return null
  const strings = keys.map(k => String(v[k]).trim())
  if (strings.some(s => s.length > 500) || strings[0].length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strings[2])) return null
  const registrationNumber = typeof v.registrationNumber === 'string' ? v.registrationNumber.trim() : ''
  if (registrationNumber && !/^T\d{13}$/.test(registrationNumber)) return null
  return { name: strings[0], address: strings[1], email: strings[2], registrationNumber, bankName: strings[3], branchName: strings[4], accountType: strings[5], accountNumber: strings[6], accountHolder: strings[7] }
}
async function orderFor(value: unknown) {
  const id = uuid(value)
  const { data, error } = await adminClient.from('oem_orders').select('id,lead_id,order_number,status,final_amount,formal_quote_amount').eq('id', id).single()
  if (error || !data) throw new MailError('正式発注が見つかりません。', 404)
  await requireOemMailLead(data.lead_id)
  return data
}

export async function getOemInvoices(orderId: string): Promise<GetResult> {
  try {
    await requireMailAdmin(); const order = await orderFor(orderId)
    const [{ data, error }, { data: receipts, error: receiptError }] = await Promise.all([
      adminClient.from('oem_invoices').select('id,order_id,lead_id,plan_id,stage,invoice_number,snapshot,issued_at,send_request_id,mail_status,lifecycle_status,void_reason,voided_at,superseded_by,revision_of,revision_no').eq('order_id', order.id).order('issued_at', { ascending: true }),
      adminClient.from('oem_payment_receipts').select('amount,oem_payment_plans!inner(order_id,stage)').eq('oem_payment_plans.order_id', order.id).eq('oem_payment_plans.stage', 'deposit'),
    ])
    if (error) throw error; if (receiptError) throw receiptError
    const invoices = (data || []) as OemInvoice[]
    const ids = invoices.map(i => i.send_request_id)
    if (ids.length) {
      const statuses = await adminClient.from('oem_conversation_messages').select('request_id,status').in('request_id', ids)
      if (!statuses.error) for (const invoice of invoices) invoice.mail_status = statuses.data?.find(s => s.request_id === invoice.send_request_id)?.status || invoice.mail_status
    }
    return { success: true, invoices, depositReceived: (receipts || []).reduce((sum, r) => sum + Number(r.amount || 0), 0), issuer: invoices[0]?.snapshot?.issuer || undefined }
  } catch (error) { return { ...fail(error, '請求書を取得できませんでした。'), invoices: [], depositReceived: 0 } }
}

export async function issueOemInvoice(orderId: string, input: InvoiceInput): Promise<InvoiceResult> {
  let attempted = false
  try {
    const user = await requireMailAdmin(); const order = await orderFor(orderId)
    const stage = input?.stage; const dueDate = dateValue(input?.dueDate); const issuer = issuerValue(input?.issuer)
    const description = typeof input?.description === 'string' ? input.description.trim() : ''
    const values = [input?.taxable8, input?.taxable10, input?.nonTaxable]
    if (stage !== 'deposit' && stage !== 'balance' || !uuid(input?.requestId) || !dueDate || !description || description.length > 2000 || !issuer || values.some(v => !Number.isSafeInteger(v) || Number(v) < 0 || Number(v) > 100000000)) return { success: false, error: '請求書の入力内容を確認してください。' }
    const normalized = { orderId: order.id, stage, dueDate, description, taxable8: Number(input.taxable8), taxable10: Number(input.taxable10), nonTaxable: Number(input.nonTaxable), issuer }
    invoiceTotals(stage as PaymentStage, normalized.taxable8, normalized.taxable10, normalized.nonTaxable, 0)
    const hash = hashMail(JSON.stringify(normalized)); attempted = true
    const { data, error } = await adminClient.rpc('issue_oem_invoice', { p_order_id: order.id, p_request_id: uuid(input.requestId), p_input_hash: hash, p_stage: stage, p_due_date: dueDate, p_description: description, p_taxable8: normalized.taxable8, p_taxable10: normalized.taxable10, p_non_taxable: normalized.nonTaxable, p_issuer: issuer, p_actor: user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '請求書の入力内容を確認してください。', state: '現在の発注状態では請求書を作成できません。', plan_mismatch: '入金予定の金額・期限を先に請求書と一致させてください。', amount_mismatch: '発注額と請求内訳が一致しません。', receipt_exists: '入金記録済みのため新規請求書は発行できません。精算内容を確認してください。', deposit_required: '前金の入金確認後に残金請求書を発行してください。', conflict: '同じ送信IDが別内容で使用されています。', forbidden: '請求書発行権限がありません。' }
    if (!['issued','duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '請求書を作成できませんでした。' }
    revalidatePath('/admin/dashboard')
    const saved = await adminClient.from('oem_invoices').select('id,order_id,lead_id,plan_id,stage,invoice_number,snapshot,issued_at,send_request_id,mail_status,lifecycle_status,void_reason,voided_at,superseded_by,revision_of,revision_no').eq('id', row.invoice_id).single()
    if (saved.error || !saved.data) return { success: false, error: '請求書の保存結果を確認できませんでした。', uncertain: true }
    return { success: true, message: row.result === 'duplicate' ? '同じ請求書は発行済みです。' : '請求書を発行しました。メールは送信していません。', invoice: saved.data as OemInvoice }
  } catch (error) { return { ...fail(error, '請求書を作成できませんでした。入力内容と接続状態を確認してください。'), uncertain: attempted } }
}

export async function sendOemInvoice(invoiceId: string): Promise<InvoiceResult> {
  try {
    const user = await requireMailAdmin(); const id = uuid(invoiceId)
    const { data: invoice, error } = await adminClient.from('oem_invoices').select('id,order_id,lead_id,plan_id,stage,invoice_number,snapshot,send_request_id,mail_status,lifecycle_status,oem_orders!inner(status)').eq('id', id).single()
    if (error || !invoice) return { success: false, error: '請求書が見つかりません。' }
    if (invoice.lifecycle_status && invoice.lifecycle_status !== 'active') return { success: false, error: '無効化・差替済みの請求書は送信できません。' }
    const orderStatus = (invoice.oem_orders as { status?: string } | undefined)?.status
    const settlement = await getOemSettlementData(invoice.order_id)
    if (!settlement.success || settlement.data?.latest) return { success: false, error: '精算管理を開始した発注では、元の請求書案内は送信できません。最新の精算内容を確認してください。' }
    if (orderStatus === 'cancelled' || (invoice.stage === 'deposit' && orderStatus !== 'accepted') || (invoice.stage === 'balance' && orderStatus !== 'balance_due')) return { success: false, error: '現在の発注状態では請求案内を送信できません。' }
    if (invoice.mail_status === 'sent') return { success: true, message: '請求書案内は送信済みです。' }
    const receiptCheck = await adminClient.from('oem_payment_receipts').select('id').eq('plan_id', invoice.plan_id).limit(1)
    if (receiptCheck.error) throw receiptCheck.error
    if (receiptCheck.data?.length) return { success: false, error: '入金記録済みのため請求案内を新規送信できません。精算内容を確認してください。' }
    const lead = await requireOemMailLead(invoice.lead_id); const snapshot = invoice.snapshot as OemInvoice['snapshot']
    const demoTestRecipient = 'ts@ai.aizu-tv.com'
    if ((snapshot.demo && snapshot.email !== demoTestRecipient) || (!snapshot.demo && snapshot.email.endsWith('.invalid')) || lead.email !== snapshot.email) return { success: false, error: '請求書の宛先を確認してください。' }
    const demoPrefix = snapshot.demo ? '【動作テスト・支払不要】' : ''
    const demoNotice = snapshot.demo ? '\n\n※これは動作テストです。支払いは不要です。' : ''
    const text = `${snapshot.companyName} ${snapshot.contactName} 様\n\n${demoPrefix}請求書 ${invoice.invoice_number} をご案内します。\n請求金額：¥${snapshot.amountDue.toLocaleString('ja-JP')}\n支払期限：${snapshot.dueDate}\n\n請求書の確認：\n${invoiceUrl(invoice.id)}\n\n本メールはOEM案件の請求案内です。${demoNotice}`
    const reservation = await adminClient.rpc('reserve_oem_invoice_send', { p_invoice_id: id, p_actor: user.id })
    const reservationRow = Array.isArray(reservation.data) ? reservation.data[0] : reservation.data
    if (reservation.error || reservationRow?.result !== 'reserved') return { success: false, error: reservationRow?.result === 'already_attempted' ? '送信済み・送信中・結果不明のため重複送信を防止しました。' : '送信予約を確保できませんでした。請求書の状態を確認してください。', uncertain: Boolean(reservation.error) }
    let sent: Awaited<ReturnType<typeof sendConversation>>
    try { sent = await sendConversation(lead, user.id, { requestId: invoice.send_request_id, subject: `${demoPrefix}請求書 ${invoice.invoice_number}`, text }) }
    catch (error) { const failedUpdate = await adminClient.from('oem_invoices').update({ mail_status: 'failed' }).eq('id', id); if (failedUpdate.error) return { success: false, error: '送信前後の状態を保存できませんでした。メール同期で確認してください。', uncertain: true }; throw error }
    const statusUpdate = await adminClient.from('oem_invoices').update({ mail_status: sent.status }).eq('id', id)
    if (statusUpdate.error) return { success: false, error: sent.success ? '送信結果を保存できませんでした。メール同期で確認してください。' : sent.error, uncertain: true }
    if (!sent.success) return { success: false, error: sent.error, uncertain: sent.status === 'unknown' }
    revalidatePath('/admin/dashboard'); return { success: true, message: '請求書案内を送信しました。' }
  } catch (error) { return fail(error, '請求書案内を送信できませんでした。') }
}

export async function correctOemInvoice(invoiceId: string, input: { requestId: string; stage: PaymentStage; amountDue: number; description?: string; dueDate?: string; issuer?: Partial<InvoiceIssuer> }): Promise<InvoiceResult> {
  let attempted = false
  try {
    const user = await requireMailAdmin(); const id = uuid(invoiceId); const requestId = uuid(input?.requestId)
    if (!requestId || (input.stage !== 'deposit' && input.stage !== 'balance') || !Number.isSafeInteger(input.amountDue) || input.amountDue < 1 || input.amountDue > 100000000) return { success: false, error: '訂正内容を確認してください。' }
    const payload: Record<string, unknown> = { stage: input.stage, amountDue: input.amountDue }
    if (input.description !== undefined) { if (typeof input.description !== 'string' || input.description.trim().length < 1 || input.description.trim().length > 2000) return { success: false, error: '請求内容を確認してください。' }; payload.description = input.description.trim() }
    if (input.dueDate !== undefined) { const d = dateValue(input.dueDate); if (!d) return { success: false, error: '支払期限を確認してください。' }; payload.dueDate = d }
    if (input.issuer !== undefined) { const merged = issuerValue(input.issuer); if (!merged) return { success: false, error: '発行者情報を確認してください。' }; payload.issuer = merged }
    attempted = true
    const { data, error } = await adminClient.rpc('correct_oem_invoice', { p_invoice_id: id, p_request_id: requestId, p_input: payload, p_actor: user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '訂正内容を確認してください。', forbidden: '請求書訂正権限がありません。', not_found: '有効な請求書が見つかりません。', mail_race: '送信中・送信結果不明の請求書は訂正できません。メール同期後に確認してください。', financially_locked: '入金・精算後の請求書は訂正できません。', amount_locked: '訂正で金額・ステージは変更できません。' }
    if (!['corrected','duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '請求書を訂正できませんでした。' }
    revalidatePath('/admin/dashboard')
    const saved = await adminClient.from('oem_invoices').select('*').eq('id', row.invoice_id).single()
    if (saved.error || !saved.data) return { success: false, error: '訂正後の請求書を確認できませんでした。', uncertain: true }
    return { success: true, message: row.result === 'duplicate' ? '同じ訂正処理は登録済みです。' : '請求書を訂正しました。メールは送信していません。', invoice: saved.data as OemInvoice }
  } catch (error) { return { ...fail(error, '請求書を訂正できませんでした。'), uncertain: attempted } }
}

export async function cancelReissueOemInvoice(invoiceId: string, reason: string, requestId: string): Promise<InvoiceResult> {
  let attempted = false
  try {
    const user = await requireMailAdmin(); const id = uuid(invoiceId); const request = uuid(requestId); const why = typeof reason === 'string' ? reason.trim() : ''
    if (!request || why.length < 1 || why.length > 2000) return { success: false, error: '取消理由を確認してください。' }
    attempted = true
    const { data, error } = await adminClient.rpc('cancel_reissue_oem_invoice', { p_invoice_id: id, p_request_id: request, p_reason: why, p_actor: user.id })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '取消理由を確認してください。', forbidden: '請求書操作権限がありません。', not_found: '有効な請求書が見つかりません。', financially_locked: '精算開始後は請求書を取消・再発行できません。' }
    if (!['reissued','duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '請求書を取消・再発行できませんでした。' }
    revalidatePath('/admin/dashboard')
    const saved = await adminClient.from('oem_invoices').select('*').eq('id', row.invoice_id).single()
    if (saved.error || !saved.data) return { success: false, error: '再発行後の請求書を確認できませんでした。', uncertain: true }
    return { success: true, message: row.result === 'duplicate' ? '同じ取消・再発行処理は登録済みです。' : '請求書を取消・再発行しました。旧URLは無効です。', invoice: saved.data as OemInvoice }
  } catch (error) { return { ...fail(error, '請求書を取消・再発行できませんでした。'), uncertain: attempted } }
}
