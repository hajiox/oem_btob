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
    Instagram,
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
    Warehouse,
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
    title: '福島の素材と売り場に、\nここでしか買えない商品を。',
    description: '農家・生産者の原料も、道の駅・観光施設・土産店の売り場も。自分の場所でお客様に直接販売するオリジナル食品を、400個から一緒につくります。',
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
    { value: '400個〜', label: '対応商品の小ロット製造' },
    { value: '10商品以上', label: '楽天・Yahoo!ランキング1位獲得商品' },
    { value: '50社以上', label: 'OEM取引実績' },
] as const

const audienceEntrances = [
    {
        label: '原料を持っている',
        audience: '農家・生産者・地域事業者',
        detail: '桃・梅・トマト・米など、福島の素材を商品にしたい',
        icon: Tractor,
    },
    {
        label: '直販売り場を持っている',
        audience: '道の駅・観光施設・土産店',
        detail: '自店・施設・自社ECで売る、限定商品をつくりたい',
        icon: Store,
    },
] as const

const excludedAudiences = [
    { label: '同業の食品加工会社', icon: Factory },
    { label: '卸業者・仲介業者', icon: Warehouse },
    { label: '完成品の再卸・転売', icon: Truck },
] as const

const actualProductExamples = [
    {
        source: '会津美里町の高田梅',
        decision: '常温で使えるご飯のお供へ',
        outlet: '土産・自社EC・日常食',
        title: '会津たかだうめふりかけ',
        image: '/images/btob/ec-takada-ume-furikake.webp',
        alt: '会津たかだうめふりかけの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/141696577',
    },
    {
        source: '福島の桃',
        decision: '意外性のある常温レトルトへ',
        outlet: '土産・ギフト',
        title: '福島もものZEROカレー',
        image: '/images/btob/ec-peach-zero-curry.webp',
        alt: '福島もものZEROカレーの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125350864',
    },
    {
        source: '南会津産トマト＋会津の地酒',
        decision: '長く売れる調味料へ',
        outlet: '自店・ホテル・旅館',
        title: '南会津産トマトドレッシング',
        image: '/images/btob/ec-tomato-dressing.webp',
        alt: '南会津産トマトドレッシングの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125353567',
    },
    {
        source: '会津の郷土料理',
        decision: '一食分・お湯だけの簡便商品へ',
        outlet: '観光売店・土産',
        title: 'カップこづゆ',
        image: '/images/btob/ec-cup-kozuyu.webp',
        alt: 'カップこづゆの実商品',
        href: 'https://www.aizubrandhall-ec.com/items/125351142',
    },
] as const

const designDecisions = [
    { question: '誰が、いつ買うか', answer: '味・内容量', detail: '観光客、地元客、ギフトなど', icon: ShoppingBag },
    { question: 'いくらなら手に取るか', answer: '原価・ロット', detail: '売価と在庫のバランス', icon: CircleDollarSign },
    { question: 'どう持ち帰り、届けるか', answer: '保存・物流', detail: '常温、賞味期限、EC配送', icon: Truck },
    { question: 'どこに陳列するか', answer: '表示・包材', detail: '棚、レジ横、ギフト売り場', icon: Tags },
] as const

const consultationRoutes = [
    {
        label: '原料を持っている方',
        title: '素材から、売り方を決める',
        audience: '農家・生産者・地域事業者',
        steps: ['種類・状態・供給量', '加工方法と商品形態', '売り場と価格を設計'],
        icon: Sprout,
    },
    {
        label: '売り場を持っている方',
        title: '客層から、商品を決める',
        audience: '道の駅・観光施設・土産店',
        steps: ['客層・売価・陳列場所', '商品・数量・包材', '概算と採算を確認'],
        icon: Store,
    },
] as const

const flowSteps = [
    { title: '素材・売り場確認', output: '企画条件', description: '原料か直販売り場、客層、数量を確認します。', icon: MessageCircle },
    { title: '商品仮説', output: '商品案', description: '味・容量・価格・保存性・包材を一つにします。', icon: ClipboardList },
    { title: '概算・採算確認', output: '概算', description: '直販で成立する仕様と費用を確認します。', icon: Calculator },
    { title: '試作・包材確認', output: '量産仕様', description: '味と仕上がり、表示、包材を決定します。', icon: FlaskConical },
    { title: '製造・納品', output: '販売開始', description: '指定場所へ納品し、自社の売り場で販売します。', icon: Truck },
] as const

const standardFaqs = [
    {
        question: '原料がなくても相談できますか？',
        answer: 'はい。道の駅、観光施設、土産店など、ご自身の直販売り場がある場合は、客層・売価・売り場から商品を一緒に設計できます。',
    },
    {
        question: '卸売や再卸を目的とした製造はできますか？',
        answer: 'このサービスは、自店・自施設・自社ECでお客様へ直接販売する商品づくりを対象としています。同業者、卸業者、完成品の再卸を目的とするご相談は対象外です。',
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
                {section.section_type === 'cta' && <Link className={styles.secondaryCta} href="#bto-form">対象条件を確認する <ArrowRight size={17} aria-hidden="true" /></Link>}
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
                    <Link href="#audience">対象となる方</Link>
                    <Link href="#cases">商品化事例</Link>
                    <Link href="#design">商品設計</Link>
                    <Link href="#products">概算商品</Link>
                    <Link href="#flow">ご利用の流れ</Link>
                </nav>
                <Link className={styles.headerCta} href="#bto-form">対象条件を確認する <ArrowRight size={16} aria-hidden="true" /></Link>
            </header>

            <main id="top">
                <section className={styles.hero} aria-labelledby="hero-title">
                    <div className={styles.heroAccent} aria-hidden="true" />
                    <div className={styles.heroInner}>
                        <div className={styles.heroCopy}>
                            <p className={styles.eyebrow}><MapPin size={15} aria-hidden="true" /> 福島の農家・道の駅・観光施設のための食品OEM</p>
                            <h1 id="hero-title">{heroTitle}</h1>
                            <p className={styles.heroDescription}>{heroDescription}</p>
                            <div className={styles.heroActions}>
                                <Link className={styles.primaryCta} href="#audience">自分が対象か確認する <ArrowRight size={19} aria-hidden="true" /></Link>
                                <Link className={styles.textCta} href="#cases">実商品を見る <ArrowRight size={16} aria-hidden="true" /></Link>
                            </div>
                            <div className={styles.heroTrust} aria-label="このOEMの対象条件">
                                <span><Check size={15} aria-hidden="true" />原料または直販売り場がある</span>
                                <span><Ban size={15} aria-hidden="true" />卸・再卸目的は対象外</span>
                            </div>
                        </div>

                        <div className={styles.heroJourney} aria-label="福島の素材または売り場から、直販商品をつくる流れ">
                            <div className={styles.heroInputs}>
                                <div><Sprout size={24} aria-hidden="true" /><span>福島の原料</span><small>農家・生産者</small></div>
                                <b>または</b>
                                <div><Store size={24} aria-hidden="true" /><span>自分の売り場</span><small>道の駅・観光施設</small></div>
                            </div>
                            <ArrowDown className={styles.heroJourneyArrow} size={22} aria-hidden="true" />
                            <div className={styles.heroProductVisual}>
                                <Image
                                    src={showDefaultHero ? defaultEcHeroImage : (isRenderableImage(hero?.image_url) ? hero!.image_url! : defaultEcHeroImage)}
                                    alt="福島の素材を活かした会津ブランド館の実商品"
                                    fill
                                    priority
                                    sizes="(max-width: 760px) 100vw, 44vw"
                                />
                                <span><PackageCheck size={17} aria-hidden="true" />ここでしか買えない自社商品</span>
                            </div>
                            <ArrowDown className={styles.heroJourneyArrow} size={22} aria-hidden="true" />
                            <div className={styles.heroDestination}><Gift size={22} aria-hidden="true" /><strong>自店・自施設で、お客様へ直接販売</strong></div>
                        </div>
                    </div>
                    <div className={styles.proofStrip} aria-label="商品開発実績">
                        {provenResults.map(result => <div key={result.value}><strong>{result.value}</strong><span>{result.label}</span></div>)}
                    </div>
                </section>

                <section className={styles.audienceSection} id="audience" aria-labelledby="audience-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>WHO THIS IS FOR</p>
                        <h2 id="audience-title">「原料」か「自分の売り場」を<br />持つ方のためのOEMです。</h2>
                        <p>福島で、自分たちの商品としてお客様に直接販売することが前提です。</p>
                    </div>

                    <div className={styles.audienceDiagram} aria-label="対象となる二つの入口">
                        <div className={styles.audienceEntrances}>
                            {audienceEntrances.map(({ label, audience, detail, icon: Icon }, index) => (
                                <article key={label}>
                                    <span className={styles.audienceNumber}>0{index + 1}</span>
                                    <div className={styles.audienceIcon}><Icon size={34} aria-hidden="true" /></div>
                                    <p>{audience}</p>
                                    <h3>{label}</h3>
                                    <small>{detail}</small>
                                </article>
                            ))}
                            <span className={styles.orBadge}>どちらか一つ</span>
                        </div>
                        <ArrowDown className={styles.audienceArrow} size={26} aria-hidden="true" />
                        <div className={styles.audienceResult}>
                            <div><Sparkles size={25} aria-hidden="true" /></div>
                            <span>地域限定・施設限定の</span>
                            <strong>自社オリジナル商品</strong>
                            <ArrowRight size={22} aria-hidden="true" />
                            <div><ShoppingBag size={25} aria-hidden="true" /></div>
                            <strong>自分の売り場で直販</strong>
                        </div>
                    </div>

                    <div className={styles.excludedPanel} aria-label="このOEMの対象外となる事業者">
                        <div className={styles.excludedTitle}><Ban size={27} aria-hidden="true" /><div><span>対象外</span><strong>仕入れて、どこかへ卸すための商品製造</strong></div></div>
                        <div className={styles.excludedItems}>
                            {excludedAudiences.map(({ label, icon: Icon }) => <span key={label}><Icon size={18} aria-hidden="true" />{label}</span>)}
                        </div>
                        <p>完成品を再卸する価格設計ではないため、同業者・卸業者からのご相談はお受けしていません。</p>
                    </div>
                </section>

                <section className={styles.directSection} aria-labelledby="direct-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>DIRECT SALES MODEL</p><h2 id="direct-title">直販だから、<br />成り立つ商品づくり。</h2></div>
                        <p>店頭売価から商品仕様を逆算します。製造価格は売価のおおむね7割が目安のため、中間の卸を挟まず、ご自身の売り場で販売する事業者向けです。</p>
                    </div>

                    <div className={styles.directGrid}>
                        <div className={styles.priceDiagram} aria-label="販売価格1000円の場合の価格構造例">
                            <div className={styles.priceHeader}><span>価格構造の例</span><strong>店頭売価 1,000円</strong></div>
                            <div className={styles.priceBar}>
                                <div className={styles.priceOem}><span>OEM商品価格の目安</span><strong>約700円</strong></div>
                                <div className={styles.priceRetail}><span>販売経費・利益の原資</span><strong>約300円</strong></div>
                            </div>
                            <p>※商品・数量・包材・原料条件により変動します。</p>
                        </div>

                        <div className={styles.channelDiagram} aria-label="想定する販売経路と対象外の販売経路">
                            <div className={styles.channelGood}>
                                <span>想定する流れ</span>
                                <div><Factory size={22} aria-hidden="true" /><strong>商品化</strong><ArrowRight size={19} /><Store size={22} aria-hidden="true" /><strong>あなたの売り場</strong><ArrowRight size={19} /><ShoppingBag size={22} aria-hidden="true" /><strong>お客様</strong></div>
                            </div>
                            <div className={styles.channelBad}>
                                <span>対象外</span>
                                <div><Factory size={20} aria-hidden="true" /><ArrowRight size={17} /><Warehouse size={20} aria-hidden="true" /><ArrowRight size={17} /><Store size={20} aria-hidden="true" /><Ban size={22} aria-hidden="true" /></div>
                                <p>卸・再卸を前提にすると、販売余地が残りにくくなります。</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={styles.casesSection} id="cases" aria-labelledby="cases-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>MATERIAL TO MARKET</p>
                        <h2 id="cases-title">素材を、売り場で選ばれる形へ。</h2>
                        <p>写真を並べるだけではなく、何をどう変え、どこで売れる商品にしたかを示します。</p>
                    </div>
                    <div className={styles.caseGrid}>
                        {actualProductExamples.map(example => (
                            <article className={styles.caseCard} key={example.href}>
                                <div className={styles.caseImage}><Image src={example.image} alt={example.alt} fill sizes="(max-width: 760px) 38vw, 22vw" /></div>
                                <div className={styles.caseCopy}>
                                    <h3>{example.title}</h3>
                                    <ol aria-label={`${example.title}の商品化の流れ`}>
                                        <li><span>素材・文化</span><strong>{example.source}</strong></li>
                                        <li><span>加工判断</span><strong>{example.decision}</strong></li>
                                        <li><span>直販売り場</span><strong>{example.outlet}</strong></li>
                                    </ol>
                                    <Link href={example.href} target="_blank" rel="noreferrer">実商品を見る <ExternalLink size={14} aria-hidden="true" /></Link>
                                </div>
                            </article>
                        ))}
                    </div>
                    <p className={styles.note}><BadgeCheck size={18} aria-hidden="true" />すべて会津ブランド館ECで現在も販売している実商品です。</p>
                </section>

                <section className={styles.designSection} id="design" aria-labelledby="design-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>DESIGN FROM THE SHELF</p>
                        <h2 id="design-title">売り場が決まると、<br />商品仕様が決まります。</h2>
                        <p>先に商品を作るのではなく、誰が・どこで・いくらで買うかを起点にします。</p>
                    </div>

                    <div className={styles.decisionMap} aria-label="売り場から商品仕様を決める設計図">
                        <div className={styles.decisionStart}>
                            <Store size={31} aria-hidden="true" />
                            <span>最初に決める</span>
                            <strong>売り場・客層・店頭売価</strong>
                        </div>
                        <ArrowDown size={26} aria-hidden="true" />
                        <div className={styles.decisionGrid}>
                            {designDecisions.map(({ question, answer, detail, icon: Icon }) => (
                                <article key={answer}>
                                    <div><Icon size={23} aria-hidden="true" /></div>
                                    <span>{question}</span>
                                    <ArrowDown size={18} aria-hidden="true" />
                                    <strong>{answer}</strong>
                                    <small>{detail}</small>
                                </article>
                            ))}
                        </div>
                        <ArrowDown size={26} aria-hidden="true" />
                        <div className={styles.decisionResult}><PackageCheck size={27} aria-hidden="true" /><span>結果</span><strong>自分の売り場で、無理なく売り切れる商品</strong></div>
                    </div>
                </section>

                <section className={styles.packagingSection} aria-labelledby="packaging-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>PACKAGE REALITY</p><h2 id="packaging-title">商品より包材が余る。<br />その失敗を最初から避ける。</h2></div>
                        <p>商品ロットだけでなく、箱・袋・ラベルの発注単位も同時に確認します。小ロットの商品ほど、包材の選び方が採算を左右します。</p>
                    </div>

                    <div className={styles.packageCompare}>
                        <article className={styles.packageBad}>
                            <div className={styles.compareLabel}><Ban size={20} aria-hidden="true" /><strong>別々に決めると</strong></div>
                            <div className={styles.inventoryRow}><span>商品</span><div><i style={{ width: '40%' }} /><b>400個 完売</b></div></div>
                            <div className={styles.inventoryRow}><span>専用包材</span><div><i style={{ width: '100%' }} /><b>1,000枚</b></div></div>
                            <p><strong>600枚</strong>の包材だけが在庫に残る</p>
                        </article>
                        <ArrowRight className={styles.packageArrow} size={28} aria-hidden="true" />
                        <article className={styles.packageGood}>
                            <div className={styles.compareLabel}><BadgeCheck size={20} aria-hidden="true" /><strong>同時に設計すると</strong></div>
                            <div className={styles.inventoryRow}><span>商品</span><div><i /><b>400個</b></div></div>
                            <div className={styles.inventoryRow}><span>包材</span><div><i /><b>400個分</b></div></div>
                            <p>販売量に合う仕様で、追加発注もしやすい</p>
                        </article>
                    </div>
                    <div className={styles.packageOptions} aria-label="小ロット向けの包装選択肢">
                        <span><Tags size={20} aria-hidden="true" /><strong>ラベル</strong></span>
                        <span><FileCheck2 size={20} aria-hidden="true" /><strong>白無地箱＋巻紙</strong></span>
                        <span><Boxes size={20} aria-hidden="true" /><strong>バルク納品</strong></span>
                        <span><PackageCheck size={20} aria-hidden="true" /><strong>販売量に合う外装</strong></span>
                    </div>
                </section>

                <section className={styles.routeSection} id="start" aria-labelledby="route-title">
                    <div className={styles.sectionHeading}>
                        <p className={styles.eyebrow}>TWO WAYS TO START</p>
                        <h2 id="route-title">入口は二つ。素材か、売り場か。</h2>
                        <p>「原料の有無」だけでは分けません。原料を持つ方と、売り場を持つ方で、最初に整理する条件が違います。</p>
                    </div>
                    <div className={styles.routeGrid}>
                        {consultationRoutes.map(({ label, title, audience, steps, icon: Icon }) => (
                            <article className={styles.routeCard} key={label}>
                                <div className={styles.routeHeader}><div><Icon size={30} aria-hidden="true" /></div><span>{label}</span></div>
                                <small>{audience}</small>
                                <h3>{title}</h3>
                                <ol>{steps.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong>{index < steps.length - 1 && <ArrowDown size={15} aria-hidden="true" />}</li>)}</ol>
                                <Link href="#bto-form">この条件で概算・相談へ <ArrowRight size={17} aria-hidden="true" /></Link>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.productsSection} id="products" aria-labelledby="products-title">
                    <div className={styles.splitHeading}>
                        <div><p className={styles.eyebrow}>QUICK ESTIMATE</p><h2 id="products-title">対応商品から、<br />概算を確認できます。</h2></div>
                        <p>数量・原料供給・包装仕様を選ぶと、その場で概算を確認できます。原料を持ち込む方も、売り場から商品を考える方も利用できます。</p>
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
                    <Link className={styles.primaryCta} href="#bto-form">対象条件と概算を確認する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                {supplementalSections.length > 0 && (
                    <section className={styles.supplementalSections} aria-label="追加のご案内">
                        {supplementalSections.map(section => <RichSection key={section.id} section={section} />)}
                    </section>
                )}

                <section className={styles.flowSection} id="flow" aria-labelledby="flow-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>HOW IT WORKS</p><h2 id="flow-title">相談から、自分の売り場に並ぶまで。</h2><p>各段階で何が決まるかを確認しながら進めます。</p></div>
                    <ol className={styles.flowList}>
                        {flowSteps.map(({ title, output, description, icon: Icon }, index) => (
                            <li key={title}>
                                <span className={styles.flowMarker}><Icon size={20} aria-hidden="true" /><small>{String(index + 1).padStart(2, '0')}</small></span>
                                <div><span className={styles.flowOutput}>{output}</span><h3>{title}</h3><p>{description}</p></div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className={styles.offerSection} aria-labelledby="offer-title">
                    <div className={styles.offerCopy}>
                        <p className={styles.eyebrow}>先着10社限定キャンペーン</p>
                        <h2 id="offer-title">商品化の最初の3項目を、今なら0円に。</h2>
                        <ul>
                            <li><Check size={17} aria-hidden="true" />レシピ開発費（2回修正まで）</li>
                            <li><Check size={17} aria-hidden="true" />原材料・栄養成分表示</li>
                            <li><Check size={17} aria-hidden="true" />簡易パッケージデザイン</li>
                        </ul>
                        <small>※適用条件があります。詳細はお見積もり後にご案内します。</small>
                    </div>
                    <Link className={styles.lightCta} href="#bto-form">対象条件を確認する <ArrowRight size={18} aria-hidden="true" /></Link>
                </section>

                <section className={styles.faqSection} aria-labelledby="faq-title">
                    <div className={styles.sectionHeading}><p className={styles.eyebrow}>FAQ</p><h2 id="faq-title">対象条件と進め方について。</h2></div>
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
                        <h2 id="form-title">自分の素材・売り場で、<br />何が作れるか確認する。</h2>
                        <p>福島の原料を持つ方、または自店・自施設・自社ECで直接販売する方のための概算フォームです。</p>
                    </div>
                    <div className={styles.formEligibility}>
                        <span><Check size={18} aria-hidden="true" />原料がある</span>
                        <b>または</b>
                        <span><Check size={18} aria-hidden="true" />直販売り場がある</span>
                        <i><Ban size={17} aria-hidden="true" />卸・再卸目的は対象外</i>
                    </div>
                    <div className={styles.formShell}><InteractiveForm steps={formSteps} products={products} pageId={pageId} showFloatingCta={false} /></div>
                </section>

                <section className={styles.storeSection} aria-labelledby="store-title">
                    <div className={styles.storeVisual}><Image src="/images/btob/brandkan.jpg" alt="会津ブランド館 店舗外観" fill sizes="(max-width: 760px) 100vw, 48vw" /></div>
                    <div className={styles.storeCopy}>
                        <p className={styles.eyebrow}>WHO WE ARE</p>
                        <h2 id="store-title">私たち自身も、福島で売り場を持っています。</h2>
                        <p>OEMは、福島県会津若松市の「会津ブランド館」が実施しています。自分たちの商品を実際に販売し、お客様の反応を見てきた経験を、地域の商品設計に活かします。</p>
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
                    <div><Image src="/images/btob/rogo.jpg" alt="会津ブランド館" width={80} height={80} /><p>福島の素材と売り場を、<br />ここでしか買えない商品へ。</p></div>
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
