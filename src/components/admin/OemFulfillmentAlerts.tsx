'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getOemFulfillmentAlerts } from '@/actions/oemFulfillment'
import type { FulfillmentAlert } from '@/lib/oem-fulfillment-shared'
import { OemOrderPanel } from './OemOrderPanel'
import { FULFILLMENT_CHANGED } from './OemFulfillmentPanel'

const labels: Record<FulfillmentAlert['kind'], string> = {
  shipment_overdue: '出荷予定超過', production_overdue: '製造予定超過', unconfigured: '計画未設定', ready_to_ship: '出荷待ち',
}
const badgeColor: Record<FulfillmentAlert['kind'], string> = {
  shipment_overdue: '#fca5a5', production_overdue: '#fca5a5', unconfigured: '#fbbf24', ready_to_ship: '#4ade80',
}
const button = { padding: '7px 12px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }

export function OemFulfillmentAlerts() {
  const [items, setItems] = useState<FulfillmentAlert[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<FulfillmentAlert | null>(null)
  const sequence = useRef(0)
  const request = useRef<AbortController | null>(null)

  const reload = useCallback(async (nextOffset = 0) => {
    const current = ++sequence.current
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    try {
      const result = await getOemFulfillmentAlerts(nextOffset)
      if (controller.signal.aborted || current !== sequence.current) return
      if (!result.success) { setError(result.error || '製造・発送アラートを取得できませんでした'); return }
      setItems(result.items); setTotal(result.total); setHasMore(result.hasMore); setOffset(nextOffset); setNextOffset(result.hasMore ? (result.nextOffset ?? nextOffset + result.items.length) : null); setError('')
    } catch { if (!controller.signal.aborted && current === sequence.current) setError('製造・発送アラートを取得できませんでした') }
    finally { if (!controller.signal.aborted && current === sequence.current) setLoading(false) }
  }, [])

  useEffect(() => {
    void reload()
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    window.addEventListener(FULFILLMENT_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { window.removeEventListener(FULFILLMENT_CHANGED, refresh); window.removeEventListener('focus', refresh); window.clearInterval(timer); request.current?.abort() }
  }, [reload])

  return <section aria-label="製造・発送アラート" style={section}>
    <div style={header}><h2 style={heading}>製造・発送アラート {error ? '取得エラー' : loading ? '確認中…' : `${total}件`}</h2><button type="button" onClick={() => void reload(offset)} disabled={loading} style={button}>更新</button></div>
    <p style={muted}>製造・出荷予定、設定漏れ、出荷待ちを確認します。</p>
    {error && <p role="alert" style={danger}>{error}（件数は未確認）</p>}
    {!error && !loading && total === 0 && <p style={success}>現在、製造・発送アラートはありません。</p>}
    {!error && <div style={{ display: 'grid', gap: 8 }}>{items.map(item => <button key={`${item.order_id}-${item.kind}`} type="button" onClick={() => setSelected(item)} style={{ ...button, padding: 14, textAlign: 'left' as const, display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', gap: 12 }}>
      <span><strong>{item.company_name}</strong><small style={small}>{item.order_number}</small></span>
      <span><strong style={{ color: badgeColor[item.kind] }}>{labels[item.kind]}</strong><small style={small}>{item.planned_quantity == null ? '数量未設定' : `計画 ${item.planned_quantity.toLocaleString()} ${item.quantity_unit}`} ／ 完成 {item.completed_quantity == null ? '未記録' : item.completed_quantity.toLocaleString()}</small></span>
    </button>)}</div>}
    {!error && hasMore && nextOffset !== null && <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}><button type="button" onClick={() => void reload(nextOffset)} disabled={loading} style={button}>次のページ</button></div>}
    {selected && <div style={{ marginTop: 18, border: '1px solid var(--admin-accent)', padding: 16, borderRadius: 8 }}>
      <div style={header}><strong>{selected.company_name} ／ {labels[selected.kind]}</strong><button type="button" onClick={() => setSelected(null)} style={button}>案件を閉じる</button></div>
      <OemOrderPanel key={selected.order_id} leadId={selected.lead_id} estimatedTotalPrice={0} />
    </div>}
  </section>
}

const section = { marginBottom: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-card)' }
const header = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }
const heading = { fontSize: 18, margin: 0 }
const muted = { color: 'var(--admin-text-muted)', fontSize: 13 }
const small = { display: 'block', color: 'var(--admin-text-muted)', marginTop: 4, fontSize: 13 }
const danger = { color: '#fca5a5', fontSize: 13 }
const success = { color: '#4ade80', fontSize: 13 }
