import { adminClient } from '@/lib/supabase/admin'

const TSG_ENDPOINT = 'https://v0-line-blush.vercel.app/api/integrations/oem/consultation-received'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type OemTsgPayload = {
    schemaVersion: 1
    event: 'consultation_received'
    sourceKey: string
    leadId: string
    receivedAt: string
    companyName: string
    productName: string
    quantityLabel: string
    estimatedTotalPrice: number
}

const PAYLOAD_KEYS = ['schemaVersion', 'event', 'sourceKey', 'leadId', 'receivedAt', 'companyName', 'productName', 'quantityLabel', 'estimatedTotalPrice']

/** Only the immutable intake snapshot may cross this integration boundary. */
export function validateOemTsgPayload(input: unknown): OemTsgPayload {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_notification_payload')
    const row = input as Record<string, unknown>
    const keys = Object.keys(row)
    const validText = (value: unknown) => typeof value === 'string' && value.trim().length > 0
        && Array.from(value).length <= 200 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    if (keys.length !== PAYLOAD_KEYS.length || keys.some(key => !PAYLOAD_KEYS.includes(key))
        || row.schemaVersion !== 1 || row.event !== 'consultation_received'
        || typeof row.leadId !== 'string' || !UUID.test(row.leadId)
        || row.sourceKey !== `oem:consultation:${row.leadId}:received:v1`
        || typeof row.receivedAt !== 'string' || row.receivedAt.length > 40
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.receivedAt)
        || !Number.isFinite(Date.parse(row.receivedAt))
        || !validText(row.companyName) || !validText(row.productName) || !validText(row.quantityLabel)
        || typeof row.estimatedTotalPrice !== 'number' || !Number.isSafeInteger(row.estimatedTotalPrice) || row.estimatedTotalPrice < 0) {
        throw new Error('invalid_notification_payload')
    }
    return row as OemTsgPayload
}

type DeliveryResult = { postId?: string; errorCode?: string; retryable: boolean }
export type OemTsgDispatchResult = { enabled: boolean; claimed: number; sent: number; retried: number; blocked: number }

async function send(payload: OemTsgPayload, secret: string): Promise<DeliveryResult> {
    try {
        const response = await fetch(TSG_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
        })
        if (response.status !== 200 && response.status !== 201) {
            return { errorCode: `tsg_http_${response.status}`, retryable: ![400, 409, 422].includes(response.status) }
        }
        const result: unknown = await response.json()
        if (!result || typeof result !== 'object') return { errorCode: 'tsg_invalid_response', retryable: true }
        const body = result as Record<string, unknown>
        if (body.success !== true || typeof body.postId !== 'string' || !UUID.test(body.postId) || typeof body.duplicate !== 'boolean') {
            return { errorCode: 'tsg_invalid_response', retryable: true }
        }
        return { postId: body.postId, retryable: false }
    } catch {
        // A response can be lost after TSG commits. Every retry reuses the same
        // sourceKey and snapshot; the receiver must deduplicate atomically.
        return { errorCode: 'tsg_connection_error', retryable: true }
    }
}

export async function dispatchOemTsgNotifications(input: { leadId?: string; limit?: number } = {}): Promise<OemTsgDispatchResult> {
    const summary: OemTsgDispatchResult = { enabled: false, claimed: 0, sent: 0, retried: 0, blocked: 0 }
    // Preview builds can share the OEM DB, so they must never deliver live notices.
    if (process.env.OEM_TSG_NOTIFICATIONS_ENABLED !== 'true'
        || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')) return summary
    const secret = process.env.OEM_TSG_NOTIFICATION_SECRET?.trim()
    if (!secret || secret.length < 32) throw new Error('tsg_notification_not_configured')
    if (input.leadId !== undefined && !UUID.test(input.leadId)) throw new Error('invalid_notification_lead')
    const limit = input.leadId ? 1 : Math.min(10, Math.max(1, Number.isFinite(input.limit) ? Math.floor(input.limit!) : 10))
    summary.enabled = true
    for (let index = 0; index < limit; index++) {
        const { data, error } = await adminClient.rpc('claim_oem_tsg_notification', { p_lead_id: input.leadId ?? null })
        if (error) throw new Error('tsg_notification_claim_failed')
        const delivery = data?.[0]
        if (!delivery) break
        summary.claimed++
        let result: DeliveryResult
        try {
            const payload = validateOemTsgPayload(delivery.payload)
            if (payload.leadId !== delivery.lead_id || payload.sourceKey !== delivery.source_key) throw new Error('invalid_notification_payload')
            result = await send(payload, secret)
        } catch {
            result = { errorCode: 'invalid_notification_payload', retryable: false }
        }
        const finished = await adminClient.rpc('finish_oem_tsg_notification', {
            p_id: delivery.id,
            p_lease_token: delivery.lease_token,
            p_post_id: result.postId ?? null,
            p_error_code: result.errorCode ?? null,
            p_retryable: result.retryable,
        })
        if (finished.error || finished.data !== true) throw new Error('tsg_notification_status_save_failed')
        if (result.postId) summary.sent++
        else if (result.retryable) summary.retried++
        else summary.blocked++
    }
    return summary
}
