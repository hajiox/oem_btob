import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { mailOrigin, uuid } from '@/lib/oem-mail-security'
import type { AdditionalTrialPayment } from './oem-additional-trial-payments-shared'

function signature(id: string) {
  const secret = process.env.OEM_INTAKE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Invoice link signing is not configured')
  return createHmac('sha256', secret).update(`oem-additional-trial:v1:${id}`).digest('base64url')
}
export function additionalTrialInvoiceUrl(id: string) {
  const value = uuid(id)
  return `${mailOrigin()}/btob/additional-trial-invoice/${value}.${signature(value)}`
}
export async function getAdditionalTrialInvoiceForToken(token: string): Promise<AdditionalTrialPayment | null> {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [id, sig] = token.split('.')
  try {
    uuid(id)
    if (!timingSafeEqual(Buffer.from(signature(id)), Buffer.from(sig))) return null
  } catch { return null }
  const { data, error } = await adminClient.from('oem_additional_trial_payments').select('*').eq('id', id).neq('status', 'void').maybeSingle()
  return error || !data ? null : data as AdditionalTrialPayment
}
