'use client'

import { useRef, useState, useTransition } from 'react'
import { requestOemReorder } from '@/actions/oemPortal'
import type { OemPortalOrder } from '@/lib/oem-portal'

export function OemPortalReorderForm({ token, order }: { token: string; order: OemPortalOrder }) {
  const [specification, setSpecification] = useState(order.specification); const [message, setMessage] = useState(''); const [requestId] = useState(() => crypto.randomUUID()); const [completed, setCompleted] = useState(false); const [pending, startTransition] = useTransition(); const busyRef = useRef(false)
  const submit = () => {
    if (busyRef.current || completed) return
    busyRef.current = true
    startTransition(async () => {
      try {
        if (!window.confirm('この内容を再注文の下書きとして担当者へ依頼します。価格・納期・規約・入金・特典は引き継がれず、再見積りと再合意が必要です。続けますか？')) return
        setMessage('')
        const result = await requestOemReorder(token, order.id, requestId, { selectedOptions: order.selectedOptions, specification })
        setMessage(result.error || result.message || '')
        if (result.success) setCompleted(true)
      } catch { setMessage('依頼結果を確認できませんでした。同じ仕様で再確認してください。下書き作成済みの場合は重複登録しません。') }
      finally { busyRef.current = false }
    })
  }
  return <section style={card}><h2 style={{ margin: '0 0 10px', fontSize: 22 }}>再注文のご相談</h2><p style={{ margin: '0 0 14px', lineHeight: 1.8, color: '#52645e' }}>下記仕様をもとに、再見積り・再合意のための下書きを作成します。これは正式発注ではありません。</p><label style={{ display: 'block', fontSize: 14, color: '#52645e' }}>再注文希望仕様<textarea value={specification} onChange={e => setSpecification(e.target.value)} maxLength={10000} style={input} /></label><button type="button" disabled={pending || completed || !specification.trim()} onClick={submit} style={button}>{pending ? '送信中…' : completed ? '依頼済み' : '再注文を依頼する'}</button>{message && <p role="status" style={{ color: message.includes('できません') ? '#b42318' : '#166534', lineHeight: 1.7 }}>{message}</p>}</section>
}
const card = { padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df', marginBottom: 20 }
const input = { display: 'block', width: '100%', minHeight: 130, marginTop: 8, padding: 12, border: '1px solid #cbd5d1', borderRadius: 8, font: 'inherit', resize: 'vertical' as const }
const button = { marginTop: 16, padding: '11px 16px', border: 0, borderRadius: 8, background: '#1d6b4f', color: '#fff', fontWeight: 800, cursor: 'pointer' }
