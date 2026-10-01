import { requireMailAdmin, checkMailOrigin, requireOemMailLead, MailError, mailFailure } from '@/lib/oem-mail-security'
import { prepareReply, validateReply, validateReplyFacts, replyContextStamp, generateReply } from '@/lib/oem-reply-assist'
import { replyTemplateId } from '@/lib/oem-reply-assist-shared'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request) {
  try {
    checkMailOrigin(request)
    const user = await requireMailAdmin()
    const reader = request.body?.getReader(); if (!reader) throw new MailError('入力を確認してください。')
    const chunks: Uint8Array[] = []; let length = 0
    while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 24000) { await reader.cancel(); throw new MailError('返信案の入力が大きすぎます。', 413) }; chunks.push(chunk.value) }
    let input
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new MailError('入力を確認してください。') }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MailError('入力を確認してください。')
    const allowed = input.action === 'generate' ? ['action', 'leadId', 'templateId', 'snapshot', 'question', 'instruction', 'consentConfirmed', 'requestId'] : input.action === 'validate' ? ['action', 'leadId', 'templateId', 'snapshot', 'contextSnapshot'] : input.action === 'prepare' ? ['action', 'leadId', 'templateId'] : []
    if (!allowed.length || Object.keys(input).some(key => !allowed.includes(key))) throw new MailError('返信案の操作・入力を確認してください。')
    let templateId
    try { templateId = replyTemplateId(input.templateId) } catch { throw new MailError('定型文を選択してください。') }
    const lead = await requireOemMailLead(input.leadId)
    if (input.action === 'validate' && input.snapshot !== undefined && input.contextSnapshot !== undefined) throw new MailError('返信案の参照情報を確認してください。')
    const result = input.action === 'prepare' ? { success: true, prepared: await prepareReply(lead, templateId) } : input.action === 'validate' ? input.contextSnapshot !== undefined ? await validateReplyFacts(lead, replyContextStamp({ templateId, contextSnapshot: input.contextSnapshot })!) : await validateReply(lead, templateId, input.snapshot) : await generateReply(lead, user.id, templateId, input)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return mailFailure(error) }
}
