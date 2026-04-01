import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { LpSection, Product } from '@/types/database'
import { getActiveForm, getPublicProducts } from '@/actions/publicForm'
import InteractiveForm from '@/components/InteractiveForm'
import Image from 'next/image'
import Link from 'next/link'
import { Facebook, Instagram, Youtube, MapPin, Phone, Clock, CalendarDays } from 'lucide-react'

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



// ヘッダー（参照: ヘッター・フッター.tsx）
function Header() {
  return (
    <header style={{ width: '100%', backgroundColor: '#fff', padding: '24px 16px' }}>
      <div style={{ maxWidth: '896px', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          src="/images/btob/rogo.jpg"
          alt="AIZU BRAND HALL"
          width={200}
          height={200}
          style={{ height: '80px', width: 'auto' }}
          priority
        />
      </div>
    </header>
  )
}

// 店舗情報セクション
function StoreSection() {
  return (
    <section style={{ width: '100%', padding: '100px 16px', backgroundColor: '#fff', borderTop: '1px solid #eaeaea' }}>
      <div style={{ maxWidth: '896px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 500, letterSpacing: '0.1em', color: '#111', lineHeight: 1.5 }}>
            OEMは「会津ブランド館」が実施しています。
          </h2>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#111', margin: '24px auto 0' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '64px', alignItems: 'center' }}>
            {/* 写真 */}
            <div style={{ position: 'relative', aspectRatio: '4/3', width: '100%' }}>
              <Image
                src="/images/btob/brandkan.jpg"
                alt="会津ブランド館 店舗外観"
                fill
                style={{ objectFit: 'cover' }}
              />
            </div>
            
            {/* 店舗情報 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.2em', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
                Store Information
              </h3>
              <p style={{ fontSize: '20px', fontWeight: 600, color: '#111', marginBottom: '32px', letterSpacing: '0.05em' }}>
                会津ブランド館
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '14px', color: '#333', letterSpacing: '0.05em', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <MapPin size={18} style={{ color: '#ccc', flexShrink: 0, marginTop: '2px' }} />
                  <span>〒965-0044<br/>福島県会津若松市七日町6−15</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Phone size={18} style={{ color: '#ccc', flexShrink: 0 }} />
                  <span>0242-25-4141</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Clock size={18} style={{ color: '#ccc', flexShrink: 0 }} />
                  <span>11:00 〜 16:00</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <CalendarDays size={18} style={{ color: '#ccc', flexShrink: 0, marginTop: '2px' }} />
                  <span>12月31日・1月1日 休業<br/><span style={{ fontSize: '12px', color: '#888' }}>（発送もお休みさせて頂きます）</span></span>
                </div>
              </div>
            </div>
          </div>

          {/* Google Maps */}
          <div style={{ width: '100%' }}>
            <div style={{ aspectRatio: '21/9', width: '100%', filter: 'grayscale(100%) contrast(1.1) opacity(0.9)', backgroundColor: '#f5f5f5' }}>
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3186.7449148!2d139.92674!3d37.49778!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x5f8aaa5961ea738b%3A0x98f1d2c1d32acdd2!2z5Lya5rSl44OW44Op44Oz44OJ6aSo!5e0!3m2!1sja!2sjp!4v1710000000000!5m2!1sja!2sjp"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <a
                href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#111', fontSize: '13px', letterSpacing: '0.05em', borderBottom: '1px solid #111', paddingBottom: '2px', textDecoration: 'none' }}
              >
                Google Maps で開く
              </a>
            </div>
          </div>
        </div>

        {/* SNSリンク */}
        <div style={{ marginTop: '80px', textAlign: 'center', borderTop: '1px solid #eaeaea', paddingTop: '60px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#999', letterSpacing: '0.25em', marginBottom: '24px' }}>FOLLOW US</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px' }}>
            <Link href="https://www.facebook.com/aizubrandkan/" target="_blank" rel="noopener noreferrer" style={{ color: '#111' }}>
              <Facebook size={20} strokeWidth={1.5} />
            </Link>
            <Link href="https://x.com/Aizu_Brand_Kan" target="_blank" rel="noopener noreferrer" style={{ color: '#111' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16z" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" /></svg>
            </Link>
            <Link href="https://www.instagram.com/aizubrandhall/" target="_blank" rel="noopener noreferrer" style={{ color: '#111' }}>
              <Instagram size={20} strokeWidth={1.5} />
            </Link>
            <Link href="https://www.youtube.com/channel/UCpusPn2NlWyrgkIMbacH4-w" target="_blank" rel="noopener noreferrer" style={{ color: '#111' }}>
              <Youtube size={20} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// フッター
function Footer() {
  return (
    <footer style={{ width: '100%', backgroundColor: '#fff', color: '#111', padding: '60px 16px', borderTop: '1px solid #eaeaea' }}>
      <div style={{ maxWidth: '896px', margin: '0 auto', textAlign: 'center' }}>
        <Image
          src="/images/btob/rogo.jpg"
          alt="AIZU BRAND HALL"
          width={100}
          height={100}
          style={{ height: '32px', width: 'auto', margin: '0 auto 24px' }}
        />
        <p style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#999' }}>
          &copy; {new Date().getFullYear()} AIZU BRAND HALL. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

import { notFound } from 'next/navigation'
import { Metadata } from 'next'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { slug } = await params

  try {
    const supabase = await createClient()
    const { data: pageData } = await supabase
      .from('pages')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!pageData) return {}

    return {
      title: pageData.seo_title || pageData.title || 'フォームLP作成ツール',
      description: pageData.seo_description || pageData.description || 'LP・フォーム',
      openGraph: {
        title: pageData.og_title || pageData.seo_title || pageData.title,
        description: pageData.og_description || pageData.seo_description || pageData.description || '',
        images: pageData.og_image_url ? [pageData.og_image_url] : [],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: pageData.og_title || pageData.seo_title || pageData.title,
        description: pageData.og_description || pageData.seo_description || pageData.description || '',
        images: pageData.og_image_url ? [pageData.og_image_url] : [],
      },
      icons: pageData.favicon_url ? {
        icon: pageData.favicon_url,
      } : undefined,
    }
  } catch {
    return {}
  }
}

// メインページ
export default async function HomePage({ params }: { params: { slug: string } }) {
  const { slug } = await params
  let sections: LpSection[] = []
  let formSteps: any[] = []
  let products: Product[] = []
  let currentPageId = ''

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
    currentPageId = pageId

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

    // 4. 商品一覧の取得
    products = await getPublicProducts(pageId)

  } catch {
    // Supabase未設定時はデフォルト表示
  }

  return (
    <main id="top" style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      {/* ヘッダー */}
      <Header />

      {/* LP画像セクション */}
      <Suspense fallback={<SectionSkeleton />}>
        <div style={{ maxWidth: '896px', marginLeft: 'auto', marginRight: 'auto', padding: '40px 20px 56px', display: 'flex', flexDirection: 'column', gap: '48px', alignItems: 'center' }}>
          {/* DB画像があればDB優先、なければフォールバック */}
          {sections.length > 0 ? (
            sections.map((section, i) => (
              <div
                key={section.id}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: section.section_type === 'hero' ? '32px' : '24px',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                {/* 画像部分 */}
                {section.image_url && (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: section.section_type === 'hero' ? '32px' : '24px',
                      overflow: 'hidden',
                      boxShadow: section.section_type === 'hero' 
                        ? '0 30px 60px -12px rgba(0,0,0,0.3)' 
                        : '0 25px 50px -12px rgba(0,0,0,0.25)',
                      transition: 'transform 0.3s ease',
                    }}
                  >
                    <Image
                      src={section.image_url}
                      alt={section.title || ''}
                      width={1200}
                      height={1600}
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                      priority={i === 0 || section.section_type === 'hero'}
                    />
                  </div>
                )}

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
        padding: '80px 20px 96px',
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
        <div style={{ textAlign: 'center', marginBottom: '56px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-block', padding: '10px 24px', borderRadius: '9999px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', marginBottom: '24px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#a5b4fc', letterSpacing: '0.1em' }}>✨ 簡単3ステップ</span>
          </div>
          <h2 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800, color: '#fff', marginBottom: '20px', letterSpacing: '0.04em', lineHeight: 1.4 }}>
            今すぐ無料で<br />
            <span style={{ background: 'linear-gradient(90deg, #818cf8, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>自動お見積もり</span>
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.9, letterSpacing: '0.05em' }}>
            質問に回答するだけで、概算のお見積りが即座に算出されます。お気軽にお試しください。
          </p>
        </div>

        <InteractiveForm steps={formSteps} products={products} pageId={currentPageId} />
      </section>

      {/* 店舗情報セクション */}
      <StoreSection />

      {/* フッター */}
      <Footer />

    </main>
  )
}
