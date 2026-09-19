'use client'
import { useEffect, useState } from 'react'
import { getOemMailStatus, retryOemMail } from '@/actions/oemMail'

type Row = Awaited<ReturnType<typeof getOemMailStatus>>[number]
const labels: Record<string,string> = { pending: '未送信', sending: '送信処理中', sent: '送信サービス受付済', failed: '送信失敗', unknown: '結果未確認' }
export function OemMailPanel({ leadId }: { leadId: string }) {
    const [rows, setRows] = useState<Row[]>([])
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    useEffect(() => {
        let active = true
        getOemMailStatus(leadId).then(data => { if (active) { setRows(data); setLoaded(true) } }).catch(() => { if (active) setError('メール状況を読み込めませんでした。') })
        return () => { active = false }
    }, [leadId])
    async function refresh() {
        setBusy(true); setError('')
        try { setRows(await getOemMailStatus(leadId)); setLoaded(true) } catch { setError('メール状況を読み込めませんでした。') } finally { setBusy(false) }
    }
    async function retry(row: Row) {
        setBusy(true); setError('')
        try {
            const result = await retryOemMail(row.id)
            if (!result.success) setError(result.error || '再送できませんでした。')
            setRows(await getOemMailStatus(leadId))
        } catch { setError('再送状況を確認できませんでした。更新して確認してください。') } finally { setBusy(false) }
    }
    return <section style={{ marginTop: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
        <h4 style={{ fontSize: 17, marginBottom: 8 }}>メール送信状況 <button type="button" disabled={busy} onClick={refresh} style={{ marginLeft: 12, cursor: 'pointer' }}>更新</button></h4>
        <p style={{ fontSize: 14, color: 'var(--admin-text-muted)' }}>受付済はメール配信サービスが受け付けた状態です。受信箱への到着を保証するものではありません。</p>
        {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
        {!loaded && !error && <p>読込中…</p>}
        {loaded && rows.length === 0 && <p>導入前の案件のため、送信状況の記録はありません。</p>}
        {rows.map(row => <div key={row.id} style={{ marginTop: 14, fontSize: 15 }}>
            <strong>{row.kind === 'customer' ? 'お客様への控え' : '管理者への通知'}</strong>：{labels[row.status] || row.status}（試行 {row.attempts} 回）
            <span style={{ display: 'block', fontSize: 13 }}>{new Date(row.updated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
            {row.error_code === 'manual_check_required' ? <p style={{ color: '#fbbf24' }}>結果不明のまま時間が経過しています。重複防止のため再送を停止しました。配信サービスで受理状況を確認してください。</p> : row.status !== 'sent' && <button type="button" disabled={busy || (row.status === 'sending' && Date.now() - Date.parse(row.updated_at) < 300000)} onClick={() => retry(row)} style={{ padding: '8px 14px', marginTop: 8, border: '1px solid var(--admin-border)', borderRadius: 6, cursor: 'pointer' }}>{busy ? '処理中…' : '未送信メールを再試行'}</button>}
        </div>)}
    </section>
}
