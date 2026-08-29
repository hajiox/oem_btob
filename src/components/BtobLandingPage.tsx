import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowDown,
    ArrowRight,
    BadgeCheck,
    Ban,
    Boxes,
    Calculator,
    Check,
    ChevronDown,
    CircleDollarSign,
    ClipboardList,
    Clock3,
    ExternalLink,
    Factory,
    FileCheck2,
    FlaskConical,
    Gift,
    Handshake,
    Instagram,
    Lightbulb,
    MapPin,
    MessageCircle,
    PackageCheck,
    Phone,
    ShoppingBag,
    Sparkles,
    Sprout,
    Store,
    Tags,
    Tractor,
    Truck,
    UserRound,
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
    title: '福島の素材を、\n売り先を見据えた\n商品に。',
    description: '農家の素材は、道の駅やふるさと納税での販売を想定した商品へ。道の駅・観光施設・土産店には、その売り場に合うオリジナル商品を。400個から一緒につくります。',
}

const defaultHeroStorePhoto = '/images/btob/store-floor-hero-4911.webp'
const defaultRouteArtwork = '/images/btob/oem-hybrid-hero-illustration-v1.webp'
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
    { value: '400個〜', label: '対応商品の小ロット製造' },
    { value: '50社以上', label: 'OEM取引実績' },
    { value: '10商品以上', label: '楽天・Yahoo!ランキング1位獲得' },
] as const

const consultationRoutes = [
    {
        marker: '01',
        label: '原料から相談',
        title: '素材を、売れる形に変える。',
        audience: '福島の農家・生産者・地域事業者',
        lead: '桃、梅、トマト、米など。素材の個性と供給量から、無理なく続けられる商品を考えます。',
        steps: ['原料の種類・状態・供給量', '道の駅・ふるさと納税など想定先', '商品形態・保存方法・包材'],
        result: '地域の売り場へ持ち込める商品仕様',
        icon: Tractor,
    },
    {
        marker: '02',
        label: '売り場から相談',
        title: '売り場に、足りない商品をつくる。',
        audience: '道の駅・観光施設・土産店',
        lead: '客層、店頭価格、陳列場所から逆算し、その施設らしく手に取られる限定商品を考えます。',
        steps: ['来店客・店頭価格・陳列場所', '欲しい商品・数量・季節性', '常温性・持ち帰りやすさ・包材'],
        result: '自店・自施設で育てられる限定商品',
        icon: Store,
    },
] as const

const channelPlans = [
    {
        title: '道の駅',
        subtitle: '毎日の棚で、選ばれる',
        points: ['地元客にも届く価格', '常温・省スペース', '棚で素材が伝わる表示'],
        icon: Store,
    },
    {
        title: 'ふるさと納税',
        subtitle: '届いた瞬間まで、商品設計',
        points: ['配送に耐える包材', '賞味期限・セット構成', '地域性が伝わる見た目'],
        icon: Gift,
    },
    {
        title: '観光施設・土産店',
        subtitle: '旅の記憶を、持ち帰れる',
        points: ['福島らしい物語', '持ち運びやすいサイズ', '施設限定の理由づくり'],
        icon: ShoppingBag,
    },
] as const

const salesFloorPhotos = [
    {
        image: '/images/btob/store-floor-curry-4913.webp',
        alt: '会津ブランド館の売り場に並ぶカレーやこづゆなどの地域商品',
        label: '商品が棚に立つ',
        title: 'レトルト・郷土食',
    },
    {
        image: '/images/btob/store-floor-packaging-4912.webp',
        alt: '会津ブランド館の売り場に並ぶ袋物や茶の商品',
        label: '形が変われば、見え方も変わる',
        title: '袋物・茶・ギフト',
    },
    {
        image: '/images/btob/store-floor-series-4915.webp',
        alt: '会津ブランド館の売り場に並ぶ瓶商品のシリーズ',
        label: '味違いで、棚をつくる',
        title: '瓶・シリーズ展開',
    },
] as const

const actualProductExamples = [
    {
        source: '会津美里町の高田梅',
        decision: '常温で使えるご飯のお供へ',
        outlet: '道の駅・土産・自社EC',
        title: '会津たかだうめふりかけ',
        image: '/images/btob/ec-takada-ume-furikake.webp',
        imageScale: 0.92,
        alt: '会津たかだうめふりかけの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/141696577',
    },
    {
        source: '福島の桃',
        decision: '意外性のある常温レトルトへ',
        outlet: '観光土産・ギフト',
        title: '福島もものZEROカレー',
        image: '/images/btob/ec-peach-zero-curry.webp',
        imageScale: 1.35,
        alt: '福島もものZEROカレーの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125350864',
    },
    {
        source: '南会津産トマト＋会津の地酒',
        decision: '長く売れる調味料へ',
        outlet: '自店・ホテル・旅館',
        title: '南会津産トマトドレッシング',
        image: '/images/btob/ec-tomato-dressing.webp',
        imageScale: 1.72,
        alt: '南会津産トマトドレッシングの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125353567',
    },
    {
        source: '会津の郷土料理',
        decision: '一食分・お湯だけの簡便商品へ',
        outlet: '観光売店・土産',
        title: 'カップこづゆ',
        image: '/images/btob/ec-cup-kozuyu.webp',
        imageScale: 1.3,
        alt: 'カップこづゆの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125351142',
    },
] as const

const productDesignSteps = [
    { label: '素材・客層', detail: '誰に、何を届けるか', icon: Sprout },
    { label: 'レシピ・試作', detail: '味と商品形態を決める', icon: FlaskConical },
    { label: '表示・包材', detail: '棚と配送に合わせる', icon: Tags },
    { label: '製造・納品', detail: '販売量に合わせてつくる', icon: Factory },
    { label: '売り方の助言', detail: '次回へ改善点をつなぐ', icon: Lightbulb },
] as const

const roleColumns = [
    {
        label: 'ご相談者',
        title: '持ってくるもの',
        items: ['原料情報・供給できる量', '想定する売り先・客層', '販売・商談・各種登録'],
        icon: UserRound,
    },
    {
        label: '一緒に決める',
        title: '商品としての条件',
        items: ['味・容量・店頭価格', '製造数・賞味期限', '包材・見せ方・納期'],
        icon: Handshake,
    },
    {
        label: '会津ブランド館',
        title: '商品化を支える',
        items: ['レシピ開発・試作', '食品表示・包材設計', '製造調整・概算見積もり'],
        icon: Factory,
    },
] as const

const flowSteps = [
    { title: '条件を聞く', output: '企画条件', description: '素材、想定売り先、客層、数量を確認します。', icon: MessageCircle },
    { title: '商品を組み立てる', output: '商品案', description: '味・容量・価格・保存性・包材を一つにします。', icon: ClipboardList },
    { title: '概算を確かめる', output: '概算', description: '数量と仕様を合わせ、続けられる条件を確認します。', icon: Calculator },
    { title: '試作・表示を決める', output: '量産仕様', description: '味、仕上がり、食品表示、包材を決定します。', icon: FlaskConical },
    { title: '製造・納品する', output: '販売準備', description: '想定販売先や自社売り場へ持ち込める形で納品します。', icon: Truck },
] as const

const standardFaqs = [
    {
        question: '原料がなくても相談できますか？',
        answer: 'はい。道の駅、観光施設、土産店など、販売する場所や客層が見えている場合は、売り場から商品を一緒に設計できます。',
    },
    {
        question: '販売先の紹介や、ふるさと納税の登録も依頼できますか？',
        answer: '道の駅への商談・紹介や、ふるさと納税の登録代行は行っていません。想定する売り先を伺い、その売り方に合う商品仕様・価格・包材について助言します。',
    },
    {
        question: '販売先がまだ決まっていなくても相談できますか？',
        answer: '相談は可能です。候補となる販売先や客層を整理し、商品化する前に決めておく条件をご案内します。商談や申請はご相談者自身で進めていただきます。',
    },
    {
        question: '最低ロットは何個ですか？',
        answer: '現在の自動見積もりは400個から800個を対象にしています。商品や仕様によって条件が異なるため、詳しくは見積もり後に個別にご案内します。',
    },
    {
        question: '原料の持ち込みはできますか？',
        answer: '原料供給の有無をフォームで指定できます。持ち込みたい原料がある場合は、原料名・状態・供給できる量を入力してご相談ください。',
    },
    {
        question: 'パッケージも一緒に相談できますか？',
        answer: 'はい。商品ロットと包材ロットを同時に確認し、ラベル、白無地箱＋巻紙、バルクなど、余剰資材が出にくい仕様をご案内します。',
    },
    {
        question: '見積もりを試すと、すぐに申込みになりますか？',
        answer: 'いいえ。まず概算金額を確認し、内容に納得した場合のみ仮申込みへ進みます。条件整理だけでもお試しいただけます。',
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
            <section className={styles.faqItem} aria-labelledby={'lp-section-' + section.id}>
                <details>
                    <summary id={'lp-section-' + section.id}><span className={styles.faqMark}>Q</span>{title}<ChevronDown size={19} aria-hidden="true" /></summary>
                    <p>{description}</p>
                </details>
            </section>
        )
    }

    return (
        <section className={styles.supplementalCard} aria-labelledby={'lp-section-' + section.id}>
            <div>
                <span className={styles.sectionKicker}>{section.section_type.toUpperCase()}</span>
                <h2 id={'lp-section-' + section.id}>{title}</h2>
                <p>{description}</p>
                {section.section_type === 'cta' && <Link className={styles.secondaryCta} href="#bto-form">相談条件を整理する <ArrowRight size={17} aria-hidden="true" /></Link>}
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
    const heroVisualImage = showDefaultHero ? defaultHeroStorePhoto : (isRenderableImage(hero?.image_url) ? hero!.image_url! : defaultHeroStorePhoto)
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
                    <Link href="#audience">二つの入口</Link>
                    <Link href="#design">販路別設計</Link>
                    <Link href="#cases">実商品</Link>
                    <Link href="#roles">役割分担</Link>
                    <Link href="#products">概算</Link>
                </nav>
                <Link className={styles.headerCta} href="#bto-form">相談条件を整理する <ArrowRight size={16} aria-hidden="true" /></Link>
            </header>

            <main id="top">
                <section className={styles.hero} aria-labelledby="hero-title">
                    <div className={styles.heroInner}>
                        <div className={styles.heroCopy}>
                            <p className={styles.eyebrow}><MapPin size={15} aria-hidden="true" /> 福島の農家・道の駅・観光施設のための食品OEM</p>
                            <h1 id="hero-title">{heroTitle}</h1>
                            <p className={styles.heroDescription}>{heroDescription}</p>
                            <div className={styles.heroActions}>
                                <Link className={styles.primaryCta} href="#audience">二つの相談方法を見る <ArrowRight size={19} aria-hidden="true" /></Link>
                                <Link className={styles.textCta} href="#cases">実商品を見る <ArrowRight size={16} aria-hidden="true" /></Link>
                            </div>
                            <div className={styles.heroTrust} aria-label="相談できる二つの入口">
                                <span><Sprout size={16} aria-hidden="true" />原料から相談</span>
                                <span><Store size={16} aria-hidden="true" />売り場から相談</span>
                                <span><PackageCheck size={16} aria-hidden="true" />400個から</span>
                            </div>
                        </div>

                        <div className={styles.heroVisual} aria-label={showDefaultHero ? '会津ブランド館の実際の売り場' : heroTitle}>
                            <Image className={styles.heroStorePhoto} src={heroVisualImage} alt={showDefaultHero ? '会津ブランド館の実際の売り場に並ぶ地域商品' : heroTitle} fill priority sizes="(max-width: 900px) calc(100vw - 30px), 58vw" />
                            {showDefaultHero && (
                                <div className={styles.heroPhotoCaption}>
                                    <span><BadgeCheck size={15} aria-hidden="true" />会津ブランド館の実際の売り場</span>
                                    <strong>商品をつくるだけでなく、<br />棚で選ばれる形まで。</strong>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className={styles.proofStrip} aria-label="商品開発実績">
                        {provenResults.map(result => <div key={result.value}><strong>{result.value}</strong><span>{result.label}</span></div>)}
                    </div>
                </section>

                <section className={styles.salesFloorSection} aria-labelledby="sales-floor-title">
                    <div className={styles.salesFloorIntro}>
                        <div>
                            <p className={styles.eyebrow}>REAL SALES FLOOR</p>
                            <h2 id="sales-floor-title">売る現場があるから、<br />棚から逆算できる。</h2>
                        </div>
                        <p>商品は、完成した瞬間ではなく、棚に並んで手に取られて初めて価値になります。価格、サイズ、包材、並べ方まで、実際の販売現場を基準に考えます。</p>
                    </div>
                    <div className={styles.salesFloorGallery}>
                        {salesFloorPhotos.map((photo, index) => (
                            <figure className={index === 0 ? styles.salesFloorPrimary : undefined} key={photo.image}>
                                <Image src={photo.image} alt={photo.alt} fill sizes={index === 0 ? '(max-width: 760px) 100vw, 58vw' : '(max-width: 760px) 50vw, 27vw'} />
                                <figcaption><span>{photo.label}</span><strong>{photo.title}</strong></figcaption>
                            </figure>
                        ))}
                    </div>
                    <p className={styles.salesFloorNote}><Store size={18} aria-hidden="true" />写真は会津ブランド館の実際の売り場です。商品化実績は、下の事例で個別にご紹介します。</p>
                </section>

                <section className={styles.routeSection} id="audience" aria-labelledby="audience-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>TWO WAYS TO START</p>
                        <h2 id="audience-title">入口は二つ。<br />原料からでも、売り場からでも。</h2>
                        <p>持っている強みが違えば、最初に聞くことも違います。二つの道筋を分けて整理します。</p>
                    </div>
                    <div className={styles.routeStoryVisual} aria-label="原料または売り場から商品化へ進む二つの入口">
                        <Image src={defaultRouteArtwork} alt="農家の原料と地域の売り場を会津ブランド館の商品化につなぐイラスト" fill sizes="(max-width: 760px) 100vw, 1080px" />
                        <div className={styles.routeStoryOrigin}><Sprout size={17} aria-hidden="true" /><span>原料から</span><strong>農家・生産者</strong></div>
                        <div className={styles.routeStoryCenter}><Sparkles size={20} aria-hidden="true" /><span>二つの入口を</span><strong>商品化へつなぐ</strong></div>
                        <div className={styles.routeStoryShop}><Store size={17} aria-hidden="true" /><span>売り場から</span><strong>道の駅・観光施設</strong></div>
                    </div>
                    <div className={styles.routeDiagram}>
                        <div className={styles.routeGrid}>
                            {consultationRoutes.map(({ marker, label, title, audience, lead, steps, result, icon: Icon }) => (
                                <article className={styles.routeCard} key={label}>
                                    <div className={styles.routeTop}><span>{marker}</span><div><Icon size={31} aria-hidden="true" /></div><p>{label}</p></div>
                                    <small>{audience}</small>
                                    <h3>{title}</h3>
                                    <p className={styles.routeLead}>{lead}</p>
                                    <ol>{steps.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
                                    <div className={styles.routeResult}><ArrowDown size={18} aria-hidden="true" /><span>目指す形</span><strong>{result}</strong></div>
                                </article>
                            ))}
                        </div>
                        <div className={styles.routeMerge}><span>それぞれの条件を整理</span><ArrowDown size={22} aria-hidden="true" /><strong><Sparkles size={21} aria-hidden="true" />会津ブランド館で商品化</strong></div>
                    </div>
                </section>

                <section className={styles.channelSection} id="design" aria-labelledby="design-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>DESIGN FOR THE DESTINATION</p><h2 id="design-title">売り先が違えば、<br />正解の商品も変わる。</h2></div>
                        <p>味だけを決めてから販路を探すのではなく、どこで・誰が・どう買うかを先に置きます。</p>
                    </div>
                    <div className={styles.channelGrid}>
                        {channelPlans.map(({ title, subtitle, points, icon: Icon }, index) => (
                            <article key={title}>
                                <div className={styles.channelNumber}>0{index + 1}</div>
                                <div className={styles.channelIcon}><Icon size={29} aria-hidden="true" /></div>
                                <h3>{title}</h3>
                                <p>{subtitle}</p>
                                <ul>{points.map(point => <li key={point}><Check size={16} aria-hidden="true" />{point}</li>)}</ul>
                            </article>
                        ))}
                    </div>
                    <p className={styles.channelNote}><Lightbulb size={18} aria-hidden="true" />販路への商談や登録の代行ではなく、その売り方に合う商品設計を支援します。</p>
                </section>

                <section className={styles.storySection} aria-labelledby="story-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>FROM IDEA TO SHELF</p>
                        <h2 id="story-title">素材の話から、棚に並ぶ形まで。</h2>
                        <p>レシピだけでも、パッケージだけでもありません。商品として成立する条件を一本につなぎます。</p>
                    </div>
                    <div className={styles.storyVisual}>
                        <Image src="/images/btob/oem-one-stop-flow-illustration-v1.webp" alt="素材、レシピ、パッケージ、製造、売り場までの商品化の流れ" fill sizes="(max-width: 760px) 100vw, 1200px" />
                    </div>
                    <ol className={styles.storyLegend}>
                        {productDesignSteps.map(({ label, detail, icon: Icon }, index) => (
                            <li key={label}><span>{String(index + 1).padStart(2, '0')}</span><div><Icon size={20} aria-hidden="true" /><strong>{label}</strong><small>{detail}</small></div></li>
                        ))}
                    </ol>
                </section>

                <section className={styles.casesSection} id="cases" aria-labelledby="cases-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>REAL PRODUCTS, REAL DECISIONS</p>
                        <h2 id="cases-title">実際の商品で見る、<br />素材から売り方までの設計。</h2>
                        <p>すべて会津ブランド館ECで販売している実商品です。見た目だけでなく、商品化の判断まで示します。</p>
                    </div>
                    <div className={styles.caseGrid}>
                        {actualProductExamples.map(example => (
                            <article className={styles.caseCard} key={example.href}>
                                <div className={styles.caseImage}><Image src={example.image} alt={example.alt} fill sizes="(max-width: 760px) 44vw, 280px" style={{ transform: 'scale(' + example.imageScale + ')' }} /></div>
                                <div className={styles.caseCopy}>
                                    <h3>{example.title}</h3>
                                    <ol aria-label={example.title + 'の商品化の流れ'}>
                                        <li><span>素材・文化</span><strong>{example.source}</strong></li>
                                        <li><span>商品化判断</span><strong>{example.decision}</strong></li>
                                        <li><span>想定売り場</span><strong>{example.outlet}</strong></li>
                                    </ol>
                                    <Link href={example.href} target="_blank" rel="noreferrer">実商品を見る <ExternalLink size={14} aria-hidden="true" /></Link>
                                </div>
                            </article>
                        ))}
                    </div>
                    <p className={styles.note}><BadgeCheck size={18} aria-hidden="true" />架空のモックではなく、現在販売している商品の写真を使用しています。</p>
                </section>

                <section className={styles.packagingSection} aria-labelledby="packaging-title">
                    <div className={styles.packagingIntro}>
                        <div>
                            <p className={styles.eyebrow}>PACKAGE REALITY</p>
                            <h2 id="packaging-title">商品より包材が余る。<br />その失敗を最初から避ける。</h2>
                            <p>商品ロットだけでなく、箱・袋・ラベルの発注単位も同時に確認します。小ロットほど、包材の選び方が採算と継続性を左右します。</p>
                        </div>
                        <div className={styles.packagingVisual}><Image src="/images/btob/oem-label-design-illustration-v1.webp" alt="瓶、袋、ボトルに合わせたオリジナルラベル設計のイラスト" fill sizes="(max-width: 760px) 100vw, 48vw" /></div>
                    </div>

                    <div className={styles.packageCompare}>
                        <article className={styles.packageBad}>
                            <div className={styles.compareLabel}><Ban size={20} aria-hidden="true" /><strong>別々に決めると</strong></div>
                            <div className={styles.inventoryRow}><span>商品</span><div><i className={styles.barShort} /><b>400個 完売</b></div></div>
                            <div className={styles.inventoryRow}><span>専用包材</span><div><i className={styles.barLong} /><b>1,000枚</b></div></div>
                            <p><strong>600枚</strong>の包材だけが在庫に残る</p>
                        </article>
                        <ArrowRight className={styles.packageArrow} size={28} aria-hidden="true" />
                        <article className={styles.packageGood}>
                            <div className={styles.compareLabel}><BadgeCheck size={20} aria-hidden="true" /><strong>同時に設計すると</strong></div>
                            <div className={styles.inventoryRow}><span>商品</span><div><i className={styles.barMatch} /><b>400個</b></div></div>
                            <div className={styles.inventoryRow}><span>包材</span><div><i className={styles.barMatch} /><b>400個分</b></div></div>
                            <p>販売量に合い、追加発注もしやすい</p>
                        </article>
                    </div>
                    <div className={styles.packageOptions} aria-label="小ロット向けの包装選択肢">
                        <span><Tags size={20} aria-hidden="true" /><strong>ラベル</strong></span>
                        <span><FileCheck2 size={20} aria-hidden="true" /><strong>白無地箱＋巻紙</strong></span>
                        <span><Boxes size={20} aria-hidden="true" /><strong>バルク納品</strong></span>
                        <span><PackageCheck size={20} aria-hidden="true" /><strong>販売量に合う外装</strong></span>
                    </div>
                </section>

                <section className={styles.rolesSection} id="roles" aria-labelledby="roles-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>WHO DOES WHAT</p>
                        <h2 id="roles-title">一緒につくる。<br />でも、役割は曖昧にしない。</h2>
                        <p>商品化を前に進めるために、最初から担当範囲を見える形にします。</p>
                    </div>
                    <div className={styles.roleMap}>
                        {roleColumns.map(({ label, title, items, icon: Icon }, index) => (
                            <article key={label}>
                                <div className={styles.roleHead}><div><Icon size={27} aria-hidden="true" /></div><span>{label}</span></div>
                                <h3>{title}</h3>
                                <ul>{items.map(item => <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
                                {index < roleColumns.length - 1 && <ArrowRight className={styles.roleArrow} size={25} aria-hidden="true" />}
                            </article>
                        ))}
                    </div>
                    <p className={styles.roleBoundary}><MessageCircle size={19} aria-hidden="true" /><span><strong>販売先との商談・紹介、ふるさと納税の登録はご相談者の担当です。</strong>会津ブランド館は、想定販路に合う仕様・価格・包材の考え方まで助言します。</span></p>
                </section>

                <section className={styles.productsSection} id="products" aria-labelledby="products-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>QUICK ESTIMATE</p><h2 id="products-title">つくりたい商品から、<br />概算を確認できます。</h2></div>
                        <p>数量・原料供給・包装仕様を選ぶと、その場で概算を確認できます。原料から相談する方も、売り場から考える方も利用できます。</p>
                    </div>
                    {visibleProducts.length > 0 && (
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
                    )}
                    <div className={styles.estimateHint}><CircleDollarSign size={20} aria-hidden="true" /><p><strong>見積もりイメージ</strong>店頭想定価格1,000円の商品で、製造費が700円前後になる例もあります。商品・数量・包材・原料条件で変わります。</p></div>
                    <Link className={styles.primaryCta} href="#bto-form">相談条件と概算を確認する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                {supplementalSections.length > 0 && (
                    <section className={styles.supplementalSections} aria-label="追加のご案内">
                        {supplementalSections.map(section => <RichSection key={section.id} section={section} />)}
                    </section>
                )}

                <section className={styles.flowSection} id="flow" aria-labelledby="flow-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>HOW IT WORKS</p><h2 id="flow-title">相談から、販売準備まで。</h2><p>各段階で何が決まるかを確認しながら進めます。</p></div>
                    <ol className={styles.flowList}>
                        {flowSteps.map(({ title, output, description, icon: Icon }, index) => (
                            <li key={title}>
                                <span className={styles.flowMarker}><Icon size={20} aria-hidden="true" /><small>{String(index + 1).padStart(2, '0')}</small></span>
                                <div><span className={styles.flowOutput}>{output}</span><h3>{title}</h3><p>{description}</p></div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className={styles.supportSection} aria-labelledby="support-title">
                    <div>
                        <p className={styles.eyebrow}>INITIAL SUPPORT</p>
                        <h2 id="support-title">商品化の最初につまずきやすい項目も、まとめて。</h2>
                        <ul>
                            <li><Check size={17} aria-hidden="true" />レシピ開発（2回修正まで）</li>
                            <li><Check size={17} aria-hidden="true" />原材料・栄養成分表示</li>
                            <li><Check size={17} aria-hidden="true" />簡易パッケージデザイン</li>
                        </ul>
                        <small>現在、適用条件を満たす先着10社は上記3項目を無料対応します。詳細はお見積もり後にご案内します。</small>
                    </div>
                    <Link className={styles.lightCta} href="#bto-form">相談条件を確認する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                <section className={styles.faqSection} aria-labelledby="faq-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>FAQ</p><h2 id="faq-title">相談前によくある質問。</h2></div>
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
                    <div className={styles.formHeading}>
                        <p className={styles.eyebrow}>3分で条件整理</p>
                        <h2 id="form-title">原料から。<br />売り場から。<br />あなたの入口で始める。</h2>
                        <p>つくりたい数量と商品を選び、原料供給の有無に応じた質問へ進みます。まずは概算だけでも確認できます。</p>
                    </div>
                    <div className={styles.formEligibility}>
                        <span><Sprout size={18} aria-hidden="true" />原料から相談</span>
                        <b>または</b>
                        <span><Store size={18} aria-hidden="true" />売り場から相談</span>
                    </div>
                    <div className={styles.formShell}><InteractiveForm steps={formSteps} products={products} pageId={pageId} showFloatingCta={false} /></div>
                </section>

                <section className={styles.storeSection} aria-labelledby="store-title">
                    <div className={styles.storeVisual}><Image src="/images/btob/brandkan.jpg" alt="会津ブランド館 店舗外観" fill sizes="(max-width: 760px) 100vw, 48vw" /></div>
                    <div className={styles.storeCopy}>
                        <p className={styles.eyebrow}>WHO WE ARE</p>
                        <h2 id="store-title">私たち自身も、福島で商品を売っています。</h2>
                        <p>OEMは、福島県会津若松市の「会津ブランド館」が実施しています。商品を実際に販売し、お客様の反応を見てきた経験を、地域の商品設計に活かします。</p>
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
                    <div><Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={80} height={80} /><p>福島の素材と売り場を、<br />長く売れる地域商品へ。</p></div>
                    <div className={styles.footerLinks}>
                        <Link href="https://maps.app.goo.gl/Dw5oKqfk7SEEYJLS9" target="_blank" rel="noreferrer"><MapPin size={16} />会津ブランド館</Link>
                        <Link href="tel:0242254141"><Phone size={16} />0242-25-4141</Link>
                        <Link href="https://www.instagram.com/aizubrandhall/" target="_blank" rel="noreferrer"><Instagram size={16} />Instagram</Link>
                    </div>
                </div>
                <div className={styles.footerBottom}><span>© Aizu Brand Hall</span><span><Sparkles size={13} />福島から、次の定番を。</span></div>
            </footer>
        </div>
    )
}
