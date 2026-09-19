'use client'

import { useEffect, useState, useTransition } from 'react'
import { getOemLeadCase, updateOemLeadCase, type OemLeadCase, type OemLeadEvent } from '@/actions/dashboard'

const emptyCase: OemLeadCase = { lead_id: '', internal_notes: null, next_followup_at: null, raw_material_condition: null, trial_notes: null, recipe_notes: null, work_time_notes: null, yield_notes: null, issue_notes: null, final_spec_revision: null, customer_approval_evidence: null, customer_approval_at: null, updated_at: '' }
const fields = [
    ['raw_material_condition', '原料・状態'], ['trial_notes', '試作メモ'], ['recipe_notes', 'レシピ・配合'],
    ['work_time_notes', '作業時間'], ['yield_notes', '歩留まり・出来高'], ['issue_notes', '課題・申し送り'],
] as const
const toLocalDateTime = (value: string | null) => { if (!value) return ''; const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16) }
const toIsoDateTime = (value: string) => value ? new Date(value).toISOString() : ''
const eventLabels: Record<string, string> = { internal_notes: '社内メモ', next_followup_at: '次回フォロー', raw_material_condition: '原料・状態', trial_notes: '試作', recipe_notes: 'レシピ・配合', work_time_notes: '作業時間', yield_notes: '歩留まり', issue_notes: '課題', final_spec_revision: '最終仕様', customer_approval_evidence: '承認根拠', customer_approval_at: '承認日', status: 'ステータス' }

export function OemLeadCasePanel({ leadId, onChanged }: { leadId: string; onChanged?: () => void | Promise<void> }) {
    const [caseData, setCaseData] = useState<OemLeadCase>(emptyCase)
    const [events, setEvents] = useState<OemLeadEvent[]>([])
    const [eventsTotal, setEventsTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [ready, setReady] = useState(false)
    const [historyPage, setHistoryPage] = useState(0)
    const [message, setMessage] = useState<string | null>(null)
    const [now] = useState(() => Date.now())
    const [isPending, startTransition] = useTransition()

    async function reload() {
        setLoading(true); setReady(false)
        try { const result = await getOemLeadCase(leadId); if (result.success) { setCaseData(result.case ?? { ...emptyCase, lead_id: leadId }); setEvents(result.events); setEventsTotal(result.eventsTotal); setHistoryPage(0); setReady(true); setMessage(null) } else setMessage(result.error) } catch { setMessage('ケース情報の取得に失敗しました') } finally { setLoading(false) }
    }
    useEffect(() => { let active = true; getOemLeadCase(leadId).then(result => { if (!active) return; if (result.success) { setCaseData(result.case ?? { ...emptyCase, lead_id: leadId }); setEvents(result.events); setEventsTotal(result.eventsTotal); setReady(true) } else setMessage(result.error) }).catch(() => { if (active) setMessage('ケース情報の取得に失敗しました') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [leadId])
    async function olderHistory() {
        try { const result = await getOemLeadCase(leadId, historyPage + 1); if (result.success) { setEvents(previous => [...result.events, ...previous]); setHistoryPage(previous => previous + 1) } else setMessage(result.error) } catch { setMessage('履歴を取得できませんでした') }
    }
    const update = (key: keyof OemLeadCase, value: string) => setCaseData(previous => ({ ...previous, [key]: value || null }))
    const save = () => startTransition(async () => { try { setMessage(null); const result = await updateOemLeadCase(leadId, { ...caseData, expected_updated_at: caseData.updated_at || undefined }); setMessage(result.success ? '保存しました' : result.error || '保存に失敗しました'); if (result.success) { const latest = await getOemLeadCase(leadId); if (latest.success) { setCaseData(latest.case ?? { ...emptyCase, lead_id: leadId }); setEvents(latest.events); setEventsTotal(latest.eventsTotal) }; await onChanged?.() } } catch { setMessage('保存に失敗しました') } })
    if (loading) return <div style={{ color: 'var(--admin-text-muted)', padding: '16px 0' }}>ケース情報を読み込み中...</div>
    const isOverdue = !!caseData.next_followup_at && new Date(caseData.next_followup_at).getTime() < now
    return <div style={{ marginTop: 28, borderTop: '1px solid var(--admin-border)', paddingTop: 24 }} onClick={e => e.stopPropagation()}>
        <h4 style={{ fontSize: 17, color: 'var(--admin-text)', marginBottom: 16 }}>OEM案件管理 <button type="button" onClick={reload} disabled={isPending} style={{ fontSize: 14, marginLeft: 12 }}>最新情報を読み直す（未保存の編集は破棄）</button></h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
            <label style={{ fontSize: 14, color: isOverdue ? '#f87171' : 'var(--admin-text-muted)' }}>次回フォローアップ {isOverdue && '（期限超過）'}
                <input type="datetime-local" value={toLocalDateTime(caseData.next_followup_at)} onChange={e => update('next_followup_at', toIsoDateTime(e.target.value))} style={inputStyle} />
            </label>
            <label style={{ fontSize: 14, color: 'var(--admin-text-muted)' }}>社内運用メモ<textarea value={caseData.internal_notes ?? ''} onChange={e => update('internal_notes', e.target.value)} style={areaStyle} /></label>
        </div>
        <details style={{ marginTop: 20 }}><summary style={{ fontSize: 17, cursor: 'pointer' }}>製造ノウハウ</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: 14 }}>
            {fields.map(([key, label]) => <label key={key} style={{ fontSize: 14, color: 'var(--admin-text-muted)' }}>{label}<textarea value={caseData[key] ?? ''} onChange={e => update(key, e.target.value)} style={areaStyle} /></label>)}
        </div></details>
        <details style={{ marginTop: 20 }}><summary style={{ fontSize: 17, cursor: 'pointer' }}>最終仕様・顧客承認</summary><p style={{ fontSize: 14, marginTop: 8 }}>承認はお客様から受けたメール等の記録です。仕様を変更すると、以前の承認は解除されます。</p><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <label style={{ fontSize: 14, color: 'var(--admin-text-muted)' }}>最終仕様・改訂履歴<textarea value={caseData.final_spec_revision ?? ''} onChange={e => update('final_spec_revision', e.target.value)} style={areaStyle} /></label>
            <div><label style={{ fontSize: 14, color: 'var(--admin-text-muted)' }}>顧客承認の記録（メール・議事録等の手動根拠）<textarea value={caseData.customer_approval_evidence ?? ''} onChange={e => update('customer_approval_evidence', e.target.value)} style={areaStyle} /></label><label style={{ display: 'block', fontSize: 14, color: 'var(--admin-text-muted)', marginTop: 8 }}>承認日<input type="date" value={caseData.customer_approval_at ? caseData.customer_approval_at.slice(0, 10) : ''} onChange={e => update('customer_approval_at', e.target.value ? `${e.target.value}T00:00:00.000Z` : '')} style={inputStyle} /></label></div>
        </div></details>
        <button type="button" onClick={save} disabled={isPending || !ready} style={{ marginTop: 16, padding: '8px 16px', border: 0, borderRadius: 6, background: 'var(--admin-accent)', color: '#fff', cursor: 'pointer', opacity: isPending || !ready ? .6 : 1 }}>{isPending ? '保存中...' : 'ケース情報を保存'}</button>
        {message && <span style={{ marginLeft: 12, fontSize: 12, color: message === '保存しました' ? '#4ade80' : '#f87171' }}>{message}</span>}
        <details style={{ marginTop: 24 }}><summary style={{ fontSize: 17, cursor: 'pointer' }}>案件履歴（全{eventsTotal}件）</summary>
            {eventsTotal > events.length && <button type="button" onClick={olderHistory} style={{ marginTop: 12 }}>以前の履歴を読み込む（現在{events.length}件）</button>}
            {events.length === 0 ? <p>履歴はありません</p> : events.map(event => <div key={event.id} style={{ borderLeft: '2px solid var(--admin-accent)', padding: '9px 12px', marginTop: 8, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                <b>{event.event_type === 'status_changed' ? 'ステータス変更' : event.event_type === 'case_created' ? 'ケース作成' : 'ケース更新'}</b> · {new Date(event.created_at).toLocaleString('ja-JP')}
                {event.event_type === 'case_created' ? Object.entries((event.details.after || {}) as Record<string,unknown>).filter(([key,value]) => eventLabels[key] && value).map(([key,value]) => <div key={key}>{eventLabels[key]}：{String(value)}</div>)
                : event.event_type === 'status_changed' ? <div>{String(event.details.before)} → {String(event.details.after)}</div>
                : Object.entries(event.details).map(([key,value]) => { const detail=value as {before?:unknown;after?:unknown}; return <div key={key}>{eventLabels[key] || key}：{String(detail.before ?? '未設定')} → {String(detail.after ?? '未設定')}</div> })}
            </div>)}
        </details>
    </div>
}

const inputStyle = { display: 'block', width: '100%', marginTop: 5, padding: '10px 12px', background: 'var(--admin-card)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5, fontSize: 16 }
const areaStyle = { ...inputStyle, minHeight: 80, resize: 'vertical' as const, fontFamily: 'inherit' }
