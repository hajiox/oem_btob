'use client'

import { useEffect } from 'react'
import {
    installOemGoogleTag,
    isOemAnalyticsPage,
    isValidMeasurementId,
} from '@/lib/oem-analytics'

export default function OemAnalytics({ measurementId }: { measurementId?: string }) {
    useEffect(() => {
        if (!isValidMeasurementId(measurementId) || !isOemAnalyticsPage(window.location)) return
        void installOemGoogleTag(measurementId)
    }, [measurementId])

    return null
}
