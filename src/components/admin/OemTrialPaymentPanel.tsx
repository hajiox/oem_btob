'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createOemTrialPrepayment, getOemTrialPrepayment, recordOemTrialPrepaymentReceipt, voidOemTrialPrepayment } from '@/actions/oemTrialPayments'
import { TRIAL_PREPAYMENT_INITIAL_GROSS, type TrialPrepayment, type TrialPrepaymentInvoice } from '@/lib/oem-trial-payments-shared'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

type Props = { leadId: string; companyKey: string; identityEvidence: string; claimIncluded: boolean; onPaid?: (paid: boolean) => void; onIdentity?: (value: { companyKey: string; identityEvidence: string; claimIncluded: boolean }) => void }
type Issuer = { name: string; address: string; email: string; registrationNumber: string; bankName: string; branchName: string; accountType: string; accountNumber: string; accountHolder: string }
type PaymentResult = { success: true; prepayment: TrialPrepayment | null; invoices: Array<TrialPrepaymentInvoice & { invoiceUrl: string }>; receipts: Array<{ id: string; prepayment_id: string; request_id: string; amount: number; paid_on: string; payer_name: string; note: string | null; confirmed_by: string; created_at: string }> }
const emptyIssuer: Issuer = { name: '', address: '', email: '', registrationNumber: '', bankName: '', branchName: '', accountType: '', accountNumber: '', accountHolder: '' }
const issuerLabels: Record<keyof Issuer, string> = { name: '発行者名', address: '発行者住所', email: '発行者メール', registrationNumber: '適格請求書登録番号（任意）', bankName: '銀行名', branchName: '支店名', accountType: '口座種別', accountNumber: '口座番号', accountHolder: '口座名義' }
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`

export function OemTrialPaymentPanel({ leadId, companyKey, identityEvidence, claimIncluded, onPaid, onIdentity }: Props) {
  const [data, setData] = useState<PaymentResult | null>(null)
  const [issuer, setIssuer] = useState<Issuer>(emptyIssuer)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(today())
  const [payer, setPayer] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const createRequest = useRef<{ id: string; payload: string } | null>(null)
  const receiptRequest = useRef<{ id: string; payload: string } | null>(null)
  const load = useCallback(async () => { const r = await getOemTrialPrepayment(leadId); if (!r.success) throw new Error('error' in r ? r.error : '試作前払い情報を取得できませんでした'); const next = r as PaymentResult; setData(next); onPaid?.(next.prepayment?.status === 'paid'); if (next.prepayment) onIdentity?.({ companyKey: next.prepayment.company_key, identityEvidence: next.prepayment.identity_evidence, claimIncluded: next.prepayment.claim_included }) }, [leadId, onIdentity, onPaid])
  useEffect(() => { void load().catch(e => setMessage(e instanceof Error ? e.message : '試作前払い情報を取得できませんでした')) }, [load])
  const setField = (key: keyof Issuer, value: string) => setIssuer(v => ({ ...v, [key]: value }))
  const create = async () => {
    if (busy || !companyKey.trim() || !identityEvidence.trim()) return
    const payload = JSON.stringify({ companyKey, identityEvidence, claimIncluded, issuer })
    if (uncertain && createRequest.current?.payload !== payload) { setMessage('前回の発行結果を再確認してから内容を変更してください。'); return }
    const requestId = createRequest.current?.payload === payload ? createRequest.current.id : crypto.randomUUID()
    createRequest.current = { id: requestId, payload }; setBusy(true); setMessage('')
    try {
      const r = await createOemTrialPrepayment(leadId, { companyKey, identityEvidence, claimIncluded, requestId, issuer })
      if (!r.success && 'uncertain' in r && r.uncertain) setUncertain(true)
      setMessage(('error' in r ? r.error : '') || (r.success ? `試作前払い請求を発行しました（税込${yen(Number('grossAmount' in r ? r.grossAmount : TRIAL_PREPAYMENT_INITIAL_GROSS))}）。` : ''))
      if (r.success) { createRequest.current = null; setUncertain(false); window.dispatchEvent(new Event(PAYMENT_CHANGED)); await load().catch(() => setMessage('試作前払い請求は発行済みです。履歴を更新して請求書を確認してください。')) }
    } catch { setUncertain(true); setMessage('発行結果を確認できませんでした。同じ内容で再確認してください。') } finally { setBusy(false) }
  }
  const record = async () => {
    if (busy || !data?.prepayment?.id || !confirmed) return
    const payload = JSON.stringify({ prepaymentId: data.prepayment.id, amount, paidOn, payer, note })
    if (uncertain && receiptRequest.current?.payload !== payload) { setMessage('前回の入金結果を再確認してから内容を変更してください。'); return }
    const requestId = receiptRequest.current?.payload === payload ? receiptRequest.current.id : crypto.randomUUID()
    receiptRequest.current = { id: requestId, payload }; setBusy(true); setMessage('')
    try {
      const r = await recordOemTrialPrepaymentReceipt(data.prepayment.id, { requestId, amount: Number(amount), paidOn, payerName: payer, note })
      if (!r.success && 'uncertain' in r && r.uncertain) setUncertain(true)
      setMessage(('error' in r ? r.error : '') || (r.success ? ('status' in r && r.status === 'partial' ? '部分入金を記録しました。全額の入金確認後に試作を開始できます。' : '試作前払いの入金を記録しました。履歴の入金確認済み表示を確認してから試作を開始してください。') : ''))
      if (r.success) { receiptRequest.current = null; setUncertain(false); setAmount(''); setPayer(''); setNote(''); setConfirmed(false); window.dispatchEvent(new Event(PAYMENT_CHANGED)); await load().catch(() => setMessage('入金記録は保存済みです。履歴を更新して入金状態を確認してください。')) }
    } catch { setUncertain(true); setMessage('入金結果を確認できませんでした。同じ内容で再確認してください。') } finally { setBusy(false) }
  }
  const voidPrepayment = async () => { if (!prepayment || received !== 0 || prepayment.status !== 'awaiting_payment' || busy) return; const reason = window.prompt('未入金の試作前払いを取り下げる理由を入力してください。'); if (!reason?.trim()) return; setBusy(true); setMessage(''); try { const r = await voidOemTrialPrepayment(prepayment.id, reason); setMessage(('error' in r ? r.error : '') || (r.success ? '試作前払いを取り下げました。' : '')); if (r.success) { window.dispatchEvent(new Event(PAYMENT_CHANGED)); await load() } } catch { setMessage('取り下げ結果を確認できませんでした。再読み込みして確認してください。') } finally { setBusy(false) } }
  const prepayment = data?.prepayment
  const received = (data?.receipts || []).reduce((n: number, r: { amount: number }) => n + Number(r.amount || 0), 0)
  return <section aria-label="試作前払い管理" style={{ marginTop: 16, padding: 16, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
    <h4 style={{ margin: '0 0 8px' }}>試作費の先入金</h4>
    <p style={muted}>初回試作2回までの費用は税別5,000円（税込5,500円）です。先入金を確認してから試作を開始します。試作のみで終了できます。製造へ進む場合は、製造着手金50％と出荷前精算金が別途必要です。</p>
    {!prepayment && <p style={muted}>今回の請求：{claimIncluded ? '初回特典5,000円（税別・税込5,500円）' : '通常料金10,000円（税別・税込11,000円）'}。初回特典を使う場合は、下の対象確認にチェックしてください。</p>}
    {!prepayment ? <>
      <div style={grid}>{(Object.keys(issuerLabels) as Array<keyof Issuer>).map(key => <label key={key}>{issuerLabels[key]}<input value={issuer[key]} onChange={e => setField(key, e.target.value)} style={input} /></label>)}</div>
      <button type="button" disabled={busy || !companyKey.trim() || !identityEvidence.trim()} onClick={() => void create()} style={button}>{busy ? '処理中…' : '試作前払い請求を発行'}</button>
    </> : <>
      <p style={muted}>状態：<strong>{prepayment.status === 'paid' ? '入金確認済み（試作開始可）' : prepayment.status === 'void' ? '無効' : '入金待ち'}</strong> ／ 請求額：{yen(prepayment.gross_amount)} ／ 入金合計：{yen(received)}</p>
      {(data.invoices || []).map(invoice => <p key={invoice.id} style={muted}>請求書番号：{invoice.invoice_number}　{prepayment.status === 'void' ? '取り下げ済み（URL無効）' : <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--admin-accent)' }}>顧客用請求書URLを表示</a>}</p>)}
      {prepayment.status === 'awaiting_payment' && <div style={{ display: 'grid', gap: 10 }}><label>今回の入金額（税込）<input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} style={input} /></label><label>入金日<input type="date" max={today()} value={paidOn} onChange={e => setPaidOn(e.target.value)} style={input} /></label><label>振込名義<input value={payer} onChange={e => setPayer(e.target.value)} style={input} /></label><label>確認メモ<input value={note} onChange={e => setNote(e.target.value)} style={input} /></label><label style={muted}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 銀行明細で入金日・金額・名義を確認しました</label><button type="button" disabled={busy || !confirmed || !amount || !payer.trim()} onClick={() => void record()} style={button}>{busy ? '記録中…' : '入金確認を記録'}</button></div>}
      {(data.receipts || []).length > 0 && <details open style={{ marginTop: 12 }}><summary>入金明細（{data.receipts.length}件）</summary>{data.receipts.map(receipt => <p key={receipt.id} style={muted}>{yen(Number(receipt.amount))} ／ 入金日：{receipt.paid_on} ／ 振込名義：{receipt.payer_name} ／ 確認者：{receipt.confirmed_by} ／ 記録：{new Date(receipt.created_at).toLocaleString('ja-JP')} ／ メモ：{receipt.note || 'なし'}</p>)}</details>}
      {prepayment.status === 'awaiting_payment' && received === 0 && <button type="button" disabled={busy} onClick={() => void voidPrepayment()} style={{ ...button, color: '#fca5a5' }}>未入金の試作前払いを取り下げ</button>}
    </>}
    {message && <p role="status" style={muted}>{message}</p>}
  </section>
}
const muted = { fontSize: 13, color: 'var(--admin-text-muted)', lineHeight: 1.8 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }
const input = { display: 'block', width: '100%', marginTop: 5, padding: '8px 10px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5 }
const button = { padding: '8px 12px', marginTop: 10, background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }
