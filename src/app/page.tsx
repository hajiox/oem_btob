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

// 動的 LP セクション描画（DB管理用、将来のlp-editor対応）
function DynamicSection({ section }: { section: LpSection }) {
  return (
    <section className="w-full max-w-3xl mx-auto px-4" id={`section-${section.id}`}>
      <div className="rounded-2xl shadow-2xl overflow-hidden">
        {section.image_url && (
          <img
            src={section.image_url}
            alt={section.title || ''}
            className="w-full h-auto"
          />
        )}
      </div>
    </section>
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

// メインページ
export default async function HomePage() {
  let sections: LpSection[] = []
  let formSteps: any[] = []

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('lp_sections')
      .select('*')
      .eq('is_visible', true)
      .order('order_index', { ascending: true })

    sections = (data ?? []) as LpSection[]

    // 動的フォームデータの取得
    formSteps = await getActiveForm()
  } catch {
    // Supabase未設定時はデフォルト表示
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* LP画像セクション */}
      <Suspense fallback={<SectionSkeleton />}>
        <div style={{ maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', padding: '48px 16px', display: 'flex', flexDirection: 'column', gap: '64px', alignItems: 'center' }}>
          {LP_IMAGES.map((img, i) => (
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
          ))}
        </div>
      </Suspense>

      {/* DB管理の動的セクション（将来のlp-editor対応） */}
      {sections.length > 0 && (
        <div id="features" style={{ maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', padding: '48px 16px', display: 'flex', flexDirection: 'column' as const, gap: '64px' }}>
          {sections
            .filter(s => s.section_type !== 'hero')
            .map(section => (
              <DynamicSection key={section.id} section={section} />
            ))}
        </div>
      )}

      {/* フォームセクション（BTO見積もり） */}
      <section id="bto-form" style={{ width: '100%', padding: '80px 16px', position: 'relative' }}>
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
