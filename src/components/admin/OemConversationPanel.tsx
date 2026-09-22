'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Attachment = { id: string; name: string; size: number }
type Message = { id: string; direction: string; subject: string; text: string; from: string; to: string; sentAt: string; status?: string; requestId?: string; attachments: Attachment[] }
type MailboxData = { messages: Message[]; draft: { subject: string; text: string } | null; hasMore: boolean; nextCursor?: string; connected: boolean; hasUnresolved?: boolean }
type Upload = { name: string; type: string; base64: string; size: number }
const MAX_BYTES = 3 * 1024 * 1024
const MAX_FILES = 10
const ALLOWED = new Set(['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'docx', 'xlsx'])
const MIME_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

async function api(action: string, payload: Record<string, unknown>) {
    const response = await fetch('/api/oem/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
    const data = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : response.status === 401 || response.status === 403 ? 'メールボックスの権限を確認してください。' : 'メール操作に失敗しました。')
    return data
}

export function OemConversationPanel({ leadId, leadEmail }: { leadId: string; leadEmail: string }) {
    const [data, setData] = useState<MailboxData | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [subject, setSubject] = useState('')
    const [text, setText] = useState('')
    const [files, setFiles] = useState<Upload[]>([])
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState('')
    const [preview, setPreview] = useState<{ subject: string; text: string; files: Upload[] } | null>(null)
    const [sendRequestId, setSendRequestId] = useState<string | null>(null)
    const sendRequestIdRef = useRef<string | null>(null)
    const [sendState, setSendState] = useState<'idle' | 'sent' | 'pending' | 'sending' | 'unknown' | 'failed'>('idle')
    const draftDirtyRef = useRef(false)
    const [syncCursor, setSyncCursor] = useState<string | undefined>()
    const [syncHasMore, setSyncHasMore] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const totalBytes = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files])
    const historyLocked = !!data?.hasUnresolved || !!data?.messages.some(message => ['pending', 'sending', 'unknown'].includes(message.status || ''))
    const locked = historyLocked || sendState === 'sending' || sendState === 'pending' || sendState === 'unknown'

    const list = useCallback(async (cursor?: string, preserveDraft = true) => {
        const result = await api('list', { leadId, ...(cursor ? { cursor } : {}) }) as unknown as MailboxData
        setData(previous => cursor && previous ? { ...result, messages: [...previous.messages, ...result.messages] } : result)
        const reconciled = result.messages.find(message => sendRequestIdRef.current && message.requestId === sendRequestIdRef.current && message.status === 'sent')
        if (reconciled) { setSendState('sent'); setPreview(null); setFiles([]); setSendRequestId(null); sendRequestIdRef.current = null; setSubject(''); setText(''); draftDirtyRef.current = false }
        if (!preserveDraft && !draftDirtyRef.current) { setSubject(result.draft?.subject || ''); setText(result.draft?.text || '') }
    }, [leadId])
    useEffect(() => { const controller = new AbortController(); void list(undefined, false).catch(value => { if (!controller.signal.aborted) setError(value instanceof Error ? value.message : '会話を読み込めませんでした。') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [list])

    async function sync(cursor?: string) { setBusy(true); setNotice(''); try { const result = await api('sync', { leadId, ...(cursor ? { cursor } : {}) }); setSyncCursor(result.nextCursor as string | undefined); setSyncHasMore(Boolean(result.hasMore)); setNotice(String(result.message || '同期しました。')); await list(undefined) } catch (value) { setNotice(value instanceof Error ? value.message : '同期できませんでした。') } finally { setBusy(false) } }
    async function saveDraft() { setBusy(true); setNotice(''); try { const result = await api('draft', { leadId, subject, text }); setNotice(result.success ? '下書きを保存しました。' : String(result.error || '下書きを保存できませんでした。')); if (result.success) draftDirtyRef.current = false } catch (value) { setNotice(value instanceof Error ? value.message : '下書きを保存できませんでした。') } finally { setBusy(false) } }
    async function send() {
        if (!preview || !sendRequestId) return
        setBusy(true); setNotice(''); setSendState('sending')
        try { const result = await api('send', { leadId, subject: preview.subject, text: preview.text, requestId: sendRequestId, attachments: preview.files.map(({ name, type, base64 }) => ({ name, type, base64 })) }); const status = String(result.status || (result.success ? 'sent' : 'unknown')) as typeof sendState; setSendState(status); setNotice(result.success ? '送信しました。' : String(result.error || '送信結果を確認できません。再送せず同期してください。')); if (status === 'sent') { setPreview(null); setFiles([]); setSendRequestId(null); sendRequestIdRef.current = null; setSubject(''); setText(''); draftDirtyRef.current = false; await list(undefined) } } catch (value) { setSendState('unknown'); setNotice(value instanceof Error ? `${value.message} 再送せず同期してください。` : '送信結果を確認できません。再送せず同期してください。') } finally { setBusy(false) }
    }
    async function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
        const selected = Array.from(event.target.files || []); event.target.value = ''
        if (!selected.length) return
        if (files.length + selected.length > MAX_FILES) { setNotice(`添付は合計${MAX_FILES}ファイルまでです。`); return }
        const invalid = selected.find(file => !ALLOWED.has(file.name.split('.').pop()?.toLowerCase() || ''))
        const selectedSize = selected.reduce((sum, file) => sum + file.size, 0)
        if (invalid) { setNotice('添付できる形式は PDF / PNG / JPG / TXT / CSV / DOCX / XLSX です。'); return }
        if (totalBytes + selectedSize > MAX_BYTES) { setNotice('添付ファイルの合計サイズは3MB以下にしてください。'); return }
        try { const uploads = await Promise.all(selected.map(file => new Promise<Upload>((resolve, reject) => { const reader = new FileReader(); const extension = file.name.split('.').pop()?.toLowerCase() || ''; reader.onload = () => resolve({ name: file.name, type: MIME_BY_EXTENSION[extension], base64: String(reader.result).split(',')[1] || '', size: file.size }); reader.onerror = () => reject(new Error('添付ファイルを読み込めませんでした。')); reader.readAsDataURL(file) }))); setFiles(previous => [...previous, ...uploads]); setNotice('') } catch (value) { setNotice(value instanceof Error ? value.message : '添付ファイルを読み込めませんでした。') }
    }
    const removeFile = (name: string) => setFiles(previous => previous.filter(file => file.name !== name))
    const download = (messageId: string, attachmentId: string) => { window.location.href = `/api/oem/mail/attachment?leadId=${encodeURIComponent(leadId)}&messageId=${encodeURIComponent(messageId)}&attachmentId=${encodeURIComponent(attachmentId)}` }
    return <section onClick={event => event.stopPropagation()} aria-labelledby={`conversation-${leadId}`} style={{ marginTop: 24, borderTop: '1px solid var(--admin-border)', paddingTop: 24 }}>
        <h4 id={`conversation-${leadId}`} style={{ margin: '0 0 14px', fontSize: 17 }}>顧客メールスレッド</h4>
        {loading && <p style={{ color: 'var(--admin-text-muted)' }}>会話を読み込み中…</p>}
        {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
        {!loading && data && <>
            {data.messages.length === 0 ? <p style={{ color: 'var(--admin-text-muted)' }}>この案件のメールはまだありません。</p> : <div style={{ display: 'grid', gap: 10 }}>{data.messages.map(message => <article key={message.id} style={{ padding: 14, border: '1px solid var(--admin-border)', borderRadius: 6, background: 'var(--admin-card)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--admin-text-muted)' }}><span>{message.direction === 'inbound' ? '受信' : '送信'} · {message.from} → {message.to} · 状態: {message.status || '確認済み'}</span><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString('ja-JP')}</time></div><strong style={{ display: 'block', marginTop: 6 }}>{message.subject || '(件名なし)'}</strong><p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</p>{message.attachments?.length > 0 && <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{message.attachments.map(file => <button type="button" key={file.id || file.name} disabled={!file.id} onClick={() => download(message.id, file.id)} style={linkButton}>{file.name}（{Math.ceil(file.size / 1024)}KB）{!file.id ? '（同期が必要）' : ''}</button>)}</div>}</article>)}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{data.hasMore && data.nextCursor && <button type="button" onClick={() => void list(data.nextCursor)} disabled={busy} style={linkButton}>以前の会話を読み込む</button>}<button type="button" onClick={() => void sync()} disabled={busy} style={linkButton}>メールを同期</button>{syncHasMore && syncCursor && <button type="button" onClick={() => void sync(syncCursor)} disabled={busy} style={linkButton}>同期の続きを取得</button>}</div>
            {!data.connected && <p role="status" style={{ color: '#fbbf24' }}>メールボックス未接続のため、返信はできません。接続後に同期してください。</p>}
            {data.connected && !locked && <div style={{ marginTop: 18, display: 'grid', gap: 10 }}><label>宛先<input value={leadEmail} readOnly aria-label="宛先" style={inputStyle} /></label><label>件名<input disabled={!!preview} value={subject} onChange={event => { setSubject(event.target.value); draftDirtyRef.current = true }} style={inputStyle} /></label><label>返信本文<textarea disabled={!!preview} value={text} onChange={event => { setText(event.target.value); draftDirtyRef.current = true }} rows={6} style={{ ...inputStyle, resize: 'vertical' }} /></label><input ref={inputRef} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" onChange={event => void chooseFiles(event)} /><div><button type="button" onClick={() => inputRef.current?.click()} disabled={busy || !!preview} style={linkButton}>ファイルを添付</button><span style={{ marginLeft: 10, color: 'var(--admin-text-muted)', fontSize: 12 }}>{files.length ? `${files.map(file => file.name).join('、')}（合計${Math.ceil(totalBytes / 1024)}KB）` : '添付なし'}</span>{files.map(file => <button type="button" key={file.name} onClick={() => removeFile(file.name)} disabled={!!preview} style={{ ...linkButton, marginLeft: 6 }} aria-label={`${file.name}を削除`}>×</button>)}</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => void saveDraft()} disabled={busy || !!preview} style={linkButton}>下書きを保存</button><button type="button" onClick={() => { const requestId = globalThis.crypto?.randomUUID?.(); if (!requestId) { setNotice('このブラウザでは安全な送信IDを生成できません。'); return } setSendRequestId(requestId); sendRequestIdRef.current = requestId; setPreview({ subject, text, files: [...files] }) }} disabled={busy || !!preview || !text.trim()} style={sendButton}>送信内容を確認</button></div></div>}
            {notice && <p role="status" style={{ marginTop: 10, color: notice.includes('できません') || locked ? '#fbbf24' : '#4ade80' }}>{notice}</p>}
            {locked && <p role="status" style={{ color: '#fbbf24' }}>送信状態：{sendState === 'unknown' ? '結果未確認' : sendState}。再送せず、メール同期で確認してください。</p>}
            {preview && <div aria-labelledby={`preview-${leadId}`} style={{ marginTop: 14, padding: 16, border: '1px solid var(--admin-accent)', borderRadius: 6 }}><h5 id={`preview-${leadId}`} style={{ margin: 0 }}>送信前プレビュー</h5><p style={{ fontSize: 13 }}>宛先：{leadEmail}</p><p style={{ fontWeight: 700 }}>{preview.subject || '(件名なし)'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</p>{preview.files.length > 0 && <p style={{ fontSize: 13 }}>添付：{preview.files.map(file => file.name).join('、')}</p>}<button type="button" onClick={() => void send()} disabled={busy || locked} style={sendButton}>{busy ? '送信処理中…' : 'この内容で送信'}</button><button type="button" onClick={() => setPreview(null)} disabled={busy} style={{ ...linkButton, marginLeft: 8 }}>戻る</button></div>}
        </>}
    </section>
}

const inputStyle = { display: 'block', width: '100%', marginTop: 5, padding: '10px 12px', background: 'var(--admin-card)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5, fontSize: 15 }
const linkButton = { padding: '7px 11px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const sendButton = { ...linkButton, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700 }
