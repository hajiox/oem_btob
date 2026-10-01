'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { parseFulfillmentInput, type FulfillmentAction, type FulfillmentAlert, type FulfillmentInput, type OemFulfillment } from '@/lib/oem-fulfillment-shared'

type Result = { success: boolean; error?: string; message?: string; uncertain?: boolean }
function failure(error: unknown, fallback: string): Result { return { success: false, error: error instanceof MailError ? error.message : fallback } }
function validVersion(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647 }

async function orderFor(orderId: unknown) {
  const id = uuid(orderId)
  const { data, error } = await adminClient.from('oem_orders').select('id,lead_id').eq('id', id).single()
  if (error || !data) throw new MailError('正式発注が見つかりません。', 404)
  await requireOemMailLead(data.lead_id)
  return data
}

export async function getOemFulfillment(orderId: string): Promise<{ success: boolean; error?: string; fulfillment: OemFulfillment | null }> {
  try {
    await requireMailAdmin()
    const order = await orderFor(orderId)
    const { data, error } = await adminClient.from('oem_order_fulfillment').select('order_id,planned_quantity,quantity_unit,production_due_date,shipment_due_date,started_on,completed_quantity,completed_on,shipped_on,carrier,tracking_number,notes,version,updated_at,updated_by').eq('order_id', order.id).maybeSingle()
    if (error) throw error
    return { success: true, fulfillment: data as OemFulfillment | null }
  } catch (error) { return { ...failure(error, '製造・出荷情報を取得できませんでした'), fulfillment: null } }
}

export async function updateOemFulfillment(orderId: string, action: FulfillmentAction, input: FulfillmentInput, expectedVersion: number): Promise<Result> {
  try {
    const user = await requireMailAdmin()
    const order = await orderFor(orderId)
    if (!validVersion(expectedVersion)) return { success: false, error: '更新番号が不正です' }
    let parsed: FulfillmentInput
    try { parsed = parseFulfillmentInput(input, action) } catch (error) { return { success: false, error: error instanceof Error ? error.message : '入力内容を確認してください' } }
    const { data, error } = await adminClient.rpc('update_oem_fulfillment', { p_order_id: order.id, p_actor: user.id, p_expected_version: expectedVersion, p_action: action, p_input: parsed })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    const result = typeof row?.result === 'string' ? row.result : ''
    const messages: Record<string, string> = {
      conflict: '他の管理者が更新しました。最新情報を読み込んでください',
      state: '現在の発注状態ではこの操作を実行できません',
      invalid: '製造・出荷情報の入力内容を確認してください',
      forbidden: '製造・出荷情報を更新する権限がありません',
      not_found: '正式発注が見つかりません',
    }
    if (!['saved', 'started', 'completed', 'completion_recorded', 'shipped'].includes(result)) {
      if (!result) return { success: false, error: '更新結果を確認できませんでした。最新情報を読み込んで確認してください', uncertain: true }
      return { success: false, error: messages[result] || '製造・出荷情報を更新できませんでした', uncertain: true }
    }
    revalidatePath('/admin/dashboard')
    const successMessages: Record<string, string> = { save: '製造・出荷情報を保存しました', start: '製造を開始しました', complete: '製造完了を記録しました', record_completion: '完成数量を記録しました', ship: '出荷を記録しました' }
    return { success: true, message: successMessages[action] || '製造・出荷情報を更新しました' }
  } catch (error) {
    if (error instanceof MailError) return failure(error, '製造・出荷情報を更新できませんでした')
    return { success: false, error: '更新結果を確認できませんでした。最新情報を読み込んで確認してください', uncertain: true }
  }
}

export async function getOemFulfillmentAlerts(offset = 0): Promise<{ success: boolean; error?: string; items: FulfillmentAlert[]; total: number; hasMore: boolean; nextOffset?: number }> {
  try {
    await requireMailAdmin()
    const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
    const { data, error } = await adminClient.rpc('get_oem_fulfillment_alerts', { p_limit: 50, p_offset: safeOffset })
    if (error) throw error
    const rows = (Array.isArray(data) ? data : []) as Array<FulfillmentAlert & { total_count: number }>
    const total = Number(rows[0]?.total_count || 0)
    const items = rows.map(row => { const { total_count, ...item } = row; void total_count; return item })
    const hasMore = safeOffset + items.length < total
    return { success: true, items, total, hasMore, ...(hasMore ? { nextOffset: safeOffset + items.length } : {}) }
  } catch (error) { return { ...failure(error, '製造・出荷アラートを取得できませんでした'), items: [], total: 0, hasMore: false } }
}
