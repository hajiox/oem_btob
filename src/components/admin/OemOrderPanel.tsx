'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { advanceOemOrder, cancelOemOrder, getOemOrder, issueOemOrder, reissueOemOrderLink } from '@/actions/oemOrders'
import type { OemOrder } from '@/lib/oem-orders'
import { nextOemOrderStatus, OEM_ORDER_STATUS_LABELS, type OemOrderStatus } from '@/lib/oem-order-shared'
import { OemPaymentPanel, PAYMENT_CHANGED } from './OemPaymentPanel'
import { OemInvoicePanel } from './OemInvoicePanel'

const nextButtonLabels: Partial<Record<OemOrderStatus, string>> = {
  accepted: '前金入金済みにする', deposit_paid: '製造開始にする', in_production: '製造数・最終金額を確定する', balance_due: '全額入金済みにする', paid: '出荷済みにする',
}

export function OemOrderPanel({ leadId, estimatedTotalPrice }: { leadId: string; estimatedTotalPrice: number }) {
  const [order, setOrder] = useState<OemOrder | null>(null)
  const [acceptance, setAcceptance] = useState<Record<string, unknown> | null>(null)
  const [amount, setAmount] = useState(String(estimatedTotalPrice || ''))
  const [finalAmount, setFinalAmount] = useState('')
  const [specification, setSpecification] = useState('')
  const [message, setMessage] = useState('')
  const [issuedUrl, setIssuedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await getOemOrder(leadId)
    if (result.success) {
      setOrder(result.order || null); setAcceptance(result.acceptance || null)
      if (result.defaultSpecification) setSpecification(previous => previous || result.defaultSpecification || '')
    } else setMessage(result.error || '正式発注情報を取得できませんでした')
    setLoading(false)
  }, [leadId])
  useEffect(() => {
    let active = true
    getOemOrder(leadId).then(result => {
      if (!active) return
      if (result.success) {
        setOrder(result.order || null); setAcceptance(result.acceptance || null)
        if (result.defaultSpecification) setSpecification(previous => previous || result.defaultSpecification || '')
        setMessage('')
      } else setMessage(result.error || '正式発注情報を取得できませんでした')
    }).catch(() => { if (active) setMessage('正式発注情報を取得できませんでした') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [leadId])

  const issue = () => startTransition(async () => {
    if (!window.confirm('表示中の正式見積・仕様・規約を固定し、お客様へ正式発注メールを送信します。よろしいですか？')) return
    const result = await issueOemOrder(leadId, { formalQuoteAmount: Number(amount), specification })
    setMessage(result.error || result.mailWarning || result.message || '')
    if (result.url) setIssuedUrl(result.url)
    if (result.success) { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)) }
  })
  const reissue = () => startTransition(async () => {
    if (!order || !window.confirm('以前の発注URLを無効にし、新しいURLをメール送信します。よろしいですか？')) return
    const result = await reissueOemOrderLink(order.id)
    setMessage(result.error || result.mailWarning || result.message || '')
    if (result.url) setIssuedUrl(result.url)
    if (result.success) { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)) }
  })
  const advance = () => startTransition(async () => {
    if (!order) return
    const next = nextOemOrderStatus(order.status)
    if (!next) return
    if (!window.confirm(`「${OEM_ORDER_STATUS_LABELS[next]}」へ進めます。よろしいですか？`)) return
    const result = await advanceOemOrder(order.id, next, next === 'balance_due' ? Number(finalAmount) : undefined)
    setMessage(result.error || result.message || '')
    if (result.success) { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)) }
  })
  const cancel = () => startTransition(async () => {
    if (!order || !window.confirm('この正式発注をキャンセルします。発注URLも利用できなくなります。よろしいですか？')) return
    const result = await cancelOemOrder(order.id)
    setMessage(result.error || result.message || '')
    if (result.success) { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)) }
  })

  return <div style={{ marginTop: 28, borderTop: '1px solid var(--admin-border)', paddingTop: 24 }} onClick={event => event.stopPropagation()}>
    <h4 style={{ fontSize: 17, color: 'var(--admin-text)', marginBottom: 8 }}>正式発注・規約同意</h4>
    <p style={{ margin: '0 0 16px', color: 'var(--admin-text-muted)', fontSize: 14 }}>お客様が専用ページで規約に同意するまで、前金確認以降には進めません。</p>
    {loading ? <p>読み込み中...</p> : !order || order.status === 'cancelled' ? <div style={cardStyle}>
      {order?.status === 'cancelled' && <p style={{ color: '#fbbf24' }}>直前の正式発注はキャンセル済みです。必要なら改訂版を発行できます。</p>}
      <label style={labelStyle}>正式見積額（税別）<input type="number" min="1" max="100000000" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></label>
      <label style={labelStyle}>正式な商品仕様<textarea value={specification} onChange={e => setSpecification(e.target.value)} maxLength={10000} style={{ ...inputStyle, minHeight: 130, resize: 'vertical' }} /></label>
      <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>発行時点の正式見積・仕様・規約版が固定保存されます。前金は正式見積額の50％です。</p>
      <button type="button" onClick={issue} disabled={pending} style={primaryButton}>{pending ? '発行中...' : '正式発注を発行してメール送信'}</button>
    </div> : <div style={cardStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}><strong>{order.order_number}</strong><span style={badgeStyle}>{OEM_ORDER_STATUS_LABELS[order.status]}</span></div>
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, fontSize: 14 }}>
        <span>正式見積（税別）：¥{order.formal_quote_amount.toLocaleString()}</span><span>前金（税別）：¥{order.deposit_amount.toLocaleString()}</span><span>規約版：{order.terms_version}</span>
      </div>
      <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer' }}>固定済みの商品仕様</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.specification}</p></details>
      {order.status === 'issued' && <div style={{ marginTop: 16 }}>
        <p style={{ color: '#fbbf24', marginBottom: 10 }}>お客様の規約同意待ちです。工程ボタンは同意完了後に表示されます。</p>
        <button type="button" onClick={reissue} disabled={pending} style={secondaryButton}>期限を延長して発注リンクを再送</button>
      </div>}
      {acceptance && <p style={{ margin: '14px 0 0', color: '#4ade80', fontSize: 14 }}>規約同意：{String(acceptance.contact_name)} 様／{new Date(String(acceptance.accepted_at)).toLocaleString('ja-JP')}</p>}
      {order.status === 'in_production' && <label style={{ ...labelStyle, marginTop: 16 }}>完成数量確定後の最終金額（税別）<input type="number" min="1" max="100000000" value={finalAmount} onChange={e => setFinalAmount(e.target.value)} style={inputStyle} /></label>}
      {nextOemOrderStatus(order.status) && !['accepted', 'balance_due'].includes(order.status) && <button type="button" onClick={advance} disabled={pending} style={{ ...primaryButton, marginTop: 16 }}>{nextButtonLabels[order.status]}</button>}
      <OemInvoicePanel order={order} />
      <OemPaymentPanel orderId={order.id} status={order.status} onChanged={reload} />
      {!['shipped', 'cancelled'].includes(order.status) && <button type="button" onClick={cancel} disabled={pending} style={{ ...secondaryButton, marginTop: 16, marginLeft: 10, color: '#fca5a5' }}>キャンセル</button>}
    </div>}
    {issuedUrl && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--admin-text-muted)', overflowWrap: 'anywhere' }}>今回発行したURL（再表示不可）：<a href={issuedUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--admin-accent)' }}>{issuedUrl}</a></div>}
    {message && <p role="status" style={{ marginTop: 12, color: message.includes('できません') || message.includes('必要') ? '#f87171' : '#4ade80' }}>{message}</p>}
  </div>
}

const cardStyle = { background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: 8, padding: 20 }
const labelStyle = { display: 'block', marginBottom: 14, color: 'var(--admin-text-muted)', fontSize: 14 }
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, fontSize: 16 }
const primaryButton = { padding: '10px 16px', border: 0, borderRadius: 6, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }
const secondaryButton = { padding: '9px 14px', border: '1px solid var(--admin-border)', borderRadius: 6, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const badgeStyle = { display: 'inline-block', padding: '4px 9px', borderRadius: 999, background: 'rgba(6,182,212,.14)', color: '#67e8f9', fontSize: 12, fontWeight: 800 }
