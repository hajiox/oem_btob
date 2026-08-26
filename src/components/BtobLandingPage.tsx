import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowRight,
    BadgeCheck,
    Check,
    ChevronDown,
    Clock3,
    Instagram,
    MapPin,
    MessageCircle,
    PackageCheck,
    Phone,
    ShieldCheck,
    Sparkles,
    Star,
} from 'lucide-react'
import InteractiveForm from '@/components/InteractiveForm'
import type { FormStepWithItems } from '@/actions/publicForm'
import type { LpSection, Product } from '@/types/database'
import styles from './BtobLandingPage.module.css'

type Props = {
    sections: LpSection[]
    formSteps: FormStepWithItems[]
    products: Product[]
    pageId: string
}

const fallbackHero = {
    title: '福島の食材を、\n売れる商品へ。',
    description: '小ロット400個から。レシピ開発・パッケージ・製造まで、会津の食品開発チームがひとつの窓口で伴走します。',
}

const standardFaqs = [
    {
        question: 'まだ商品仕様が決まっていなくても相談できますか？',
        answer: 'はい。素材や販売先、作りたいイメージの段階からご相談いただけます。フォームへの回答を通じて、必要な条件を順番に整理できます。',
    },
    {
        question: '最低ロットは何個ですか？',
        answer: '現在の自動見積もりは400個から800個を対象にしています。商品や仕様によって条件が異なるため、詳しくは見積もり後に個別にご案内します。',
    },
    {
        question: '原料の持ち込みはできますか？',
        answer: '原料供給の有無をフォームで指定できます。持ち込みたい原料がある場合は、原料名や状態を入力してご相談ください。',
    },
    {
        question: 'パッケージも一緒に相談できますか？',
        answer: 'はい。白無地箱と巻紙、バルクなど、商品ごとに選べる仕様をご案内しています。簡易パッケージデザインもキャンペーン対象に含まれます。',
    },
    {
        question: '見積もりを試すと、すぐに申込みになりますか？',
        answer: 'いいえ。まず概算金額を確認し、内容に納得した場合のみ仮申込みへ進みます。条件整理だけでもお気軽にお試しください。',
    },
]

const isRenderableImage = (url: string | null | undefined) => Boolean(url && (url.startsWith('/') || url.includes('public.blob.vercel-storage.com')))

function SectionImage({ url, alt }: { url: string | null | undefined; alt: string }) {
    if (!isRenderableImage(url)) return null
    return <Image className={styles.sectionImage} src={url as string} alt={alt} width={900} height={620} sizes="(max-width: 700px) 100vw, 50vw" />
}

function RichSection({ section }: { section: LpSection }) {
    const title = section.title || '会津の恵みを、あなたの商品へ。'
    const isPolicy = title.includes('注意事項')
    const description = section.description || (isPolicy
        ? '品質、製造ロット、サンプル、キャンセルなどの条件は、商品仕様を確認したうえで個別にご案内します。'
        : '素材の魅力を引き出し、販売したい人に届く商品へ。')
    const isWide = section.section_type === 'hero' || section.section_type === 'testimonial' || section.section_type === 'cta'
    const typeClass = styles[section.section_type] || ''

    if (section.section_type === 'faq' || isPolicy) {
        return (
            <section className={styles.faqItem} aria-labelledby={`lp-section-${section.id}`}>
                <details>
                    <summary id={`lp-section-${section.id}`}><span className={styles.faqMark}>Q</span>{title}<ChevronDown size={19} aria-hidden="true" /></summary>
                    <p>{description}</p>
                </details>
            </section>
        )
    }

    return (
        <section className={`${styles.managedSection} ${typeClass} ${isWide ? styles.wideSection : ''}`} aria-labelledby={`lp-section-${section.id}`}>
            <div className={styles.sectionCopy}>
                <span className={styles.sectionKicker}>{section.section_type === 'feature' ? 'FEATURE' : section.section_type.toUpperCase()}</span>
                <h2 id={`lp-section-${section.id}`}>{title}</h2>
                <p>{description}</p>
                {section.section_type === 'cta' && <Link className={styles.inlineCta} href="#bto-form">商品企画を相談する <ArrowRight size={17} aria-hidden="true" /></Link>}
            </div>
            <SectionImage url={section.image_url} alt={title} />
        </section>
    )
}

export default function BtobLandingPage({ sections, formSteps, products, pageId }: Props) {
    const visibleSections = sections.filter(section => section.is_visible).sort((a, b) => a.order_index - b.order_index)
    const explicitHero = visibleSections.find(section => section.section_type === 'hero')
    const hero = explicitHero || visibleSections[0]
    const contentSections = visibleSections.filter(section => section.id !== hero?.id && section.section_type !== 'faq')
    const faqSections = visibleSections.filter(section => section.section_type === 'faq')

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Link href="#top" className={styles.brand} aria-label="会津ブランド館 OEMトップへ">
                    <Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={64} height={64} />
                </Link>
                <nav className={styles.nav} aria-label="ページ内ナビゲーション">
                    <Link href="#reasons">選ばれる理由</Link><Link href="#products">商品例</Link><Link href="#flow">ご利用の流れ</Link>
                </nav>
                <Link className={styles.headerCta} href="#bto-form">無料で相談する <ArrowRight size={16} aria-hidden="true" /></Link>
            </header>

            <main id="top">
                <section className={styles.hero} aria-labelledby="hero-title">
                    <div className={styles.heroGlow} aria-hidden="true" />
                    <div className={styles.heroInner}>
                        <div className={styles.heroCopy}>
                            <p className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> 会津ブランド館｜食品OEM</p>
                            <h1 id="hero-title">{explicitHero?.title || fallbackHero.title}</h1>
                            <p className={styles.heroDescription}>{explicitHero?.description || fallbackHero.description}</p>
                            <div className={styles.heroActions}><Link className={styles.primaryCta} href="#bto-form">まずは商品を相談する <ArrowRight size={19} aria-hidden="true" /></Link><span>相談・概算見積もり無料</span></div>
                            <div className={styles.proofBar} aria-label="OEMの実績">
                                <span><strong>400</strong>個〜の小ロット</span>
                                <span><strong>50+</strong>社のOEM取引実績</span>
                                <span><strong>No.1</strong>楽天・Yahoo!ランキング商品実績</span>
                                <span><strong>0円</strong>初期費用キャンペーン</span>
                            </div>
                        </div>
                        <div className={styles.heroVisual}>
                            <div className={styles.heroCard}>
                                <Image
                                    src={isRenderableImage(hero?.image_url) ? hero!.image_url! : '/images/lp-hero.jpg'}
                                    alt={hero?.title || '福島の食材を使った食品OEM'}
                                    fill
                                    priority
                                    sizes="(max-width: 700px) 90vw, 43vw"
                                />
                            </div>
                            <div className={styles.rankingBadge}><BadgeCheck size={18} aria-hidden="true" /><span>企画から商品化まで<br /><strong>ワンストップ</strong></span></div>
                        </div>
                    </div>
                </section>

                <section className={styles.problemSection} aria-labelledby="problem-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>こんなお悩みありませんか</p><h2 id="problem-title">「作りたい」が、止まっていませんか？</h2></div>
                    <div className={styles.problemGrid}>{['アイデアはあるけれど、何から始めるか分からない', '大手工場のロットや費用が合わない', '品質・表示・納期まで相談できる相手がいない'].map((text, index) => <article className={styles.problemCard} key={text}><span>0{index + 1}</span><p>{text}</p><MessageCircle size={21} aria-hidden="true" /></article>)}</div>
                </section>

                <section className={styles.reasonsSection} id="reasons" aria-labelledby="reasons-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>選ばれる理由</p><h2 id="reasons-title">企画担当者の目線で、<br />最後まで伴走します。</h2></div>
                    <div className={styles.reasonGrid}>
                        <article><div className={styles.iconCircle}><PackageCheck size={24} /></div><span>01</span><h3>小ロットから現実的に</h3><p>400個から相談できるから、テスト販売や新商品の第一歩に。</p></article>
                        <article><div className={styles.iconCircle}><ShieldCheck size={24} /></div><span>02</span><h3>品質と表示を一緒に確認</h3><p>食品として大切な確認事項を整理し、安心して販売できる形へ。</p></article>
                        <article><div className={styles.iconCircle}><Clock3 size={24} /></div><span>03</span><h3>相談から納品まで一本化</h3><p>仕様・数量・納期を同じ担当者に相談。やりとりの負担を減らします。</p></article>
                    </div>
                </section>

                {contentSections.length > 0 && <section className={styles.managedSections} aria-label="ご提案内容">{contentSections.map(section => <RichSection key={section.id} section={section} />)}</section>}

                <section className={styles.productsSection} id="products" aria-labelledby="products-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>PRODUCT EXAMPLES</p><h2 id="products-title">商品化のイメージ</h2><p>素材や用途に合わせて、オリジナル商品を設計します。</p></div>
                    <div className={styles.productGrid}>{products.filter(product => product.is_visible).sort((a, b) => a.order_index - b.order_index).map(product => <article className={styles.productCard} key={product.id}>{isRenderableImage(product.image_url) ? <Image src={product.image_url as string} alt="" width={520} height={340} sizes="(max-width: 700px) 100vw, 33vw" /> : <div className={styles.productPlaceholder}><PackageCheck size={28} aria-hidden="true" /></div>}<div><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<span>基本単価 {product.base_price.toLocaleString()}{product.base_price_type === 'percentage' ? '%' : '円 / 個'}〜</span></div></article>)}</div>
                </section>

                <section className={styles.flowSection} id="flow" aria-labelledby="flow-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>HOW IT WORKS</p><h2 id="flow-title">ご相談から納品まで</h2></div>
                    <ol className={styles.flowList}>{['ご相談・ヒアリング', '商品仕様と数量を整理', '概算見積もり・ご提案', '試作・最終確認', '製造・納品'].map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{step}</h3><p>{['フォームから気軽にご希望をお聞かせください。', '味・容量・パッケージなどを一緒に整理します。', '条件に合わせた現実的なプランをご案内します。', '納得いくまで仕上がりを確認します。', '完成した商品を、指定場所へお届けします。'][index]}</p></div></li>)}</ol>
                </section>

                <section className={styles.offerSection} aria-labelledby="offer-title">
                    <div className={styles.offerCopy}>
                        <p className={styles.eyebrow}>先着10社限定キャンペーン</p>
                        <h2 id="offer-title">商品化に必要な初期費用を、今なら0円に。</h2>
                        <p>構想段階から動き出せるよう、商品設計の最初の負担を軽くしました。</p>
                        <ul>
                            <li><Check size={16} aria-hidden="true" />レシピ開発費（2回修正まで）</li>
                            <li><Check size={16} aria-hidden="true" />原材料表示・栄養成分表示の作成</li>
                            <li><Check size={16} aria-hidden="true" />簡易パッケージデザイン</li>
                        </ul>
                        <small>※キャンペーンには適用条件があります。詳細はお見積もり後にご案内します。</small>
                    </div>
                    <Link className={styles.lightCta} href="#bto-form">無料で概算を見る <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                <section className={styles.faqSection} aria-labelledby="faq-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>FAQ</p><h2 id="faq-title">相談前の不安に、お答えします。</h2></div>
                    <div className={styles.faqList}>
                        {standardFaqs.map(({ question, answer }) => (
                            <section className={styles.faqItem} key={question}>
                                <details>
                                    <summary><span className={styles.faqMark}>Q</span>{question}<ChevronDown size={19} aria-hidden="true" /></summary>
                                    <p>{answer}</p>
                                </details>
                            </section>
                        ))}
                        {faqSections.map(section => <RichSection key={section.id} section={section} />)}
                    </div>
                </section>

                <section className={styles.formSection} id="bto-form" aria-labelledby="form-title"><div className={styles.formHeading}><p className={styles.eyebrow}>3分で条件整理</p><h2 id="form-title">無料で概算見積もり</h2><p>選択式で条件を整理できます。回答後、その場で概算金額をご確認いただけます。</p></div><div className={styles.formShell}><InteractiveForm steps={formSteps} products={products} pageId={pageId} showFloatingCta={false} /></div></section>

                <section className={styles.storeSection} aria-labelledby="store-title">
                    <div className={styles.storeVisual}><Image src="/images/btob/brandkan.jpg" alt="会津ブランド館 店舗外観" fill sizes="(max-width: 700px) 100vw, 48vw" /></div>
                    <div className={styles.storeCopy}>
                        <p className={styles.eyebrow}>運営者情報</p>
                        <h2 id="store-title">顔の見える食品開発チームです。</h2>
                        <p>OEMは、福島県会津若松市の「会津ブランド館」が実施しています。地域の商品を実際に販売してきた視点で、売り場まで見据えた商品づくりをお手伝いします。</p>
                        <dl>
                            <div><dt><MapPin size={17} aria-hidden="true" />所在地</dt><dd>福島県会津若松市七日町6−15</dd></div>
                            <div><dt><Phone size={17} aria-hidden="true" />電話</dt><dd><a href="tel:0242254141">0242-25-4141</a></dd></div>
                            <div><dt><Clock3 size={17} aria-hidden="true" />営業時間</dt><dd>11:00〜16:00</dd></div>
                        </dl>
                        <Link className={styles.storeLink} href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9" target="_blank" rel="noreferrer">Google Mapsで確認する <ArrowRight size={16} aria-hidden="true" /></Link>
                    </div>
                </section>
            </main>

            <footer className={styles.footer}><div className={styles.footerInner}><div><Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={80} height={80} /><p>地域の素材と、つくり手の想いを<br />次の商品へ。</p></div><div className={styles.footerLinks}><Link href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9" target="_blank" rel="noreferrer"><MapPin size={16} />会津ブランド館</Link><Link href="tel:0242254141"><Phone size={16} />0242-25-4141</Link><Link href="https://www.instagram.com/aizubrandhall/" target="_blank" rel="noreferrer"><Instagram size={16} />Instagram</Link></div></div><div className={styles.footerBottom}><span>© Aizu Brand Hall</span><span><Star size={13} />会津から、次の定番を。</span></div></footer>
        </div>
    )
}
