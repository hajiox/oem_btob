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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    template: '%s | 食品OEM パートナー',
    default: '食品OEM パートナー - あなただけのオリジナル食品を',
  },
  description: '小ロットから対応可能な食品OEMサービス。レトルト食品、調味料、冷凍食品など、あなたのアイデアを形にします。BTO見積もりで簡単お見積り。',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: '食品OEM パートナー',
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
