import type { MetadataRoute } from 'next'
import { OEM_CANONICAL_URL } from '@/lib/oem-seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: OEM_CANONICAL_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${OEM_CANONICAL_URL.replace(/\/$/, '')}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  ]
}
