import { getInvoiceForToken, invoiceResponse, unavailableInvoice } from '@/lib/oem-invoices'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const invoice = await getInvoiceForToken((await params).token)
    return invoice ? invoiceResponse(invoice) : unavailableInvoice()
  } catch { return unavailableInvoice() }
}
