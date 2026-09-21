'use client'

import { useEffect, useState } from 'react'
import {
    OEM_ANALYTICS_CONSENT_KEY,
    installOemGoogleTag,
    isOemAnalyticsPage,
    isValidMeasurementId,
    readOemConsent,
    saveOemConsent,
    updateOemGoogleConsent,
    type OemConsent,
} from '@/lib/oem-analytics'

export default function OemAnalytics({ measurementId }: { measurementId?: string }) {
    const [consent, setConsent] = useState<OemConsent | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        // Consent is read after hydration so a stored choice never changes server HTML.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true)
        if (isOemAnalyticsPage(window.location)) {
            try { setConsent(readOemConsent(window.localStorage)) } catch { setConsent(null) }
        }
    }, [])

    useEffect(() => {
        if (!mounted || consent !== 'accepted' || !isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return
        void installOemGoogleTag(measurementId)
    }, [consent, measurementId, mounted])

    const choose = (next: OemConsent) => {
        try { saveOemConsent(window.localStorage, next) } catch { /* blocked storage: keep this choice in memory */ }
        if (isValidMeasurementId(measurementId)) updateOemGoogleConsent(measurementId, next)
        setConsent(next)
    }

    const reopen = () => {
        if (isValidMeasurementId(measurementId)) updateOemGoogleConsent(measurementId, 'rejected')
        try { window.localStorage.removeItem(OEM_ANALYTICS_CONSENT_KEY) } catch {}
        setConsent(null)
    }

    if (!mounted || !isOemAnalyticsPage(typeof window === 'undefined' ? { hostname: '', pathname: '' } : window.location)) return null
    if (consent) {
        return (
            <button type="button" onClick={reopen} style={{ display: 'inline-block', marginTop: 12, border: 0, background: 'transparent', color: '#64748b', padding: '8px 12px', fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
                アクセス解析の設定
            </button>
        )
    }
    return (
        <aside role="dialog" aria-label="アクセス解析の設定" style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 70, padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.2)', background: '#0f172a', color: '#e2e8f0', boxShadow: '0 12px 32px rgba(0,0,0,.3)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6 }}>サイト改善のため、Google Analyticsによるアクセス解析を利用します。広告向けの利用は行わず、個人情報やフォーム内容は送信しません。</p>
            <details style={{ fontSize: 12, marginBottom: 12 }}><summary style={{ cursor: 'pointer' }}>プライバシーについて</summary><p style={{ margin: '8px 0 0', lineHeight: 1.6 }}>同意後のみGoogleのCookie等を使い、流入元、選択商品、見積もり表示、相談開始・送信完了を測定します。広告配信・個人向け広告には利用せず、氏名・連絡先・相談内容は送信しません。いつでもページ下部の「アクセス解析の設定」から変更できます。</p></details>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => choose('rejected')} style={{ border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, background: 'transparent', color: '#e2e8f0', padding: '9px 14px', cursor: 'pointer' }}>利用しない</button>
                <button type="button" onClick={() => choose('accepted')} style={{ border: '1px solid #818cf8', borderRadius: 8, background: '#4f46e5', color: '#fff', padding: '9px 14px', cursor: 'pointer' }}>同意する</button>
            </div>
        </aside>
    )
}
