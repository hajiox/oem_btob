import { getTrialPrepaymentInvoiceForToken, trialPrepaymentInvoiceResponse, unavailableTrialPrepaymentInvoice } from '@/lib/oem-trial-prepayment-invoices'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}) { const {token}=await params; const invoice=await getTrialPrepaymentInvoiceForToken(token); return invoice?trialPrepaymentInvoiceResponse(invoice):unavailableTrialPrepaymentInvoice() }
