import Image from 'next/image'
import Link from 'next/link'
import OemAnalytics from '@/components/OemAnalytics'
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
  const quoteHref = `/btob?product=${props.product}#bto-form`
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
            <div className={styles.actions}>
              <Link href={quoteHref} className={styles.primary}>この商品の概算を確認する</Link>
              <Link href="/btob" className={styles.secondary}>食品OEM全体を見る</Link>
            </div>
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
          <p>まずは仕様・包装を選び、概算をご確認ください。作りたい味や使いたい原料について伺い、試作の内容を相談します。</p>
          <p>試作で味を確認した後、製造をご希望の場合は仕様・数量・正式見積もりを決めます。</p>
          <div className={styles.actions}>
            <Link href={quoteHref} className={styles.primary}>この商品で概算を確認する</Link>
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
