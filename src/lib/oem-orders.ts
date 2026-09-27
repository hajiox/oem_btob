import 'server-only'

import { createHash, createHmac } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { stableStringify } from '@/lib/oem-intake'
import type { OemOrderStatus } from '@/lib/oem-order-shared'

export const OEM_ORDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const OEM_ORDER_EXPIRY_DAYS = 14

export type OemOrder = {
  id: string
  lead_id: string
  revision: number
  order_number: string
  status: OemOrderStatus
  formal_quote_amount: number
  deposit_amount: number
  final_amount: number | null
  specification: string
  quote_snapshot: Record<string, unknown>
  quote_sha256: string
  terms_version: string
  terms_title: string
  terms_body: string
  terms_sha256: string
  expires_at: string
  issued_at: string
  accepted_at: string | null
  created_at: string
  updated_at: string
}

export type PublicOemOrder = Pick<OemOrder,
  'id' | 'order_number' | 'status' | 'formal_quote_amount' | 'deposit_amount' |
  'specification' | 'quote_sha256' | 'terms_version' | 'terms_title' |
  'terms_body' | 'terms_sha256' | 'expires_at' | 'issued_at' | 'accepted_at'
> & { companyName: string; contactName: string }

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function snapshotSha256(value: unknown): string {
  return sha256(stableStringify(value))
}

export function tokenHash(token: string): string | null {
  return OEM_ORDER_TOKEN_PATTERN.test(token) ? sha256(token) : null
}

export function evidenceHash(value: string): string {
  const secret = process.env.OEM_INTAKE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('OEM order evidence secret is not configured')
  return createHmac('sha256', secret).update(value || 'unknown').digest('hex')
}

export function depositAmount(formalQuoteAmount: number): number {
  return Math.floor(formalQuoteAmount / 2)
}

export async function getPublicOemOrder(token: string): Promise<{ state: 'available' | 'expired' | 'unavailable'; order?: PublicOemOrder }> {
  const hash = tokenHash(token)
  if (!hash) return { state: 'unavailable' }
  const { data: order, error } = await adminClient.from('oem_orders')
    .select('id,lead_id,order_number,status,formal_quote_amount,deposit_amount,specification,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,expires_at,issued_at,accepted_at')
    .eq('access_token_hash', hash).maybeSingle()
  if (error || !order || order.status === 'cancelled') return { state: 'unavailable' }
  const { data: lead, error: leadError } = await adminClient.from('leads')
    .select('company_name,contact_name').eq('id', order.lead_id).maybeSingle()
  if (leadError || !lead) return { state: 'unavailable' }
  const publicOrder = { ...order, companyName: lead.company_name, contactName: lead.contact_name } as PublicOemOrder
  if (order.status === 'issued' && new Date(order.expires_at).getTime() <= Date.now()) return { state: 'expired', order: publicOrder }
  return { state: 'available', order: publicOrder }
}
