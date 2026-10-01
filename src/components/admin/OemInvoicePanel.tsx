'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { getOemInvoices, issueOemInvoice, sendOemInvoice } from '@/actions/oemInvoices'
import type { OemOrder } from '@/lib/oem-orders'
import { invoiceTotals, INVOICE_CHANGED, yen, type InvoiceInput, type InvoiceIssuer, type OemInvoice } from '@/lib/oem-invoices-shared'
import type { PaymentStage } from '@/lib/oem-payments-shared'

const EMPTY_ISSUER: InvoiceIssuer = {
  name: '株式会社テクニカルスタッフ（会津ブランド館）', address: '〒965-0044 福島県会津若松市七日町6−15', email: 'staff@aizu-tv.com', registrationNumber: '',
  bankName: 'PayPay銀行', branchName: '本店営業部（001）', accountType: '普通', accountNumber: '3570598', accountHolder: 'カ）テクニカルスタッフ',
}
const issuerLabels: Record<keyof InvoiceIssuer, string> = { name: '発行者名', address: '住所', email: '発行者メールアドレス', registrationNumber: '登録番号（任意）', bankName: '銀行名', branchName: '支店名・支店コード', accountType: '口座種別', accountNumber: '口座番号', accountHolder: '口座名義' }
const mailStatusLabels: Record<string, string> = { sent: '送信済み', pending: '送信中', sending: '送信中', failed: '送信失敗', unknown: '送信結果未確認', not_sent: '未送信' }
const inputStyle = { display: 'block', width: '100%', marginTop: 5, padding: '9px 10px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5, fontSize: 14 }
const labelStyle = { display: 'block', color: 'var(--admin-text-muted)', fontSize: 13 }
const button = { padding: '9px 13px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const primary = { ...button, background: 'var(--admin-accent)', borderColor: 'var(--admin-accent)', color: '#fff', fontWeight: 700 }
const muted = { color: 'var(--admin-text-muted)', fontSize: 13 }

export function OemInvoicePanel({ order, readOnly = false }: { order: OemOrder; readOnly?: boolean }) {
  // Kept as the single vocabulary for status rendering when the compact list is expanded.
  const [invoices, setInvoices] = useState<OemInvoice[]>([])
  const [depositReceived, setDepositReceived] = useState(0)
  const [issuer, setIssuer] = useState<InvoiceIssuer>(EMPTY_ISSUER)
  const stage: PaymentStage = order.status === 'balance_due' ? 'balance' : 'deposit'
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const target = order.status === 'balance_due' && order.final_amount ? order.final_amount : order.formal_quote_amount
  const [taxable8, setTaxable8] = useState('0')
  const [taxable10, setTaxable10] = useState('0')
  const [nonTaxable, setNonTaxable] = useState('0')
  const [previewed, setPreviewed] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, startTransition] = useTransition()
  const requestRef = useRef<{ id: string; payload: string } | null>(null)
  const issuerLoadedRef = useRef(false)
  const [uncertain, setUncertain] = useState(false)
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [loadedInvoices, setLoadedInvoices] = useState(false)

  const load = useCallback(async () => {
    const result = await getOemInvoices(order.id)
    if (!result.success) throw new Error(result.error || '請求書情報を取得できませんでした')
    setInvoices(result.invoices || []); setDepositReceived(result.depositReceived || 0); setLoadedInvoices(true)
    if (result.issuer && !issuerLoadedRef.current) { setIssuer(previous => ({ ...previous, ...result.issuer })); issuerLoadedRef.current = true }
  }, [order.id])
  // Loading is intentionally client-side: invoice state changes after payment events.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { let active = true; setLoadingInvoices(true); void load().catch(error => { if (active) setMessage(error instanceof Error ? error.message : '請求書情報を取得できませんでした') }).finally(() => { if (active) setLoadingInvoices(false) }); return () => { active = false } }, [load])
  useEffect(() => {
    const refresh = () => { void load().catch(() => undefined) }
    window.addEventListener(INVOICE_CHANGED, refresh); window.addEventListener('oem-payment-changed', refresh)
    return () => { window.removeEventListener(INVOICE_CHANGED, refresh); window.removeEventListener('oem-payment-changed', refresh) }
  }, [load])

  const values = { taxable8: Number(taxable8), taxable10: Number(taxable10), nonTaxable: Number(nonTaxable) }
  const totals = useMemo(() => { try { return invoiceTotals(stage, values.taxable8, values.taxable10, values.nonTaxable, depositReceived) } catch { return null } }, [stage, values.taxable8, values.taxable10, values.nonTaxable, depositReceived])
  const issuerComplete = ['name', 'address', 'email', 'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder'].every(field => issuer[field as keyof InvoiceIssuer].trim().length > 0)
  const canIssue = Boolean(totals && values.taxable8 + values.taxable10 + values.nonTaxable === target && dueDate && description && issuerComplete)
  const active = !readOnly && ((stage === 'deposit' && order.status === 'accepted') || (stage === 'balance' && order.status === 'balance_due'))
  const hasActiveInvoice = invoices.some(invoice => invoice.stage === stage)

  function setField(field: keyof InvoiceIssuer, value: string) { setIssuer(previous => ({ ...previous, [field]: value })) }
  function issue() { startTransition(async () => {
    if (loadingInvoices || !loadedInvoices || !active || !totals || !previewed) return
    const payloadBase = { stage, dueDate, description, ...values, issuer }
    const payload = JSON.stringify(payloadBase)
    if (uncertain && requestRef.current?.payload !== payload) { setMessage('前回の結果を再確認してから内容を変更してください。'); return }
    if (!requestRef.current || requestRef.current.payload !== payload) requestRef.current = { id: crypto.randomUUID(), payload }
    setMessage('')
    try {
      const result = await issueOemInvoice(order.id, { requestId: requestRef.current.id, ...payloadBase } as InvoiceInput)
      const uncertainResult = (result as typeof result & { uncertain?: boolean }).uncertain
      if (!result.success) { setUncertain(Boolean(uncertainResult)); setMessage(uncertainResult ? '発行結果を確認できません。同じ内容で再確認してください。' : result.error || '請求書を発行できませんでした'); return }
      setUncertain(false); requestRef.current = null; setMessage(result.message || '請求書を発行しました。メールは送信していません。'); setPreviewed(false)
      await load(); window.dispatchEvent(new Event(INVOICE_CHANGED)); window.dispatchEvent(new Event('oem-payment-changed'))
    } catch { setUncertain(true); setMessage('通信が切れました。同じ内容で再確認してください。') }
  }) }
  function send(invoice: OemInvoice) { startTransition(async () => {
    const isDemoTest = invoice.snapshot.demo === true && invoice.snapshot.email === 'ts@ai.aizu-tv.com'
    if (invoice.snapshot.demo && !isDemoTest) { setMessage('デモ請求書は ts@ai.aizu-tv.com 宛てだけ送信できます。'); return }
    const recipient = invoice.snapshot.email; const amount = invoice.snapshot.amountDue
    const prompt = isDemoTest
      ? `これはテストメールです。支払不要のデモ請求書 ${yen(amount)} を ${recipient} へ送信します。実際の請求・支払いは発生しません。よろしいですか？`
      : `${recipient} へ ${yen(amount)} の請求書メールを送信します。よろしいですか？`
    if (!window.confirm(prompt)) return
    try {
      const result = await sendOemInvoice(invoice.id)
      if (!result.success) { setMessage(result.error || '送信結果を確認できません。再読み込みしました。'); await load().catch(() => undefined); return }
      setMessage(result.message || '請求書メールを送信しました。'); await load(); window.dispatchEvent(new Event(INVOICE_CHANGED)); window.dispatchEvent(new Event('oem-payment-changed'))
    } catch { setMessage('送信結果を確認できません。再読み込みして確認してください。'); await load().catch(() => undefined) }
  }) }

  return <section aria-label="請求書管理" style={{ marginTop: 20, borderTop: '1px solid var(--admin-border)', paddingTop: 18 }}>
    <h4 style={{ margin: '0 0 8px' }}>請求書</h4>
    <p style={muted}>請求書の発行とメール送信は別操作です。金額は税率別に明示入力してください。</p>
    {readOnly && <p style={muted}>元の請求書は固定された履歴です。現在の追加請求・返金額は精算管理を確認してください。</p>}
    {invoices.length > 0 && <div style={{ display: 'grid', gap: 8, margin: '12px 0 18px' }}>{invoices.map(invoice => {
      const isDemoTest = invoice.snapshot.demo === true && invoice.snapshot.email === 'ts@ai.aizu-tv.com'
      const demoBlocked = invoice.snapshot.demo === true && !isDemoTest
      const stageActive = !readOnly && (invoice.stage === 'deposit' ? order.status === 'accepted' : order.status === 'balance_due')
      const alreadyAttempted = ['pending', 'sending', 'unknown', 'failed'].includes(invoice.mail_status || '')
      return <div key={invoice.id} style={card}>
        <strong>{invoice.invoice_number}</strong>　{invoice.stage === 'deposit' ? '前金' : '残金'}　{yen(invoice.snapshot.amountDue)}　<span>{mailStatusLabels[invoice.mail_status || 'not_sent'] || '確認が必要'}</span>
        <p style={muted}>送信元：staff@aizu-tv.com ／ 宛先：{invoice.snapshot.email}</p>
        <a href={`/admin/invoices/${encodeURIComponent(invoice.id)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--admin-accent)' }}>請求書を表示・印刷</a>
        {invoice.mail_status !== 'sent' && stageActive && <button type="button" disabled={busy || demoBlocked} style={{ ...button, marginLeft: 10 }} onClick={() => send(invoice)}>{alreadyAttempted ? '送信状況を再確認（重複送信なし）' : isDemoTest ? 'テストメールを送信（支払不要）' : demoBlocked ? 'デモ送信先不許可' : 'この請求書をメール送信'}</button>}
        {alreadyAttempted && <p style={muted}>送信済みか不明な場合は案件メールを同期してください。同じ請求書は自動で再送しません。</p>}
      </div>
    })}</div>}
    {!active ? <p style={muted}>前金は規約同意後、残金は残金請求ステージで発行できます。</p> : hasActiveInvoice ? <p style={muted}>このステージの請求書は発行済みです。再発行が必要な場合は既存請求書を確認してください。</p> : <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}><label style={labelStyle}>対象<input readOnly value={stage === 'deposit' ? '前金' : '残金'} style={inputStyle} /></label><label style={labelStyle}>支払期限<input disabled={busy || uncertain} required type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); setPreviewed(false) }} style={inputStyle} /></label></div>
      <label style={{ ...labelStyle, marginTop: 10 }}>請求内容<input disabled={busy || uncertain} required maxLength={500} value={description} onChange={e => { setDescription(e.target.value); setPreviewed(false) }} style={inputStyle} /></label>
      <p style={{ ...muted, marginBottom: 4 }}>税抜合計は {yen(target)} と一致させてください（現在：{yen(values.taxable8 + values.taxable10 + values.nonTaxable)}）。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}><label style={labelStyle}>8%対象（税抜）<input disabled={busy || uncertain} type="number" min="0" step="1" value={taxable8} onChange={e => { setTaxable8(e.target.value); setPreviewed(false) }} style={inputStyle} /></label><label style={labelStyle}>10%対象（税抜）<input disabled={busy || uncertain} type="number" min="0" step="1" value={taxable10} onChange={e => { setTaxable10(e.target.value); setPreviewed(false) }} style={inputStyle} /></label><label style={labelStyle}>非課税・対象外<input disabled={busy || uncertain} type="number" min="0" step="1" value={nonTaxable} onChange={e => { setNonTaxable(e.target.value); setPreviewed(false) }} style={inputStyle} /></label></div>
      {totals && <p style={{ margin: '12px 0', padding: 10, background: 'var(--admin-bg)' }}>税込総額 {yen(totals.grossTotal)} ／ 今回請求額 <strong>{yen(totals.amountDue)}</strong>{stage === 'balance' && `（前金入金 ${yen(depositReceived)} を差引）`}</p>}
      <details><summary style={{ cursor: 'pointer' }}>発行者情報（編集可）</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 12 }}>{(['name','address','email','registrationNumber','bankName','branchName','accountType','accountNumber','accountHolder'] as (keyof InvoiceIssuer)[]).map(field => <label key={field} style={labelStyle}>{issuerLabels[field]}<input disabled={busy || uncertain} required={field !== 'registrationNumber'} value={issuer[field]} onChange={e => { setField(field, e.target.value); setPreviewed(false) }} style={inputStyle} /></label>)}</div></details>
      {canIssue && <><label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}><input type="checkbox" checked={previewed} onChange={e => setPreviewed(e.target.checked)} />上記の請求額・支払期限・発行者情報を確認しました</label><button type="button" disabled={loadingInvoices || busy || !previewed || uncertain} style={{ ...primary, marginTop: 12 }} onClick={issue}>{loadingInvoices ? '請求書情報を確認中…' : busy ? '処理中…' : uncertain ? '同じ内容で発行結果を再確認' : '請求書を発行（メール送信なし）'}</button>{uncertain && <button type="button" disabled={busy} style={{ ...button, marginLeft: 8 }} onClick={issue}>同じ内容で再確認</button>}</>}
      {!canIssue && <p style={{ color: '#fca5a5', fontSize: 13 }}>税抜金額の合計を一致させ、支払期限・請求内容・必須の発行者情報を入力してください。</p>}</div>}
    {message && <p role="status" style={{ color: message.includes('できません') || message.includes('切れ') ? '#fca5a5' : '#7dd3fc' }}>{message}</p>}
  </section>
}

const card = { padding: 12, border: '1px solid var(--admin-border)', borderRadius: 6, background: 'var(--admin-bg)', fontSize: 13 }
