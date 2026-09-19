import type { Metadata } from 'next'

export const OEM_SITE_URL = 'https://oem.aizubrandhall.com'
export const OEM_CANONICAL_URL = `${OEM_SITE_URL}/btob`
export const OEM_OG_IMAGE = '/images/btob/oem-social-v1.jpg'
export const OEM_FAVICON = '/images/btob/favicon.png'

export const OEM_SEO_TITLE = '福島の食品OEM・小ロット商品開発｜会津ブランド館'
export const OEM_SEO_DESCRIPTION = '福島の農家・地域事業者・道の駅・観光施設向けに、地域食材を使ったオリジナル食品づくりを支援。カレー・ラーメン・調味料・瓶詰めなど、基本1ロット約400個で製造。商品と包装を選んで概算見積もりを確認できます。お茶は専用プラン。'
export const OEM_OG_TITLE = '福島の食材を、あなたのお店・農園のオリジナル商品に。'
export const OEM_OG_DESCRIPTION = 'カレー、調味料、ジャムなど、地域の素材を活かした商品づくり。会津ブランド館が試作から包装・製造までサポート。商品とパッケージを選んで、まずは概算を確認できます。'

export const OEM_METADATA: Metadata = {
  title: { absolute: OEM_SEO_TITLE },
  description: OEM_SEO_DESCRIPTION,
  alternates: { canonical: OEM_CANONICAL_URL },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: OEM_CANONICAL_URL,
    siteName: '会津ブランド館',
    title: OEM_OG_TITLE,
    description: OEM_OG_DESCRIPTION,
    images: [{ url: `${OEM_SITE_URL}${OEM_OG_IMAGE}`, width: 1200, height: 630, alt: OEM_OG_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: OEM_OG_TITLE,
    description: OEM_OG_DESCRIPTION,
    images: [`${OEM_SITE_URL}${OEM_OG_IMAGE}`],
  },
  icons: { icon: OEM_FAVICON },
  robots: { index: true, follow: true },
}
