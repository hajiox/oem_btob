import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowRight,
    BadgeCheck,
    Check,
    ChevronDown,
    Clock3,
    ExternalLink,
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

const btobImages = {
    consultation: '/images/btob/ec-takada-ume-furikake.webp',
    regionalProducts: '/images/btob/ec-suumomo.webp',
    development: '/images/btob/ec-tomato-dressing.webp',
    offer: '/images/btob/ec-peach-zero-curry.webp',
} as const

const legacyHeroMarkers = ['1772951498736_1.jpg', '/images/lp-hero.jpg'] as const

const legacyImageReplacements = [
    { markers: ['1773114673701_', '/images/lp-problems.jpg'], replacement: btobImages.consultation },
    { markers: ['1773120587054_', '/images/lp-reasons.jpg'], replacement: btobImages.regionalProducts },
    { markers: ['1773115309124_', '/images/lp-cases.jpg'], replacement: btobImages.development },
    { markers: ['/images/lp-cta.jpg'], replacement: btobImages.offer },
] as const

const defaultEcHeroImage = '/images/btob/oem-hero-real-products-v3.webp'

const actualProductExamples = [
    {
        title: 'ふりかけ・ご飯のお供',
        materials: '高田梅、会津産雪下にんじん、国産春鮎',
        formats: '地域素材の香りと食感を活かした常温商品、ご当地ギフトへ。',
        image: '/images/btob/ec-takada-ume-furikake.webp',
        alt: '会津たかだうめふりかけの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/141696577',
    },
    {
        title: 'レトルト・常温惣菜',
        materials: '福島の桃、会津産トマト、牛バラ・豚角煮',
        formats: 'カレーや炊き込みご飯の素、備蓄・アウトドア商品へ。',
        image: '/images/btob/ec-peach-zero-curry.webp',
        alt: '福島もものZEROカレーの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125350864',
    },
    {
        title: 'ドレッシング・ソース',
        materials: '南会津産トマト、会津地酒、じゅうねん',
        formats: '素材感のある調味料、ご当地ソース、業務用商品へ。',
        image: '/images/btob/ec-tomato-dressing.webp',
        alt: '南会津産トマトドレッシングの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125353567',
    },
    {
        title: '素材茶・果実商品',
        materials: '会津産りんご、福島の桃、湯川村産米、喜多方市産そば',
        formats: '乾燥素材のお茶、常温保存の濃密果実商品、ギフトへ。',
        image: '/images/btob/ec-aizu-apple-tea.webp',
        alt: '会津のりんご茶の実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125565759',
    },
    {
        title: '郷土料理の簡便商品',
        materials: 'こづゆ、いかにんじんなど会津・福島の郷土料理',
        formats: 'お湯で食べられるカップスープや、ふりかけなどの時短商品へ。',
        image: '/images/btob/ec-cup-kozuyu.webp',
        alt: 'カップこづゆの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125351142',
    },
    {
        title: '麺・スープ・セット',
        materials: '喜多方ラーメン、会津山塩、西会津味噌',
        formats: '麺とスープ、土産用の箱入りセット、食べ比べ商品へ。',
        image: '/images/btob/ec-aizu-three-ramen.webp',
        alt: '会津三大ラーメンの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125352708',
    },
] as const

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

const usesEcProductShowcase = (url: string | null | undefined) => !url || legacyHeroMarkers.some(marker => url.includes(marker))

function resolveBtobImage(url: string | null | undefined, fallback?: string) {
    if (!url) return fallback

    // Replace only the known text-heavy legacy artwork. A new image saved from
    // the LP editor keeps taking precedence without changing its data contract.
    const legacyImage = legacyImageReplacements.find(({ markers }) => markers.some(marker => url.includes(marker)))
    return legacyImage?.replacement || url
}

function SectionImage({ url, alt }: { url: string | null | undefined; alt: string }) {
    const resolvedUrl = resolveBtobImage(url)
    if (!isRenderableImage(resolvedUrl)) return null
    const isEcProduct = resolvedUrl?.startsWith('/images/btob/ec-')
    return <Image className={`${styles.sectionImage} ${isEcProduct ? styles.sectionProductImage : ''}`} src={resolvedUrl as string} alt={alt} width={900} height={600} sizes="(max-width: 700px) 100vw, 50vw" />
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
    const showEcProductHero = usesEcProductShowcase(hero?.image_url)
    const heroImage = resolveBtobImage(hero?.image_url)

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
                            {showEcProductHero ? (
                                <div className={`${styles.heroCard} ${styles.heroGeneratedCard}`}>
                                    <Image
                                        src={defaultEcHeroImage}
                                        alt="会津ブランド館の実商品を、福島の素材とともに並べた商品開発イメージ"
                                        fill
                                        priority
                                        sizes="(max-width: 700px) 100vw, 43vw"
                                    />
                                </div>
                            ) : (
                                <div className={styles.heroCard}>
                                    <Image
                                        src={isRenderableImage(heroImage) ? heroImage! : defaultEcHeroImage}
                                        alt={hero?.title || '福島の食材を使った食品OEM'}
                                        fill
                                        priority
                                        sizes="(max-width: 700px) 90vw, 43vw"
                                    />
                                </div>
                            )}
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

                <section className={styles.actualExamplesSection} aria-labelledby="actual-examples-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>REAL PRODUCT RECORD</p>
                        <h2 id="actual-examples-title">素材を、ここまで商品にしてきました。</h2>
                        <p>会津ブランド館ECで実際に販売している商品化事例です。果実・野菜・穀物・郷土料理を、売り方に合わせた形へ変えています。</p>
                    </div>
                    <div className={styles.actualExampleGrid}>
                        {actualProductExamples.map(example => (
                            <article className={styles.actualExampleCard} key={example.href}>
                                <div className={styles.actualExampleImage}><Image src={example.image} alt={example.alt} fill sizes="(max-width: 700px) 100vw, 33vw" /></div>
                                <div className={styles.actualExampleCopy}>
                                    <span className={styles.materialLabel}>素材</span>
                                    <p>{example.materials}</p>
                                    <h3>{example.title}</h3>
                                    <p>{example.formats}</p>
                                    <Link className={styles.actualExampleLink} href={example.href} target="_blank" rel="noreferrer">ECで実商品を見る <ExternalLink size={15} aria-hidden="true" /></Link>
                                </div>
                            </article>
                        ))}
                    </div>
                    <p className={styles.actualExamplesNote}><BadgeCheck size={18} aria-hidden="true" />上記は自社の商品開発実績です。御社の原料の状態・希望ロット・販売方法に合わせ、実際に製造可能な商品を個別にご提案します。</p>
                </section>

                <section className={styles.productsSection} id="products" aria-labelledby="products-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>ESTIMATE PRODUCTS</p><h2 id="products-title">まずは対応商品から、概算できます。</h2><p>以下の商品は、このページ上で数量・原料供給・包装仕様を選んで概算を確認できます。</p></div>
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
