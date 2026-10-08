import { getAdditionalTrialInvoiceForToken } from '@/lib/oem-additional-trial-invoices'
import { trialPrepaymentInvoiceResponse, unavailableTrialPrepaymentInvoice } from '@/lib/oem-trial-prepayment-invoices'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getAdditionalTrialInvoiceForToken(token)
  return invoice ? trialPrepaymentInvoiceResponse(invoice, 'additional') : unavailableTrialPrepaymentInvoice()
}
