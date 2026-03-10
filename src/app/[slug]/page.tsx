import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LpSection } from '@/types/database'
import { getActiveForm } from '@/actions/publicForm'
import InteractiveForm from '@/components/InteractiveForm'
import Image from 'next/image'

// LP画像セクション（ハードコード）
const LP_IMAGES = [
  { src: '/images/lp-hero.jpg', alt: '福島の食材を楽天1位の味で。小ロット400個からの地元食材OEM' },
  { src: '/images/lp-problems.jpg', alt: 'OEMは地獄？福島の食材で小ロット・低コスト・簡単フロー' },
  { src: '/images/lp-cases.jpg', alt: '農家・自治体・道の駅ホテルの活用事例' },
  { src: '/images/lp-reasons.jpg', alt: '福島専門のOEMプロ集団が企画から販売までフルサポート' },
  { src: '/images/lp-cta.jpg', alt: '先着10社様限定 今なら初期費用0円' },
]

// LP セクションスケルトン
function SectionSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      <div className="skeleton h-8 w-64 mb-4" />
      <div className="skeleton h-[400px] w-full rounded-2xl" />
    </div>
  )
}



// フッター
function Footer() {
  return (
    <footer style={{ width: '100%', borderTop: '1px solid #e5e7eb', backgroundColor: '#fff' }}>
      <div style={{ maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', padding: '32px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937' }}>
              食品OEM パートナー
            </span>
            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
              あなたのアイデアを美味しい商品に
            </p>
          </div>
          <p style={{ fontSize: '14px', color: '#9ca3af' }}>
            &copy; {new Date().getFullYear()} Food OEM Partner. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

import { notFound } from 'next/navigation'

// メインページ
export default async function HomePage({ params }: { params: { slug: string } }) {
  const { slug } = await params
  let sections: LpSection[] = []
  let formSteps: any[] = []

  try {
    const supabase = await createClient()

    // 1. スラッグからページ情報を取得
    const { data: pageData } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!pageData) {
      notFound()
    }

    const pageId = pageData.id

    // 2. LPセクションの取得
    const { data: lpData } = await supabase
      .from('lp_sections')
      .select('*')
      .eq('page_id', pageId)
      .eq('is_visible', true)
      .order('order_index', { ascending: true })

    sections = (lpData ?? []) as LpSection[]

    // 3. 動的フォームデータの取得
    formSteps = await getActiveForm(pageId)

  } catch {
    // Supabase未設定時はデフォルト表示
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* LP画像セクション */}
      <Suspense fallback={<SectionSkeleton />}>
        <div style={{ maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', padding: '48px 16px', display: 'flex', flexDirection: 'column', gap: '64px', alignItems: 'center' }}>
          {/* DB画像があればDB優先、なければフォールバック */}
          {sections.length > 0 ? (
            sections.filter(s => s.image_url).map((section, i) => (
              <div
                key={section.id}
                style={{ width: '100%', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
              >
                <img
                  src={section.image_url!}
                  alt={section.title || ''}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
            ))
          ) : (
            LP_IMAGES.map((img, i) => (
              <div
                key={i}
                style={{ width: '100%', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={1200}
                  height={1600}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  priority={i === 0}
                />
              </div>
            ))
          )}
        </div>
      </Suspense>

      {/* フォームセクション（BTO見積もり） */}
      <section id="bto-form" style={{
        width: '100%',
        padding: '96px 16px',
        position: 'relative',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #312e81 60%, #1e1b4b 100%)',
        overflow: 'hidden',
      }}>
        {/* 背景装飾 */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(236,72,153,0.1) 0%, transparent 50%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '-50%', left: '-20%', width: '60%', height: '200%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* セクション見出し */}
        <div style={{ textAlign: 'center', marginBottom: '48px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-block', padding: '8px 20px', borderRadius: '9999px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#a5b4fc', letterSpacing: '0.05em' }}>✨ 簡単3ステップ</span>
          </div>
          <h2 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800, color: '#fff', marginBottom: '12px', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
            今すぐ無料で<br />
            <span style={{ background: 'linear-gradient(90deg, #818cf8, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>自動お見積もり</span>
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
            質問に回答するだけで、概算のお見積りが即座に算出されます。お気軽にお試しください。
          </p>
        </div>

        <InteractiveForm steps={formSteps} />
      </section>

      {/* フッター */}
      <Footer />

      {/* フローティング見積もりボタン */}
      <a
        href="#bto-form"
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50, padding: '16px 24px', backgroundColor: '#ea580c', color: '#fff', fontWeight: 'bold', fontSize: '18px', borderRadius: '9999px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', textDecoration: 'none', transition: 'all 0.3s' }}
      >
        🚀 今すぐ自動見積もり
      </a>
    </main>
  )
}
