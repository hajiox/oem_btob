export const OEM_ANALYTICS_HOST = 'oem.aizubrandhall.com'
export const OEM_ANALYTICS_PATH = '/btob'
export const OEM_ANALYTICS_PATHS = new Set([OEM_ANALYTICS_PATH, '/curry-oem', '/ramen-oem'])
export const OEM_INTERNAL_TRAFFIC_STORAGE_KEY = 'oem_analytics_internal_v1'
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
    utm_campaign: ['oem_fukushima', 'oem_pmax_fukushima', 'oem_curry', 'oem_ramen', 'oem_furikake', 'oem_sauce', 'oem_jar', 'oem_tea', 'oem_tracking_test'],
    utm_content: ['profile', 'post', 'story', 'reel', 'banner', 'text_ad', 'qr', 'curry', 'ramen'],
} as const

export function hasOemTestCampaign(search: string = ''): boolean {
    return new URLSearchParams(search).getAll('utm_campaign').some(value => value.toLowerCase() === 'oem_tracking_test')
}

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

export type OemEventName = 'oem_select_product' | 'oem_view_quote' | 'oem_start_consultation' | 'generate_lead'

export type OemInteractionName = 'oem_form_start' | 'oem_step_view' | 'oem_answer' | 'oem_step_back'
    | 'oem_contact_start' | 'oem_field_start' | 'oem_validation_error' | 'oem_submit_attempt'
    | 'oem_submit_error' | 'oem_form_exit' | 'oem_cta_click' | 'oem_scroll'
export type OemFieldName = 'company_name' | 'contact_name' | 'email' | 'phone' | 'notes' | 'desired_product'
export type OemInputType = 'radio' | 'checkbox' | 'select' | 'text' | 'number' | 'textarea'
    | 'select_text_selected' | 'select_text_extra' | 'select_number_selected' | 'select_number_extra'
export type OemInteractionDetails = {
    step_id?: string
    question_id?: string
    step_index?: number
    step_kind?: 'product' | 'question' | 'quote' | 'contact' | 'complete'
    field_name?: OemFieldName
    input_type?: OemInputType
    action?: 'select' | 'change' | 'clear' | 'next' | 'back'
    error_type?: 'required' | 'invalid_contact' | 'submission_failed' | 'network' | 'unavailable'
    elapsed_seconds?: number
    scroll_percent?: 25 | 50 | 75 | 90
    cta_location?: 'hero' | 'offer' | 'footer' | 'sticky'
}
export type OemInteractionOptions = { once?: boolean }

type Gtag = (...args: unknown[]) => void
type OemWindow = Window & { gtag?: Gtag; dataLayer?: IArguments[]; __oemGaLoaded?: boolean; __oemGaMeasurementId?: string }
type PageContext = { page_location: string; page_referrer?: string; campaign: Record<string, string> }
type PendingEvent = {
    name: OemEventName | OemInteractionName
    productId?: string
    details?: OemInteractionDetails
    once: boolean
    dedupeKey: string
    page: PageContext
}
type AnalyticsState = {
    sentEvents: Set<string>
    sentLegacyEvents: Set<string>
    pendingEvents: PendingEvent[]
    pendingPages: PageContext[]
    loadingPromise: Promise<boolean> | null
    campaign: Record<string, string>
    currentPage?: PageContext
    lastPageView?: string
}

const states = new WeakMap<Window, AnalyticsState>()
const MAX_PENDING_EVENTS = 200
const MAX_DEDUPE_EVENTS = 2048
const interactionNames: readonly OemInteractionName[] = ['oem_form_start', 'oem_step_view', 'oem_answer', 'oem_step_back', 'oem_contact_start', 'oem_field_start', 'oem_validation_error', 'oem_submit_attempt', 'oem_submit_error', 'oem_form_exit', 'oem_cta_click', 'oem_scroll']
const legacyNames: readonly OemEventName[] = ['oem_select_product', 'oem_view_quote', 'oem_start_consultation', 'generate_lead']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getState(): AnalyticsState {
    let state = states.get(window)
    if (!state) {
        state = { sentEvents: new Set(), sentLegacyEvents: new Set(), pendingEvents: [], pendingPages: [], loadingPromise: null, campaign: {} }
        states.set(window, state)
    }
    return state
}

// Runtime allowlisting is intentional: TypeScript types do not stop callers
// from accidentally passing answer text, contact details, or DOM labels.
export function sanitizeOemInteractionDetails(details: unknown): OemInteractionDetails {
    if (!details || typeof details !== 'object') return {}
    const source = details as Record<string, unknown>
    const safe: Record<string, string | number> = {}
    for (const key of ['step_id', 'question_id'] as const) {
        if (typeof source[key] === 'string' && uuidPattern.test(source[key])) safe[key] = source[key].toLowerCase()
    }
    for (const [key, max] of [['step_index', 100], ['elapsed_seconds', 86400]] as const) {
        const value = source[key]
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max) safe[key] = value
    }
    const enums = {
        step_kind: ['product', 'question', 'quote', 'contact', 'complete'],
        field_name: ['company_name', 'contact_name', 'email', 'phone', 'notes', 'desired_product'],
        input_type: ['radio', 'checkbox', 'select', 'text', 'number', 'textarea', 'select_text_selected', 'select_text_extra', 'select_number_selected', 'select_number_extra'],
        action: ['select', 'change', 'clear', 'next', 'back'],
        error_type: ['required', 'invalid_contact', 'submission_failed', 'network', 'unavailable'],
        cta_location: ['hero', 'offer', 'footer', 'sticky'],
    }
    for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
        const value = source[key]
        if (typeof value === 'string' && enums[key].includes(value)) safe[key] = value
    }
    if ([25, 50, 75, 90].includes(source.scroll_percent as number)) safe.scroll_percent = source.scroll_percent as number
    return safe as OemInteractionDetails
}

function clearPending(state: AnalyticsState) {
    state.pendingEvents = []
    state.pendingPages = []
}

function capturePageContext(): PageContext {
    const state = getState()
    const campaign = getSafeCampaign(window.location.search)
    if (Object.keys(campaign).length) state.campaign = campaign
    const location = getCanonicalPageLocation(window.location)
    const referrer = state.currentPage?.page_location === location
        ? state.currentPage.page_referrer
        : state.currentPage?.page_location ?? getSafeReferrer(typeof document === 'undefined' ? undefined : document.referrer)
    const page = { page_location: location, ...(referrer ? { page_referrer: referrer } : {}), campaign: { ...state.campaign } }
    state.currentPage = page
    return page
}

function queuePageView(page: PageContext) {
    const state = getState()
    const previous = state.pendingPages.at(-1)?.page_location ?? state.lastPageView
    if (previous === page.page_location) return
    if (state.pendingPages.length >= MAX_PENDING_EVENTS) state.pendingPages.shift()
    state.pendingPages.push(page)
}

function interactionDedupeKey(name: OemInteractionName, productId: string | undefined, details: OemInteractionDetails): string {
    let context: OemInteractionDetails
    if (name === 'oem_form_start' || name === 'oem_contact_start') context = {}
    else if (name === 'oem_field_start') context = { field_name: details.field_name }
    else if (name === 'oem_answer') context = {
        question_id: details.question_id ?? details.step_id,
        ...(!details.question_id && !details.step_id ? { step_index: details.step_index } : {}),
        input_type: details.input_type,
    }
    else {
        // Stable IDs survive changes in step order; elapsed time never defines
        // a new interaction when React effects run more than once.
        context = { ...details }
        delete context.elapsed_seconds
        if (details.step_id || details.question_id) delete context.step_index
    }
    return `${name}:${productId ?? ''}:${JSON.stringify(context)}`
}

function queueEvent(event: PendingEvent) {
    const state = getState()
    if (event.once && state.pendingEvents.some(pending => pending.once && pending.dedupeKey === event.dedupeKey)) return
    if (state.pendingEvents.length >= MAX_PENDING_EVENTS) state.pendingEvents.shift()
    state.pendingEvents.push(event)
}

export function isOemAnalyticsPage(location: Pick<Location, 'hostname' | 'pathname'>): boolean {
    return location.hostname === OEM_ANALYTICS_HOST && OEM_ANALYTICS_PATHS.has(location.pathname)
}

function isOemAnalyticsHost(location: Pick<Location, 'hostname'>): boolean {
    return location.hostname === OEM_ANALYTICS_HOST
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
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
        // External paths can contain email addresses or other personal data.
        // Only our reviewed acquisition routes may retain a referrer path.
        const path = url.origin === `https://${OEM_ANALYTICS_HOST}` && OEM_ANALYTICS_PATHS.has(url.pathname) ? url.pathname : ''
        return `${url.origin}${path}`
    } catch {
        return undefined
    }
}

export function resetOemAnalyticsDedupe() {
    if (typeof window === 'undefined') return
    const state = getState()
    state.sentEvents.clear()
    state.sentLegacyEvents.clear()
    state.pendingEvents = []
}

export function getOemInternalTrafficExcluded(): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsHost(window.location)) return false
    try {
        return window.localStorage.getItem(OEM_INTERNAL_TRAFFIC_STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

export function isOemAnalyticsExcluded(): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsHost(window.location)) return false
    return (isOemAnalyticsPage(window.location) && hasOemTestCampaign(window.location.search)) || getOemInternalTrafficExcluded()
}

function setGaDisabledFlag(excluded: boolean) {
    if (typeof window === 'undefined' || !isOemAnalyticsHost(window.location)) return
    const target = window as OemWindow
    if (!target.__oemGaLoaded || !target.__oemGaMeasurementId) return
    ;(target as Window & Record<string, unknown>)[`ga-disable-${target.__oemGaMeasurementId}`] = excluded
}

export function setOemInternalTrafficExcluded(excluded: boolean): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsHost(window.location)) return false
    try {
        if (excluded) window.localStorage.setItem(OEM_INTERNAL_TRAFFIC_STORAGE_KEY, '1')
        else window.localStorage.removeItem(OEM_INTERNAL_TRAFFIC_STORAGE_KEY)
    } catch {
        return false
    }
    if (excluded) clearPending(getState())
    setGaDisabledFlag(isOemAnalyticsExcluded())
    if (typeof window.Event === 'function') window.dispatchEvent?.(new window.Event('oem-internal-traffic-changed'))
    return true
}

function canSend(): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsPage(window.location)) return false
    if (isOemAnalyticsExcluded()) {
        clearPending(getState())
        setGaDisabledFlag(true)
        return false
    }
    return Boolean((window as OemWindow).__oemGaLoaded)
}

export function trackOemEvent(name: OemEventName, productId?: string | null): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsPage(window.location)) return false
    if (isOemAnalyticsExcluded()) { clearPending(getState()); return false }
    if (!productId || !OEM_PRODUCT_IDS.has(productId)) return false
    if (!legacyNames.includes(name)) return false
    const dedupeKey = `${name}:${productId}`
    return sendEvent({ name, productId, once: true, dedupeKey, page: capturePageContext() })
}

export function trackOemInteraction(name: OemInteractionName, productId?: string | null, details: OemInteractionDetails = {}, options: OemInteractionOptions = {}): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsPage(window.location)) return false
    if (isOemAnalyticsExcluded()) { clearPending(getState()); return false }
    if (!interactionNames.includes(name)) return false
    const safe = sanitizeOemInteractionDetails(details)
    if (productId != null && !OEM_PRODUCT_IDS.has(productId)) return false
    if (!productId && name !== 'oem_scroll' && !(name === 'oem_step_view' && safe.step_kind === 'product')) return false
    const product = productId || undefined
    const once = options?.once !== false
    return sendEvent({ name, productId: product, details: safe, once,
        dedupeKey: interactionDedupeKey(name, product, safe), page: capturePageContext() })
}

function sendEvent(event: PendingEvent): boolean {
    const state = getState()
    if (!isOemAnalyticsPage(window.location)) return false
    if (isOemAnalyticsExcluded()) { clearPending(state); setGaDisabledFlag(true); return false }
    const sent = event.details ? state.sentEvents : state.sentLegacyEvents
    if (event.once && sent.has(event.dedupeKey)) return false
    if (!canSend()) { queueEvent(event); return false }
    const gtag = (window as OemWindow).gtag
    if (typeof gtag !== 'function') return false
    const product = event.productId ? { product_id: event.productId, product_name: OEM_PRODUCT_NAMES[event.productId] } : {}
    // Keep the original four event payloads exactly compatible. Detailed
    // events contain only reviewed metadata and a query-free page location.
    const params = event.details ? { ...product, ...event.details,
        page_location: event.page.page_location, page_referrer: event.page.page_referrer ?? '', ...event.page.campaign } : product
    try {
        gtag('event', event.name, params)
        if (event.once) {
            if (event.details && sent.size >= MAX_DEDUPE_EVENTS) sent.delete(sent.values().next().value as string)
            sent.add(event.dedupeKey)
        }
        return true
    } catch {
        return false
    }
}

function sendPageView(page: PageContext): boolean {
    const target = window as OemWindow
    const state = getState()
    if (state.lastPageView === page.page_location || !target.__oemGaMeasurementId || typeof target.gtag !== 'function') return false
    try {
        target.gtag('config', target.__oemGaMeasurementId, {
            send_page_view: false,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            page_location: page.page_location,
            // Explicitly clear an absent referrer instead of retaining a
            // previous route's value in gtag's configuration.
            page_referrer: page.page_referrer ?? '',
            ...page.campaign,
        })
        target.gtag('event', 'page_view', {})
        state.lastPageView = page.page_location
        return true
    } catch {
        return false
    }
}

export function trackOemPageView(): boolean {
    if (typeof window === 'undefined' || !isOemAnalyticsPage(window.location)) return false
    if (isOemAnalyticsExcluded()) { clearPending(getState()); setGaDisabledFlag(true); return false }
    const page = capturePageContext()
    if (!canSend()) { queuePageView(page); return false }
    setGaDisabledFlag(false)
    return sendPageView(page)
}

export function installOemGoogleTag(measurementId: string): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
    if (!isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return Promise.resolve(false)
    const target = window as OemWindow
    const state = getState()
    if (isOemAnalyticsExcluded()) {
        clearPending(state)
        setGaDisabledFlag(true)
        return Promise.resolve(false)
    }
    const page = capturePageContext()
    if (target.__oemGaLoaded) { setGaDisabledFlag(false); return Promise.resolve(true) }
    queuePageView(page)
    if (state.loadingPromise) return state.loadingPromise
    state.loadingPromise = new Promise(resolve => {
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
        target.__oemGaMeasurementId = measurementId.trim()
        const script = document.createElement('script')
        script.async = true
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId.trim())}`
        script.onload = () => {
            const gtag = w.gtag
            if (typeof gtag !== 'function') { state.loadingPromise = null; resolve(false); return }
            if (!isOemAnalyticsPage(window.location) || isOemAnalyticsExcluded()) {
                clearPending(state)
                state.loadingPromise = null
                setGaDisabledFlag(true)
                resolve(false)
                return
            }
            target.__oemGaLoaded = true
            queuePageView(capturePageContext())
            const pages = state.pendingPages
            state.pendingPages = []
            for (const page of pages) sendPageView(page)
            const pending = state.pendingEvents
            state.pendingEvents = []
            for (const event of pending) sendEvent(event)
            state.loadingPromise = null
            resolve(true)
        }
        script.onerror = () => { state.loadingPromise = null; script.remove(); resolve(false) }
        document.head.appendChild(script)
    })
    return state.loadingPromise
}
