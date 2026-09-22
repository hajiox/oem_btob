import { requireMailAdmin, requireOemMailLead, mailFailure, MailError, mailOrigin } from '@/lib/oem-mail-security'
import { downloadConversationAttachment } from '@/lib/oem-conversations'
export const runtime = 'nodejs'
export async function GET(request: Request) {
    try {
        const origin = request.headers.get('origin')
        if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== mailOrigin())) throw new MailError('同じサイトから操作してください。', 403)
        await requireMailAdmin()
        const url = new URL(request.url), lead = await requireOemMailLead(url.searchParams.get('leadId'))
        return await downloadConversationAttachment(lead, url.searchParams.get('messageId') || '', url.searchParams.get('attachmentId') || '')
    } catch (error) { return mailFailure(error) }
}
