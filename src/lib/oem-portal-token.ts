import 'server-only'

import { randomBytes, createHash } from 'node:crypto'

export const OEM_PORTAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const OEM_PORTAL_MAX_DAYS = 90

export function createPortalToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: createHash('sha256').update(token, 'utf8').digest('hex') }
}

export function portalTokenHash(token: unknown): string | null {
  return typeof token === 'string' && OEM_PORTAL_TOKEN_PATTERN.test(token)
    ? createHash('sha256').update(token, 'utf8').digest('hex')
    : null
}

export function portalExpiry(days = OEM_PORTAL_MAX_DAYS) {
  const bounded = Math.max(1, Math.min(OEM_PORTAL_MAX_DAYS, Math.trunc(days)))
  return new Date(Date.now() + bounded * 24 * 60 * 60 * 1000).toISOString()
}
