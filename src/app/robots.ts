import type { MetadataRoute } from 'next'
import { OEM_SITE_URL } from '@/lib/oem-seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/'], disallow: ['/admin', '/api'] }],
    sitemap: `${OEM_SITE_URL}/sitemap.xml`,
  }
}
