'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { getOemProgressForAdmin, issueOemProgressLink, renewOemProgressLink, revokeOemProgressLink } from '@/actions/oemPortal'

type LinkRow = { id: string; issued_at: string; expires_at: string; revoked_at: string | null }
export function OemPortalPanel({ leadId }: { leadId: string }) {
  const [links, setLinks] = useState<LinkRow[]>([]); const [message, setMessage] = useState(''); const [url, setUrl] = useState(''); const [pending, startTransition] = useTransition()
  const reload = useCallback(async () => { const result = await getOemProgressForAdmin(leadId); if (result.success) setLinks(result.links as LinkRow[]); else setMessage(result.error || '進捗リンクを取得できませんでした') }, [leadId])
  useEffect(() => {
    let active = true
    getOemProgressForAdmin(leadId).then(result => {
      if (!active) return
      if (result.success) setLinks(result.links as LinkRow[])
      else setMessage(result.error || '進捗リンクを取得できませんでした')
    }).catch(() => { if (active) setMessage('進捗リンクを取得できませんでした') })
    return () => { active = false }
  }, [leadId])
  const run = (fn: () => Promise<{ success: boolean; message?: string; error?: string; url?: string }>) => startTransition(async () => { const result = await fn(); setMessage(result.error || result.message || ''); if (result.url) setUrl(result.url); if (result.success) await reload() })
  return <section style={{ marginTop: 24, borderTop: '1px solid var(--admin-border)', paddingTop: 20 }}>
    <h4 style={{ margin: '0 0 8px', color: 'var(--admin-text)' }}>お客様向け進捗ポータル</h4>
    <p style={{ margin: '0 0 14px', color: 'var(--admin-text-muted)', fontSize: 13 }}>専用リンクを明示的に発行・失効・更新します。メール送信や自動注文は行いません。</p>
    <button type="button" disabled={pending} onClick={() => run(() => issueOemProgressLink(leadId))} style={primaryButton}>{pending ? '処理中...' : '進捗リンクを発行'}</button>
    {links.length > 0 && <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>{links.map(link => <div key={link.id} style={rowStyle}><span>{new Date(link.issued_at).toLocaleString('ja-JP')}〜{new Date(link.expires_at).toLocaleDateString('ja-JP')}</span><span>{link.revoked_at ? '失効済み' : '有効／期限は上記'}</span><span style={{ display: 'flex', gap: 6 }}>{!link.revoked_at && <button type="button" disabled={pending} onClick={() => run(() => revokeOemProgressLink(leadId, link.id))} style={secondaryButton}>失効</button>}<button type="button" disabled={pending} onClick={() => run(() => renewOemProgressLink(leadId, link.id))} style={secondaryButton}>更新</button></span></div>)}</div>}
    {url && <p style={{ margin: '12px 0 0', overflowWrap: 'anywhere', fontSize: 13 }}>今回のURL（再表示不可）：<a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--admin-accent)' }}>{url}</a></p>}
    {message && <p role="status" style={{ margin: '10px 0 0', color: message.includes('できません') ? '#f87171' : '#4ade80' }}>{message}</p>}
  </section>
}
const primaryButton = { padding: '9px 14px', border: 0, borderRadius: 6, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }
const secondaryButton = { padding: '6px 10px', border: '1px solid var(--admin-border)', borderRadius: 6, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const rowStyle = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--admin-text-muted)' }
