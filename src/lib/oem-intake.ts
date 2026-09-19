import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'

/** The client key is deliberately opaque and must be generated once per form session. */
export type OemIntakePayload = Record<string, unknown>

export type OemIntakeReservation = {
    status: 'reserved' | 'duplicate' | 'rejected'
    leadId?: string
    retryAfterSeconds?: number
    reason?: 'idempotency_payload_mismatch' | 'rate_limited' | 'invalid_request'
    duplicate?: boolean
}

export type OemIntakeHashSet = {
    payloadHash: string
    emailHash: string
    ipHash: string
}

const HASH_SECRET_ENV = 'SUPABASE_SERVICE_ROLE_KEY'
const DEFAULT_WINDOW_SECONDS = 60 * 60
const DEFAULT_RATE_LIMIT = 5

function hash(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('hex')
}

/** Stable JSON is used so a retried request with the same data has the same digest. */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`
}

export function hashOemValue(value: unknown, secret: string): string {
    return hash(stableStringify(value), secret)
}

export function buildOemIntakeHashes(payload: OemIntakePayload, email: string, ip: string, secret = process.env[HASH_SECRET_ENV]): OemIntakeHashSet {
    if (!secret) throw new Error('OEM intake hash secret is not configured')
    return {
        payloadHash: hashOemValue(payload, secret),
        emailHash: hash(email.trim().toLowerCase(), secret),
        ipHash: hash(ip.trim(), secret),
    }
}

/**
 * Uses the server's trusted proxy headers. The raw IP/email never crosses the RPC
 * boundary; only keyed digests are persisted, so logs and rate-limit rows contain
 * no directly identifying values.
 */
export async function getOemRequestIp(): Promise<string> {
    const requestHeaders = await headers()
    return requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
        || requestHeaders.get('x-real-ip')
        || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
        || 'unknown'
}

export async function reserveOemLead(input: {
    idempotencyKey: string
    payload: OemIntakePayload
    email: string
    lead: Record<string, unknown>
    mailPayloads: { customer: Record<string, unknown>; admin: Record<string, unknown> }
    ip?: string
    windowSeconds?: number
    rateLimit?: number
}): Promise<OemIntakeReservation> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
        return { status: 'rejected', reason: 'invalid_request' }
    }
    const ip = input.ip ?? await getOemRequestIp()
    const hashes = buildOemIntakeHashes(input.payload, input.email, ip)
    const { adminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await adminClient.rpc('reserve_oem_lead', {
        p_idempotency_key: input.idempotencyKey,
        p_payload_hash: hashes.payloadHash,
        p_email_hash: hashes.emailHash,
        p_ip_hash: hashes.ipHash,
        p_lead: input.lead,
        p_mail_payloads: input.mailPayloads,
        p_window_seconds: input.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
        p_rate_limit: input.rateLimit ?? DEFAULT_RATE_LIMIT,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row.status !== 'string') throw new Error('OEM intake reservation returned an invalid response')
    return {
        status: row.status,
        leadId: typeof row.lead_id === 'string' ? row.lead_id : undefined,
        retryAfterSeconds: typeof row.retry_after_seconds === 'number' ? row.retry_after_seconds : undefined,
        reason: row.reason,
        duplicate: row.duplicate === true || row.status === 'duplicate',
    }
}
