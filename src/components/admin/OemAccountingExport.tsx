'use client'

import { useState } from 'react'

export function OemAccountingExport() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const query = new URLSearchParams()
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  const invalid = !!from && !!to && from > to
  return <details style={{ marginBottom: 24, padding: 18, border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-card)' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>会計事務所用CSV</summary>
    <p style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>請求書と確認済みの入出金を種類別で出力します。請求額と入金を合算して二重計上しないでください。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
      <label>開始日<input type="date" defaultValue="" onChange={e => setFrom(e.target.value)} style={input} /></label>
      <label>終了日（含む）<input type="date" defaultValue="" onChange={e => setTo(e.target.value)} style={input} /></label>
      {invalid ? <span role="alert" style={{ color: '#fca5a5' }}>終了日は開始日以降にしてください。</span> : <a href={`/admin/documents/export${query.size ? `?${query}` : ''}`} style={{ padding: '9px 14px', color: 'var(--admin-accent)', border: '1px solid var(--admin-border)', borderRadius: 6 }}>CSVをダウンロード</a>}
    </div>
    <p style={{ color: 'var(--admin-text-muted)', fontSize: 12 }}>日付未指定は全期間。合成テスト案件も含まれるため、会計事務所へ渡す前に確認してください。</p>
  </details>
}
const input = { display: 'block', marginTop: 5, padding: '8px 10px', background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)', borderRadius: 5 }
