import { adminClient } from '@/lib/supabase/admin'
import { requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { documentResponse, unavailableDocument } from '@/lib/oem-documents'
import type { OemDocument } from '@/lib/oem-documents-shared'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) { try { await requireMailAdmin(); const id=uuid((await params).id); const r=await adminClient.from('oem_documents').select('*').eq('id',id).maybeSingle(); if(r.error||!r.data)return unavailableDocument(); await requireOemMailLead(r.data.lead_id); return documentResponse(r.data as OemDocument) } catch{return unavailableDocument()} }
