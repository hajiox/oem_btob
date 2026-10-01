'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getOemPayments, recordOemPayment, saveOemPaymentPlan } from '@/actions/oemPayments'
import type { PaymentData, PaymentPlan, PaymentStage } from '@/lib/oem-payments-shared'
import type { OemOrderStatus } from '@/lib/oem-order-shared'
import { INVOICE_CHANGED } from '@/lib/oem-invoices-shared'

const yen = (amount: number) => `¥${amount.toLocaleString('ja-JP')}`
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const names = { deposit: '前金', balance: '残金' }
export const PAYMENT_CHANGED = 'oem-payment-changed'

export function OemPaymentPanel({ orderId, status, onChanged, readOnly = false }: { orderId: string; status: OemOrderStatus; onChanged?: () => void | Promise<void>; readOnly?: boolean }) {
  const [data, setData] = useState<PaymentData | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    const result = await getOemPayments(orderId)
    if (!result.success || !result.data) throw new Error(result.error || '入金情報を取得できませんでした')
    setData(result.data); setError('')
  }, [orderId])
  useEffect(() => {
    const refresh = () => { void reload().catch(() => setError('入金情報を取得できませんでした')) }
    window.addEventListener(INVOICE_CHANGED, refresh)
    return () => window.removeEventListener(INVOICE_CHANGED, refresh)
  }, [reload])
  useEffect(() => { let active = true; void getOemPayments(orderId).then(result => {
    if (!active) return
    if (result.success && result.data) { setData(result.data); setError('') }
    else setError(result.error || '入金情報を取得できませんでした')
  }).catch(() => { if (active) setError('入金情報を取得できませんでした') }); return () => { active = false } }, [orderId])
  const changed = async () => { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)); await onChanged?.() }
  if (status === 'issued') return null
  return <section aria-label="入金管理" style={{ marginTop: 20, borderTop: '1px solid var(--admin-border)', paddingTop: 18 }}>
    <h4 style={{ margin: '0 0 8px' }}>入金管理（銀行で確認して手動登録）</h4>
    <p style={muted}>銀行との自動連携はありません。実際の請求額（税込）と、銀行で確認した入金を記録します。</p>
    {readOnly && <p style={muted}>元の前金・残金履歴は閲覧のみです。変更後の入出金は精算管理で記録してください。</p>}
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error} <button type="button" onClick={() => void reload().catch(e => setError(String(e.message)))}>再読み込み</button></p>}
    {!data && !error && <p>入金情報を読み込み中…</p>}
    {data && (['deposit', 'balance'] as PaymentStage[]).map(stage => {
      const plan = data.plans.find(item => item.stage === stage)
      const active = !readOnly && ((stage === 'deposit' && status === 'accepted') || (stage === 'balance' && status === 'balance_due'))
      if (!plan && !active) return null
      return <PaymentStagePanel key={`${orderId}-${stage}`} orderId={orderId} stage={stage} plan={plan} receipts={data.receipts} active={active} onChanged={changed} />
    })}
  </section>
}

function PaymentStagePanel({ orderId, stage, plan, receipts, active, onChanged }: {
  orderId: string; stage: PaymentStage; plan?: PaymentPlan; receipts: PaymentData['receipts']; active: boolean; onChanged: () => Promise<void>
}) {
  const ownReceipts = receipts.filter(item => item.plan_id === plan?.id)
  const received = ownReceipts.reduce((sum, item) => sum + item.amount, 0)
  const remaining = plan ? plan.expected_amount - received : 0
  const [editing, setEditing] = useState(false)
  const [expectedAmount, setExpectedAmount] = useState(String(plan?.expected_amount || ''))
  const [dueDate, setDueDate] = useState(plan?.due_date || '')
  const [expectedPayer, setExpectedPayer] = useState(plan?.payer_name || '')
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [payer, setPayer] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const requestRef = useRef<{ id: string; payload: string } | null>(null)
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busyRef.current) return
    busyRef.current = true; setBusy(true); setMessage('')
    try {
      const result = await saveOemPaymentPlan(orderId, { stage, expectedAmount: Number(expectedAmount), dueDate: dueDate || null, payerName: expectedPayer, expectedUpdatedAt: plan?.updated_at })
      if (!result.success) { setMessage(result.error || '保存できませんでした'); return }
      setEditing(false); await onChanged(); setMessage('請求予定を保存しました。メールは送信していません。')
    } catch { setMessage('保存結果を確認できません。再読み込みして確認してください。') }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function record(event: React.FormEvent) {
    event.preventDefault(); if (!plan || !confirmed || busyRef.current) return
    const payload = JSON.stringify({ amount: Number(amount), paidOn, payerName: payer, note })
    if (requestRef.current && requestRef.current.payload !== payload && uncertain) { setMessage('前回の結果を再確認してから内容を変更してください。'); return }
    if (!requestRef.current || requestRef.current.payload !== payload) requestRef.current = { id: crypto.randomUUID(), payload }
    busyRef.current = true; setBusy(true); setMessage('')
    try {
      const result = await recordOemPayment(plan.id, { requestId: requestRef.current.id, amount: Number(amount), paidOn, payerName: payer, note })
      if (!result.success) { setUncertain(Boolean(result.uncertain)); setMessage(result.uncertain ? '登録結果を確認できません。同じ内容で再確認してください（二重登録されません）。' : result.error || '登録できませんでした'); return }
      setUncertain(false); setAmount(''); setNote(''); setConfirmed(false); requestRef.current = null
      await onChanged(); setMessage(result.message || '入金を記録しました。')
    } catch { setUncertain(true); setMessage('通信が切れました。同じ内容で再確認してください（二重登録されません）。') }
    finally { busyRef.current = false; setBusy(false) }
  }
  return <div style={{ padding: 16, marginTop: 12, borderRadius: 8, border: '1px solid var(--admin-border)', background: 'var(--admin-bg)' }}>
    <h5 style={{ margin: '0 0 10px', fontSize: 16 }}>{names[stage]} {plan && <span style={{ color: remaining === 0 ? '#4ade80' : remaining < 0 ? '#fca5a5' : '#fbbf24' }}>{remaining === 0 ? '確認済み' : remaining < 0 ? '過入金・要確認' : '入金待ち'}</span>}</h5>
    {plan && <>
      <p>請求額（税込）<strong>{yen(plan.expected_amount)}</strong> ／ 入金合計 <strong>{yen(received)}</strong> ／ {remaining < 0 ? '超過' : '残額'} <strong>{yen(Math.abs(remaining))}</strong></p>
      <p style={muted}>支払期限：{plan.due_date || '未設定'} ／ 振込予定名義：{plan.payer_name || '未設定'}</p>
      {active && <button type="button" disabled={busy} style={button} onClick={() => { setExpectedAmount(String(plan.expected_amount)); setDueDate(plan.due_date || ''); setExpectedPayer(plan.payer_name); setEditing(!editing) }}>{editing ? '編集を閉じる' : '請求予定を編集'}</button>}
    </>}
    {active && (!plan || editing) && <form onSubmit={save} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
      {!plan && <p style={{ color: '#fbbf24', margin: 0 }}>まず実際の請求額（税込）を登録してください。</p>}
      <div style={grid}>
        <label>請求額（税込・円）<input required type="number" min="1" max="100000000" step="1" value={expectedAmount} disabled={busy || ownReceipts.length > 0 || plan?.invoiced} onChange={e => setExpectedAmount(e.target.value)} style={input} /></label>
        <label>支払期限<input type="date" value={dueDate} disabled={busy || plan?.invoiced} onChange={e => setDueDate(e.target.value)} style={input} /></label>
        <label>振込予定名義<input maxLength={200} value={expectedPayer} disabled={busy} onChange={e => setExpectedPayer(e.target.value)} style={input} /></label>
      </div>
      {ownReceipts.length > 0 && <p style={muted}>入金記録後は請求額を変更できません。</p>}
      {plan?.invoiced && <p style={muted}>請求書発行済みのため、請求額・支払期限は固定されています。</p>}
      <div><button disabled={busy} style={primary} type="submit">請求予定を保存</button></div>
    </form>}
    {active && plan && remaining > 0 && !editing && <form onSubmit={record} style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      <div style={grid}>
        <label>今回の入金額（円）<input required type="number" min="1" max="100000000" step="1" value={amount} disabled={busy || uncertain} onChange={e => setAmount(e.target.value)} style={input} /></label>
        <label>実際の入金日<input required type="date" max={today()} value={paidOn} disabled={busy || uncertain} onChange={e => setPaidOn(e.target.value)} style={input} /></label>
        <label>実際の振込名義<input required maxLength={200} value={payer} disabled={busy || uncertain} onChange={e => setPayer(e.target.value)} style={input} /></label>
      </div>
      <label>確認メモ（任意）<input maxLength={2000} value={note} disabled={busy || uncertain} onChange={e => setNote(e.target.value)} style={input} /></label>
      {Number(amount) > remaining && <p style={{ color: '#fca5a5', margin: 0 }}>請求残額を超えています。記録後も要確認として残り、工程は進みません。</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />銀行明細で入金日・金額・名義を確認しました</label>
      <div><button type="submit" disabled={busy || !confirmed} style={primary}>{busy ? '記録中…' : uncertain ? '同じ入金の結果を再確認' : '入金確認を記録'}</button></div>
    </form>}
    {ownReceipts.length > 0 && <details style={{ marginTop: 14 }} open><summary>入金履歴（{ownReceipts.length}件）</summary>{ownReceipts.map(item => <div key={item.id} style={{ paddingTop: 10, fontSize: 14 }}><strong>{item.paid_on}　{yen(item.amount)}</strong>　{item.payer_name}<p style={muted}>{item.note || 'メモなし'} ／ 記録：{new Date(item.created_at).toLocaleString('ja-JP')} ／ 確認者ID：{item.confirmed_by}</p></div>)}</details>}
    {message && <p role="status" style={{ color: '#7dd3fc', marginTop: 12 }}>{message}</p>}
  </div>
}

const muted = { color: 'var(--admin-text-muted)', fontSize: 13, margin: '8px 0' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }
const input = { display: 'block', width: '100%', marginTop: 6, padding: '10px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'var(--admin-card)', color: 'var(--admin-text)', colorScheme: 'dark', fontSize: 15 }
const button = { padding: '8px 12px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const primary = { ...button, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700 }
