import 'server-only'

import { createHash } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { OEM_TERMS_VERSION } from '@/lib/oem-terms'
import { type OemOrderStatus } from '@/lib/oem-order-shared'
import { replyTemplateId, type PreparedReply, type ReplyTemplateId } from '@/lib/oem-reply-assist-shared'
import { buildReplyTemplate } from '@/lib/oem-reply-templates'

export type ValidatedReplyLead = { id: string; email: string; company_name: string; contact_name: string }

export type SafeOrder = { id: string; revision: number; order_number: string; status: OemOrderStatus; formal_quote_amount: number; deposit_amount: number; final_amount: number | null; terms_version: string; accepted_at: string | null }
export type SafeFulfillment = { planned_quantity: number | null; quantity_unit: string; production_due_date: string | null; shipment_due_date: string | null; started_on: string | null; completed_quantity: number | null; completed_on: string | null; shipped_on: string | null; carrier: string; tracking_number: string }
export type SafePlan = { id: string; stage: 'deposit' | 'balance'; expected_amount: number; due_date: string | null }
export type SafeSettlement = { id: string; kind: 'adjustment' | 'cancellation'; state: 'draft' | 'confirmed' | 'settled' | 'void'; material_stage: 'before' | 'after' | 'not_applicable'; target_gross: number; due_date: string | null }
export type SafeCash = { direction: 'receipt' | 'refund'; amount: number }
export type SafeInbound = { id: string; subject: string | null; text_body: string | null; status: string; sent_at: string; awaitingReply: boolean }
export type SafeDraft = { subject: string | null; text_body: string | null; updated_at: string }
export type SafeSelectedOption = { question: string; answer: string }

export type ReplyContext = {
  lead: ValidatedReplyLead
  order: SafeOrder | null
  fulfillment: SafeFulfillment | null
  plans: SafePlan[]
  receiptTotals: Record<'deposit' | 'balance', number>
  settlement: SafeSettlement | null
  cashNet: number
  ledgerReceived: number
  settlementRemaining: number | null
  legacyCancellation: boolean
  draft: SafeDraft | null
  inbound: SafeInbound | null
  question: string
  sourceSubject: string | null
  warnings: string[]
  selectedOptions: SafeSelectedOption[]
}

function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function replySnapshotHashes(payload: unknown, draft: unknown) {
  return { contextSnapshot: hash(payload), snapshot: hash({ payload, draft }) }
}
function yen(value: number) { return `¥${value.toLocaleString('ja-JP')}` }
async function allRows<T>(query: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const result = await query(from, from + 999)
    if (result.error) throw new Error('返信用案件情報を取得できませんでした。')
    rows.push(...(result.data || []))
    if (!result.data || result.data.length < 1000) return rows
  }
}
export function cleanQuestion(value: string, lead: ValidatedReplyLead) {
  let text = value || ''
  for (const part of [lead.company_name, lead.contact_name, lead.email]) if (part) text = text.split(part).join('[伏せ字]')
  text = text.replace(/https?:\/\/\S+|www\.\S+/gi, '[URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[メールアドレス]')
    .replace(/(?:\+?\d[\d().-]*[\s().-][\d().\s-]{5,}\d)/g, value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '[電話番号]')
    .replace(/\b0\d{9,10}\b/g, '[電話番号]')
    .replace(/(?:口座番号|暗証番号)[\s：:=#-]*[A-Za-z0-9-]{4,}/g, '[機密情報]')
    .replace(/AIza[\w-]{20,}|GOCSPX-[\w-]+|sk-[\w-]{15,}|ya29\.[\w.-]+/g, '[機密情報]')
    .replace(/\b(?:account|acct|account_number|口座|口座番号|token|secret|api[_ -]?key|oauth)[\s:#=-]*[A-Za-z0-9_./+-]{4,}\b/gi, '[機密情報]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[識別子]')
  if (text.length > 6000) return `${text.slice(0, 5970)}\n[質問本文を6000文字以内で切り詰めました]`
  return text
}
export function safeSelectedOptions(value: unknown): SafeSelectedOption[] {
  if (!Array.isArray(value)) return []
  const rows: SafeSelectedOption[] = []
  for (const item of value.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue
    const raw = item as { question?: unknown; answer?: unknown }
    const question = typeof raw.question === 'string' ? raw.question.trim() : ''
    const answer = typeof raw.answer === 'string' ? raw.answer.trim() : ''
    if (!question || !answer || question.length > 100 || answer.length > 200) continue
    if (/(同意|規約|承認|正式発注|確認期限|メール|電話|会社|担当者|備考|希望時期|味のイメージ|レシピ|配合)/.test(question)) continue
    if (!/(商品|製品|包装|容器|パッケージ|容量|内容量|原料|素材|食材|支給|製造数|数量|プラン)/.test(question)) continue
    rows.push({ question, answer })
  }
  return rows
}

export async function prepareReplyContext(lead: ValidatedReplyLead, templateId: ReplyTemplateId): Promise<PreparedReply> {
  const id = lead.id
  const [orderResult, draftResult, pendingInboundResult, latestInboundResult, leadResult] = await Promise.all([
    adminClient.from('oem_orders').select('id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,terms_version,accepted_at').eq('lead_id', id).order('revision', { ascending: false }),
    adminClient.from('oem_conversation_drafts').select('subject,text_body,updated_at').eq('lead_id', id).maybeSingle(),
    adminClient.from('oem_conversation_messages').select('id,subject,text_body,status,sent_at,reply_closed_at,handled_at').eq('lead_id', id).eq('direction', 'inbound').eq('status', 'received').is('reply_closed_at', null).is('handled_at', null).order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(1),
    adminClient.from('oem_conversation_messages').select('id,subject,text_body,status,sent_at,reply_closed_at,handled_at').eq('lead_id', id).eq('direction', 'inbound').eq('status', 'received').order('sent_at', { ascending: false }).order('id', { ascending: false }).limit(1),
    adminClient.from('leads').select('selected_options').eq('id', id).maybeSingle(),
  ])
  if (orderResult.error || draftResult.error || pendingInboundResult.error || latestInboundResult.error || leadResult.error) throw new Error('返信用案件情報を取得できませんでした。')
  const orders = (orderResult.data || []) as SafeOrder[]
  const order = orders[0] || null
  const activeOrder = order && order.status !== 'cancelled' ? order : null
  const legacyCancellation = Boolean(order?.status === 'cancelled' && order.accepted_at)
  let fulfillment: SafeFulfillment | null = null
  if (activeOrder) {
    const result = await adminClient.from('oem_order_fulfillment').select('planned_quantity,quantity_unit,production_due_date,shipment_due_date,started_on,completed_quantity,completed_on,shipped_on,carrier,tracking_number').eq('order_id', activeOrder.id).maybeSingle()
    if (result.error) throw new Error('製造・出荷情報を取得できませんでした。')
    fulfillment = result.data as SafeFulfillment | null
  }
  const allOrderIds = orders.map(item => item.id)
  const planRows = allOrderIds.length ? await allRows<SafePlan>(async (from, to) => adminClient.from('oem_payment_plans').select('id,order_id,stage,expected_amount,due_date').in('order_id', allOrderIds).order('id').range(from, to) as unknown as Promise<{ data: SafePlan[]; error: unknown }>) : []
  const allPlans = planRows
  const receiptRows = allPlans.length ? await allRows<{ plan_id: string; amount: number }>(async (from, to) => adminClient.from('oem_payment_receipts').select('plan_id,amount').in('plan_id', allPlans.map(p => p.id)).order('id').range(from, to) as unknown as Promise<{ data: { plan_id: string; amount: number }[]; error: unknown }>) : []
  const plans = activeOrder ? allPlans.filter(p => (p as SafePlan & { order_id?: string }).order_id === activeOrder.id) : []
  const receiptTotals = { deposit: 0, balance: 0 } as Record<'deposit' | 'balance', number>
  let ledgerReceived = 0
  for (const row of receiptRows) { ledgerReceived += Number(row.amount) || 0; const plan = plans.find(p => p.id === row.plan_id); if (plan) receiptTotals[plan.stage] += Number(row.amount) || 0 }
  let settlement: SafeSettlement | null = null; let cashNet = 0
  const settlementOrder = order
  if (settlementOrder) {
    const settlementResult = await adminClient.from('oem_settlements').select('id,kind,state,material_stage,target_gross,due_date').eq('order_id', settlementOrder.id).neq('state', 'void').order('revision', { ascending: false }).limit(1).maybeSingle()
    if (settlementResult.error) throw new Error('精算情報を取得できませんでした。')
    settlement = settlementResult.data as SafeSettlement | null
    if (settlement) {
      const netResult = await adminClient.rpc('oem_settlement_net_received', { p_order: settlementOrder.id })
      if (netResult.error) throw new Error('精算入出金を取得できませんでした。')
      cashNet = Number(netResult.data || 0)
    }
  }
  if (settlement) { plans.length = 0; receiptTotals.deposit = 0; receiptTotals.balance = 0 }
  const pendingRows = (pendingInboundResult.data || []) as Array<SafeInbound & { reply_closed_at?: string | null; handled_at?: string | null }>
  const latestRows = (latestInboundResult.data || []) as Array<SafeInbound & { reply_closed_at?: string | null; handled_at?: string | null }>
  const inboundRow = pendingRows[0] || latestRows[0] || null
  const inbound = inboundRow ? { ...inboundRow, awaitingReply: !inboundRow.reply_closed_at && !inboundRow.handled_at } : null
  const selectedOptions = safeSelectedOptions(leadResult.data?.selected_options)
  const question = cleanQuestion(inbound?.text_body || '', lead)
  const warnings: string[] = ['返信案は下書きです。送信前に担当者が事実・宛先・添付を確認してください。', '本文の匿名化は保証されません。']
  if (order?.terms_version && order.terms_version !== OEM_TERMS_VERSION) warnings.push(`発注規約版が現行版（${OEM_TERMS_VERSION}）と異なるため、現行規約の条件を過去発注へ自動適用しないでください。`)
  if (settlement?.state === 'draft') warnings.push('精算は下書きであり、確定請求・返金の案内ではありません。')
  const settlementRemaining = settlement && settlement.state !== 'draft' ? settlement.target_gross - cashNet : null
  if (legacyCancellation && !settlement) warnings.push('キャンセル済みの旧発注について、確定した精算情報を確認できません。旧発注の金額を現在の請求額として案内しないでください。')
  const context: ReplyContext = { lead, order: activeOrder, fulfillment, plans, receiptTotals, settlement, cashNet, ledgerReceived, settlementRemaining, legacyCancellation, draft: draftResult.data as SafeDraft | null, inbound, question, sourceSubject: inbound?.subject || null, warnings, selectedOptions }
  const template = buildReplyTemplate(context, replyTemplateId(templateId))
  const snapshotPayload = { lead, templateId, termsVersion: OEM_TERMS_VERSION, orders, fulfillment, plans, receiptTotals, settlement, cashNet, ledgerReceived, settlementRemaining, selectedOptions, inbound: inbound ? { id: inbound.id, subject: inbound.subject, text_body: inbound.text_body, status: inbound.status, awaitingReply: inbound.awaitingReply } : null }
  const hashes = replySnapshotHashes(snapshotPayload, context.draft)
  return { ...template, ...hashes, question, facts: template.facts, aiConfigured: Boolean(process.env.GEMINI_API_KEY), sourceMessageId: inbound?.id || null, sourceSubject: inbound?.subject || null, warnings }
}

export { yen }
