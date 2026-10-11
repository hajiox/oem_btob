'use client'

import { useSyncExternalStore } from 'react'
import { getOemNavigationSearch } from '@/lib/oem-analytics'

function subscribe(onChange: () => void) {
    window.addEventListener('popstate', onChange)
    window.addEventListener('hashchange', onChange)
    return () => {
        window.removeEventListener('popstate', onChange)
        window.removeEventListener('hashchange', onChange)
    }
}

const getSnapshot = () => getOemNavigationSearch(window.location.search)
const getServerSnapshot = () => ''

export default function useOemNavigationSearch() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
