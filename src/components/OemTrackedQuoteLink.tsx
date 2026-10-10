'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackOemInteraction } from '@/lib/oem-analytics'

export default function OemTrackedQuoteLink({ product, location, className, children }: {
    product: 'curry' | 'ramen'
    location: 'hero' | 'footer'
    className?: string
    children: ReactNode
}) {
    const productId = product === 'curry' ? 'c0000001-0000-0000-0000-000000000001'
        : 'c0000001-0000-0000-0000-000000000002'
    return <Link href={`/btob?product=${product}#bto-form`} className={className}
        onClick={() => trackOemInteraction('oem_cta_click', productId, { cta_location: location })}>
        {children}
    </Link>
}
