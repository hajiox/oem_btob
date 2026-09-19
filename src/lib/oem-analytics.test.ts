import assert from 'node:assert/strict'
import test from 'node:test'
import {
    OEM_ANALYTICS_CONSENT_KEY,
    getCanonicalPageLocation,
    getSafeReferrer,
    isOemAnalyticsPage,
    isValidMeasurementId,
    readOemConsent,
    installOemGoogleTag,
    resetOemAnalyticsDedupe,
    saveOemConsent,
    trackOemEvent,
    updateOemGoogleConsent,
} from './oem-analytics'

test('OEM analytics is restricted to the canonical public page', () => {
    assert.equal(isOemAnalyticsPage({ hostname: 'oem.aizubrandhall.com', pathname: '/btob' }), true)
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

test('consent storage accepts only explicit choices and survives storage errors', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) } }
    assert.equal(readOemConsent(storage), null)
    assert.equal(saveOemConsent(storage, 'rejected'), true)
    assert.equal(values.get(OEM_ANALYTICS_CONSENT_KEY), 'rejected')
    assert.equal(readOemConsent(storage), 'rejected')
    assert.equal(saveOemConsent({ setItem: () => { throw new Error('blocked') } }, 'accepted'), false)
})

test('runtime queue, consent race, dedupe, and PII exclusion are enforced', async () => {
    const values = new Map<string, string>([['oem-ga4-consent-v1', 'accepted']])
    const calls: unknown[][] = []
    let appendedScript: { onload?: () => void; onerror?: () => void; remove: () => void } | undefined
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) } }
    type FakeWindow = Window & { dataLayer: IArguments[]; gtag?: (...args: unknown[]) => void; __oemGaLoaded?: boolean }
    const fakeWindow = {
        location: { hostname: 'oem.aizubrandhall.com', pathname: '/btob', origin: 'https://oem.aizubrandhall.com' },
        localStorage: storage,
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
        values.set('oem-ga4-consent-v1', 'rejected')
        appendedScript?.onload?.()
        assert.equal(await loading, false)
        values.set('oem-ga4-consent-v1', 'accepted')
        const resumed = installOemGoogleTag('G-TEST123')
        assert.ok(appendedScript)
        appendedScript?.onload?.()
        assert.equal(await resumed, true)
        const queuedConfig = fakeWindow.dataLayer.map(entry => Array.from(entry)).find(entry => entry[0] === 'config')
        assert.equal((queuedConfig?.[2] as { allow_google_signals?: boolean }).allow_google_signals, false)
        assert.equal((queuedConfig?.[2] as { allow_ad_personalization_signals?: boolean }).allow_ad_personalization_signals, false)
        const originalGtag = fakeWindow.gtag
        fakeWindow.gtag = ((...args: unknown[]) => calls.push(args)) as unknown as typeof fakeWindow.gtag
        fakeWindow.__oemGaLoaded = true
        resetOemAnalyticsDedupe()
        assert.equal(trackOemEvent('oem_select_product', 'c0000001-0000-0000-0000-000000000001'), true)
        assert.equal(trackOemEvent('oem_select_product', 'c0000001-0000-0000-0000-000000000001'), false)
        assert.equal(trackOemEvent('oem_view_quote'), true)
        assert.equal(trackOemEvent('oem_view_quote'), false)
        updateOemGoogleConsent('G-TEST123', 'rejected')
        assert.equal(trackOemEvent('generate_lead'), false)
        assert.equal(JSON.stringify([...fakeWindow.dataLayer.map(entry => Array.from(entry)), ...calls]).includes('email'), false)
        fakeWindow.gtag = originalGtag
    } finally {
        delete (globalThis as { window?: unknown }).window
        delete (globalThis as { document?: unknown }).document
    }
})
