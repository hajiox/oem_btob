import 'server-only'
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { mailOrigin, uuid } from '@/lib/oem-mail-security'
import { invoiceDocument } from './oem-invoice-document'
import type { OemInvoice } from './oem-invoices-shared'

function signature(id: string): string {
  const secret = process.env.OEM_INTAKE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Invoice link signing is not configured')
  return createHmac('sha256', secret).update(`oem-invoice:v1:${id}`).digest('base64url')
}
export function invoiceUrl(id: string): string {
  const invoiceId = uuid(id)
  return `${mailOrigin()}/btob/invoice/${invoiceId}.${signature(invoiceId)}`
}
export async function getInvoiceForToken(token: string): Promise<OemInvoice | null> {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [id, sig] = token.split('.')
  try { uuid(id) } catch { return null }
  if (!timingSafeEqual(Buffer.from(signature(id)), Buffer.from(sig))) return null
  const { data, error } = await adminClient.from('oem_invoices').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  const parent = await adminClient.from('oem_orders').select('status').eq('id', data.order_id).maybeSingle()
  if (parent.error || !parent.data || parent.data.status === 'cancelled') return null
  return data as OemInvoice
}
export function invoiceResponse(invoice: OemInvoice, cancelled = false): Response {
  const nonce = randomBytes(18).toString('base64')
  return new Response(invoiceDocument(invoice, nonce, cancelled), { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  } })
}
export function unavailableInvoice(): Response {
  return new Response('請求書を表示できません。URLをご確認いただくか、担当者へお問い合わせください。', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } })
}
