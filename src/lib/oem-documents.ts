import 'server-only'
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { mailOrigin, uuid } from '@/lib/oem-mail-security'
import { oemDocumentHtml } from './oem-document-document'
import type { OemDocument } from './oem-documents-shared'
function signature(id: string) { const secret = process.env.OEM_INTAKE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY; if (!secret) throw new Error('Document signing is not configured'); return createHmac('sha256', secret).update(`oem-document:v1:${id}`).digest('base64url') }
export function documentUrl(id: string) { const value = uuid(id); return `${mailOrigin()}/btob/document/${value}.${signature(value)}` }
export async function getDocumentForToken(token: string): Promise<OemDocument | null> {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null; const [id,sig] = token.split('.')
  try { uuid(id); const expected = signature(id); if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected),Buffer.from(sig))) return null } catch { return null }
  const { data,error } = await adminClient.from('oem_documents').select('*').eq('id',id).maybeSingle(); if (error || !data) return null; return data as OemDocument
}
export function documentResponse(document: OemDocument) { const nonce = randomBytes(18).toString('base64'); return new Response(oemDocumentHtml(document,nonce),{ headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private,no-store,max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`}}) }
export function unavailableDocument() { return new Response('書面を表示できません。URLをご確認ください。',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}}) }
