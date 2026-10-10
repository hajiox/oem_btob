'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
    installOemGoogleTag,
    isOemAnalyticsPage,
    isValidMeasurementId,
    trackOemInteraction,
    trackOemPageView,
} from '@/lib/oem-analytics'

export default function OemAnalytics({ measurementId }: { measurementId?: string }) {
    const pathname = usePathname()

    useEffect(() => {
        if (!isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return
        let active = true
        void installOemGoogleTag(measurementId).then(loaded => {
            if (active && loaded) trackOemPageView()
        })
        return () => { active = false }
    }, [measurementId, pathname])

    useEffect(() => {
        if (!isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return
        const productId = pathname === '/curry-oem' ? 'c0000001-0000-0000-0000-000000000001'
            : pathname === '/ramen-oem' ? 'c0000001-0000-0000-0000-000000000002' : undefined
        const reached = new Set<number>()
        const onScroll = () => {
            const height = document.documentElement.scrollHeight - window.innerHeight
            // A page that fits in the viewport has not been scrolled.
            if (height <= 0 || window.scrollY <= 0) return
            const percent = Math.min(100, window.scrollY / height * 100)
            for (const threshold of [25, 50, 75, 90] as const) {
                if (percent < threshold || reached.has(threshold)) continue
                reached.add(threshold)
                trackOemInteraction('oem_scroll', productId, { scroll_percent: threshold })
            }
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [measurementId, pathname])

    return null
}
