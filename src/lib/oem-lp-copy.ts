import { SAMPLE_PAGE_ID } from './package-samples'

// Exact-source replacements keep the OEM corrections isolated from the LP builder.
const OEM_IMAGES = [
  {
    sources: ['/images/lp-problems.jpg', 'https://p1nd6l4edkl5ahso.public.blob.vercel-storage.com/form/1773114673701_hf_20260310_033509_4a41621d-eb95-4898-b330-f5fe90d.jpg'],
    src: '/images/btob/oem-problems-copy-v3.webp',
    width: 1126, height: 1397,
    alt: '1ロット約400個。包装500枚分込み（400個分＋予備100枚）。ラーメンは約400セット、お茶は専用プラン。商品・仕様を選んで自動見積もり。',
    notes: ['包装は400個分＋予備100枚の計500枚分を料金に含みます。ラーメンは約400セット、お茶は専用プランです。'],
  },
  {
    sources: ['https://p1nd6l4edkl5ahso.public.blob.vercel-storage.com/form/1773135634427_hf_20260310_093425_fb3f6534-e425-4883-bc17-e1722ed.jpg'],
    src: '/images/btob/oem-notice-copy-v3.webp',
    width: 1126, height: 1397,
    alt: '取引条件：使用不可の支給原料の補償不可。製造数量は多少前後し完成全数買い取り・実数精算。既存商品の無料配布なし、商品開発の試作は初回無料特典の対象（2回まで）。キャンセルは契約後・資材手配前3万円、資材手配後は発生した実費。',
    notes: ['製造数量は多少前後します。完成した全数を買い取り、実際の数量で精算します。', '既存商品の無料サンプル配布はありません。ECでご購入ください。商品開発の試作は初回無料特典の対象です（1企業・個人は1名につき1回、試作2回まで）。', 'キャンセル料：契約後・資材手配前は3万円。資材手配後は、発生した実費をご負担いただきます。'],
  },
  {
    sources: ['/images/lp-hero.jpg', 'https://p1nd6l4edkl5ahso.public.blob.vercel-storage.com/form/1772951498736_1.jpg'],
    src: '/images/btob/oem-hero-copy-v3.webp',
    width: 1126, height: 1397,
    alt: '福島の食材を、楽天1位の味で。1ロット約400個の地元食材OEM。ラーメンは約400セット、お茶は専用プラン。',
  },
  {
    sources: ['/images/lp-cases.jpg', 'https://p1nd6l4edkl5ahso.public.blob.vercel-storage.com/form/1773120587054_hf_20260310_052708_a88e0c02-62a9-4064-a590-3062908.jpg'],
    src: '/images/btob/oem-cases-copy-v3.webp',
    width: 1125, height: 1398,
    alt: '農家の余剰農産物を活かした商品づくり、農家・地域事業者のふるさと納税向け商品、道の駅・ホテルの自社ブランド。返礼品登録・販路紹介の代行は行っていません。',
  },
  {
    sources: ['/images/lp-cta.jpg'],
    src: '/images/btob/oem-first-order-offer-v3.webp',
    width: 1122, height: 1402,
    alt: '初回限定：1企業（個人は1名）につき1回限り。通常料金は税別で、試作費（2回まで）10,000円、原材料表示作成5,000円、栄養成分表示作成（計算値）5,000円、簡易パッケージデザイン30,000円。通常合計50,000円が初回0円。追加試作は1回につき3,000円（税別）。',
  },
]

export function oemLpImage(pageId: string, src: string, alt: string) {
  const image = pageId === SAMPLE_PAGE_ID ? OEM_IMAGES.find(item => item.sources.includes(src)) : undefined
  return image ? { src: image.src, alt: image.alt, width: image.width, height: image.height } : { src, alt, width: 1200, height: 1600 }
}

export function oemMetadataCopy(pageId: string, text: string) {
  return pageId === SAMPLE_PAGE_ID ? text.replace(/小ロット400個[〜～~]/g, '1ロット約400個').replace(/400個から/g, '約400個のロット') : text
}

export function oemLpNotes(pageId: string, src: string): string[] {
  return pageId === SAMPLE_PAGE_ID ? OEM_IMAGES.find(item => item.sources.includes(src))?.notes ?? [] : []
}
