import type { Metadata } from 'next'
import { Noto_Sans_JP, Inter } from 'next/font/google'
import './globals.css'

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: {
    template: '%s | 食品OEM パートナー',
    default: '食品OEM パートナー - あなただけのオリジナル食品を',
  },
  description: '小ロットから対応可能なB2B向け食品OEMサービス。レトルト食品、調味料、冷凍食品など、あなたのアイデアを形にします。最新のBTO見積もりで簡単・瞬時にお見積りをシミュレーション。',
  keywords: ['食品OEM', 'B2B', '小ロットOEM', 'レトルト食品製作', 'オリジナル食品', 'BTO見積もり'],
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: '/',
    siteName: '食品OEM パートナー',
    title: '食品OEM パートナー - あなただけのオリジナル食品を',
    description: '小ロットから対応可能なB2B向け食品OEMサービス。最新のBTO見積もりで簡単・瞬時にお見積りをシミュレーション。',
  },
  twitter: {
    card: 'summary_large_image',
    title: '食品OEM パートナー - あなただけのオリジナル食品を',
    description: '小ロットから対応可能なB2B向け食品OEMサービス。あなたのアイデアを形にします。',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} ${inter.variable}`}>
      <body>
        {children}
      </body>
    </html>
  )
}
