import type { Metadata } from 'next'
import { getOemPortal } from '@/lib/oem-portal'
import { OemPortalReorderForm } from '@/components/OemPortalReorderForm'
import { portalDate as date, portalTimestampDate } from '@/lib/oem-portal-format'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'OEM進捗ポータル｜会津ブランド館', robots: { index: false, follow: false, nocache: true } }
const yen = (value: number | null) => value == null ? '—' : `¥${value.toLocaleString('ja-JP')}`

export default async function OemProgressPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const portal = await getOemPortal(token)
  if (!portal) return <main style={shell}><div style={card}><h1>進捗ポータルを表示できません</h1><p>リンクが無効・失効・期限切れです。担当者へ新しいリンクをご依頼ください。</p></div></main>
  const order = portal.order
  return <main style={shell}><div style={{ maxWidth: 840, margin: '0 auto' }}><header style={{ marginBottom: 24 }}><p style={{ color: '#1d6b4f', fontWeight: 800, letterSpacing: '.08em' }}>AIZU BRAND HALL</p><h1 style={{ margin: 0 }}>OEM進捗ポータル</h1><p style={{ color: '#52645e' }}>{portal.companyName} 様　／　お客様専用ページ</p></header>{!order ? <div style={card}><h2>発注情報は準備中です</h2><p>担当者から正式発注が発行されると、ここに進捗が表示されます。</p></div> : <><section style={card}><h2>発注状況：{order.status === 'shipped' ? '発送済み' : order.status === 'paid' ? '入金確認済み' : order.status === 'balance_due' ? '出荷前精算金の確認中' : order.status === 'in_production' ? '製造中' : order.status === 'deposit_paid' ? '製造着手金確認済み' : order.status === 'accepted' ? '受付済み' : order.status}</h2><p>発注番号：{order.orderNumber}</p><p style={{ color: '#52645e', fontSize: 13, lineHeight: 1.8 }}>初回試作費5,000円（税別・税込5,500円）は先入金、入金確認後に試作を開始します。試作のみで終了できます。製造へ進む場合は、製造着手金50％と出荷前精算金の計3回入金です。</p><dl style={grid}><dt>{order.amountKind}</dt><dd>{yen(order.agreedAmount)}</dd><dt>製造分の銀行入金・精算反映額（試作費別）</dt><dd>{yen(order.receivedAmount)}</dd><dt>製造分の未精算・未入金額（試作費別）</dt><dd>{yen(order.outstandingAmount)}</dd><dt>入金状態</dt><dd>{order.paymentState}</dd></dl><p style={{ color: '#52645e', fontSize: 13 }}>金額は税区分を含む現在の表示上の合意額です。再見積り前の参考値を確定額として扱っていません。</p></section><section style={card}><h2>仕様・製造・発送</h2><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}>{order.specification}</p><dl style={grid}><dt>予定数量</dt><dd>{order.plannedQuantity == null ? '—' : `${order.plannedQuantity} ${order.quantityUnit}`}</dd><dt>製造完了予定</dt><dd>{date(order.productionDueDate)}</dd><dt>出荷予定</dt><dd>{date(order.shipmentDueDate)}</dd><dt>完成数量</dt><dd>{order.completedQuantity == null ? '—' : `${order.completedQuantity} ${order.quantityUnit}`}</dd><dt>出荷日</dt><dd>{date(order.shippedOn)}</dd><dt>配送会社</dt><dd>{order.carrier || '—'}</dd><dt>追跡番号</dt><dd>{order.trackingNumber || '—'}</dd></dl></section>{order.canReorder && <OemPortalReorderForm token={token} order={order} />}</>}</div><p style={{ textAlign: 'center', color: '#66736e', fontSize: 12 }}>リンク有効期限：{portalTimestampDate(portal.linkExpiresAt)}</p></main>
}
const shell = { minHeight: '100vh', padding: '40px 20px 80px', background: '#f3f5f4', color: '#17211e' }
const card = { padding: 28, borderRadius: 16, background: '#fff', border: '1px solid #dbe3df', marginBottom: 20 }
const grid = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '10px 24px', margin: '18px 0 0' }
