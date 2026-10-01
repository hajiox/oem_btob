import { tokyoToday } from './oem-fulfillment-shared'

export type SettlementKind = 'adjustment' | 'cancellation'
export type SettlementState = 'draft' | 'confirmed' | 'settled' | 'void'
export type SettlementAction = 'save' | 'confirm' | 'void' | 'record_cash'
export type SettlementSaveInput = {
  kind: SettlementKind; materialStage: 'before' | 'after' | 'not_applicable'
  taxable8: number; taxable10: number; nonTaxable: number
  dueDate: string | null; reason: string; agreementNote: string
}
export type SettlementCashInput = {
  direction: 'receipt' | 'refund'; amount: number; happenedOn: string
  counterparty: string; note: string; bankConfirmed: boolean
}
export type SettlementInput = SettlementSaveInput | SettlementCashInput | { customerConfirmed: boolean } | { reason: string }
export type OemSettlement = {
  id: string; order_id: string; revision: number; kind: SettlementKind; state: SettlementState
  material_stage: 'before' | 'after' | 'not_applicable'
  taxable8: number; taxable10: number; non_taxable: number; tax8: number; tax10: number; target_gross: number
  due_date: string | null; reason: string; agreement_note: string
  confirmed_at: string | null; confirmed_by: string | null; received_at_confirmation: number | null
  original_snapshot: Record<string, unknown> | null
  void_reason: string; version: number; created_at: string; updated_at: string
}
export type SettlementCash = {
  id: string; settlement_id: string; direction: 'receipt' | 'refund'; amount: number
  happened_on: string; counterparty: string; note: string; confirmed_by: string; created_at: string
}
export type SettlementData = {
  latest: OemSettlement | null; history: OemSettlement[]; cash: SettlementCash[]
  originalReceived: number; settlementReceived: number; settlementRefunded: number; netReceived: number
  remaining: number | null; historyHasMore: boolean; cashHasMore: boolean
}
export type SettlementAlert = {
  order_id: string; lead_id: string; order_number: string; company_name: string
  settlement_id: string | null; kind: 'draft' | 'collect' | 'refund' | 'overdue' | 'unconfigured'
  target_gross: number | null; net_received: number; remaining: number | null; due_date: string | null
}
export const SETTLEMENT_CHANGED = 'oem-settlement-changed'
export const SETTLEMENT_STATE_LABELS: Record<SettlementState, string> = { draft: '下書き・工程保留', confirmed: '確定・入出金待ち', settled: '精算完了', void: '下書き取下げ' }

export function settlementTotals(taxable8: number, taxable10: number, nonTaxable: number) {
  if ([taxable8, taxable10, nonTaxable].some(value => !Number.isSafeInteger(value) || value < 0 || value > 100_000_000)) throw new Error('金額は0〜1億円の整数で入力してください')
  const tax8 = Math.floor(taxable8 * 8 / 100), tax10 = Math.floor(taxable10 * 10 / 100)
  const gross = taxable8 + taxable10 + nonTaxable + tax8 + tax10
  if (gross > 100_000_000) throw new Error('税込合意総額は1億円以内で入力してください')
  return { tax8, tax10, gross }
}
function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.includes('\0') || value.trim().length > max || (required && !value.trim())) throw new Error(`${label}を${required ? '1〜' : ''}${max}文字以内で入力してください`)
  return value.trim()
}
function date(value: unknown, label: string, required = false): string | null {
  if (!required && (value === null || value === undefined || value === '')) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') throw new Error(`${label}を正しい日付で入力してください`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label}を正しい日付で入力してください`)
  return value
}
export function parseSettlementInput(input: unknown, action: SettlementAction): SettlementInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('入力内容を確認してください')
  const value = input as Record<string, unknown>
  const fields: Record<SettlementAction, string[]> = {
    save: ['kind', 'materialStage', 'taxable8', 'taxable10', 'nonTaxable', 'dueDate', 'reason', 'agreementNote'],
    confirm: ['customerConfirmed'], void: ['reason'], record_cash: ['direction', 'amount', 'happenedOn', 'counterparty', 'note', 'bankConfirmed'],
  }
  if (!Object.hasOwn(fields, action) || Object.keys(value).some(key => !fields[action].includes(key))) throw new Error('指定された操作の入力内容を確認してください')
  if (action === 'save') {
    if (typeof value.kind !== 'string' || !['adjustment', 'cancellation'].includes(value.kind) || typeof value.materialStage !== 'string' || !['before', 'after', 'not_applicable'].includes(value.materialStage)) throw new Error('精算の種類と資材手配状況を選択してください')
    if (value.kind === 'cancellation' && value.materialStage === 'not_applicable') throw new Error('キャンセル時の資材手配状況を選択してください')
    if (value.kind === 'adjustment' && value.materialStage !== 'not_applicable') throw new Error('金額調整の資材手配区分は対象外にしてください')
    settlementTotals(value.taxable8 as number, value.taxable10 as number, value.nonTaxable as number)
    return { kind: value.kind as SettlementKind, materialStage: value.materialStage as SettlementSaveInput['materialStage'], taxable8: value.taxable8 as number, taxable10: value.taxable10 as number, nonTaxable: value.nonTaxable as number, dueDate: date(value.dueDate, '精算期限'), reason: text(value.reason, '精算理由', 2000), agreementNote: text(value.agreementNote, 'お客様との合意根拠', 4000) }
  }
  if (action === 'confirm') {
    if (value.customerConfirmed !== true) throw new Error('お客様との合意を確認してください')
    return { customerConfirmed: true }
  }
  if (action === 'void') return { reason: text(value.reason, '取下げ理由', 2000) }
  if (typeof value.direction !== 'string' || !['receipt', 'refund'].includes(value.direction) || typeof value.amount !== 'number' || !Number.isSafeInteger(value.amount) || value.amount < 1 || value.amount > 100_000_000) throw new Error('入出金の種類と金額を確認してください')
  if (value.bankConfirmed !== true) throw new Error('銀行明細で実際の入出金を確認してください')
  const happenedOn = date(value.happenedOn, '入出金日', true)!
  if (happenedOn > tokyoToday()) throw new Error('入出金日に未来の日付は指定できません')
  return { direction: value.direction as SettlementCashInput['direction'], amount: value.amount, happenedOn, counterparty: text(value.counterparty, '振込人・返金先名義', 200), note: text(value.note, '銀行確認メモ', 2000), bankConfirmed: true }
}
