'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { sendConversation } from '@/lib/oem-conversations'
import { MailError, mailOrigin, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'
import { OEM_TERMS_BODY, OEM_TERMS_TITLE, OEM_TERMS_VERSION } from '@/lib/oem-terms'
import {
  depositAmount, evidenceHash, getPublicOemOrder,
  sha256, snapshotSha256, tokenHash,
  type OemOrder,
} from '@/lib/oem-orders'
import { canAdvanceOemOrder, type OemOrderStatus } from '@/lib/oem-order-shared'

type ActionResult = { success: boolean; error?: string; message?: string; order?: OemOrder; url?: string; mailWarning?: string }
type AcceptState = { success: boolean; error?: string; orderNumber?: string }

function failure(error: unknown, fallback: string): ActionResult {
  return { success: false, error: error instanceof MailError ? error.message : fallback }
}
function orderUrl(token: string): string {
  return `${mailOrigin()}/btob/order/${encodeURIComponent(token)}`
}

function money(value: number): string {
  return `¥${value.toLocaleString('ja-JP')}（税別）`
}

async function addEvent(leadId: string, eventType: string, details: Record<string, unknown>, userId: string) {
  const { error } = await adminClient.from('oem_lead_events').insert({ lead_id: leadId, event_type: eventType, details, created_by: userId })
  if (error) throw new Error('発注履歴を保存できませんでした')
}

export async function getOemOrder(leadId: string): Promise<ActionResult & { acceptance?: Record<string, unknown> | null; defaultSpecification?: string }> {
  try {
    await requireMailAdmin()
    const lead = await requireOemMailLead(leadId)
    const [{ data: order, error }, { data: caseData }] = await Promise.all([
      adminClient.from('oem_orders').select('*').eq('lead_id', lead.id).order('revision', { ascending: false }).limit(1).maybeSingle(),
      adminClient.from('oem_lead_cases').select('final_spec_revision').eq('lead_id', lead.id).maybeSingle(),
    ])
    if (error) throw error
    let acceptance = null
    if (order?.accepted_at) {
      const result = await adminClient.from('oem_order_acceptances')
        .select('company_name,contact_name,email,terms_version,accepted_at').eq('order_id', order.id).maybeSingle()
      if (result.error) throw result.error
      acceptance = result.data
    }
    return { success: true, order: order as OemOrder | undefined, acceptance, defaultSpecification: caseData?.final_spec_revision || '' }
  } catch (error) { return failure(error, '正式発注情報を取得できませんでした') }
}

export async function issueOemOrder(leadId: string, input: { formalQuoteAmount: number; specification: string }): Promise<ActionResult> {
  try {
    const user = await requireMailAdmin()
    const lead = await requireOemMailLead(leadId)
    const amount = Number(input?.formalQuoteAmount)
    const specification = typeof input?.specification === 'string' ? input.specification.trim() : ''
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000) return { success: false, error: '正式見積額を1円〜1億円の整数で入力してください' }
    if (!specification || specification.length > 10000) return { success: false, error: '正式仕様を1〜10,000文字で入力してください' }
    const [{ data: current, error: currentError }, { data: leadDetail, error: leadError }] = await Promise.all([
      adminClient.from('oem_orders').select('id,status,revision').eq('lead_id', lead.id).order('revision', { ascending: false }).limit(1).maybeSingle(),
      adminClient.from('leads').select('selected_options,estimated_total_price').eq('id', lead.id).eq('page_id', OEM_PAGE_ID).single(),
    ])
    if (currentError || leadError || !leadDetail) throw currentError || leadError || new Error('案件が見つかりません')
    if (current && current.status !== 'cancelled') return { success: false, error: '有効な正式発注があります。二重発行はできません' }
    const revision = (current?.revision || 0) + 1
    const deposit = depositAmount(amount)
    const quoteSnapshot = {
      formalQuoteAmount: amount,
      depositAmount: deposit,
      balanceBeforeFinalAdjustment: amount - deposit,
      specification,
      originalEstimate: leadDetail.estimated_total_price,
      selectedOptions: leadDetail.selected_options,
      customer: { companyName: lead.company_name, contactName: lead.contact_name },
      revision,
    }
    const token = randomBytes(32).toString('base64url')
    const date = new Date()
    const ymd = date.toISOString().slice(0, 10).replaceAll('-', '')
    const orderNumber = `OEM-${ymd}-${randomBytes(4).toString('hex').toUpperCase()}`
    const expiresAt = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: order, error } = await adminClient.from('oem_orders').insert({
      lead_id: lead.id, revision, order_number: orderNumber, formal_quote_amount: amount,
      deposit_amount: deposit, specification, quote_snapshot: quoteSnapshot,
      quote_sha256: snapshotSha256(quoteSnapshot), terms_version: OEM_TERMS_VERSION,
      terms_title: OEM_TERMS_TITLE, terms_body: OEM_TERMS_BODY,
      terms_sha256: sha256(OEM_TERMS_BODY), access_token_hash: tokenHash(token),
      expires_at: expiresAt, created_by: user.id,
    }).select('*').single()
    if (error || !order) throw error || new Error('正式発注を作成できませんでした')
    let warning: string | undefined
    try { await addEvent(lead.id, 'order_issued', { order_id: order.id, order_number: orderNumber, revision, amount, terms_version: OEM_TERMS_VERSION }, user.id) }
    catch { warning = '正式発注は作成済みですが、履歴保存を確認できませんでした' }
    const url = orderUrl(token)
    const text = `${lead.company_name}\n${lead.contact_name} 様\n\n正式お見積りと商品仕様をご用意しました。\n下記の専用ページで内容と取引規約をご確認のうえ、正式発注をお願いいたします。\n\n正式見積額：${money(amount)}\n前金（正式見積額の50％）：${money(deposit)}\n確認期限：${new Date(expiresAt).toLocaleDateString('ja-JP')}\n\n${url}\n\n※規約への同意が完了するまで、前金の請求・資材手配・製造には進みません。\n※このURLはお客様専用です。第三者へ共有しないでください。`
    let mailWarning = warning
    try {
      const mail = await sendConversation(lead, user.id, { requestId: randomUUID(), subject: `正式お見積り・発注内容のご確認 ${orderNumber}`, text })
      if (!mail.success) mailWarning = mail.error || 'メール送信を確認できませんでした'
    } catch (mailError) {
      mailWarning = mailError instanceof Error ? `正式発注は作成済みですが、メールを送信できませんでした：${mailError.message}` : '正式発注は作成済みですが、メールを送信できませんでした'
    }
    revalidatePath('/admin/dashboard')
    return { success: true, order: order as OemOrder, url, message: mailWarning ? '正式発注を発行しました' : '正式発注を発行し、お客様へメールを送信しました', mailWarning }
  } catch (error) { return failure(error, '正式発注を発行できませんでした') }
}

export async function reissueOemOrderLink(orderId: string): Promise<ActionResult> {
  try {
    const user = await requireMailAdmin()
    const id = uuid(orderId)
    const { data: order, error } = await adminClient.from('oem_orders').select('*').eq('id', id).single()
    if (error || !order) return { success: false, error: '正式発注が見つかりません' }
    if (order.status !== 'issued') return { success: false, error: '規約同意待ちの発注だけリンクを再発行できます' }
    const lead = await requireOemMailLead(order.lead_id)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: updated, error: updateError } = await adminClient.from('oem_orders').update({ access_token_hash: tokenHash(token), expires_at: expiresAt }).eq('id', id).eq('status', 'issued').select('id').maybeSingle()
    if (updateError) throw updateError
    if (!updated) return { success: false, error: '他の操作で状態が変わりました。最新情報を読み込んでください' }
    const url = orderUrl(token)
    let mailWarning: string | undefined
    try { await addEvent(lead.id, 'order_link_reissued', { order_id: id, order_number: order.order_number, expires_at: expiresAt }, user.id) }
    catch { mailWarning = 'リンクは再発行済みですが、履歴保存を確認できませんでした' }
    try {
      const mail = await sendConversation(lead, user.id, { requestId: randomUUID(), subject: `正式発注ページの再発行 ${order.order_number}`, text: `${lead.company_name}\n${lead.contact_name} 様\n\n正式発注ページを再発行しました。以前のURLは無効です。\n下記ページから内容と取引規約をご確認ください。\n\n${url}\n\n確認期限：${new Date(expiresAt).toLocaleDateString('ja-JP')}\n※このURLはお客様専用です。第三者へ共有しないでください。` })
      if (!mail.success) mailWarning = mail.error || 'メール送信を確認できませんでした'
    } catch (mailError) {
      mailWarning = mailError instanceof Error ? `リンクは再発行済みですが、メールを送信できませんでした：${mailError.message}` : 'リンクは再発行済みですが、メールを送信できませんでした'
    }
    return { success: true, url, message: mailWarning ? 'リンクを再発行しました' : 'リンクを再発行してメールを送信しました', mailWarning }
  } catch (error) { return failure(error, '発注リンクを再発行できませんでした') }
}

export async function advanceOemOrder(orderId: string, requestedStatus: OemOrderStatus, finalAmount?: number): Promise<ActionResult> {
  try {
    const user = await requireMailAdmin()
    if (requestedStatus === 'deposit_paid' || requestedStatus === 'paid') return { success: false, error: '入金管理で銀行明細を確認し、入金日・金額・名義を記録してください' }
    const id = uuid(orderId)
    const { data: order, error } = await adminClient.from('oem_orders').select('*').eq('id', id).single()
    if (error || !order) return { success: false, error: '正式発注が見つかりません' }
    const current = order.status as OemOrderStatus
    if (current === 'issued') return { success: false, error: 'お客様の規約同意が完了するまで先へ進めません' }
    if (!canAdvanceOemOrder(current, requestedStatus)) return { success: false, error: '現在の状態から指定された工程へは進めません' }
    const patch: Record<string, unknown> = { status: requestedStatus }
    if (requestedStatus === 'balance_due') {
      const value = Number(finalAmount)
      if (!Number.isSafeInteger(value) || value < 1 || value > 100_000_000) return { success: false, error: '製造数量確定後の最終金額を入力してください' }
      patch.final_amount = value
    }
    const { data: updated, error: updateError } = await adminClient.from('oem_orders').update(patch).eq('id', id).eq('status', current).select('*').maybeSingle()
    if (updateError) throw updateError
    if (!updated) return { success: false, error: '他の管理者が更新しました。最新情報を読み込んでください' }
    await addEvent(order.lead_id, 'order_status_changed', { order_id: id, order_number: order.order_number, before: current, after: requestedStatus, final_amount: patch.final_amount || null }, user.id)
    revalidatePath('/admin/dashboard')
    return { success: true, order: updated as OemOrder, message: '発注工程を更新しました' }
  } catch (error) { return failure(error, '発注工程を更新できませんでした') }
}

export async function cancelOemOrder(orderId: string): Promise<ActionResult> {
  try {
    const user = await requireMailAdmin()
    const id = uuid(orderId)
    const { data: order, error } = await adminClient.from('oem_orders').select('*').eq('id', id).single()
    if (error || !order) return { success: false, error: '正式発注が見つかりません' }
    if (['shipped', 'cancelled'].includes(order.status)) return { success: false, error: 'この正式発注はキャンセルできません' }
    const { data: updated, error: updateError } = await adminClient.from('oem_orders').update({ status: 'cancelled' }).eq('id', id).eq('status', order.status).select('*').maybeSingle()
    if (updateError) throw updateError
    if (!updated) return { success: false, error: '他の管理者が更新しました。最新情報を読み込んでください' }
    await addEvent(order.lead_id, 'order_cancelled', { order_id: id, order_number: order.order_number, before: order.status }, user.id)
    revalidatePath('/admin/dashboard')
    return { success: true, order: updated as OemOrder, message: '正式発注をキャンセルしました' }
  } catch (error) { return failure(error, '正式発注をキャンセルできませんでした') }
}

export async function acceptOemOrder(token: string, _previous: AcceptState, formData: FormData): Promise<AcceptState> {
  try {
    if (formData.get('termsAccepted') !== 'on') return { success: false, error: '取引規約への同意が必要です' }
    const contactName = String(formData.get('contactName') || '').trim()
    const requestId = String(formData.get('requestId') || '')
    if (!contactName || contactName.length > 100) return { success: false, error: '発注者名を入力してください' }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return { success: false, error: '画面を再読み込みしてお試しください' }
    const publicResult = await getPublicOemOrder(token)
    if (publicResult.state === 'expired') return { success: false, error: '確認期限が切れています。担当者へ再発行をご依頼ください' }
    if (publicResult.state !== 'available' || !publicResult.order) return { success: false, error: 'この正式発注は現在利用できません' }
    if (publicResult.order.status !== 'issued') return publicResult.order.accepted_at
      ? { success: true, orderNumber: publicResult.order.order_number }
      : { success: false, error: 'この正式発注は現在利用できません' }
    const requestHeaders = await headers()
    const ip = requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
      || requestHeaders.get('x-real-ip') || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const userAgent = requestHeaders.get('user-agent') || 'unknown'
    const { data, error } = await adminClient.rpc('accept_oem_order', {
      p_token_hash: tokenHash(token), p_request_id: requestId, p_contact_name: contactName,
      p_terms_version: publicResult.order.terms_version, p_terms_sha256: publicResult.order.terms_sha256,
      p_quote_sha256: publicResult.order.quote_sha256, p_ip_hash: evidenceHash(ip),
      p_user_agent_hash: evidenceHash(userAgent),
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (row?.result === 'accepted') return { success: true, orderNumber: row.order_number }
    const errors: Record<string, string> = { expired: '確認期限が切れています。担当者へ再発行をご依頼ください', changed: '発注内容が更新されました。担当者へご確認ください', conflict: '二重送信を確認できませんでした。画面を再読み込みしてください' }
    return { success: false, error: errors[row?.result] || '正式発注を完了できませんでした' }
  } catch { return { success: false, error: '正式発注を完了できませんでした。時間をおいて再度お試しください' } }
}
