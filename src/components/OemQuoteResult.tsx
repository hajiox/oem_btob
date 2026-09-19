'use client'

import type { CSSProperties } from 'react'

export type OemQuoteSummaryItem = {
  question: string
  answer: string
}

export type OemQuoteUnitBreakdownItem = {
  label: string
  amount: number
}

export type OemQuoteResultProps = {
  productName: string
  quantityLabel: string
  quantity: number
  quantityUnit: string
  productSubtotal: number
  shippingFee: number
  total: number
  conditionNote: string
  summary: OemQuoteSummaryItem[]
  unitBreakdown: OemQuoteUnitBreakdownItem[]
  isTea: boolean
  isRamen: boolean
  onConsult: () => void
}

const yen = (amount: number) => `¥${Math.round(amount).toLocaleString('ja-JP')}`
const INITIAL_FREE_ESTIMATE_NOTE = '初回無料適用時の概算です。1企業（個人は1名）につき1回限り、試作は2回まで無料です。初回無料特典が適用されない場合の試作・表示作成・デザイン費、および追加試作費は別途となります。'

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 16,
  padding: '12px 0',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  fontSize: 16,
  overflowWrap: 'anywhere',
}

export default function OemQuoteResult({
  productName,
  quantityLabel,
  quantity,
  quantityUnit,
  productSubtotal,
  shippingFee,
  total,
  conditionNote,
  summary,
  unitBreakdown,
  isTea,
  isRamen,
  onConsult,
}: OemQuoteResultProps) {
  const safeQuantity = quantity > 0 ? quantity : 1
  const unitCost = Math.ceil(productSubtotal / safeQuantity)
  const unitCostWithShipping = Math.ceil(total / safeQuantity)
  const isEstimate = /概算|目安|参考|見積/.test(conditionNote)
  const conditionText = conditionNote || '正式な仕様確認後に確定する概算です。'

  return (
    <section
      aria-labelledby="oem-quote-result-title"
      style={{
        width: '100%',
        maxWidth: 720,
        margin: '0 auto',
        padding: '8px 0 16px',
        boxSizing: 'border-box',
        color: '#fff',
        fontSize: 16,
        lineHeight: 1.65,
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, color: '#a5b4fc', fontSize: 14, fontWeight: 700 }}>OEM見積もり結果</p>
        <h2 id="oem-quote-result-title" style={{ margin: '4px 0 4px', fontSize: 24, lineHeight: 1.35, fontWeight: 800, overflowWrap: 'anywhere' }}>
          {productName}
        </h2>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: 16 }}>{quantityLabel}</p>
      </header>

      <div style={{ padding: 20, borderRadius: 16, background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(236,72,153,0.12))', border: '1px solid rgba(129,140,248,0.3)' }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14 }}>概算合計（税抜）</p>
        <p style={{ margin: '2px 0 2px', fontSize: 'clamp(32px, 9vw, 46px)', lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em' }}>{yen(total)}</p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>送料・発送梱包手数料込み／消費税別</p>
        <p style={{ margin: '10px 0 0', color: '#fde68a', fontSize: 14 }}>{INITIAL_FREE_ESTIMATE_NOTE}</p>
        <div data-testid="quote-order-breakdown" style={{ marginTop: 16 }}>
          <div style={rowStyle}><span>商品小計（税別）</span><strong>{yen(productSubtotal)}</strong></div>
          <div style={rowStyle}><span>送料・発送梱包手数料<br /><small>税別・1注文につき</small></span><strong style={{ whiteSpace: 'nowrap' }}>{yen(shippingFee)}</strong></div>
          <div style={{ ...rowStyle, borderBottom: 0, paddingBottom: 0, fontWeight: 800 }}><span>概算合計（税別）</span><strong>{yen(total)}</strong></div>
        </div>
        <button type="button" onClick={onConsult} style={{ width: '100%', marginTop: 20, padding: '14px 16px', border: 0, borderRadius: 999, background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(16,185,129,0.25)' }}>
          この内容で相談する
        </button>
        <p style={{ margin: '10px 0 0', textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>まだ送信されません。次に連絡先を入力します。</p>
      </div>

      <p style={{ margin: '16px 0', fontSize: 15, color: '#e2e8f0' }}>{isTea ? 'お茶は原料支給が必須です。食材により価格と乾燥加工の可否が変わります。' : '約400個（ラーメンは400セット）の概算です。完成全数のお買い取り・実数精算となります。'}</p>
      <details style={{ marginTop: 12, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <summary style={{ cursor: 'pointer', margin: '0 0 6px', fontWeight: 800 }}>製造条件・賞味期限・ご注意</summary>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)' }}>{conditionText}</p>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.82)' }}>
          {isEstimate ? 'この金額は概算です。仕様・原料・包材の確認後、正式なお見積もりをご案内します。' : '仕様確認後に正式なお見積もりをご案内します。'}
          {isTea ? ' お茶は原料のご支給が必須です。' : ''}
          {isRamen ? ' ラーメンは1セット（2食入り）単位での表示です。' : ''}
        </p>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>表示価格はすべて税抜です。販売シミュレーションの売価には送料・その他費用を含みません。</p>
      </details>

      <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>今回の内容</h3>
        <dl style={{ margin: 0 }}>
          <div style={rowStyle}><dt>商品</dt><dd style={{ margin: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>{productName}</dd></div>
          <div style={rowStyle}><dt>数量</dt><dd style={{ margin: 0 }}>{quantity.toLocaleString('ja-JP')}{quantityUnit}</dd></div>
          {summary.map((item, index) => <div key={`${item.question}-${index}`} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}><dt style={{ color: '#a5b4fc', fontSize: 14 }}>{item.question}</dt><dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{item.answer}</dd></div>)}
        </dl>
      </div>

      <details style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>単価・内訳を見る</summary>
        <div style={{ marginTop: 12 }}>
          {unitBreakdown.map((item, index) => <div key={`${item.label}-${index}`} style={rowStyle}><span style={{ overflowWrap: 'anywhere' }}>{item.label}</span><strong>{yen(item.amount)}</strong></div>)}
          <div style={rowStyle}><span>1{quantityUnit}あたり（送料等別）</span><strong>{yen(unitCost)}</strong></div>
          <div style={{ ...rowStyle, borderBottom: 0 }}><span>1{quantityUnit}あたり（送料込み参考）</span><strong>{yen(unitCostWithShipping)}</strong></div>
          <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>送料等を1{quantityUnit}に按分すると{yen(shippingFee / safeQuantity)}です。税込売価や販売手数料などは別途ご検討ください。</p>
        </div>
      </details>

      <details style={{ marginTop: 12, padding: '14px 16px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#fcd34d' }}>販売シミュレーションを見る</summary>
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>商品原価ベースの粗利率です。商品単価（送料等別）を原価としており、送料・発送梱包手数料、販売手数料、消費税などは含まない参考値です。</p>
          {[30, 40, 50].map((margin) => {
            const sellingPrice = Math.ceil(unitCost * 100 / (100 - margin))
            const profit = sellingPrice - unitCost
            return <div key={margin} style={{ ...rowStyle, fontSize: 15 }}><span>粗利率 {margin}%</span><strong>{yen(sellingPrice)}（粗利 {yen(profit)} / {quantityUnit}）</strong></div>
          })}
        </div>
      </details>
    </section>
  )
}
