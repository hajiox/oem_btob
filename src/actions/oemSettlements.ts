'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { parseSettlementInput, type SettlementAction, type SettlementInput } from '@/lib/oem-settlements-shared'
import type { SettlementData, SettlementAlert } from '@/lib/oem-settlements-shared'

export type SettlementResult = { success: boolean; error?: string; message?: string; uncertain?: boolean; settlementId?: string; currentVersion?: number }

function fail(error: unknown, fallback: string): SettlementResult {
  return { success: false, error: error instanceof MailError ? error.message : fallback }
}
async function orderFor(orderId: unknown) {
  const id = uuid(orderId)
  const { data, error } = await adminClient.from('oem_orders').select('id,lead_id').eq('id', id).single()
  if (error || !data) throw new MailError('正式発注が見つかりません。', 404)
  await requireOemMailLead(data.lead_id)
  return data
}

export async function getOemSettlementData(orderId: string): Promise<{ success: boolean; error?: string; data?: SettlementData | null }> {
  try {
    const user = await requireMailAdmin(); const order = await orderFor(orderId)
    const { data, error } = await adminClient.rpc('get_oem_settlement_data', { p_order_id: order.id, p_actor: user.id })
    if (error) throw error
    if (!data) return { success: false, error: '精算情報を取得する権限または対象案件を確認してください', data: null }
    return { success: true, data: data as SettlementData }
  } catch (error) { return { ...fail(error, '精算情報を取得できませんでした'), data: null } }
}

export async function updateOemSettlement(orderId: string, settlementId: string | null, action: SettlementAction, input: SettlementInput, expectedVersion: number, requestId: string): Promise<SettlementResult> {
  try {
    const user = await requireMailAdmin(); const order = await orderFor(orderId)
    const id = settlementId ? uuid(settlementId) : null; const request = uuid(requestId)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > 2147483647) return { success: false, error: '精算入力が不正です' }
    let parsed: SettlementInput
    try { parsed = parseSettlementInput(input, action) } catch (error) { return { success: false, error: error instanceof Error ? error.message : '精算入力を確認してください' } }
    const { data, error } = await adminClient.rpc('update_oem_settlement', { p_order_id: order.id, p_settlement_id: id, p_actor: user.id, p_expected_version: expectedVersion, p_action: action, p_request_id: request, p_input: parsed })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const messages: Record<string, string> = { invalid: '精算入力を確認してください', forbidden: '精算権限がありません', conflict: '他の管理者が更新しました。最新情報を読み込んでください', state: '現在の発注状態では実行できません', not_found: '精算が見つかりません' }
    if (!['saved', 'confirmed', 'voided', 'recorded', 'duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '精算処理の結果が不明です', uncertain: !Object.hasOwn(messages, row?.result || '') }
    revalidatePath('/admin/dashboard')
    return { success: true, message: row.result === 'duplicate' ? '同じ送信IDの処理は登録済みです' : '精算情報を更新しました', settlementId: row.settlement_id, currentVersion: row.current_version }
  } catch (error) {
    if (error instanceof MailError) return fail(error, '精算処理を完了できませんでした')
    return { success: false, error: '精算処理の結果を確認できませんでした。同じ送信IDで再確認してください', uncertain: true }
  }
}

export async function getOemSettlementAlerts(offset = 0) {
  try {
    await requireMailAdmin()
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 && offset <= 2147483647 ? offset : 0
    const { data, error } = await adminClient.rpc('get_oem_settlement_alerts', { p_limit: 50, p_offset: safeOffset })
    if (error) throw error
    const rows = Array.isArray(data) ? data as Array<SettlementAlert & { total_count?: number }> : []
    const total = Number(rows[0]?.total_count || 0)
    const items = rows.map(row => { const { total_count, ...item } = row; void total_count; return item })
    return { success: true, items, total, hasMore: safeOffset + rows.length < total, nextOffset: safeOffset + rows.length < total ? safeOffset + rows.length : undefined }
  } catch (error) { return { ...fail(error, '精算アラートを取得できませんでした'), items: [], total: 0, hasMore: false } }
}

export async function saveOemSettlement(orderId: string, settlementId: string | null, expectedVersion: number, input: SettlementInput, requestId: string) {
  return updateOemSettlement(orderId, settlementId, 'save', input, expectedVersion, requestId)
}
export async function confirmOemSettlement(orderId: string, settlementId: string, expectedVersion: number, requestId: string) {
  return updateOemSettlement(orderId, settlementId, 'confirm', { customerConfirmed: true }, expectedVersion, requestId)
}
export async function voidOemSettlement(orderId: string, settlementId: string, expectedVersion: number, reason: string, requestId: string) {
  return updateOemSettlement(orderId, settlementId, 'void', { reason }, expectedVersion, requestId)
}
export async function recordOemSettlementCash(orderId: string, settlementId: string, expectedVersion: number, input: SettlementInput, requestId: string) {
  return updateOemSettlement(orderId, settlementId, 'record_cash', input, expectedVersion, requestId)
}
