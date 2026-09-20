export const OEM_ANALYTICS_HOST = 'oem.aizubrandhall.com'
export const OEM_ANALYTICS_PATH = '/btob'
export const OEM_ANALYTICS_CONSENT_KEY = 'oem-ga4-consent-v1'

export const OEM_PRODUCT_IDS = new Set([
    'c0000001-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000003',
    'c0000001-0000-0000-0000-000000000004',
    'c0000001-0000-0000-0000-000000000005',
    'c0000001-0000-0000-0000-000000000006',
])

export const OEM_PRODUCT_NAMES: Record<string, string> = {
    'c0000001-0000-0000-0000-000000000001': 'カレー',
    'c0000001-0000-0000-0000-000000000002': 'ラーメン',
    'c0000001-0000-0000-0000-000000000003': 'ふりかけ',
    'c0000001-0000-0000-0000-000000000004': 'たれ・ソース・ドレッシング',
    'c0000001-0000-0000-0000-000000000005': '瓶詰め（ジャム・ご飯のお供）',
    'c0000001-0000-0000-0000-000000000006': 'お茶',
}

// Only reviewed, non-personal campaign labels may leave the page. Never pass
// arbitrary UTM values, search terms, click IDs, or the full query to Google.
export const OEM_CAMPAIGN_VALUES = {
    utm_source: ['google', 'yahoo', 'bing', 'instagram', 'facebook', 'threads', 'x', 'youtube', 'line'],
    utm_medium: ['cpc', 'paid_social', 'social', 'organic', 'referral', 'email', 'qr'],
    utm_campaign: ['oem_fukushima', 'oem_curry', 'oem_ramen', 'oem_furikake', 'oem_sauce', 'oem_jar', 'oem_tea', 'oem_tracking_test'],
    utm_content: ['profile', 'post', 'story', 'reel', 'banner', 'text_ad', 'qr'],
} as const

export function getSafeCampaign(search: string = ''): Record<string, string> {
    const query = new URLSearchParams(search)
    const safe = (key: keyof typeof OEM_CAMPAIGN_VALUES) => {
        const values = query.getAll(key)
        if (values.length !== 1) return undefined
        const value = values[0].toLowerCase()
        return (OEM_CAMPAIGN_VALUES[key] as readonly string[]).includes(value) ? value : undefined
    }
    const source = safe('utm_source')
    const medium = safe('utm_medium')
    // Partial or invalid attribution must not overwrite ordinary referrer attribution.
    if (!source || !medium) return {}
    const name = safe('utm_campaign')
    const content = safe('utm_content')
    return { campaign_source: source, campaign_medium: medium,
        ...(name ? { campaign_name: name } : {}), ...(content ? { campaign_content: content } : {}) }
}

export type OemConsent = 'accepted' | 'rejected'
export type OemEventName = 'oem_select_product' | 'oem_view_quote' | 'oem_start_consultation' | 'generate_lead'

type Gtag = (...args: unknown[]) => void
type OemWindow = Window & { gtag?: Gtag; dataLayer?: IArguments[]; __oemGaLoaded?: boolean; __oemGaDisabled?: boolean; __oemGaMeasurementId?: string }

const sentEvents = new Set<string>()
const pendingEvents = new Map<string, { name: OemEventName; productId: string }>()
let loadingPromise: Promise<boolean> | null = null

export function isOemAnalyticsPage(location: Pick<Location, 'hostname' | 'pathname'>): boolean {
    return location.hostname === OEM_ANALYTICS_HOST && location.pathname === OEM_ANALYTICS_PATH
}

export function isValidMeasurementId(value: string | undefined | null): value is string {
    return typeof value === 'string' && /^G-[A-Z0-9]+$/i.test(value.trim())
}

export function getCanonicalPageLocation(location: Pick<Location, 'origin' | 'pathname'>): string {
    return `${location.origin}${location.pathname}`
}

export function getSafeReferrer(referrer: string | undefined | null): string | undefined {
    if (!referrer) return undefined
    try {
        const url = new URL(referrer)
        return `${url.origin}${url.pathname}`
    } catch {
        return undefined
    }
}

export function readOemConsent(storage: Pick<Storage, 'getItem'> | undefined): OemConsent | null {
    try {
        const value = storage?.getItem(OEM_ANALYTICS_CONSENT_KEY)
        return value === 'accepted' || value === 'rejected' ? value : null
    } catch {
        return null
    }
}

export function saveOemConsent(storage: Pick<Storage, 'setItem'> | undefined, consent: OemConsent): boolean {
    try {
        storage?.setItem(OEM_ANALYTICS_CONSENT_KEY, consent)
        return true
    } catch {
        return false
    }
}

export function resetOemAnalyticsDedupe() {
    sentEvents.clear()
    pendingEvents.clear()
}

function canSend(): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsPage(window.location)) return false
    try {
        return readOemConsent(window.localStorage) === 'accepted' && Boolean((window as OemWindow).__oemGaLoaded) && !(window as OemWindow).__oemGaDisabled
    } catch {
        return false
    }
}

export function trackOemEvent(name: OemEventName, productId?: string | null): boolean {
    if (!productId || !OEM_PRODUCT_IDS.has(productId)) return false
    if (!['oem_select_product', 'oem_view_quote', 'oem_start_consultation', 'generate_lead'].includes(name)) return false
    const dedupeKey = `${name}:${productId}`
    if (sentEvents.has(dedupeKey)) return false
    if (!canSend()) {
        // Buffer only actions after consent while the tag loads, never pre-consent activity.
        if (typeof window !== 'undefined' && isOemAnalyticsPage(window.location)) {
            try {
                if (readOemConsent(window.localStorage) === 'accepted' && !(window as OemWindow).__oemGaDisabled)
                    pendingEvents.set(dedupeKey, { name, productId })
            } catch { /* storage unavailable: no tracking */ }
        }
        return false
    }
    const gtag = (window as OemWindow).gtag
    if (typeof gtag !== 'function') return false
    // Only fixed catalogue metadata. Never forward form answers,
    // contact data, notes, prices, or request/idempotency identifiers.
    const params = { product_id: productId, product_name: OEM_PRODUCT_NAMES[productId] }
    try {
        gtag('event', name, params || {})
        sentEvents.add(dedupeKey)
        return true
    } catch {
        return false
    }
}

export function installOemGoogleTag(measurementId: string): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
    if (!isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return Promise.resolve(false)
    const target = window as OemWindow
    if (target.__oemGaLoaded) {
        updateOemGoogleConsent(measurementId, 'accepted')
        return Promise.resolve(true)
    }
    if (loadingPromise) return loadingPromise
    loadingPromise = new Promise(resolve => {
        const w = window as OemWindow
        w.dataLayer = w.dataLayer || []
        // Use the standard gtag queue shape (an Arguments object), before the
        // script is appended so no consent/config command can be lost.
        w.gtag = w.gtag || function gtagQueue(this: unknown) {
            // eslint-disable-next-line prefer-rest-params
            w.dataLayer?.push(arguments)
        } as unknown as Gtag
        w.gtag('js', new Date())
        w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
        target.__oemGaMeasurementId = measurementId
        target.__oemGaDisabled = false
        ;(target as Window & Record<string, unknown>)[`ga-disable-${measurementId}`] = false
        const script = document.createElement('script')
        script.async = true
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
        script.onload = () => {
            let stillAccepted = false
            try { stillAccepted = readOemConsent(window.localStorage) === 'accepted' } catch { stillAccepted = false }
            if (!stillAccepted) {
                updateOemGoogleConsent(measurementId, 'rejected')
                loadingPromise = null
                script.remove()
                resolve(false)
                return
            }
            const gtag = w.gtag
            if (typeof gtag !== 'function') { resolve(false); return }
            gtag('config', measurementId, {
                send_page_view: false,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                page_location: getCanonicalPageLocation(window.location),
                ...getSafeCampaign(window.location.search),
                ...(getSafeReferrer(document.referrer) ? { page_referrer: getSafeReferrer(document.referrer) } : {}),
            })
            target.__oemGaLoaded = true
            gtag('event', 'page_view', {})
            const pending = [...pendingEvents.values()]
            pendingEvents.clear()
            for (const event of pending) trackOemEvent(event.name, event.productId)
            resolve(true)
        }
        script.onerror = () => { loadingPromise = null; script.remove(); resolve(false) }
        document.head.appendChild(script)
    })
    return loadingPromise
}

export function updateOemGoogleConsent(measurementId: string, consent: OemConsent): void {
    if (typeof window === 'undefined' || !isValidMeasurementId(measurementId)) return
    const target = window as OemWindow
    if (consent !== 'accepted') pendingEvents.clear()
    const gtag = target.gtag
    if (typeof gtag === 'function') {
        gtag('consent', 'update', consent === 'accepted'
            ? { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }
            : { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    }
    target.__oemGaDisabled = consent !== 'accepted'
    ;(target as Window & Record<string, unknown>)[`ga-disable-${measurementId}`] = consent !== 'accepted'
}
