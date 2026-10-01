import { requireMailAdmin, checkMailOrigin, requireOemMailLead, MailError, mailFailure } from '@/lib/oem-mail-security'
import { getMailboxStatus, listConversation, syncConversation, saveConversationDraft, sendConversation, reviewConversationMessages, handleConversationMessage } from '@/lib/oem-conversations'
import { replyContextStamp, validateReplyFacts } from '@/lib/oem-reply-assist'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request) {
    try {
        checkMailOrigin(request)
        const user = await requireMailAdmin()
        // Stream limit applies even to chunked requests with a missing Content-Length.
        const reader = request.body?.getReader(); if (!reader) throw new MailError('入力を確認してください。')
        const chunks: Uint8Array[] = []; let length = 0
        while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 4300000) { await reader.cancel(); throw new MailError('添付を含む送信サイズが大きすぎます。', 413) } chunks.push(chunk.value) }
        let input
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new MailError('入力を確認してください。') }
        if (!input || typeof input !== 'object') throw new MailError('入力を確認してください。')
        let result
        if (input.action === 'status') result = await getMailboxStatus()
        else {
            const lead = await requireOemMailLead(input.leadId)
            if (input.cursor !== undefined && typeof input.cursor !== 'string') throw new MailError('ページ指定が不正です。')
            switch (input.action) {
                case 'list': result = await listConversation(lead, input.cursor); break
                case 'sync': result = await syncConversation(lead, input.cursor); break
                case 'draft': {
                    const stamp = replyContextStamp(input.replyContext)
                    if (stamp) await validateReplyFacts(lead, stamp)
                    result = await saveConversationDraft(lead, user.id, input.subject, input.text, input.expectedUpdatedAt, stamp); break
                }
                case 'send': {
                    const stamp = replyContextStamp(input.replyContext)
                    if (stamp) await validateReplyFacts(lead, stamp)
                    result = await sendConversation(lead, user.id, input); break
                }
                case 'review': result = await reviewConversationMessages(lead, user.id, input.messageIds); break
                case 'handle': result = await handleConversationMessage(lead, user.id, input.messageId, input.handled); break
                default: throw new MailError('操作を確認してください。')
            }
        }
        return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) { return mailFailure(error) }
}
