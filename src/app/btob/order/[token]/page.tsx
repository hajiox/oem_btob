import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicOemOrder } from '@/lib/oem-orders'
import { AcceptOemOrderForm } from '@/components/AcceptOemOrderForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '正式発注内容の確認｜会津ブランド館',
  robots: { index: false, follow: false, nocache: true },
}

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`

export default async function OemOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await getPublicOemOrder(token)
  if (result.state !== 'available' || !result.order) return (
    <main style={{ minHeight: '100vh', padding: '64px 20px', background: '#f3f5f4', color: '#17211e' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 32, background: '#fff', borderRadius: 16, border: '1px solid #dbe3df' }}>
        <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>{result.state === 'expired' ? '確認期限が切れています' : '正式発注ページを表示できません'}</h1>
        <p style={{ margin: 0, lineHeight: 1.9 }}>{result.state === 'expired' ? '担当者へ発注ページの再発行をご依頼ください。' : 'URLが無効か、発注が取り消されています。担当者へご確認ください。'}</p>
        <Link href="/btob" style={{ display: 'inline-block', marginTop: 20, color: '#1d6b4f' }}>OEMページへ戻る</Link>
      </div>
    </main>
  )
  const order = result.order
  const alreadyAccepted = order.status !== 'issued' && !!order.accepted_at
  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px 80px', background: '#f3f5f4', color: '#17211e' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: '0 0 6px', color: '#1d6b4f', fontWeight: 800, letterSpacing: '.08em' }}>AIZU BRAND HALL</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1.4 }}>正式お見積り・発注内容の確認</h1>
          <p style={{ margin: '10px 0 0', color: '#52645e' }}>発注番号：{order.order_number}</p>
        </header>

        <section style={{ padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 18px', fontSize: 24 }}>正式お見積り</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '10px 24px', margin: 0 }}>
            <dt>正式見積額（税別）</dt><dd style={{ margin: 0, fontWeight: 800, fontSize: 22 }}>{yen(order.formal_quote_amount)}</dd>
            <dt>製造着手金（50％）</dt><dd style={{ margin: 0, fontWeight: 800 }}>{yen(order.deposit_amount)}</dd>
            <dt>出荷前精算金の目安</dt><dd style={{ margin: 0 }}>{yen(order.formal_quote_amount - order.deposit_amount)}</dd>
          </dl>
          <p style={{ margin: '16px 0 0', color: '#52645e', fontSize: 14, lineHeight: 1.8 }}>初回試作費5,000円（税別・税込5,500円）は別請求で先入金し、入金確認後に試作を開始します。試作のみで終了できます。製造へ進む場合は、製造着手金50％と出荷前精算金の計3回入金です。製造数量確定後、実際の完成数量に基づいて精算します。</p>
        </section>

        <section style={{ padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 24 }}>商品仕様</h2>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.9 }}>{order.specification}</p>
        </section>

        <section style={{ padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 24 }}>{order.terms_title}</h2>
          <p style={{ margin: '0 0 18px', color: '#66736e', fontSize: 13 }}>規約版：{order.terms_version}</p>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.9, fontSize: 15 }}>{order.terms_body}</div>
        </section>

        {alreadyAccepted ? (
          <section style={{ padding: 28, borderRadius: 16, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#064e3b' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>正式発注は受付済みです</h2>
            <p style={{ margin: 0 }}>受付日時：{new Date(order.accepted_at!).toLocaleString('ja-JP')}</p>
          </section>
        ) : <AcceptOemOrderForm token={token} defaultContactName={order.contactName} />}
        <p style={{ margin: '20px 0 0', color: '#66736e', fontSize: 13, textAlign: 'center' }}>確認期限：{new Date(order.expires_at).toLocaleDateString('ja-JP')}</p>
      </div>
    </main>
  )
}
