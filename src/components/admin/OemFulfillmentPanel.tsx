'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getOemFulfillment, updateOemFulfillment } from '@/actions/oemFulfillment'
import type { FulfillmentAction, FulfillmentInput, OemFulfillment } from '@/lib/oem-fulfillment-shared'
import { tokyoToday } from '@/lib/oem-fulfillment-shared'
import type { OemOrder } from '@/lib/oem-orders'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

export const FULFILLMENT_CHANGED = 'oem-fulfillment-changed'

const editableStatuses = ['accepted', 'deposit_paid', 'in_production', 'balance_due', 'paid']
const completeStatuses = ['in_production']
const backfillStatuses = ['balance_due', 'paid']
const dateLabel = (value: string | null | undefined) => value || '未設定'

type Props = { order: OemOrder; onChanged: () => Promise<void> | void }

export function OemFulfillmentPanel({ order, onChanged }: Props) {
  const [data, setData] = useState<OemFulfillment | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const sequence = useRef(0)
  const [plannedQuantity, setPlannedQuantity] = useState('')
  const [quantityUnit, setQuantityUnit] = useState('個')
  const [productionDueDate, setProductionDueDate] = useState('')
  const [shipmentDueDate, setShipmentDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [completedQuantity, setCompletedQuantity] = useState('')
  const [completedOn, setCompletedOn] = useState('')
  const [finalAmount, setFinalAmount] = useState('')
  const [shippedOn, setShippedOn] = useState('')
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [today, setToday] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const load = useCallback(async (overwriteDraft = false) => {
    const current = ++sequence.current
    try {
      const result = await getOemFulfillment(order.id)
      if (current !== sequence.current) return
      if (!result.success) { setError(result.error || '製造・発送情報を取得できませんでした'); return }
      const next = result.fulfillment || null
      setData(next); setError('')
      if (next && overwriteDraft) {
        setPlannedQuantity(next.planned_quantity == null ? '' : String(next.planned_quantity))
        setQuantityUnit(next.quantity_unit || '個')
        setProductionDueDate(next.production_due_date || '')
        setShipmentDueDate(next.shipment_due_date || '')
        setNotes(next.notes || '')
        setCompletedQuantity(next.completed_quantity == null ? '' : String(next.completed_quantity))
        setCompletedOn(next.completed_on || tokyoToday())
        setShippedOn(next.shipped_on || tokyoToday())
        setCarrier(next.carrier || '')
        setTrackingNumber(next.tracking_number || '')
      }
      setLoaded(true)
    } catch { if (current === sequence.current) setError('製造・発送情報を取得できませんでした') }
  }, [order.id])

  useEffect(() => { void load(true) }, [load])
  // Payment changes can move the parent order into `paid`; refresh the
  // fulfillment row while preserving any in-progress draft fields.
  useEffect(() => {
    const refresh = () => { if (!busyRef.current) void load(false) }
    window.addEventListener(PAYMENT_CHANGED, refresh)
    return () => window.removeEventListener(PAYMENT_CHANGED, refresh)
  }, [load])
  useEffect(() => {
    const value = tokyoToday()
    setToday(value)
    setCompletedOn(previous => previous || value)
    setShippedOn(previous => previous || value)
  }, [])

  const inputFrom = (form: HTMLFormElement, action: FulfillmentAction): FulfillmentInput => {
    const values = new FormData(form)
    const value = (name: string, fallback: string) => String(values.get(name) ?? fallback)
    const all: FulfillmentInput = {
      plannedQuantity: Number(value('plannedQuantity', plannedQuantity)) || undefined,
      quantityUnit: value('quantityUnit', quantityUnit).trim() || '個',
      productionDueDate: value('productionDueDate', productionDueDate) || undefined,
      shipmentDueDate: value('shipmentDueDate', shipmentDueDate) || undefined,
      notes: value('notes', notes),
      completedQuantity: Number(value('completedQuantity', completedQuantity)) || undefined,
      completedOn: value('completedOn', completedOn) || undefined,
      finalAmount: Number(value('finalAmount', finalAmount)) || undefined,
      shippedOn: value('shippedOn', shippedOn) || undefined,
      carrier: value('carrier', carrier).trim() || undefined,
      trackingNumber: value('trackingNumber', trackingNumber).trim() || undefined,
    }
    if (action === 'start') return {}
    if (action === 'save') return { plannedQuantity: all.plannedQuantity, quantityUnit: all.quantityUnit, productionDueDate: all.productionDueDate, shipmentDueDate: all.shipmentDueDate, notes: all.notes }
    if (action === 'complete') return { completedQuantity: all.completedQuantity, completedOn: all.completedOn, finalAmount: all.finalAmount }
    if (action === 'record_completion') return { completedQuantity: all.completedQuantity, completedOn: all.completedOn }
    return { shippedOn: all.shippedOn, carrier: all.carrier, trackingNumber: all.trackingNumber }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current) return
    const form = event.currentTarget
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const action = String(submitter?.value || 'save') as FulfillmentAction
    const input = inputFrom(form, action)
    const qty = input.completedQuantity
    if ((action === 'complete' || action === 'record_completion') && (!qty || qty < 1 || !input.completedOn || (action === 'complete' && (!input.finalAmount || input.finalAmount < 1)))) {
      setMessage(action === 'complete' ? '完成数量・完成日・最終金額を入力してください。' : '完成数量・完成日を入力してください。'); return
    }
    if (action === 'ship' && (!input.shippedOn || !input.carrier)) { setMessage('出荷日と配送会社・受渡方法を入力してください。'); return }
    if (['complete', 'record_completion', 'ship'].includes(action) && !confirmed) { setMessage('内容を確認し、確認欄にチェックしてください。'); return }
    busyRef.current = true; setBusy(true); setMessage(''); setError('')
    try {
      const result = await updateOemFulfillment(order.id, action, input, data?.version ?? 0)
      if (!result.success) {
        setMessage(result.error || '保存できませんでした。再読み込みして確認してください。')
        if (result.error?.includes('競合') || result.error?.includes('更新')) await load(false)
        return
      }
      setConfirmed(false)
      await load(true)
      window.dispatchEvent(new Event(FULFILLMENT_CHANGED))
      if (['start', 'complete', 'record_completion', 'ship'].includes(action)) window.dispatchEvent(new Event(PAYMENT_CHANGED))
      await onChanged()
      setMessage(result.message || '製造・発送情報を保存しました。')
    } catch { setMessage('保存結果を確認できません。再読み込みして確認してください。') }
    finally { busyRef.current = false; setBusy(false) }
  }

  if (!editableStatuses.includes(order.status) && !data) return null
  const viewData: OemFulfillment = data || { order_id: order.id, planned_quantity: null, quantity_unit: quantityUnit || '個', production_due_date: null, shipment_due_date: null, started_on: null, completed_quantity: null, completed_on: null, shipped_on: null, carrier: '', tracking_number: '', notes: '', version: 0, updated_at: '', updated_by: null }
  const completed = viewData.completed_quantity != null
  const canPlan = editableStatuses.includes(order.status) && !['shipped', 'cancelled'].includes(order.status)
  const canStart = order.status === 'deposit_paid' && viewData.planned_quantity != null && Number(plannedQuantity) === viewData.planned_quantity && quantityUnit.trim() === viewData.quantity_unit
  const canComplete = completeStatuses.includes(order.status) && !completed
  const canBackfill = backfillStatuses.includes(order.status) && !completed
  const canShip = order.status === 'paid' && completed && !data?.shipped_on

  return <section aria-label="製造・発送管理" style={section}>
    <h4 style={heading}>製造・発送管理</h4>
    {error && <p role="alert" style={danger}>{error} <button type="button" disabled={busy} onClick={() => void load(false)} style={linkButton}>再読み込み</button></p>}
    {!loaded && !error && <p>読み込み中…</p>}
    {loaded && <form onSubmit={submit}>
      <div style={grid}>
        <label>製造予定数量<input name="plannedQuantity" type="number" min="1" max="10000000" step="1" value={plannedQuantity} disabled={busy || !canPlan || completed} onChange={e => setPlannedQuantity(e.target.value)} style={input} /></label>
        <label>単位<input name="quantityUnit" maxLength={20} value={quantityUnit} disabled={busy || !canPlan || completed} onChange={e => setQuantityUnit(e.target.value)} style={input} /></label>
        <label>製造完了予定日<input name="productionDueDate" type="date" value={productionDueDate} disabled={busy || !canPlan} onChange={e => setProductionDueDate(e.target.value)} style={input} /></label>
        <label>納期（出荷予定日）<input name="shipmentDueDate" type="date" value={shipmentDueDate} disabled={busy || !canPlan} onChange={e => setShipmentDueDate(e.target.value)} style={input} /></label>
      </div>
      <label>メモ<textarea name="notes" maxLength={2000} value={notes} disabled={busy || !canPlan} onChange={e => setNotes(e.target.value)} style={{ ...input, minHeight: 70, resize: 'vertical' }} /></label>
      {canPlan && <button name="action" value="save" type="submit" disabled={busy} style={secondary}>{busy ? '保存中…' : '製造計画を保存'}</button>}
      <div style={summary}><span>製造開始日：{dateLabel(viewData.started_on)}</span><span>完成数量：{completed ? `${viewData.completed_quantity} ${viewData.quantity_unit}` : '未記録'}</span><span>完成日：{dateLabel(viewData.completed_on)}</span><span>出荷日：{dateLabel(viewData.shipped_on)}</span></div>
      {canStart && <button name="action" value="start" type="submit" disabled={busy} style={primary}>製造開始</button>}
      {(canComplete || canBackfill) && <div style={card}>
        <strong>{canComplete ? '製造完了を記録' : '既存案件の完成情報を追加'}</strong>
        <div style={grid}>
          <label>完成数量<input name="completedQuantity" type="number" min="1" max="10000000" step="1" value={completedQuantity} disabled={busy} onChange={e => setCompletedQuantity(e.target.value)} style={input} /></label>
          <label>完成日<input name="completedOn" type="date" max={today || undefined} value={completedOn} disabled={busy} onChange={e => setCompletedOn(e.target.value)} style={input} /></label>
          {canComplete && <label>最終金額（税別・円）<input name="finalAmount" type="number" min="1" max="100000000" step="1" value={finalAmount} disabled={busy} onChange={e => setFinalAmount(e.target.value)} style={input} /></label>}
        </div>
        {canComplete && <p style={muted}>最終金額は数量から比例計算せず、別管理の請求額として保存します。</p>}
        <label style={check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> 数量・完成日{canComplete ? '・最終金額' : ''}を確認しました</label>
        <button name="action" value={canComplete ? 'complete' : 'record_completion'} type="submit" disabled={busy || !confirmed} style={primary}>{canComplete ? '製造完了を確定' : '完成情報を記録'}</button>
      </div>}
      {canShip && <div style={card}>
        <strong>出荷情報</strong>
        <div style={grid}>
          <label>出荷日<input name="shippedOn" type="date" max={today || undefined} value={shippedOn} disabled={busy} onChange={e => setShippedOn(e.target.value)} style={input} /></label>
          <label>配送会社・受渡方法<input name="carrier" maxLength={100} placeholder="例：引き取り" value={carrier} disabled={busy} onChange={e => setCarrier(e.target.value)} style={input} /></label>
          <label>追跡番号（ある場合）<input name="trackingNumber" maxLength={100} value={trackingNumber} disabled={busy} onChange={e => setTrackingNumber(e.target.value)} style={input} /></label>
        </div>
        <label style={check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> 表示中の発送情報を確認しました</label>
        <button name="action" value="ship" type="submit" disabled={busy || !confirmed} style={primary}>発送情報を保存して出荷済みにする</button>
      </div>}
      {viewData.shipped_on && <p style={muted}>出荷済み：{viewData.shipped_on} ／ {viewData.carrier || '受渡方法未設定'}{viewData.tracking_number ? ` ／ ${viewData.tracking_number}` : ''}</p>}
    </form>}
    {message && <p role="status" style={message.includes('できません') || message.includes('入力') || message.includes('確認') ? danger : success}>{message}</p>}
  </section>
}

const section = { marginTop: 20, borderTop: '1px solid var(--admin-border)', paddingTop: 18 }
const heading = { margin: '0 0 10px', fontSize: 17, color: 'var(--admin-text)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 12 }
const input = { display: 'block', width: '100%', marginTop: 6, padding: '10px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'var(--admin-bg)', color: 'var(--admin-text)', colorScheme: 'dark', fontSize: 15 }
const card = { marginTop: 16, padding: 14, border: '1px solid var(--admin-border)', borderRadius: 8, background: 'var(--admin-bg)' }
const summary = { display: 'flex', flexWrap: 'wrap' as const, gap: 14, margin: '16px 0', color: 'var(--admin-text-muted)', fontSize: 13 }
const primary = { marginTop: 10, padding: '9px 14px', border: 0, borderRadius: 6, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }
const secondary = { marginTop: 2, padding: '8px 12px', border: '1px solid var(--admin-border)', borderRadius: 6, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const check = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--admin-text-muted)', fontSize: 13 }
const muted = { color: 'var(--admin-text-muted)', fontSize: 13 }
const danger = { color: '#fca5a5', fontSize: 13 }
const success = { color: '#7dd3fc', fontSize: 13 }
const linkButton = { marginLeft: 8, border: 0, background: 'transparent', color: 'var(--admin-accent)', textDecoration: 'underline', cursor: 'pointer' }
