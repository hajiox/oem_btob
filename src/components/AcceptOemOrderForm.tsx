'use client'

import { useActionState, useMemo, useState } from 'react'
import { acceptOemOrder } from '@/actions/oemOrders'

const initialState: { success: boolean; error?: string; orderNumber?: string } = { success: false }

export function AcceptOemOrderForm({ token, defaultContactName }: { token: string; defaultContactName: string }) {
  const action = useMemo(() => acceptOemOrder.bind(null, token), [token])
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [agreed, setAgreed] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())

  if (state.success) return (
    <section aria-live="polite" style={{ padding: 28, borderRadius: 16, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#064e3b' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>正式発注を受け付けました</h2>
      <p style={{ margin: 0, lineHeight: 1.8 }}>発注番号：<strong>{state.orderNumber}</strong></p>
      <p style={{ margin: '8px 0 0', lineHeight: 1.8 }}>担当者から前金のお支払いについてご案内します。この画面を閉じて構いません。</p>
    </section>
  )

  return (
    <form action={formAction} style={{ padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, color: '#18332a' }}>内容を確認して正式発注する</h2>
      <p style={{ margin: '0 0 22px', color: '#52645e', lineHeight: 1.8 }}>チェックを入れて発注すると、表示中の仕様・正式見積・取引規約への同意が記録されます。</p>
      <input type="hidden" name="requestId" value={requestId} />
      <label style={{ display: 'block', marginBottom: 18, fontWeight: 700, color: '#18332a' }}>
        発注者名
        <input name="contactName" required maxLength={100} defaultValue={defaultContactName} autoComplete="name"
          style={{ display: 'block', width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 8, border: '1px solid #aebdb7', fontSize: 16, color: '#17211e', background: '#fff' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 10, background: '#f5f7f6', color: '#22352e', lineHeight: 1.7, cursor: 'pointer' }}>
        <input type="checkbox" name="termsAccepted" checked={agreed} onChange={event => setAgreed(event.target.checked)}
          style={{ width: 20, height: 20, marginTop: 3, flex: '0 0 auto' }} />
        <span>上記の正式見積・商品仕様・食品OEM取引規約を確認し、すべてに同意して正式発注します。</span>
      </label>
      {state.error && <p role="alert" style={{ margin: '14px 0 0', color: '#b42318', fontWeight: 700 }}>{state.error}</p>}
      <button type="submit" disabled={!agreed || isPending}
        style={{ width: '100%', marginTop: 20, padding: '15px 20px', border: 0, borderRadius: 10, background: !agreed || isPending ? '#9aa9a3' : '#1d6b4f', color: '#fff', fontSize: 17, fontWeight: 800, cursor: !agreed || isPending ? 'not-allowed' : 'pointer' }}>
        {isPending ? '正式発注を処理しています…' : '規約に同意して正式発注する'}
      </button>
      <p style={{ margin: '12px 0 0', color: '#66736e', fontSize: 13, lineHeight: 1.7 }}>ボタンを押すまで正式発注は完了しません。概算相談の段階では料金は発生しません。</p>
    </form>
  )
}
