'use client'

import { useCallback, useEffect, useState } from 'react'

type MailStatus = { connected: boolean; configured: boolean; mailbox?: string; error?: string }

async function readJson(response: Response) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : response.status === 401 || response.status === 403 ? 'メールボックスの権限を確認してください。' : 'メール設定を確認できませんでした。')
    return body
}

export function OemMailboxConnection() {
    const [status, setStatus] = useState<MailStatus | null>(null)
    const [error, setError] = useState('')
    const [callbackNotice, setCallbackNotice] = useState('')
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(() => {
        setLoading(true); setError('')
        const controller = new AbortController()
        fetch('/api/oem/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }), signal: controller.signal })
            .then(readJson).then(value => setStatus(value as MailStatus))
            .catch(value => { if (value?.name !== 'AbortError') setError(value instanceof Error ? value.message : 'メール接続状態を確認できませんでした。') })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return controller
    }, [])
    useEffect(() => {
        const controller = new AbortController()
        const connection = new URLSearchParams(window.location.search).get('mail_connection')
        fetch('/api/oem/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }), signal: controller.signal })
            .then(readJson).then(value => {
                setStatus(value as MailStatus)
                setCallbackNotice(connection === 'connected' ? 'Google Workspaceへの接続が完了しました。' : connection === 'failed' ? 'Google Workspaceへの接続に失敗しました。再接続してください。' : '')
            })
            .catch(value => { if (value?.name !== 'AbortError') setError(value instanceof Error ? value.message : 'メール接続状態を確認できませんでした。') })
            .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        return () => controller.abort()
    }, [])

    return <section aria-labelledby="oem-mailbox-heading" style={{ marginBottom: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 8, background: 'var(--admin-card)' }}>
        <h2 id="oem-mailbox-heading" style={{ margin: 0, fontSize: 17, color: 'var(--admin-text)' }}>OEMメールボックス</h2>
        <p style={{ margin: '8px 0 14px', color: 'var(--admin-text-muted)', fontSize: 13, lineHeight: 1.6 }}>staff@aizu-tv.com の Google Workspace Gmail に読み取り・送信権限を使って接続します。アプリ側では案件スレッドだけを選択し、メールの削除は行いません。</p>
        {loading && <p style={{ margin: 0, color: 'var(--admin-text-muted)' }}>接続状態を確認中…</p>}
        {error && <p role="alert" style={{ margin: 0, color: '#fca5a5' }}>{error}</p>}
        {callbackNotice && <p role="status" style={{ margin: 0, color: callbackNotice.includes('失敗') ? '#fca5a5' : '#4ade80' }}>{callbackNotice}</p>}
        {!loading && !error && status && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: status.connected ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>{status.connected ? '接続済み' : status.configured ? '未接続' : '未設定'}</span>
            <span style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>{status.mailbox || 'staff@aizu-tv.com'}</span>
            {status.error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{status.error}</span>}
            {status.configured && <form action="/api/oem/mail/connect" method="post"><button type="submit" style={buttonStyle}>{status.connected ? 'Google Workspaceを再接続' : 'Google Workspaceに接続'}</button></form>}
            {!status.connected && <button type="button" onClick={() => refresh()} style={buttonStyle}>接続状態を再確認</button>}
            {!status.configured && <span style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>管理者設定が必要です。</span>}
        </div>}
    </section>
}

const buttonStyle = { padding: '8px 14px', border: '1px solid var(--admin-border)', borderRadius: 6, background: 'var(--admin-accent)', color: '#fff', cursor: 'pointer', fontWeight: 700 }
