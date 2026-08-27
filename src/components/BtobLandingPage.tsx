import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowRight,
    BadgeCheck,
    Boxes,
    Calculator,
    Check,
    ChevronDown,
    ClipboardList,
    Clock3,
    ExternalLink,
    FileCheck2,
    FlaskConical,
    Instagram,
    MapPin,
    MessageCircle,
    PackageCheck,
    Phone,
    ShoppingBag,
    Sparkles,
    Star,
    Tags,
    Truck,
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
    title: '売り場から逆算する、\n食品OEM。',
    description: '自社で商品を企画し、EC・実店舗で販売してきたチームが、素材・レシピ・価格・表示・包材・製造をひとつの商品として設計します。400個から、売って確かめられる第一歩を。',
}

const defaultEcHeroImage = '/images/btob/oem-hero-real-products-v3.webp'
const legacyHeroMarkers = ['1772951498736_1.jpg', '/images/lp-hero.jpg'] as const
const legacyManagedMarkers = [
    '1773114673701_',
    '/images/lp-problems.jpg',
    '1773120587054_',
    '/images/lp-reasons.jpg',
    '1773115309124_',
    '/images/lp-cases.jpg',
    '/images/lp-cta.jpg',
] as const

const provenResults = [
    { value: '10商品以上', label: '楽天・Yahoo!ランキング1位獲得商品' },
    { value: '50社以上', label: 'OEM取引実績' },
    { value: '400個〜', label: '対応商品の小ロット製造' },
] as const

const differencePillars = [
    {
        title: '売り場を知っている',
        description: '自社ECと実店舗で販売しているから、客層・価格・容量・見せ方を商品仕様に落とし込めます。',
        icon: ShoppingBag,
    },
    {
        title: '小さく始められる',
        description: '対応商品は400個から。初回在庫を抑え、反応を見ながら育てる前提で設計します。',
        icon: Boxes,
    },
    {
        title: '包材まで同時に考える',
        description: '商品ロットと包材ロットを切り離さず、余剰資材が負担になりにくい仕様を選びます。',
        icon: Tags,
    },
    {
        title: '窓口を一本にする',
        description: 'レシピ、表示、デザイン、製造条件を同じ担当者が整理し、判断の行き違いを減らします。',
        icon: ClipboardList,
    },
] as const

const actualProductExamples = [
    {
        transformation: '会津美里町の高田梅 → 常温1年のご飯のお供',
        title: '会津たかだうめふりかけ',
        description: '大粒で果肉の厚い地域素材を、毎日の食卓で使いやすいふりかけへ。',
        image: '/images/btob/ec-takada-ume-furikake.webp',
        alt: '会津たかだうめふりかけの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/141696577',
    },
    {
        transformation: '福島の桃 → 常温流通できるレトルト食品',
        title: '福島もものZEROカレー',
        description: '果実の個性を意外性のある食べ方に変え、土産・ギフトにもなる商品へ。',
        image: '/images/btob/ec-peach-zero-curry.webp',
        alt: '福島もものZEROカレーの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125350864',
    },
    {
        transformation: '南会津産トマト＋会津の地酒 → 10年以上続く定番',
        title: '南会津産トマトドレッシング',
        description: '地域素材の味を前面に出し、家庭用からホテル・旅館まで届く調味料へ。',
        image: '/images/btob/ec-tomato-dressing.webp',
        alt: '南会津産トマトドレッシングの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125353567',
    },
    {
        transformation: '会津の郷土料理 → お湯だけで食べられる簡便商品',
        title: 'カップこづゆ',
        description: '地域の食文化を、旅行者や若い世代にも手に取りやすい一食分の商品へ。',
        image: '/images/btob/ec-cup-kozuyu.webp',
        alt: 'カップこづゆの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125351142',
    },
] as const

const entryRoutes = [
    {
        label: '原料がある',
        title: 'その素材に向く商品を考える',
        description: '原料名、状態、供給量を確認し、素材の個性と販売先に合う加工方法を整理します。',
        steps: ['原料の状態を確認', '加工方法を選定', '商品仕様を提案'],
        icon: PackageCheck,
    },
    {
        label: '原料がない',
        title: '作りたい商品から概算する',
        description: '対応商品、数量、包装仕様を選び、現在の条件での概算金額をその場で確認できます。',
        steps: ['商品を選ぶ', '数量・包材を選ぶ', '概算を確認'],
        icon: Calculator,
    },
] as const

const targetUseCases = [
    {
        audience: '農家・生産者',
        source: '余剰・規格外・旬の短い農産物',
        destination: '常温商品や加工品に変え、廃棄を減らしながら付加価値をつくる。',
    },
    {
        audience: '自治体・地域団体',
        source: '地域資源や、ふるさと納税の新しい題材',
        destination: '地域の物語が伝わる返礼品・ギフトとして設計する。',
    },
    {
        audience: '道の駅・ホテル・小売店',
        source: 'その場所でしか買えない商品がない',
        destination: '売り場と客層に合わせたオリジナル商品・自社ブランドへ。',
    },
] as const

const flowSteps = [
    { title: '条件整理', description: '原料の有無、商品、数量、売り場を確認します。', icon: MessageCircle },
    { title: '商品設計', description: '味・容量・価格・保存性・包材を一つにまとめます。', icon: ClipboardList },
    { title: '概算・提案', description: '現実的な仕様と費用、進め方をご案内します。', icon: Calculator },
    { title: '試作・確認', description: '味と仕上がりを確認し、量産仕様を決定します。', icon: FlaskConical },
    { title: '製造・納品', description: '表示と品質を確認し、指定場所へお届けします。', icon: Truck },
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
] as const

const isRenderableImage = (url: string | null | undefined) => Boolean(url && (url.startsWith('/') || url.includes('public.blob.vercel-storage.com')))
const usesDefaultHero = (url: string | null | undefined) => !url || legacyHeroMarkers.some(marker => url.includes(marker))
const isLegacyManagedSection = (section: LpSection) => Boolean(section.image_url && legacyManagedMarkers.some(marker => section.image_url?.includes(marker)))

function SectionImage({ url, alt }: { url: string | null | undefined; alt: string }) {
    if (!isRenderableImage(url)) return null
    return <Image className={styles.supplementalImage} src={url as string} alt={alt} width={900} height={600} sizes="(max-width: 760px) 100vw, 48vw" />
}

function RichSection({ section }: { section: LpSection }) {
    const title = section.title || '会津の恵みを、あなたの商品へ。'
    const description = section.description || '素材の魅力を引き出し、販売したい人に届く商品へ。'

    if (section.section_type === 'faq' || title.includes('注意事項')) {
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
        <section className={styles.supplementalCard} aria-labelledby={`lp-section-${section.id}`}>
            <div>
                <span className={styles.sectionKicker}>{section.section_type.toUpperCase()}</span>
                <h2 id={`lp-section-${section.id}`}>{title}</h2>
                <p>{description}</p>
                {section.section_type === 'cta' && <Link className={styles.secondaryCta} href="#bto-form">商品化を相談する <ArrowRight size={17} aria-hidden="true" /></Link>}
            </div>
            <SectionImage url={section.image_url} alt={title} />
        </section>
    )
}

export default function BtobLandingPage({ sections, formSteps, products, pageId }: Props) {
    const visibleSections = sections.filter(section => section.is_visible).sort((a, b) => a.order_index - b.order_index)
    const explicitHero = visibleSections.find(section => section.section_type === 'hero')
    const hero = explicitHero || visibleSections[0]
    const showDefaultHero = usesDefaultHero(hero?.image_url)
    const heroTitle = showDefaultHero ? fallbackHero.title : (hero?.title || fallbackHero.title)
    const heroDescription = showDefaultHero ? fallbackHero.description : (hero?.description || fallbackHero.description)
    const faqSections = visibleSections.filter(section => section.section_type === 'faq' || section.title?.includes('注意事項'))
    const supplementalSections = visibleSections.filter(section => (
        section.id !== hero?.id
        && section.section_type !== 'faq'
        && !section.title?.includes('注意事項')
        && !isLegacyManagedSection(section)
    ))
    const visibleProducts = products.filter(product => product.is_visible).sort((a, b) => a.order_index - b.order_index)

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Link href="#top" className={styles.brand} aria-label="会津ブランド館 OEMトップへ">
                    <Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={64} height={64} />
                </Link>
                <nav className={styles.nav} aria-label="ページ内ナビゲーション">
                    <Link href="#difference">私たちの違い</Link>
                    <Link href="#cases">商品化実績</Link>
                    <Link href="#start">始め方</Link>
                    <Link href="#products">概算商品</Link>
                    <Link href="#flow">ご利用の流れ</Link>
                </nav>
                <Link className={styles.headerCta} href="#bto-form">商品化を相談する <ArrowRight size={16} aria-hidden="true" /></Link>
            </header>

            <main id="top">
                <section className={styles.hero} aria-labelledby="hero-title">
                    <div className={styles.heroAccent} aria-hidden="true" />
                    <div className={styles.heroInner}>
                        <div className={styles.heroCopy}>
                            <p className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> 売り手がつくる、食品OEM</p>
                            <h1 id="hero-title">{heroTitle}</h1>
                            <p className={styles.heroDescription}>{heroDescription}</p>
                            <div className={styles.heroActions}>
                                <Link className={styles.primaryCta} href="#bto-form">商品化の条件を整理する <ArrowRight size={19} aria-hidden="true" /></Link>
                                <Link className={styles.textCta} href="#cases">実商品を見る <ArrowRight size={16} aria-hidden="true" /></Link>
                            </div>
                            <div className={styles.heroTrust} aria-label="会津ブランド館の特徴">
                                <span><Check size={15} aria-hidden="true" />自社EC・実店舗で販売</span>
                                <span><Check size={15} aria-hidden="true" />相談・概算見積もり無料</span>
                            </div>
                        </div>
                        <div className={styles.heroVisual}>
                            <div className={styles.heroCard}>
                                <Image
                                    src={showDefaultHero ? defaultEcHeroImage : (isRenderableImage(hero?.image_url) ? hero!.image_url! : defaultEcHeroImage)}
                                    alt="会津ブランド館が企画・販売する実商品"
                                    fill
                                    priority
                                    sizes="(max-width: 760px) 100vw, 46vw"
                                />
                            </div>
                            <div className={styles.heroBadge}><BadgeCheck size={19} aria-hidden="true" /><span>掲載商品は<br /><strong>自社の開発・販売実績</strong></span></div>
                        </div>
                    </div>
                    <div className={styles.proofStrip} aria-label="商品開発実績">
                        {provenResults.map(result => <div key={result.value}><strong>{result.value}</strong><span>{result.label}</span></div>)}
                    </div>
                </section>

                <section className={styles.differenceSection} id="difference" aria-labelledby="difference-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>WHY AIZU BRAND HALL</p><h2 id="difference-title">「作れる商品」ではなく、<br />「売り切れる設計」を考える。</h2></div>
                        <p>製造条件だけで商品を決めると、味はできても、価格・容量・包材・売り場が噛み合いません。会津ブランド館は、販売する側の判断から商品仕様を組み立てます。</p>
                    </div>
                    <div className={styles.comparisonGrid}>
                        <article className={styles.comparisonMuted}>
                            <span>一般的な製造受託</span>
                            <h3>決まった仕様を、工場で形にする</h3>
                            <p>商品・数量・包材が固まった後の製造が中心。</p>
                        </article>
                        <div className={styles.comparisonArrow} aria-hidden="true"><ArrowRight size={22} /></div>
                        <article className={styles.comparisonPrimary}>
                            <span>会津ブランド館</span>
                            <h3>売る相手と場所から、仕様そのものを決める</h3>
                            <p>素材やアイデアの段階から、商品として成立する条件を整理。</p>
                        </article>
                    </div>
                    <div className={styles.pillarGrid}>
                        {differencePillars.map(({ title, description, icon: Icon }) => (
                            <article key={title}><div><Icon size={23} aria-hidden="true" /></div><h3>{title}</h3><p>{description}</p></article>
                        ))}
                    </div>
                </section>

                <section className={styles.casesSection} id="cases" aria-labelledby="cases-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>PROOF, NOT PROMISES</p>
                        <h2 id="cases-title">素材を商品に変え、<br />自分たちで売ってきました。</h2>
                        <p>イメージ写真ではなく、会津ブランド館ECで現在も販売している実商品です。</p>
                    </div>
                    <div className={styles.caseGrid}>
                        {actualProductExamples.map(example => (
                            <article className={styles.caseCard} key={example.href}>
                                <div className={styles.caseImage}><Image src={example.image} alt={example.alt} fill sizes="(max-width: 760px) 100vw, 25vw" /></div>
                                <div className={styles.caseCopy}>
                                    <span>{example.transformation}</span>
                                    <h3>{example.title}</h3>
                                    <p>{example.description}</p>
                                    <Link href={example.href} target="_blank" rel="noreferrer">ECで実商品を見る <ExternalLink size={14} aria-hidden="true" /></Link>
                                </div>
                            </article>
                        ))}
                    </div>
                    <p className={styles.note}><BadgeCheck size={18} aria-hidden="true" />商品ジャンルを並べるためではなく、素材・保存性・売り場に応じて、異なる形へ設計してきた事例です。</p>
                </section>

                <section className={styles.startSection} id="start" aria-labelledby="start-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>TWO WAYS TO START</p>
                        <h2 id="start-title">スタート地点は、2つだけです。</h2>
                        <p>原料を持っていても、作りたい商品だけが決まっていても進められます。</p>
                    </div>
                    <div className={styles.routeGrid}>
                        {entryRoutes.map(({ label, title, description, steps, icon: Icon }) => (
                            <article className={styles.routeCard} key={label}>
                                <div className={styles.routeTop}><div><Icon size={25} aria-hidden="true" /></div><span>{label}</span></div>
                                <h3>{title}</h3>
                                <p>{description}</p>
                                <ol>{steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}{index < steps.length - 1 && <ArrowRight size={15} aria-hidden="true" />}</li>)}</ol>
                                <Link href="#bto-form">この条件で相談する <ArrowRight size={17} aria-hidden="true" /></Link>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.designSection} aria-labelledby="design-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>ONE PRODUCT BLUEPRINT</p><h2 id="design-title">全部を、ひとつの設計図で決める。</h2></div>
                        <p>味、価格、保存性、包材、製造を別々に決めるのではありません。売り場を中心に、互いの条件が矛盾しない一つの商品として設計します。</p>
                    </div>
                    <div className={styles.designMap} aria-label="売り場から逆算する商品設計">
                        <div className={styles.designEndpoint}><Sparkles size={24} aria-hidden="true" /><span>素材・アイデア</span></div>
                        <ArrowRight className={styles.designArrow} size={25} aria-hidden="true" />
                        <div className={styles.designCore}><ShoppingBag size={29} aria-hidden="true" /><strong>売り場</strong><span>客層・価格・販売場所</span></div>
                        <ArrowRight className={styles.designArrow} size={25} aria-hidden="true" />
                        <div className={styles.designEndpoint}><PackageCheck size={24} aria-hidden="true" /><span>売れる商品仕様</span></div>
                    </div>
                    <div className={styles.designFactors}>
                        <div><FlaskConical size={20} aria-hidden="true" /><strong>味・容量</strong><span>誰が、いつ食べるか</span></div>
                        <div><Calculator size={20} aria-hidden="true" /><strong>価格・ロット</strong><span>利益と在庫のバランス</span></div>
                        <div><Truck size={20} aria-hidden="true" /><strong>保存・物流</strong><span>売り方に合う賞味期限</span></div>
                        <div><Tags size={20} aria-hidden="true" /><strong>表示・包材</strong><span>伝わり方と資材在庫</span></div>
                    </div>
                    <div className={styles.packagingCallout}>
                        <div>
                            <p className={styles.eyebrow}>PACKAGE REALITY</p>
                            <h3>商品より包材が余る設計は、最初から避ける。</h3>
                            <p>白無地箱＋巻紙、ラベル、バルク納品などを使い分け、商品ロットと包材ロットを同時に確認します。</p>
                        </div>
                        <ul>
                            <li><FileCheck2 size={18} aria-hidden="true" />原材料・栄養成分表示</li>
                            <li><Tags size={18} aria-hidden="true" />簡易パッケージデザイン</li>
                            <li><Boxes size={18} aria-hidden="true" />販売量に合う包装仕様</li>
                        </ul>
                    </div>
                </section>

                <section className={styles.useCaseSection} aria-labelledby="use-case-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>WHO WE SUPPORT</p>
                        <h2 id="use-case-title">素材の事情ではなく、<br />売る目的から商品にします。</h2>
                    </div>
                    <div className={styles.useCaseGrid}>
                        {targetUseCases.map((useCase, index) => (
                            <article className={styles.useCaseCard} key={useCase.audience}>
                                <span>0{index + 1}</span>
                                <h3>{useCase.audience}</h3>
                                <p>{useCase.source}</p>
                                <div aria-hidden="true"><ArrowRight size={18} /></div>
                                <strong>{useCase.destination}</strong>
                            </article>
                        ))}
                    </div>
                    <p className={styles.note}>※販売代行ではなく、想定する売り場に適した商品仕様・包装方法を一緒に整理します。</p>
                </section>

                <section className={styles.productsSection} id="products" aria-labelledby="products-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>QUICK ESTIMATE</p><h2 id="products-title">条件が決まっている方は、<br />ここで概算まで。</h2></div>
                        <p>対応商品を選び、数量・原料供給・包装仕様に答えると、その場で概算を確認できます。原料持ち込みなど個別条件は回答内容をもとにご案内します。</p>
                    </div>
                    <div className={styles.productGrid}>
                        {visibleProducts.map(product => (
                            <article className={styles.productCard} key={product.id}>
                                {isRenderableImage(product.image_url)
                                    ? <Image src={product.image_url as string} alt="" width={520} height={340} sizes="(max-width: 760px) 100vw, 33vw" />
                                    : <div className={styles.productPlaceholder}><PackageCheck size={28} aria-hidden="true" /></div>}
                                <div><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<span>基本単価 {product.base_price.toLocaleString()}{product.base_price_type === 'percentage' ? '%' : '円 / 個'}〜</span></div>
                            </article>
                        ))}
                    </div>
                    <Link className={styles.primaryCta} href="#bto-form">概算条件を入力する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                {supplementalSections.length > 0 && (
                    <section className={styles.supplementalSections} aria-label="追加のご案内">
                        {supplementalSections.map(section => <RichSection key={section.id} section={section} />)}
                    </section>
                )}

                <section className={styles.flowSection} id="flow" aria-labelledby="flow-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>HOW IT WORKS</p><h2 id="flow-title">ご相談から納品まで</h2><p>最初に売り方と条件を揃え、その後に試作・製造へ進みます。</p></div>
                    <ol className={styles.flowList}>
                        {flowSteps.map(({ title, description, icon: Icon }, index) => (
                            <li key={title}>
                                <span className={styles.flowMarker}><Icon size={20} aria-hidden="true" /><small>{String(index + 1).padStart(2, '0')}</small></span>
                                <div><h3>{title}</h3><p>{description}</p></div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className={styles.offerSection} aria-labelledby="offer-title">
                    <div className={styles.offerCopy}>
                        <p className={styles.eyebrow}>先着10社限定キャンペーン</p>
                        <h2 id="offer-title">商品化の最初の負担を、今なら0円に。</h2>
                        <p>構想を具体的な商品仕様に変える、初期設計の3項目が対象です。</p>
                        <ul>
                            <li><Check size={17} aria-hidden="true" />レシピ開発費（2回修正まで）</li>
                            <li><Check size={17} aria-hidden="true" />原材料表示・栄養成分表示の作成</li>
                            <li><Check size={17} aria-hidden="true" />簡易パッケージデザイン</li>
                        </ul>
                        <small>※キャンペーンには適用条件があります。詳細はお見積もり後にご案内します。</small>
                    </div>
                    <Link className={styles.lightCta} href="#bto-form">対象条件を確認する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                <section className={styles.faqSection} aria-labelledby="faq-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>FAQ</p><h2 id="faq-title">相談前の不安に、お答えします。</h2></div>
                    <div className={styles.faqList}>
                        {standardFaqs.map(({ question, answer }) => (
                            <section className={styles.faqItem} key={question}>
                                <details><summary><span className={styles.faqMark}>Q</span>{question}<ChevronDown size={19} aria-hidden="true" /></summary><p>{answer}</p></details>
                            </section>
                        ))}
                        {faqSections.map(section => <RichSection key={section.id} section={section} />)}
                    </div>
                </section>

                <section className={styles.formSection} id="bto-form" aria-labelledby="form-title">
                    <div className={styles.formHeading}><p className={styles.eyebrow}>3分で条件整理</p><h2 id="form-title">まず、作れる条件と概算を確認する。</h2><p>原料がある方も、ない方も、選択式で必要な条件を順番に整理できます。</p></div>
                    <div className={styles.formShell}><InteractiveForm steps={formSteps} products={products} pageId={pageId} showFloatingCta={false} /></div>
                </section>

                <section className={styles.storeSection} aria-labelledby="store-title">
                    <div className={styles.storeVisual}><Image src="/images/btob/brandkan.jpg" alt="会津ブランド館 店舗外観" fill sizes="(max-width: 760px) 100vw, 48vw" /></div>
                    <div className={styles.storeCopy}>
                        <p className={styles.eyebrow}>WHO WE ARE</p>
                        <h2 id="store-title">売り場を持つ、食品開発チームです。</h2>
                        <p>OEMは、福島県会津若松市の「会津ブランド館」が実施しています。自分たちの商品を実際に販売し、お客様の反応を見てきた経験を、御社の商品設計に活かします。</p>
                        <dl>
                            <div><dt><MapPin size={17} aria-hidden="true" />所在地</dt><dd>福島県会津若松市七日町6−15</dd></div>
                            <div><dt><Phone size={17} aria-hidden="true" />電話</dt><dd><a href="tel:0242254141">0242-25-4141</a></dd></div>
                            <div><dt><Clock3 size={17} aria-hidden="true" />営業時間</dt><dd>11:00〜16:00</dd></div>
                        </dl>
                        <Link className={styles.storeLink} href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9" target="_blank" rel="noreferrer">Google Mapsで確認する <ArrowRight size={16} aria-hidden="true" /></Link>
                    </div>
                </section>
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div><Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={80} height={80} /><p>地域の素材と、つくり手の想いを<br />売り場で選ばれる商品へ。</p></div>
                    <div className={styles.footerLinks}>
                        <Link href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9" target="_blank" rel="noreferrer"><MapPin size={16} />会津ブランド館</Link>
                        <Link href="tel:0242254141"><Phone size={16} />0242-25-4141</Link>
                        <Link href="https://www.instagram.com/aizubrandhall/" target="_blank" rel="noreferrer"><Instagram size={16} />Instagram</Link>
                    </div>
                </div>
                <div className={styles.footerBottom}><span>© Aizu Brand Hall</span><span><Star size={13} />会津から、次の定番を。</span></div>
            </footer>
        </div>
    )
}
