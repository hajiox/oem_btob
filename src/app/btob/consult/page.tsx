import type { Metadata } from 'next'
import Link from 'next/link'
import OemAnalytics from '@/components/OemAnalytics'
import OemConsultationForm from '@/components/OemConsultationForm'
import OemTrackedQuoteLink from '@/components/OemTrackedQuoteLink'
import styles from './page.module.css'

const canonical = 'https://oem.aizubrandhall.com/btob/consult'

export const metadata: Metadata = {
    title: { absolute: '商品づくりを相談する｜食品OEM｜会津ブランド館' },
    description: '使いたい食材や商品化の可否、費用・ロットを会津ブランド館に相談できます。商品や数量が未定でもご相談いただけます。',
    alternates: { canonical },
    openGraph: { type: 'website', locale: 'ja_JP', url: canonical, siteName: '会津ブランド館', title: '商品づくりを相談する｜食品OEM', description: '商品や包装、数量が未定でも、短いフォームから商品づくりを相談できます。' },
}

export default async function OemConsultationPage({ searchParams }: { searchParams: Promise<{ product?: string | string[] }> }) {
    const product = (await searchParams).product
    const initialProductId = product === 'curry' ? 'c0000001-0000-0000-0000-000000000001'
        : product === 'ramen' ? 'c0000001-0000-0000-0000-000000000002' : undefined

    return <main className={styles.page}>
        <header className={styles.header}><Link href="/btob">会津ブランド館｜食品OEM</Link></header>
        <div className={styles.content}>
            <h1>商品づくりを相談する</h1>
            <p className={styles.lead}>使いたい食材や、商品にできるか分からないアイデアからご相談いただけます。概算見積もりを確認する前でもお送りください。</p>
            <section className={styles.panel} aria-label="商品づくりの相談フォーム">
                <OemConsultationForm initialProductId={initialProductId} />
            </section>
            <p className={styles.back}><OemTrackedQuoteLink product={product === 'curry' || product === 'ramen' ? product : undefined} location="footer">概算費用を確認する</OemTrackedQuoteLink><span aria-hidden="true"> · </span><Link href="/btob">食品OEM全体を見る</Link></p>
        </div>
        <OemAnalytics measurementId={process.env.NEXT_PUBLIC_OEM_GA_MEASUREMENT_ID} />
    </main>
}
