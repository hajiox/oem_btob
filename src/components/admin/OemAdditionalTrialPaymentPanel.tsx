'use client'

import { useRef, useState } from 'react'
import { recordOemAdditionalTrialReceipt, voidOemAdditionalTrialPayment } from '@/actions/oemAdditionalTrialPayments'
import type { AdditionalTrialPaymentData } from '@/lib/oem-additional-trial-payments-shared'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

export function OemAdditionalTrialPaymentPanel({ payment, onChanged }: { payment: AdditionalTrialPaymentData; onChanged: () => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(today())
  const [payer, setPayer] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState('')
  const request = useRef<{ id: string; payload: string } | null>(null)
  const received = payment.receipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0)
  const record = async () => {
    if (busy || payment.status !== 'awaiting_payment' || !confirmed || !amount || !payer.trim()) return
    const payload = JSON.stringify({ paymentId: payment.id, amount, paidOn, payer, note })
    if (uncertain && request.current?.payload !== payload) { setMessage('前回の入金結果を再確認してから内容を変更してください。'); return }
    const requestId = request.current?.payload === payload ? request.current.id : crypto.randomUUID()
    request.current = { id: requestId, payload }; setBusy(true); setMessage('')
    try {
      const result = await recordOemAdditionalTrialReceipt(payment.id, { requestId, amount: Number(amount), paidOn, payerName: payer, note })
      if (!result.success && 'uncertain' in result && result.uncertain) setUncertain(true)
      setMessage(('error' in result ? result.error : '') || (result.success ? (result.status === 'partial' ? '追加試作の部分入金を記録しました。' : '追加試作の入金を記録しました。') : ''))
      if (result.success) { request.current = null; setUncertain(false); setAmount(''); setPayer(''); setNote(''); setConfirmed(false); window.dispatchEvent(new Event(PAYMENT_CHANGED)); await onChanged() }
    } catch { setUncertain(true); setMessage('入金結果を確認できませんでした。同じ内容で再確認してください。') } finally { setBusy(false) }
  }
  const voidPayment = async () => {
    if (busy || payment.status !== 'awaiting_payment' || received !== 0) return
    const reason = window.prompt('未入金の追加試作請求を取り下げる理由を入力してください。')
    if (!reason?.trim()) return
    setBusy(true); setMessage('')
    try {
      const result = await voidOemAdditionalTrialPayment(payment.id, reason)
      setMessage(('error' in result ? result.error : '') || (result.success ? '追加試作請求を取り下げました。' : ''))
      if (result.success) { window.dispatchEvent(new Event(PAYMENT_CHANGED)); await onChanged() }
    } catch { setMessage('取り下げ結果を確認できませんでした。履歴を更新してください。') } finally { setBusy(false) }
  }
  return <section aria-label="追加試作請求" style={{ marginTop: 12, padding: 14, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
    <h4 style={{ margin: '0 0 8px' }}>追加試作費の請求</h4>
    <p style={muted}>追加試作費：税別3,000円（税込3,300円）。初回試作費とは別の請求です。お支払期限は請求書をご確認ください。</p>
    <p style={muted}>請求書番号：{payment.invoice_number} {payment.status === 'void' ? <>（取り下げ済み・URL無効）{payment.void_reason ? ` 理由：${payment.void_reason}` : ''}</> : payment.invoiceUrl ? <a href={payment.invoiceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--admin-accent)' }}>顧客用請求書URLを表示</a> : null}</p>
    <p style={muted}>状態：<strong>{payment.status === 'paid' ? '入金確認済み' : payment.status === 'void' ? '無効' : '入金待ち'}</strong> ／ 請求額：{yen(payment.gross_amount)} ／ 入金合計：{yen(received)}</p>
    {payment.status === 'awaiting_payment' && <div style={{ display: 'grid', gap: 10 }}>
      <label>今回の入金額（税込）<input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} style={input} /></label>
      <label>入金日<input type="date" max={today()} value={paidOn} onChange={event => setPaidOn(event.target.value)} style={input} /></label>
      <label>振込名義<input value={payer} onChange={event => setPayer(event.target.value)} style={input} /></label>
      <label>確認メモ<input value={note} onChange={event => setNote(event.target.value)} style={input} /></label>
      <label style={muted}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 銀行明細で入金日・金額・名義を確認しました</label>
      <button type="button" disabled={busy || !confirmed || !amount || !payer.trim()} onClick={() => void record()} style={button}>{busy ? '記録中…' : '入金確認を記録'}</button>
    </div>}
    {payment.receipts.length > 0 && <details open style={{ marginTop: 12 }}><summary>入金明細（{payment.receipts.length}件）</summary>{payment.receipts.map(receipt => <p key={receipt.id} style={muted}>{yen(Number(receipt.amount))} ／ 入金日：{receipt.paid_on} ／ 振込名義：{receipt.payer_name} ／ 確認者：{receipt.confirmed_by} ／ メモ：{receipt.note || 'なし'}</p>)}</details>}
    {payment.status === 'awaiting_payment' && received === 0 && <button type="button" disabled={busy} onClick={() => void voidPayment()} style={{ ...button, color: '#fca5a5' }}>未入金の追加試作請求を取り下げ</button>}
    {message && <p role="status" style={muted}>{message}</p>}
  </section>
}

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`
const muted = { fontSize: 13, color: 'var(--admin-text-muted)', lineHeight: 1.8 }
const input = { display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5 }
const button = { padding: '8px 12px', marginTop: 10, background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }
