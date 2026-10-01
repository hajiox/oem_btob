import 'server-only'

import { adminClient } from '@/lib/supabase/admin'
import { portalTokenHash } from './oem-portal-token'

export type OemPortalOrder = {
  id: string; orderNumber: string; status: string; specification: string
  selectedOptions: unknown[]; amountKind: string; agreedAmount: number | null
  canReorder: boolean
  receivedAmount: number; outstandingAmount: number | null; paymentState: string
  productionDueDate: string | null; shipmentDueDate: string | null
  plannedQuantity: number | null; quantityUnit: string; completedQuantity: number | null
  completedOn: string | null; shippedOn: string | null; carrier: string; trackingNumber: string
  settlementState: string; documents: Array<{ number: string; issuedAt: string; documentUrl: string }>
}
export type OemPortalProjection = {
  linkExpiresAt: string; companyName: string; contactName: string; order: OemPortalOrder | null
}

export async function getOemPortal(token: string): Promise<OemPortalProjection | null> {
  const hash = portalTokenHash(token)
  if (!hash) return null
  const { data, error } = await adminClient.rpc('get_oem_progress_portal', { p_token_hash: hash })
  if (error || !data || typeof data !== 'object') return null
  return data as OemPortalProjection
}

export function portalOrderIsReorderable(order: OemPortalOrder) {
  return order.canReorder
}
