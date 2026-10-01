import { documentResponse, getDocumentForToken, unavailableDocument } from '@/lib/oem-documents'
export const dynamic = 'force-dynamic'
export async function GET(_request: Request,{params}:{params:Promise<{token:string}>}) { try { const document=await getDocumentForToken((await params).token); return document ? documentResponse(document) : unavailableDocument() } catch { return unavailableDocument() } }
