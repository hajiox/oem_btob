import type { Metadata } from 'next'
import OemProductLanding from '@/components/OemProductLanding'

const canonical = 'https://oem.aizubrandhall.com/ramen-oem'

export const metadata: Metadata = {
  title: { absolute: 'ラーメンOEM｜福島・小ロット商品開発｜会津ブランド館' },
  description: '福島の地域商品に向けたラーメンOEM。2食入り・1ロット約400セット（800食）を基準に、スープ・麺・包装を選んで概算を確認できます。',
  alternates: { canonical },
  openGraph: { type: 'website', locale: 'ja_JP', url: canonical, siteName: '会津ブランド館', title: 'ラーメンOEM｜福島・小ロット商品開発', description: '2食入り・約400セットのラーメンOEM。仕様と包装を選んで概算を確認できます。', images: ['/images/package-samples/ramen-box-photo.webp'] },
  twitter: { card: 'summary_large_image', title: 'ラーメンOEM｜福島・小ロット商品開発', description: '2食入り・約400セットから対応するラーメンOEM。', images: ['/images/package-samples/ramen-box-photo.webp'] },
  robots: { index: true, follow: true },
}

export default function RamenOemPage() {
  return <OemProductLanding
    product="ramen"
    title="地域の味を、オリジナルラーメン商品に。"
    lead="飲食店・地域事業者・観光施設などの商品開発に向けて、スープや麺、包装の仕様を相談できるラーメンOEMです。"
    image="/images/package-samples/ramen-box-photo.webp"
    imageAlt="ラーメンの包装イメージ（AI生成サンプル）"
    lot="約400セット"
    shelfLife="製造から60日"
    points={[
      'すべて2食入り、1ロット約400セット（800食）を基準にしています。',
      'スープの方向性、麺、包装（透明袋＋シール／箱＋巻紙）を選択できます。',
      '100セットずつの分納についても、正式見積もり時にご相談いただけます。',
      '原料を支給する場合は、受け入れ可否や価格調整を正式見積もりで確認します。',
    ]}
    faqs={[
      { question: 'スープや麺の内容は決まっていますか？', answer: '見積もり画面で方向性を選んで概算を確認できます。具体的な配合・原料・対応可否は、相談内容を確認して正式見積もりでご案内します。' },
      { question: '賞味期限と分納について教えてください。', answer: '現行BTOの案内では賞味期限は製造から60日、100セットずつの分納が可能です。最終条件は正式見積もり時に確認します。' },
      { question: '特殊な食材で試作できますか？', answer: '試作で特殊食材の使用の場合は別途お見積りとなります。対応可否と費用は、食材名・状態・必要量を確認してご案内します。' },
    ]}
  />
}
