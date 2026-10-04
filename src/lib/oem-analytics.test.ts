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
    trackOemEvent,
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
    assert.equal(getSafeReferrer('https://example.test/source?email=secret#x'), 'https://example.test/source')
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
