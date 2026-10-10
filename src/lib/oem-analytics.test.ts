import assert from 'node:assert/strict'
import test from 'node:test'
import {
    getCanonicalPageLocation,
    getSafeReferrer,
    getSafeCampaign,
    getOemInternalTrafficExcluded,
    hasOemTestCampaign,
    OEM_PRODUCT_IDS,
    OEM_INTERNAL_TRAFFIC_STORAGE_KEY,
    isOemAnalyticsPage,
    isOemAnalyticsExcluded,
    isValidMeasurementId,
    installOemGoogleTag,
    resetOemAnalyticsDedupe,
    sanitizeOemInteractionDetails,
    trackOemEvent,
    trackOemInteraction,
    trackOemPageView,
    setOemInternalTrafficExcluded,
} from './oem-analytics'

test('test campaign detection is exact and does not set persistent state', () => {
    assert.equal(hasOemTestCampaign('?utm_campaign=oem_tracking_test'), true)
    assert.equal(hasOemTestCampaign('?utm_campaign=OEM_TRACKING_TEST'), true)
    assert.equal(hasOemTestCampaign('?utm_campaign=oem_tracking_test_2'), false)
    assert.equal(hasOemTestCampaign('?utm_campaign=oem_tracking_test&utm_campaign=oem_fukushima'), true)
})

test('OEM analytics is restricted to the three public acquisition pages', () => {
    assert.equal(isOemAnalyticsPage({ hostname: 'oem.aizubrandhall.com', pathname: '/btob' }), true)
    assert.equal(isOemAnalyticsPage({ hostname: 'oem.aizubrandhall.com', pathname: '/curry-oem' }), true)
    assert.equal(isOemAnalyticsPage({ hostname: 'oem.aizubrandhall.com', pathname: '/ramen-oem' }), true)
    assert.equal(isOemAnalyticsPage({ hostname: 'oem.aizubrandhall.com', pathname: '/admin' }), false)
    assert.equal(isOemAnalyticsPage({ hostname: 'localhost', pathname: '/btob' }), false)
})

test('measurement IDs and locations are privacy-safe', () => {
    assert.equal(isValidMeasurementId('G-ABC123'), true)
    assert.equal(isValidMeasurementId('UA-ABC'), false)
    assert.equal(getCanonicalPageLocation({ origin: 'https://oem.aizubrandhall.com', pathname: '/btob' }), 'https://oem.aizubrandhall.com/btob')
    assert.equal(getSafeReferrer('https://example.test/source?email=secret#x'), 'https://example.test')
    assert.equal(getSafeReferrer('https://example.test/private@example.com'), 'https://example.test')
    assert.equal(getSafeReferrer('https://oem.aizubrandhall.com/curry-oem?gclid=secret'), 'https://oem.aizubrandhall.com/curry-oem')
    assert.equal(getSafeReferrer('https://oem.aizubrandhall.com/customers/private@example.com'), 'https://oem.aizubrandhall.com')
    assert.equal(getSafeReferrer('not a URL'), undefined)
})

test('campaign attribution accepts only reviewed labels, never arbitrary query data', () => {
    assert.deepEqual(getSafeCampaign('?utm_source=instagram&utm_medium=social&utm_campaign=oem_fukushima&utm_content=profile&email=private@example.com'), {
        campaign_source: 'instagram', campaign_medium: 'social', campaign_name: 'oem_fukushima', campaign_content: 'profile',
    })
    assert.deepEqual(getSafeCampaign('?utm_source=google&utm_medium=cpc&utm_campaign=private@example.com&utm_term=private'), { campaign_source: 'google', campaign_medium: 'cpc' })
    for (const query of ['', '?utm_source=google', '?utm_source=private&utm_medium=social', '?utm_source=google&utm_source=instagram&utm_medium=cpc']) assert.deepEqual(getSafeCampaign(query), {})
})

test('runtime queue, ad-signal denial, dedupe, and PII exclusion are enforced', async () => {
    const calls: unknown[][] = []
    let appendedScript: { onload?: () => void; onerror?: () => void; remove: () => void } | undefined
    type FakeWindow = Window & { dataLayer: IArguments[]; gtag?: (...args: unknown[]) => void; __oemGaLoaded?: boolean }
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/btob', origin: 'https://oem.aizubrandhall.com', search: '?utm_source=instagram&utm_medium=social&utm_campaign=oem_fukushima&email=secret' },
        dataLayer: [] as IArguments[],
    } as unknown as FakeWindow
    const fakeDocument = {
        referrer: 'https://source.example/path?email=do-not-send',
        createElement: () => {
            const script = { onload: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, remove: () => { appendedScript = undefined } }
            appendedScript = script
            return script
        },
        head: { appendChild: () => {} },
    } as unknown as Document
    Object.assign(globalThis, { window: fakeWindow, document: fakeDocument })
    try {
        const loading = installOemGoogleTag('G-TEST123')
        assert.ok(appendedScript)
        const queued = fakeWindow.dataLayer.map(entry => Array.from(entry))
        assert.deepEqual(queued[0]?.slice(0, 2), ['js', queued[0]?.[1]])
        assert.equal(queued[1]?.[0], 'consent')
        appendedScript?.onload?.()
        assert.equal(await loading, true)
        const queuedConfig = fakeWindow.dataLayer.map(entry => Array.from(entry)).find(entry => entry[0] === 'config')
        assert.equal((queuedConfig?.[2] as { allow_google_signals?: boolean }).allow_google_signals, false)
        assert.equal((queuedConfig?.[2] as { allow_ad_personalization_signals?: boolean }).allow_ad_personalization_signals, false)
        assert.equal((queuedConfig?.[2] as { campaign_source?: string }).campaign_source, 'instagram')
        const queuedConsent = fakeWindow.dataLayer.map(entry => Array.from(entry)).find(entry => entry[0] === 'consent')
        assert.equal((queuedConsent?.[2] as { analytics_storage?: string }).analytics_storage, 'granted')
        assert.equal((queuedConsent?.[2] as { ad_storage?: string }).ad_storage, 'denied')
        const originalGtag = fakeWindow.gtag
        fakeWindow.gtag = ((...args: unknown[]) => calls.push(args)) as unknown as typeof fakeWindow.gtag
        fakeWindow.__oemGaLoaded = true
        resetOemAnalyticsDedupe()
        assert.equal(trackOemEvent('oem_select_product', 'c0000001-0000-0000-0000-000000000001'), true)
        assert.equal(trackOemEvent('oem_select_product', 'c0000001-0000-0000-0000-000000000001'), false)
        const curry = 'c0000001-0000-0000-0000-000000000001'
        assert.equal(trackOemEvent('oem_view_quote', curry), true)
        assert.equal(trackOemEvent('oem_view_quote', curry), false)
        assert.equal(trackOemEvent('oem_view_quote'), false)
        assert.equal(trackOemEvent('generate_lead', 'invalid'), false)
        for (const product of OEM_PRODUCT_IDS) {
            for (const event of ['oem_start_consultation', 'generate_lead'] as const) {
                assert.equal(trackOemEvent(event, product), true)
                assert.equal(trackOemEvent(event, product), false)
                const payload = calls.at(-1)?.[2] as { product_id: string; product_name: string }
                assert.equal(payload.product_id, product)
                assert.ok(payload.product_name)
            }
        }
        resetOemAnalyticsDedupe()
        fakeWindow.__oemGaLoaded = false
        assert.equal(trackOemEvent('oem_select_product', curry), false)
        assert.equal(JSON.stringify([...fakeWindow.dataLayer.map(entry => Array.from(entry)), ...calls]).includes('email'), false)
        fakeWindow.gtag = originalGtag
    } finally {
        delete (globalThis as { window?: unknown }).window
        delete (globalThis as { document?: unknown }).document
    }
})

test('internal exclusion is explicit, host-scoped, and suppresses test campaigns', () => {
    const storage = new Map<string, string>()
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/btob', search: '?utm_campaign=oem_tracking_test' },
        localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    } as unknown as Window
    Object.assign(globalThis, { window: fakeWindow })
    try {
        assert.equal(isOemAnalyticsExcluded(), true)
        assert.equal(getOemInternalTrafficExcluded(), false)
        assert.equal(setOemInternalTrafficExcluded(true), true)
        assert.equal(storage.get(OEM_INTERNAL_TRAFFIC_STORAGE_KEY), '1')
        assert.equal(setOemInternalTrafficExcluded(false), true)
        assert.equal(getOemInternalTrafficExcluded(), false)
        assert.equal(storage.has(OEM_INTERNAL_TRAFFIC_STORAGE_KEY), false)
        Object.assign(fakeWindow.location, { hostname: 'example.test', search: '' })
        assert.equal(setOemInternalTrafficExcluded(true), false)
        assert.equal(storage.has(OEM_INTERNAL_TRAFFIC_STORAGE_KEY), false)
    } finally {
        delete (globalThis as { window?: unknown }).window
    }
})

test('internal exclusion settings work on the host settings route and protect storage failures', () => {
    const storage = new Map<string, string>()
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/analytics-settings', search: '' },
        localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
        __oemGaLoaded: true,
        __oemGaMeasurementId: 'G-TEST123',
        dispatchEvent: () => true,
    } as unknown as Window & { __oemGaLoaded: boolean; __oemGaMeasurementId: string }
    Object.assign(globalThis, { window: fakeWindow })
    try {
        assert.equal(getOemInternalTrafficExcluded(), false)
        assert.equal(setOemInternalTrafficExcluded(true), true)
        assert.equal(getOemInternalTrafficExcluded(), true)
        assert.equal((fakeWindow as unknown as Window & Record<string, unknown>)['ga-disable-G-TEST123'], true)
        assert.equal(setOemInternalTrafficExcluded(false), true)
        assert.equal(getOemInternalTrafficExcluded(), false)
        assert.equal((fakeWindow as unknown as Window & Record<string, unknown>)['ga-disable-G-TEST123'], false)

        const throwingWindow = { ...fakeWindow, localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } } } as unknown as Window
        Object.assign(globalThis, { window: throwingWindow })
        assert.equal(getOemInternalTrafficExcluded(), false)
        assert.equal(setOemInternalTrafficExcluded(true), false)
    } finally {
        delete (globalThis as { window?: unknown }).window
    }
})

test('excluded test campaign does not create a GA script or queue', async () => {
    let created = 0
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/curry-oem', search: '?utm_campaign=oem_tracking_test' },
    } as unknown as Window
    const fakeDocument = {
        createElement: () => { created += 1; throw new Error('GA script must not be created') },
    } as unknown as Document
    Object.assign(globalThis, { window: fakeWindow, document: fakeDocument })
    try {
        assert.equal(await installOemGoogleTag('G-TEST123'), false)
        assert.equal(created, 0)
        assert.equal((fakeWindow as Window & { dataLayer?: unknown }).dataLayer, undefined)
    } finally {
        delete (globalThis as { window?: unknown }).window
        delete (globalThis as { document?: unknown }).document
    }
})

test('excluded generate_lead is not buffered for later replay', () => {
    const calls: unknown[][] = []
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/btob', search: '?utm_campaign=oem_tracking_test' },
        gtag: (...args: unknown[]) => calls.push(args),
        __oemGaLoaded: true,
    } as unknown as Window & { gtag: (...args: unknown[]) => void; __oemGaLoaded: boolean }
    Object.assign(globalThis, { window: fakeWindow })
    try {
        resetOemAnalyticsDedupe()
        const product = 'c0000001-0000-0000-0000-000000000001'
        assert.equal(trackOemEvent('generate_lead', product), false)
        Object.assign(fakeWindow.location, { search: '' })
        assert.equal(trackOemEvent('generate_lead', product), true)
        assert.equal(calls.length, 1)
    } finally {
        delete (globalThis as { window?: unknown }).window
    }
})

const curry = 'c0000001-0000-0000-0000-000000000001'
const question = 'd0000001-0000-0000-0000-000000000001'

function withAnalyticsBrowser(run: (browser: ReturnType<typeof analyticsBrowser>) => void | Promise<void>) {
    const browser = analyticsBrowser()
    Object.assign(globalThis, { window: browser.window, document: browser.document })
    return Promise.resolve().then(() => run(browser)).finally(() => {
        delete (globalThis as { window?: unknown }).window
        delete (globalThis as { document?: unknown }).document
    })
}

function analyticsBrowser() {
    const calls: unknown[][] = []
    const scripts: { onload?: () => void; onerror?: () => void; remove: () => void }[] = []
    const storage = new Map<string, string>()
    const window = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/curry-oem', origin: 'https://oem.aizubrandhall.com', search: '?utm_source=google&utm_medium=cpc&utm_campaign=oem_pmax_fukushima&utm_content=curry&gclid=secret&email=private@example.com' },
        localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
        gtag: (...args: unknown[]) => calls.push(args),
        __oemGaLoaded: false,
        __oemGaMeasurementId: 'G-TEST123',
    }
    const document = {
        referrer: 'https://source.example/ad?email=secret&gclid=secret#secret',
        createElement: () => {
            const script = { onload: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, remove: () => {} }
            scripts.push(script)
            return script
        },
        head: { appendChild: () => {} },
    }
    return { window, document, calls, scripts, storage }
}

test('interaction sanitizer accepts reviewed metadata and drops values, labels, PII and malformed numbers', () => {
    assert.deepEqual(sanitizeOemInteractionDetails({
        step_id: question.toUpperCase(), question_id: question, step_index: 100, step_kind: 'question',
        field_name: 'email', input_type: 'select_text_extra', action: 'change', error_type: 'required',
        elapsed_seconds: 86400, scroll_percent: 90, cta_location: 'sticky',
        value: 'private@example.com', answer: 'secret', label: 'secret', price: 123, request_id: question,
        gclid: 'secret', page_location: 'https://example.test/?email=secret',
    }), {
        step_id: question, question_id: question, step_index: 100, elapsed_seconds: 86400,
        step_kind: 'question', field_name: 'email', input_type: 'select_text_extra', action: 'change',
        error_type: 'required', cta_location: 'sticky', scroll_percent: 90,
    })
    for (const value of [-1, 101, 1.5, NaN, Infinity, '1']) assert.equal(sanitizeOemInteractionDetails({ step_index: value }).step_index, undefined)
    for (const value of [-1, 86401, 1.5, NaN, '60']) assert.equal(sanitizeOemInteractionDetails({ elapsed_seconds: value }).elapsed_seconds, undefined)
    for (const details of [null, 'secret', { step_id: 'private@example.com', question_id: 'question-1', input_type: 'private', field_name: 'password', scroll_percent: '25', action: 'submit', error_type: 'secret' }]) assert.deepEqual(sanitizeOemInteractionDetails(details), {})
    assert.equal(getSafeReferrer('javascript:alert(1)'), undefined)
})

test('interaction dedupe follows stable questions, field names and deliberate repeat options', () => withAnalyticsBrowser(({ window, calls }) => {
    window.__oemGaLoaded = true
    assert.equal(trackOemInteraction('oem_step_view', curry, { step_id: question, step_index: 1, step_kind: 'question', elapsed_seconds: 1 }), true)
    assert.equal(trackOemInteraction('oem_step_view', curry, { step_id: question, step_index: 2, step_kind: 'question', elapsed_seconds: 20 }), false)
    assert.equal(trackOemInteraction('oem_answer', curry, { question_id: question, input_type: 'text', action: 'select' }), true)
    assert.equal(trackOemInteraction('oem_answer', curry, { question_id: question, input_type: 'text', action: 'change', elapsed_seconds: 5 }), false)
    assert.equal(trackOemInteraction('oem_answer', curry, { question_id: question, input_type: 'number', action: 'change' }), true)
    assert.equal(trackOemInteraction('oem_answer', curry, { question_id: question, input_type: 'text', action: 'change' }, { once: false }), true)
    assert.equal(trackOemInteraction('oem_answer', curry, { question_id: question, input_type: 'text', action: 'clear' }, { once: false }), true)
    assert.equal(trackOemInteraction('oem_form_start', curry, { step_kind: 'question' }), true)
    assert.equal(trackOemInteraction('oem_form_start', curry, { step_kind: 'contact', field_name: 'email' }), false)
    assert.equal(trackOemInteraction('oem_contact_start', curry, { field_name: 'email' }), true)
    assert.equal(trackOemInteraction('oem_contact_start', curry, { field_name: 'phone' }), false)
    assert.equal(trackOemInteraction('oem_field_start', curry, { field_name: 'email', step_kind: 'contact' }), true)
    assert.equal(trackOemInteraction('oem_field_start', curry, { field_name: 'email', step_kind: 'complete' }), false)
    assert.equal(trackOemInteraction('oem_field_start', curry, { field_name: 'phone' }), true)
    assert.equal(trackOemInteraction('oem_scroll', null, { scroll_percent: 25 }), true)
    assert.equal(trackOemInteraction('oem_scroll', null, { scroll_percent: 25 }), false)
    assert.equal(trackOemInteraction('oem_scroll', null, { scroll_percent: 50 }), true)
    assert.equal(trackOemInteraction('oem_step_view', null, { step_kind: 'product' }), true)
    assert.equal(trackOemInteraction('oem_step_view', null, { step_kind: 'question' }), false)
    assert.equal(trackOemInteraction('oem_submit_attempt', null), false)
    assert.equal(trackOemInteraction('oem_scroll', 'invalid', { scroll_percent: 75 }), false)
    assert.equal(trackOemInteraction('unknown' as Parameters<typeof trackOemInteraction>[0], curry), false)
    assert.equal(JSON.stringify(calls).includes('private@example.com'), false)
}))

test('pending interactions retain sanitized snapshots and deliberate repeats while loading', () => withAnalyticsBrowser(async ({ window, calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    assert.equal(installOemGoogleTag('G-TEST123'), loading)
    assert.equal(scripts.length, 1)
    const details = { question_id: question, step_kind: 'question' as const, input_type: 'text' as const, elapsed_seconds: 3, value: 'private@example.com' }
    assert.equal(trackOemInteraction('oem_answer', curry, details), false)
    assert.equal(trackOemInteraction('oem_answer', curry, { ...details, elapsed_seconds: 4 }), false)
    assert.equal(trackOemInteraction('oem_step_back', curry, { question_id: question, action: 'back' }, { once: false }), false)
    assert.equal(trackOemInteraction('oem_step_back', curry, { question_id: question, action: 'back' }, { once: false }), false)
    details.elapsed_seconds = 50
    details.question_id = curry
    Object.assign(window.location, { pathname: '/btob', search: '' })
    scripts[0].onload?.()
    assert.equal(await loading, true)
    const answerCalls = calls.filter(call => call[0] === 'event' && call[1] === 'oem_answer')
    assert.equal(answerCalls.length, 1)
    assert.equal((answerCalls[0][2] as Record<string, unknown>).question_id, question)
    assert.equal((answerCalls[0][2] as Record<string, unknown>).elapsed_seconds, 3)
    assert.equal((answerCalls[0][2] as Record<string, unknown>).page_location, 'https://oem.aizubrandhall.com/curry-oem')
    assert.equal((answerCalls[0][2] as Record<string, unknown>).page_referrer, 'https://source.example')
    const finalConfig = calls.filter(call => call[0] === 'config').at(-1)?.[2] as Record<string, unknown>
    assert.equal(finalConfig.page_location, 'https://oem.aizubrandhall.com/btob')
    assert.equal(finalConfig.page_referrer, 'https://oem.aizubrandhall.com/curry-oem')
    assert.equal(calls.filter(call => call[1] === 'oem_step_back').length, 2)
    assert.equal(JSON.stringify(calls).includes('private@example.com'), false)
    assert.equal(JSON.stringify(calls).includes('gclid'), false)
}))

test('loading interaction buffer is bounded and preserves recent submission events', () => withAnalyticsBrowser(async ({ calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    for (let index = 0; index < 250; index++) trackOemInteraction('oem_step_back', curry, { elapsed_seconds: index }, { once: false })
    trackOemInteraction('oem_submit_attempt', curry, {}, { once: false })
    scripts[0].onload?.()
    assert.equal(await loading, true)
    const interactions = calls.filter(call => call[0] === 'event' && call[1] !== 'page_view')
    assert.equal(interactions.length, 200)
    assert.equal((interactions[0][2] as Record<string, unknown>).elapsed_seconds, 51)
    assert.equal(interactions.at(-1)?.[1], 'oem_submit_attempt')
}))

test('SPA pageviews update canonical context once per navigation and preserve approved inbound attribution', () => withAnalyticsBrowser(async ({ window, calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    scripts[0].onload?.()
    assert.equal(await loading, true)
    assert.equal(trackOemPageView(), false)
    Object.assign(window.location, { pathname: '/btob', search: '?email=private@example.com&gclid=secret' })
    assert.equal(trackOemPageView(), true)
    assert.equal(trackOemPageView(), false)
    Object.assign(window.location, { pathname: '/curry-oem', search: '' })
    assert.equal(trackOemPageView(), true)
    const configs = calls.filter(call => call[0] === 'config').map(call => call[2] as Record<string, unknown>)
    assert.deepEqual(configs.map(config => config.page_location), [
        'https://oem.aizubrandhall.com/curry-oem', 'https://oem.aizubrandhall.com/btob', 'https://oem.aizubrandhall.com/curry-oem',
    ])
    assert.deepEqual(configs.map(config => config.page_referrer), ['https://source.example', 'https://oem.aizubrandhall.com/curry-oem', 'https://oem.aizubrandhall.com/btob'])
    for (const config of configs) {
        assert.equal(config.campaign_name, 'oem_pmax_fukushima')
        assert.equal(config.campaign_content, 'curry')
        assert.equal(config.allow_google_signals, false)
        assert.equal(config.allow_ad_personalization_signals, false)
        assert.equal(config.send_page_view, false)
    }
    assert.equal(calls.filter(call => call[0] === 'event' && call[1] === 'page_view').length, 3)
    assert.equal(JSON.stringify(calls).includes('secret'), false)
    assert.equal(JSON.stringify(calls).includes('private@example.com'), false)
}))

test('navigation while the script loads retains ordered pageviews and does not duplicate its callback view', () => withAnalyticsBrowser(async ({ window, calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    Object.assign(window.location, { pathname: '/btob', search: '' })
    assert.equal(installOemGoogleTag('G-TEST123'), loading)
    scripts[0].onload?.()
    assert.equal(await loading, true)
    assert.equal(trackOemPageView(), false)
    assert.deepEqual(calls.filter(call => call[0] === 'config').map(call => (call[2] as Record<string, unknown>).page_location), [
        'https://oem.aizubrandhall.com/curry-oem', 'https://oem.aizubrandhall.com/btob',
    ])
}))

test('internal and test exclusions discard pending detail events and pageviews without replay', () => withAnalyticsBrowser(async ({ window, calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    trackOemInteraction('oem_submit_attempt', curry)
    assert.equal(setOemInternalTrafficExcluded(true), true)
    scripts[0].onload?.()
    assert.equal(await loading, false)
    assert.equal(calls.some(call => call[0] === 'config'), false)
    assert.equal(calls.some(call => call[0] === 'event'), false)
    assert.equal(setOemInternalTrafficExcluded(false), true)
    const retry = installOemGoogleTag('G-TEST123')
    scripts[1].onload?.()
    assert.equal(await retry, true)
    assert.equal(calls.some(call => call[1] === 'oem_submit_attempt'), false)
    Object.assign(window.location, { search: '?utm_campaign=oem_tracking_test' })
    assert.equal(trackOemInteraction('oem_scroll', null, { scroll_percent: 25 }), false)
    assert.equal(trackOemPageView(), false)
    Object.assign(window.location, { pathname: '/admin', search: '' })
    assert.equal(trackOemInteraction('oem_submit_attempt', curry), false)
    assert.equal(trackOemPageView(), false)
}))

test('loading on an excluded route does not configure GA or replay actions', () => withAnalyticsBrowser(async ({ window, calls, scripts }) => {
    const loading = installOemGoogleTag('G-TEST123')
    trackOemEvent('generate_lead', curry)
    trackOemInteraction('oem_submit_attempt', curry)
    Object.assign(window.location, { pathname: '/admin', search: '' })
    scripts[0].onload?.()
    assert.equal(await loading, false)
    assert.equal(calls.some(call => call[0] === 'config' || call[0] === 'event'), false)
}))
