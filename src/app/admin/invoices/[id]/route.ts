import { adminClient } from '@/lib/supabase/admin'
import { requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { invoiceResponse, unavailableInvoice } from '@/lib/oem-invoices'
import type { OemInvoice } from '@/lib/oem-invoices-shared'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMailAdmin()
    const id = uuid((await params).id)
    const { data, error } = await adminClient.from('oem_invoices').select('*').eq('id', id).maybeSingle()
    if (error || !data) return unavailableInvoice()
    await requireOemMailLead(data.lead_id)
    const parent = await adminClient.from('oem_orders').select('status').eq('id', data.order_id).single()
    if (parent.error) return unavailableInvoice()
    const settlement = await adminClient.from('oem_settlements').select('id').eq('order_id', data.order_id).neq('state', 'void').limit(1)
    if (settlement.error) return unavailableInvoice()
    return invoiceResponse(data as OemInvoice, parent.data.status === 'cancelled', Boolean(settlement.data?.length))
  } catch { return unavailableInvoice() }
}
