import Image from 'next/image'
import Link from 'next/link'
import OemAnalytics from '@/components/OemAnalytics'
import OemTrackedQuoteLink from '@/components/OemTrackedQuoteLink'
import OemConsultationLink from '@/components/OemConsultationLink'
import { OemFirstOfferSummary } from '@/components/OemServiceGuide'
import styles from './OemProductLanding.module.css'

export type OemProductLandingProps = {
  product: 'curry' | 'ramen'
  title: string
  lead: string
  image: string
  imageAlt: string
  lot: string
  shelfLife: string
  points: string[]
  faqs: Array<{ question: string; answer: string }>
}

export default function OemProductLanding(props: OemProductLandingProps) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/btob" className={styles.brand}>会津ブランド館｜食品OEM</Link>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>福島の食品OEM</p>
            <h1 className={styles.title}>{props.title}</h1>
            <p className={styles.lead}>{props.lead}</p>
            <p className={styles.lotNote}>製造ロットの目安：{props.lot}{props.product === 'ramen' ? '（2食入り）' : ''}</p>
            <div className={styles.actions}>
              <OemConsultationLink product={props.product} location="hero" className={styles.primary}>商品づくりを相談する</OemConsultationLink>
              <OemTrackedQuoteLink product={props.product} location="hero" className={styles.secondary}>概算費用を確認する</OemTrackedQuoteLink>
            </div>
            <p className={styles.consultationNote}>商品や包装、数量が未定でもご相談いただけます。相談の送信だけで費用は発生せず、正式発注にもなりません。</p>
          </div>

          <figure className={styles.heroImage}>
            <Image src={props.image} alt={props.imageAlt} width={720} height={720} priority sizes="(max-width: 720px) 100vw, 46vw" />
            <figcaption className={styles.caption}>※掲載画像は包装イメージのAI生成サンプルです。最終仕様は正式見積もり時に確認します。</figcaption>
          </figure>
        </div>

        <section className={styles.section} aria-labelledby="overview-title">
          <h2 id="overview-title">{props.product === 'curry' ? 'レトルトカレーOEMの概要' : 'ラーメンOEMの概要'}</h2>
          <ul>
            {props.points.map(point => <li key={point}>{point}</li>)}
          </ul>
          <div className={styles.facts}>
            <div className={styles.fact}><strong>{props.lot}</strong><span>製造ロットの目安</span></div>
            <div className={styles.fact}><strong>{props.shelfLife}</strong><span>賞味期限の目安</span></div>
            <div className={styles.fact}><strong>概算</strong><span>仕様・包装を選んで確認</span></div>
          </div>
          <p className={styles.proof}>会津ブランド館は自社でもカレーや麺商品を企画・販売しています。<Link href="/btob#oem-ranking-heading">販売商品の過去のランキング実績を見る</Link></p>
        </section>

        <OemFirstOfferSummary />

        <section className={styles.section} aria-labelledby="flow-title">
          <h2 id="flow-title">ご相談から商品づくりへ</h2>
          <p>作りたい味や使いたい食材から、商品づくりをご相談ください。商品化できるか、どんな仕様にするかが未定でもお送りいただけます。費用の目安を知りたい場合は、商品・包装を選んで概算を確認できます。</p>
          <p>試作で味を確認した後、製造をご希望の場合は仕様・数量・正式見積もりを決めます。</p>
          <div className={styles.actions}>
            <OemConsultationLink product={props.product} location="footer" className={styles.primary}>商品づくりを相談する</OemConsultationLink>
            <OemTrackedQuoteLink product={props.product} location="footer" className={styles.secondary}>概算費用を確認する</OemTrackedQuoteLink>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="faq-title">
          <h2 id="faq-title">よくあるご質問</h2>
          {props.faqs.map(faq => <div className={styles.faq} key={faq.question}><h3>{faq.question}</h3><p>{faq.answer}</p></div>)}
        </section>
      </div>

      <footer className={styles.footer}>会津ブランド館｜福島県会津若松市</footer>
      <OemAnalytics measurementId={process.env.NEXT_PUBLIC_OEM_GA_MEASUREMENT_ID} />
    </main>
  )
}
