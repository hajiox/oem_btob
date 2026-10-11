'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackOemInteraction } from '@/lib/oem-analytics'
import useOemNavigationSearch from '@/components/useOemNavigationSearch'

export default function OemConsultationLink({ product, location, className, children }: {
    product?: 'curry' | 'ramen'
    location: 'hero' | 'offer' | 'footer' | 'sticky'
    className?: string
    children: ReactNode
}) {
    const campaignSearch = useOemNavigationSearch()
    const productId = product === 'curry' ? 'c0000001-0000-0000-0000-000000000001'
        : product === 'ramen' ? 'c0000001-0000-0000-0000-000000000002' : undefined
    const query = new URLSearchParams(campaignSearch)
    if (product) query.set('product', product)

    return <Link href={`/btob/consult${query.size ? `?${query}` : ''}`} className={className}
        onClick={() => trackOemInteraction('oem_cta_click', productId, { cta_location: location, inquiry_type: 'direct' })}>
        {children}
    </Link>
}
