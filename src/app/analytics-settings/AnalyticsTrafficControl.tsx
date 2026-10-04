'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import {
    getOemInternalTrafficExcluded,
    OEM_INTERNAL_TRAFFIC_STORAGE_KEY,
    setOemInternalTrafficExcluded,
} from '@/lib/oem-analytics'
import styles from './AnalyticsSettings.module.css'

function subscribe(onChange: () => void) {
    function handleStorage(event: StorageEvent) {
        if (event.key === OEM_INTERNAL_TRAFFIC_STORAGE_KEY || event.key === null) onChange()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('oem-internal-traffic-changed', onChange)
    return () => {
        window.removeEventListener('storage', handleStorage)
        window.removeEventListener('oem-internal-traffic-changed', onChange)
    }
}

export default function AnalyticsTrafficControl() {
    const excluded = useSyncExternalStore(subscribe, getOemInternalTrafficExcluded, () => false)
    const [error, setError] = useState('')

    function update(exclude: boolean) {
        if (!setOemInternalTrafficExcluded(exclude)) {
            setError('設定を保存できませんでした。OEMの本番サイトで開き、ブラウザーの保存機能を許可して再度お試しください。')
            return
        }
        setError('')
    }

    return (
        <div>
            <div role="status" aria-live="polite" className={`${styles.status} ${excluded ? styles.excluded : ''}`}>
                {excluded ? 'このブラウザーは集計から除外されています。' : 'このブラウザーは通常どおり集計されます。'}
            </div>
            <button
                type="button"
                onClick={() => update(!excluded)}
                className={styles.button}
            >
                {excluded ? '通常の集計に戻す' : 'このブラウザーを集計から除外'}
            </button>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <Link href="/btob" className={styles.link}>
                OEMサイトを開く →
            </Link>
        </div>
    )
}
