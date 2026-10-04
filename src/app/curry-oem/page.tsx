import type { Metadata } from 'next'
import OemProductLanding from '@/components/OemProductLanding'

const canonical = 'https://oem.aizubrandhall.com/curry-oem'

export const metadata: Metadata = {
  title: { absolute: 'レトルトカレーOEM｜福島・小ロット商品開発｜会津ブランド館' },
  description: '福島の食材を活かしたレトルトカレーOEM。200gを基準に1ロット約400個、包装を選んでBTOで概算見積もりを確認できます。',
  alternates: { canonical },
  openGraph: { type: 'website', locale: 'ja_JP', url: canonical, siteName: '会津ブランド館', title: 'レトルトカレーOEM｜福島・小ロット商品開発', description: '1ロット約400個のレトルトカレーOEM。包装と仕様を選んで概算を確認できます。', images: ['/images/package-samples/curry-box-photo.webp'] },
  twitter: { card: 'summary_large_image', title: 'レトルトカレーOEM｜福島・小ロット商品開発', description: '1ロット約400個から対応するレトルトカレーOEM。', images: ['/images/package-samples/curry-box-photo.webp'] },
  robots: { index: true, follow: true },
}

export default function CurryOemPage() {
  return <OemProductLanding
    product="curry"
    title="福島の食材で、レトルトカレーをオリジナル商品に。"
    lead="農家・地域事業者・道の駅・観光施設などのオリジナル商品づくりを、会津ブランド館が企画から製造まで支援します。"
    image="/images/package-samples/curry-box-photo.webp"
    imageAlt="レトルトカレーの包装イメージ（AI生成サンプル）"
    lot="約400個"
    shelfLife="製造から1年"
    points={[
      '200gを基準に、1ロット約400個で商品づくり。',
      '材料構成と包装（バルク、白箱＋印刷巻紙、PP袋＋厚紙）を選択できます。',
      '原料を支給する場合は、受け入れ可否や価格調整を正式見積もりで確認します。',
      '完成した全数をお買い取りいただき、最終数量で精算します。',
    ]}
    faqs={[
      { question: '費用はこのページで確定しますか？', answer: '確定ではありません。商品と包装を選ぶと、送料等を含む概算を確認できます。正式な仕様・可否・金額は個別に確認します。' },
      { question: '原料を持ち込めますか？', answer: 'ご相談いただけます。原料名や状態を確認し、受け入れ可否と価格調整を正式見積もりでご案内します。' },
    ]}
  />
}
