import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LpSection, FormStepWithQuestions } from '@/types/database'

// LP セクションスケルトン
function SectionSkeleton() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-16">
      <div className="skeleton h-8 w-64 mb-4" />
      <div className="skeleton h-4 w-full mb-2" />
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-64 w-full mt-6" />
    </div>
  )
}

// ヒーローセクション（フォールバック）
function HeroSection() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* 背景グラデーション */}
      <div className="absolute inset-0 gradient-primary" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(233,69,96,0.15),transparent_70%)]" />

      {/* 装飾パーティクル */}
      <div className="absolute top-20 left-10 w-2 h-2 rounded-full bg-[var(--color-accent)] opacity-40 animate-pulse" />
      <div className="absolute top-40 right-20 w-3 h-3 rounded-full bg-[var(--color-gold)] opacity-30 animate-pulse" style={{ animationDelay: '0.5s' }} />
      <div className="absolute bottom-40 left-1/4 w-2 h-2 rounded-full bg-[var(--color-accent)] opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 text-center max-w-4xl mx-auto px-6 animate-fade-in-up">
        <div className="inline-block px-4 py-2 rounded-full glass text-sm text-[var(--color-gold)] font-medium mb-8 tracking-wider">
          🍽️ B2B 食品OEMサービス
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6" style={{ fontFamily: 'var(--font-heading)' }}>
          <span className="text-white">あなただけの</span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-gold)]">
            オリジナル食品
          </span>
          <br />
          <span className="text-white">を形にします</span>
        </h1>

        <p className="text-lg md:text-xl text-[var(--color-text-muted)] max-w-2xl mx-auto mb-10 leading-relaxed">
          小ロットから対応可能。レトルト食品、調味料、冷凍食品など、
          御社のアイデアをプロフェッショナルが形にします。
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#bto-form"
            className="px-8 py-4 rounded-xl gradient-accent text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
            style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}
          >
            🚀 無料見積もりを始める
          </a>
          <a
            href="#features"
            className="px-8 py-4 rounded-xl glass text-white font-medium text-lg hover:bg-white/10 transition-all duration-300"
          >
            サービスを見る →
          </a>
        </div>
      </div>

      {/* 下スクロールインジケーター */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  )
}

// 動的 LP セクション描画
function DynamicSection({ section }: { section: LpSection }) {
  return (
    <section className="w-full max-w-6xl mx-auto px-6 py-16 animate-fade-in-up" id={`section-${section.id}`}>
      <div className="glass rounded-2xl p-8 md:p-12">
        {section.image_url && (
          <div className="w-full h-64 md:h-80 rounded-xl overflow-hidden mb-8 bg-white/5">
            <img
              src={section.image_url}
              alt={section.title || ''}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        {section.title && (
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            {section.title}
          </h2>
        )}
        {section.description && (
          <p className="text-[var(--color-text-muted)] leading-relaxed text-lg">
            {section.description}
          </p>
        )}
      </div>
    </section>
  )
}

// フォームセクション（プレースホルダー）
function BTOFormPlaceholder() {
  return (
    <section id="bto-form" className="w-full max-w-4xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
          📋 BTO見積もりフォーム
        </h2>
        <p className="text-[var(--color-text-muted)] text-lg">
          管理画面からフォームを設定すると、ここに動的フォームが表示されます。
        </p>
      </div>

      <div className="glass rounded-2xl p-8 md:p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-[var(--color-text-muted)] text-sm">
          管理画面 &rarr; フォームエディタ から質問と選択肢を追加してください
        </p>
      </div>
    </section>
  )
}

// フッター
function Footer() {
  return (
    <footer className="w-full border-t border-[var(--color-border)] mt-20">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
              食品OEM パートナー
            </span>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              あなたのアイデアを美味しい商品に
            </p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} Food OEM Partner. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

// メインページ
export default async function HomePage() {
  let sections: LpSection[] = []

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('lp_sections')
      .select('*')
      .eq('is_visible', true)
      .order('order_index', { ascending: true })

    sections = (data ?? []) as LpSection[]
  } catch {
    // Supabase未設定時はデフォルト表示
  }

  return (
    <main className="min-h-screen">
      {/* ヒーロー: DBにheroセクションがあればそれを使う、なければデフォルト */}
      <Suspense fallback={<SectionSkeleton />}>
        <HeroSection />
      </Suspense>

      {/* 動的セクション */}
      <div id="features">
        {sections
          .filter(s => s.section_type !== 'hero')
          .map(section => (
            <DynamicSection key={section.id} section={section} />
          ))}
      </div>

      {/* フォームプレースホルダー（フェーズ4で本実装） */}
      <BTOFormPlaceholder />

      {/* フッター */}
      <Footer />
    </main>
  )
}
