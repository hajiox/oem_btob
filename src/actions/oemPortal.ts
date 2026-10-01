'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { createPortalToken, portalExpiry, portalTokenHash } from '@/lib/oem-portal-token'
import { getOemPortal } from '@/lib/oem-portal'

type Result = { success: boolean; error?: string; message?: string; url?: string; linkId?: string; newLeadId?: string; duplicate?: boolean }
const baseUrl = () => new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://oem.aizubrandhall.com').origin
const resultError = (error: unknown, fallback: string): Result => ({ success: false, error: error instanceof MailError ? error.message : fallback })
function requestId(value: unknown) { return uuid(value) }

export async function issueOemProgressLink(leadId: string, days = 90): Promise<Result> {
  try {
    const actor = await requireMailAdmin(); const lead = await requireOemMailLead(leadId)
    const pair = createPortalToken(); const expiry = portalExpiry(days)
    const { data, error } = await adminClient.rpc('manage_oem_progress_link', { p_action: 'issue', p_lead_id: lead.id, p_actor: actor.id, p_token_hash: pair.hash, p_expires_at: expiry })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (row?.result !== 'issued') return { success: false, error: '進捗リンクを発行できませんでした' }
    revalidatePath('/admin/dashboard')
    return { success: true, linkId: row.link_id, url: `${baseUrl()}/btob/progress/${pair.token}`, message: '進捗リンクを発行しました。メールは送信していません。' }
  } catch (e) { return resultError(e, '進捗リンクを発行できませんでした') }
}

export async function revokeOemProgressLink(leadId: string, linkId: string): Promise<Result> {
  try {
    const actor = await requireMailAdmin(); const lead = await requireOemMailLead(leadId)
    const { data, error } = await adminClient.rpc('manage_oem_progress_link', { p_action: 'revoke', p_lead_id: lead.id, p_actor: actor.id, p_link_id: uuid(linkId), p_token_hash: null, p_expires_at: null })
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data
    return row?.result === 'revoked' ? { success: true, message: '進捗リンクを失効しました' } : { success: false, error: '進捗リンクを失効できませんでした' }
  } catch (e) { return resultError(e, '進捗リンクを失効できませんでした') }
}

export async function renewOemProgressLink(leadId: string, linkId: string, days = 90): Promise<Result> {
  try {
    const actor = await requireMailAdmin(); const lead = await requireOemMailLead(leadId); const pair = createPortalToken(); const expiry = portalExpiry(days)
    const { data, error } = await adminClient.rpc('manage_oem_progress_link', { p_action: 'renew', p_lead_id: lead.id, p_actor: actor.id, p_link_id: uuid(linkId), p_token_hash: pair.hash, p_expires_at: expiry })
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data
    if (row?.result !== 'renewed') return { success: false, error: '進捗リンクを更新できませんでした' }
    return { success: true, linkId: row.link_id, url: `${baseUrl()}/btob/progress/${pair.token}`, message: '進捗リンクを更新しました。メールは送信していません。' }
  } catch (e) { return resultError(e, '進捗リンクを更新できませんでした') }
}

export async function getOemProgressForAdmin(leadId: string) {
  try {
    await requireMailAdmin(); const lead = await requireOemMailLead(leadId)
    const { data, error } = await adminClient.from('oem_progress_links').select('id,issued_at,expires_at,revoked_at').eq('lead_id', lead.id).order('issued_at', { ascending: false })
    if (error) throw error; return { success: true, links: data || [] }
  } catch (e) { return { success: false, links: [], error: e instanceof MailError ? e.message : '進捗リンクを取得できませんでした' } }
}

export async function requestOemReorder(token: string, sourceOrderId: string, suppliedRequestId: string, selection: { selectedOptions: unknown[]; specification: string }): Promise<Result> {
  try {
    const hash = portalTokenHash(token); const source = uuid(sourceOrderId); const req = requestId(suppliedRequestId)
    if (!hash || !selection || !Array.isArray(selection.selectedOptions) || typeof selection.specification !== 'string' || selection.specification.length > 10000) return { success: false, error: '再注文内容を確認してください' }
    const { data, error } = await adminClient.rpc('request_oem_reorder', { p_token_hash: hash, p_source_order_id: source, p_request_id: req, p_selection: { selectedOptions: selection.selectedOptions, specification: selection.specification } })
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data
    if (!['created', 'duplicate'].includes(row?.result)) return { success: false, error: row?.result === 'state' || row?.result === 'blocked' ? '現在の状態では再注文を依頼できません' : '再注文依頼を登録できませんでした' }
    return { success: true, duplicate: row.result === 'duplicate', newLeadId: row.new_lead_id, message: row.result === 'duplicate' ? '同じ再注文依頼は登録済みです' : '再注文の下書きを登録しました。担当者が再見積り・再合意を行います。' }
  } catch (e) { return resultError(e, '再注文依頼を登録できませんでした') }
}

export async function requestAdminOemReorder(orderId: string, suppliedRequestId: string, selection: { selectedOptions: unknown[]; specification: string }): Promise<Result> {
  try {
    const actor = await requireMailAdmin(); const source = uuid(orderId); const req = requestId(suppliedRequestId)
    if (!selection || !Array.isArray(selection.selectedOptions) || typeof selection.specification !== 'string' || selection.specification.length > 10000) return { success: false, error: '再注文内容を確認してください' }
    const { data, error } = await adminClient.rpc('request_oem_reorder', { p_token_hash: null, p_source_order_id: source, p_request_id: req, p_actor: actor.id, p_selection: { selectedOptions: selection.selectedOptions, specification: selection.specification } })
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data
    if (!['created', 'duplicate'].includes(row?.result)) return { success: false, error: '再注文下書きを登録できませんでした' }
    return { success: true, duplicate: row.result === 'duplicate', newLeadId: row.new_lead_id, message: '再注文下書きを登録しました。正式UIから再見積り・再合意を行ってください。' }
  } catch (e) { return resultError(e, '再注文下書きを登録できませんでした') }
}

export async function getOemPortalForRequest(token: string) {
  return getOemPortal(token)
}
