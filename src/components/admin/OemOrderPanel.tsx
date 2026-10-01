'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { cancelOemOrder, getOemOrder, issueOemOrder, reissueOemOrderLink } from '@/actions/oemOrders'
import type { OemOrder } from '@/lib/oem-orders'
import { OEM_ORDER_STATUS_LABELS } from '@/lib/oem-order-shared'
import { OemPaymentPanel, PAYMENT_CHANGED } from './OemPaymentPanel'
import { OemInvoicePanel } from './OemInvoicePanel'
import { OemFulfillmentPanel } from './OemFulfillmentPanel'
import { OemSettlementPanel } from './OemSettlementPanel'
import { OemDocumentPanel } from './OemDocumentPanel'
import { OemPortalPanel } from './OemPortalPanel'
import { OemApprovalPanel } from './OemApprovalPanel'

export function OemOrderPanel({ leadId, estimatedTotalPrice }: { leadId: string; estimatedTotalPrice: number }) {
  const [order, setOrder] = useState<OemOrder | null>(null)
  const [acceptance, setAcceptance] = useState<Record<string, unknown> | null>(null)
  const [amount, setAmount] = useState(String(estimatedTotalPrice || ''))
  const [specification, setSpecification] = useState('')
  const [message, setMessage] = useState('')
  const [issuedUrl, setIssuedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [settlementState, setSettlementState] = useState({ ready: false, hasSettlement: false, blocked: true, canReissue: false })
  const [approvalState, setApprovalState] = useState({ ready: false, blocked: true })

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
  const cancel = () => startTransition(async () => {
    if (!order || order.status !== 'issued' || !window.confirm('規約同意前の発注を取り下げます。発注URLは利用できなくなります。よろしいですか？')) return
    const result = await cancelOemOrder(order.id)
    setMessage(result.error || result.message || '')
    if (result.success) { await reload(); window.dispatchEvent(new Event(PAYMENT_CHANGED)) }
  })

  return <div style={{ marginTop: 28, borderTop: '1px solid var(--admin-border)', paddingTop: 24 }} onClick={event => event.stopPropagation()}>
    <h4 style={{ fontSize: 17, color: 'var(--admin-text)', marginBottom: 8 }}>正式発注・規約同意</h4>
    <p style={{ margin: '0 0 16px', color: 'var(--admin-text-muted)', fontSize: 14 }}>お客様が専用ページで規約に同意するまで、前金確認以降には進めません。</p>
    {loading && !order ? <p>読み込み中...</p> : !order ? <div style={cardStyle}>
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
      <OemSettlementPanel key={`settlement-${order.id}`} order={order} onChanged={reload} onState={setSettlementState} />
      <OemFulfillmentPanel key={order.id} order={order} onChanged={reload} settlementBlocked={!settlementState.ready || settlementState.blocked} approvalBlocked={!approvalState.ready || approvalState.blocked} />
      <OemInvoicePanel key={`invoice-${order.id}`} order={order} readOnly={!settlementState.ready || settlementState.hasSettlement} />
      <OemPaymentPanel key={`payment-${order.id}`} orderId={order.id} status={order.status} onChanged={reload} readOnly={!settlementState.ready || settlementState.hasSettlement} />
      <details style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>納品書・領収書</summary><OemDocumentPanel order={order} readOnly={!settlementState.ready || settlementState.blocked} /></details>
      {order.status === 'issued' && <button type="button" onClick={cancel} disabled={pending} style={{ ...secondaryButton, marginTop: 16, marginLeft: 10, color: '#fca5a5' }}>同意前の発注を取り下げる</button>}
      {order.status === 'cancelled' && <div style={{ marginTop: 18 }}>
        <p style={{ color: '#fbbf24' }}>この正式発注はキャンセル済みです。元の見積・請求・入金履歴は上に残しています。</p>
        {settlementState.ready && settlementState.canReissue ? <details><summary style={{ cursor: 'pointer' }}>改訂版の正式発注を発行する</summary>
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>正式見積額（税別）<input type="number" min="1" max="100000000" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>正式な商品仕様<textarea value={specification} onChange={e => setSpecification(e.target.value)} maxLength={10000} style={{ ...inputStyle, minHeight: 130 }} /></label>
            <p style={{ fontSize: 13 }}>新しい発注として発行します。旧発注の精算・入金履歴は引き継がず保存されます。</p>
            <button type="button" onClick={issue} disabled={pending} style={primaryButton}>改訂版を発行してメール送信</button>
          </div>
        </details> : <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>キャンセル精算が完了するまで、改訂版の発行を保留します。</p>}
      </div>}
    </div>}
    <details style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>試作・ラベル・最終仕様のお客様承認</summary><OemApprovalPanel key={`approval-${order?.id || leadId}`} leadId={leadId} orderId={order?.id} onState={setApprovalState} /></details>
    <details style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>お客様向け進捗ページ・再注文</summary><OemPortalPanel leadId={leadId} /></details>
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
