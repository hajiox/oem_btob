import type { OemOrderStatus } from './oem-order-shared'

export type FulfillmentAction = 'save' | 'start' | 'complete' | 'record_completion' | 'ship'
export type FulfillmentInput = {
  plannedQuantity?: number | null
  quantityUnit?: string
  productionDueDate?: string | null
  shipmentDueDate?: string | null
  notes?: string
  completedQuantity?: number
  completedOn?: string
  finalAmount?: number
  shippedOn?: string
  carrier?: string
  trackingNumber?: string
}
export type OemFulfillment = {
  order_id: string
  planned_quantity: number | null
  quantity_unit: string
  production_due_date: string | null
  shipment_due_date: string | null
  started_on: string | null
  completed_quantity: number | null
  completed_on: string | null
  shipped_on: string | null
  carrier: string
  tracking_number: string
  notes: string
  version: number
  updated_at: string
  updated_by: string | null
}
export type FulfillmentAlert = {
  order_id: string
  lead_id: string
  order_number: string
  company_name: string
  status: OemOrderStatus
  planned_quantity: number | null
  completed_quantity: number | null
  quantity_unit: string
  production_due_date: string | null
  shipment_due_date: string | null
  kind: 'settlement_hold' | 'shipment_overdue' | 'production_overdue' | 'unconfigured' | 'ready_to_ship'
}

export function tokyoToday(reference: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(reference)
  const part = (type: string) => parts.find(value => value.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function calendarDate(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label}を入力してください`)
    return null
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') throw new Error(`${label}を正しい日付で入力してください`)
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label}を正しい日付で入力してください`)
  return value
}
function integer(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${label}を1〜${max.toLocaleString('ja-JP')}の整数で入力してください`)
  return value
}
function singleLine(value: unknown, label: string, max: number, required = false): string {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || /[\r\n\x00]/.test(value)) throw new Error(`${label}の入力内容を確認してください`)
  const text = value.trim()
  if (text.length > max || (required && !text)) throw new Error(`${label}を${required ? '1〜' : ''}${max}文字以内で入力してください`)
  return text
}

// Only action-specific fields are accepted; quantities never calculate or
// overwrite the agreed price. Both this boundary and the database validate.
export function parseFulfillmentInput(input: unknown, action: FulfillmentAction): FulfillmentInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('入力内容を確認してください')
  const value = input as Record<string, unknown>
  const fields: Record<FulfillmentAction, string[]> = {
    save: ['plannedQuantity', 'quantityUnit', 'productionDueDate', 'shipmentDueDate', 'notes'],
    start: [],
    complete: ['completedQuantity', 'completedOn', 'finalAmount'],
    record_completion: ['completedQuantity', 'completedOn'],
    ship: ['shippedOn', 'carrier', 'trackingNumber'],
  }
  if (!Object.hasOwn(fields, action) || Object.keys(value).some(key => !fields[action].includes(key))) throw new Error('指定された操作の入力内容を確認してください')
  if (action === 'start') return {}
  if (action === 'save') {
    const plannedQuantity = value.plannedQuantity === null || value.plannedQuantity === '' || value.plannedQuantity === undefined ? null : integer(value.plannedQuantity, '予定数量', 10_000_000)
    const productionDueDate = calendarDate(value.productionDueDate, '製造完了予定日')
    const shipmentDueDate = calendarDate(value.shipmentDueDate, '出荷予定日')
    if (productionDueDate && shipmentDueDate && productionDueDate > shipmentDueDate) throw new Error('出荷予定日は製造完了予定日以降にしてください')
    const notes = value.notes === undefined ? '' : value.notes
    if (typeof notes !== 'string' || notes.length > 2000 || notes.includes('\0')) throw new Error('備考を2,000文字以内で入力してください')
    return { plannedQuantity, quantityUnit: singleLine(value.quantityUnit, '数量単位', 20, true), productionDueDate, shipmentDueDate, notes: notes.trim() }
  }
  if (action === 'complete' || action === 'record_completion') {
    const completedOn = calendarDate(value.completedOn, '製造完了日', true)!
    if (completedOn > tokyoToday()) throw new Error('製造完了日に未来の日付は指定できません')
    return { completedQuantity: integer(value.completedQuantity, '完成数量', 10_000_000), completedOn, ...(action === 'complete' ? { finalAmount: integer(value.finalAmount, '最終金額', 100_000_000) } : {}) }
  }
  const shippedOn = calendarDate(value.shippedOn, '発送日', true)!
  if (shippedOn > tokyoToday()) throw new Error('発送日に未来の日付は指定できません')
  return { shippedOn, carrier: singleLine(value.carrier, '配送会社・受渡方法', 100, true), trackingNumber: singleLine(value.trackingNumber, '追跡番号', 100) }
}
