import { NextRequest } from 'next/server'
import { checkMailOrigin, mailFailure, requireMailAdmin, requireOemMailLead, MailError } from '@/lib/oem-mail-security'
import { handleConversationMessage, listMailAttention, reviewConversationMessages } from '@/lib/oem-conversations'
import { getOemSyncStatus, runOemMailboxSync } from '@/lib/oem-mail-sync'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: NextRequest) {
  try {
    await requireMailAdmin()
    const raw = request.nextUrl.searchParams.get('offset') || '0'
    const offset = Number(raw)
    return Response.json({ ...(await listMailAttention(offset)), sync: await getOemSyncStatus() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return mailFailure(error) }
}

export async function POST(request: Request) {
  try {
    checkMailOrigin(request)
    const user = await requireMailAdmin()
    let input: unknown
    try { input = await request.json() } catch { throw new MailError('入力を確認してください。') }
    if (!input || typeof input !== 'object') throw new MailError('操作を確認してください。')
    const payload = input as Record<string, unknown>
    if (payload.action === 'sync') return Response.json(await runOemMailboxSync({ force: false }), { headers: { 'Cache-Control': 'no-store' } })
    if (!['review', 'handle'].includes(String(payload.action))) throw new MailError('操作を確認してください。')
    const lead = await requireOemMailLead(payload.leadId)
    const result = payload.action === 'review'
      ? await reviewConversationMessages(lead, user.id, payload.messageIds)
      : await handleConversationMessage(lead, user.id, payload.messageId, payload.handled)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return mailFailure(error) }
}
