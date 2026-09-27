import type { Metadata } from 'next'
import Link from 'next/link'
import { OEM_TERMS_SECTIONS, OEM_TERMS_TITLE, OEM_TERMS_VERSION } from '@/lib/oem-terms'

export const metadata: Metadata = { title: `${OEM_TERMS_TITLE}｜会津ブランド館`, description: '会津ブランド館の食品OEM取引規約です。' }

export default function OemTermsPage() {
  return <main style={{ minHeight: '100vh', padding: '48px 20px 80px', background: '#f3f5f4', color: '#17211e' }}>
    <article style={{ maxWidth: 840, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', background: '#fff', borderRadius: 16, border: '1px solid #dbe3df' }}>
      <p style={{ margin: '0 0 6px', color: '#1d6b4f', fontWeight: 800 }}>会津ブランド館</p>
      <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(28px, 6vw, 40px)' }}>{OEM_TERMS_TITLE}</h1>
      <p style={{ margin: '0 0 30px', color: '#66736e' }}>規約版：{OEM_TERMS_VERSION}</p>
      {OEM_TERMS_SECTIONS.map(section => <section key={section.title} style={{ marginTop: 28 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 21 }}>{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph} style={{ margin: '8px 0 0', lineHeight: 1.9 }}>{paragraph}</p>)}
      </section>)}
      <Link href="/btob" style={{ display: 'inline-block', marginTop: 36, color: '#1d6b4f' }}>OEMページへ戻る</Link>
    </article>
  </main>
}
