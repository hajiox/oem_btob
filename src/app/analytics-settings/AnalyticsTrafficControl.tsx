'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import {
    getOemInternalTrafficExcluded,
    OEM_INTERNAL_TRAFFIC_STORAGE_KEY,
    setOemInternalTrafficExcluded,
} from '@/lib/oem-analytics'

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
            <div role="status" aria-live="polite" className={`mb-5 rounded-xl border p-4 text-sm font-semibold ${excluded ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {excluded ? 'このブラウザーは集計から除外されています。' : 'このブラウザーは通常どおり集計されます。'}
            </div>
            <button
                type="button"
                onClick={() => update(!excluded)}
                className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            >
                {excluded ? '通常の集計に戻す' : 'このブラウザーを集計から除外'}
            </button>
            {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{error}</p>}
            <Link href="/btob" className="mt-5 inline-block text-sm font-semibold text-emerald-800 underline underline-offset-4">
                OEMサイトを開く →
            </Link>
        </div>
    )
}
