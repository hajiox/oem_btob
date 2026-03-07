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
    <footer className="w-full border-t border-gray-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <span className="text-lg font-bold text-gray-800">
              食品OEM パートナー
            </span>
            <p className="text-sm text-gray-500 mt-1">
              あなたのアイデアを美味しい商品に
            </p>
          </div>
          <p className="text-sm text-gray-400">
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
    <main className="min-h-screen bg-gray-100">
      {/* LP画像セクション（v0オリジナルデザイン復元） */}
      <Suspense fallback={<SectionSkeleton />}>
        <div className="max-w-3xl mx-auto px-4 space-y-16 py-8">
          {LP_IMAGES.map((img, i) => (
            <div key={i} className="rounded-2xl shadow-2xl overflow-hidden">
              <Image
                src={img.src}
                alt={img.alt}
                width={800}
                height={1000}
                className="w-full h-auto"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </Suspense>

      {/* DB管理の動的セクション（将来のlp-editor対応） */}
      {sections.length > 0 && (
        <div id="features" className="max-w-3xl mx-auto px-4 space-y-16">
          {sections
            .filter(s => s.section_type !== 'hero')
            .map(section => (
              <DynamicSection key={section.id} section={section} />
            ))}
        </div>
      )}

      {/* フォームセクション（BTO見積もり） */}
      <section id="bto-form" className="w-full mx-auto px-4 sm:px-6 py-20 relative">
        <InteractiveForm steps={formSteps} />
      </section>

      {/* フッター */}
      <Footer />

      {/* フローティング見積もりボタン */}
      <a
        href="#bto-form"
        className="fixed bottom-6 right-6 z-50 px-6 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold text-lg rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
      >
        🚀 今すぐ自動見積もり
      </a>
    </main>
  )
}
