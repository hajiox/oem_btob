'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getOemSettlementAlerts } from '@/actions/oemSettlements'
import type { SettlementAlert } from '@/lib/oem-settlements-shared'
import { OemOrderPanel } from './OemOrderPanel'
import { SETTLEMENT_CHANGED } from './OemSettlementPanel'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

const labels: Record<SettlementAlert['kind'], string> = { draft: '精算下書き', collect: '追加請求', refund: '返金', overdue: '精算期限超過', unconfigured: '未設定' }
const colors: Record<SettlementAlert['kind'], string> = { draft: '#fbbf24', collect: '#fbbf24', refund: '#fca5a5', overdue: '#fca5a5', unconfigured: '#fbbf24' }
const button = { padding: '7px 12px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }
type AlertResult = { success: boolean; error?: string; items: SettlementAlert[]; total: number; hasMore?: boolean; nextOffset?: number }

export function OemSettlementAlerts() {
  const [items, setItems] = useState<SettlementAlert[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<SettlementAlert | null>(null)
  const sequence = useRef(0)
  const request = useRef<AbortController | null>(null)

  const reload = useCallback(async (next = 0) => {
    const current = ++sequence.current
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setLoading(true)
    try {
      const result = await getOemSettlementAlerts(next) as unknown as AlertResult
      if (controller.signal.aborted || current !== sequence.current) return
      if (!result.success) { setError(result.error || '精算アラートを取得できませんでした'); return }
      setItems(result.items || []); setTotal(Number(result.total || 0)); setOffset(next); setHasMore(Boolean(result.hasMore ?? ((result.items || []).length === 50 && next + (result.items || []).length < Number(result.total || 0)))); setNextOffset(result.nextOffset ?? (result.hasMore ? next + (result.items || []).length : null)); setError('')
    } catch { if (!controller.signal.aborted && current === sequence.current) setError('精算アラートを取得できませんでした') }
    finally { if (!controller.signal.aborted && current === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => { void reload(); const refresh = () => { if (document.visibilityState === 'visible') void reload() }; window.addEventListener(SETTLEMENT_CHANGED, refresh); window.addEventListener(PAYMENT_CHANGED, refresh); window.addEventListener('focus', refresh); return () => { window.removeEventListener(SETTLEMENT_CHANGED, refresh); window.removeEventListener(PAYMENT_CHANGED, refresh); window.removeEventListener('focus', refresh); request.current?.abort() } }, [reload])

  return <section aria-label="精算アラート" style={section}>
    <div style={header}><h2 style={heading}>精算アラート {error ? '取得エラー' : loading ? '確認中…' : `${total}件`}</h2><button type="button" onClick={() => void reload(offset)} disabled={loading} style={button}>更新</button></div>
    <p style={muted}>精算下書き、追加請求、返金、期限超過を確認します。</p>
    {error && <p role="alert" style={danger}>{error}（件数は未確認）</p>}
    {!error && !loading && total === 0 && <p style={success}>現在、精算アラートはありません。</p>}
    {!error && <div style={{ display: 'grid', gap: 8 }}>{items.map(item => <button key={`${item.order_id}-${item.kind}-${item.settlement_id || 'none'}`} type="button" onClick={() => setSelected(item)} style={{ ...button, padding: 14, textAlign: 'left' as const, display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', gap: 12 }}><span><strong>{item.company_name}</strong><small style={small}>{item.order_number}</small></span><span><strong style={{ color: colors[item.kind] }}>{labels[item.kind]}</strong><small style={small}>{item.remaining == null ? '残額未計算' : item.remaining > 0 ? `追加請求 ${yen(item.remaining)}` : item.remaining < 0 ? `返金 ${yen(Math.abs(item.remaining))}` : '残額なし'}{item.due_date ? ` ／ 期限 ${item.due_date}` : ''}</small></span></button>)}</div>}
    {!error && total > 0 && <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}><small>{offset + 1}〜{offset + items.length}件 / {total}件</small>{offset > 0 && <button type="button" onClick={() => void reload(Math.max(0, offset - 50))} disabled={loading} style={button}>前の50件</button>}{hasMore && nextOffset !== null && <button type="button" onClick={() => void reload(nextOffset)} disabled={loading} style={button}>次の50件</button>}</div>}
    {selected && <div style={{ marginTop: 18, border: '1px solid var(--admin-accent)', padding: 16, borderRadius: 8 }}><div style={header}><strong>{selected.company_name}（{selected.order_number}）</strong><button type="button" onClick={() => setSelected(null)} style={button}>案件を閉じる</button></div><OemOrderPanel key={selected.order_id} leadId={selected.lead_id} estimatedTotalPrice={0} /></div>}
  </section>
}

const yen = (amount: number) => `¥${amount.toLocaleString('ja-JP')}`
const section = { marginBottom: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-card)' }
const header = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }
const heading = { fontSize: 18, margin: 0 }
const muted = { color: 'var(--admin-text-muted)', fontSize: 13 }
const small = { display: 'block', color: 'var(--admin-text-muted)', marginTop: 4, fontSize: 13 }
const danger = { color: '#fca5a5', fontSize: 13 }
const success = { color: '#4ade80', fontSize: 13 }
