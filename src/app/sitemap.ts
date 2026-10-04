import type { MetadataRoute } from 'next'
import { OEM_CANONICAL_URL, OEM_SITE_URL } from '@/lib/oem-seo'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: OEM_CANONICAL_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${OEM_SITE_URL}/curry-oem`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${OEM_SITE_URL}/ramen-oem`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${OEM_CANONICAL_URL.replace(/\/$/, '')}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  ]
}
