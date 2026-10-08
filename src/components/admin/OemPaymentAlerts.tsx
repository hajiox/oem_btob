'use client'

import { useCallback, useEffect, useState } from 'react'
import { getOemPaymentAlerts } from '@/actions/oemPayments'
import type { PaymentAlert } from '@/lib/oem-payments-shared'
import { OemOrderPanel } from './OemOrderPanel'
import { OemTrialPanel } from './OemTrialPanel'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

const labels = { unconfigured: '請求額・期限を設定', waiting: '入金待ち', overdue: '支払期限超過', excess: '過入金・要確認' }
export function OemPaymentAlerts() {
  const [items, setItems] = useState<PaymentAlert[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PaymentAlert | null>(null)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOemPaymentAlerts()
      if (!result.success) throw new Error(result.error || '入金アラートを取得できませんでした')
      setItems(result.items); setTotal(result.total); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : '入金アラートを取得できませんでした') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener(PAYMENT_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener(PAYMENT_CHANGED, refresh); window.removeEventListener('focus', refresh) }
  }, [reload])
  return <section aria-label="入金確認アラート" style={{ marginBottom: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-card)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>入金確認 {error ? '取得エラー' : loading ? '確認中…' : `${total}件`}</h2>
      <button type="button" onClick={() => void reload()} disabled={loading} style={button}>更新</button>
    </div>
    <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>製造分の着手金・出荷前精算金と、試作費の先入金を分けて確認します。銀行明細の確認は手動です。</p>
    {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}（件数は未確認）</p>}
    {!error && !loading && total === 0 && <p style={{ color: '#4ade80' }}>現在、入金確認が必要な案件はありません。</p>}
    {!error && <div style={{ display: 'grid', gap: 8 }}>{items.map(item => <button key={`${item.order_id || item.trial_id}-${item.stage}`} type="button" onClick={() => setSelected(item)} style={{ ...button, padding: 14, textAlign: 'left', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
      <span><strong>{item.company_name}</strong>　{item.stage === 'trial' ? '試作費先入金' : item.stage === 'deposit' ? '製造着手金' : '製造出荷前精算金'}<small style={{ display: 'block', color: 'var(--admin-text-muted)', marginTop: 4 }}>{item.stage === 'trial' ? `請求書 ${item.invoice_number || '準備中'}` : item.order_number}</small></span>
      <span><strong style={{ color: ['overdue', 'excess'].includes(item.kind) ? '#fca5a5' : '#fbbf24' }}>{labels[item.kind]}</strong><small style={{ display: 'block', marginTop: 4 }}>{item.expected_amount === null ? '請求額未設定' : `請求 ¥${item.expected_amount.toLocaleString()} ／ 入金 ¥${item.received_amount.toLocaleString()}`}　期限 {item.due_date || '未設定'}</small></span>
    </button>)}</div>}
    {!error && total > items.length && <p>全{total}件のうち{items.length}件を表示しています。残りは案件一覧から確認してください。</p>}
    {selected && <div style={{ marginTop: 18, border: '1px solid var(--admin-accent)', padding: 16, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>{selected.company_name}</strong><button type="button" onClick={() => setSelected(null)} style={button}>案件を閉じる</button></div>
      {selected.stage === 'trial' ? <OemTrialPanel key={selected.trial_id} leadId={selected.lead_id} /> : <OemOrderPanel key={selected.order_id} leadId={selected.lead_id} estimatedTotalPrice={0} />}
    </div>}
  </section>
}
const button: React.CSSProperties = { padding: '7px 12px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }
