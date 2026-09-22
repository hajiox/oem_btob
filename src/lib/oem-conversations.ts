import { adminClient as db } from '@/lib/supabase/admin'
import { connectedGmail } from '@/lib/oem-gmail-auth'
import { GmailApiError, normalizeGmailMessage, buildMimeMessage, validateMailAttachments, type GmailClient, type MimeAttachment } from '@/lib/oem-gmail-client'
import { MailError, OEM_MAILBOX, caseTag, hashMail, uuid, mailConfigured } from '@/lib/oem-mail-security'

type Lead = { id: string; email: string }
const table = 'oem_conversation_messages'
const columns = 'id,lead_id,gmail_id,gmail_thread_id,direction,subject,text_body,from_address,to_address,sent_at,status,rfc_message_id,references_header,attachments,request_id,payload_hash'
function must(error: unknown) { if (error) throw new MailError('メール履歴を保存・取得できませんでした。', 503) }
export function mailSubject(value: unknown, leadId: string) {
    if (typeof value !== 'string' || /[\r\n\x00]/.test(value) || value.length > 200) throw new MailError('件名は改行なしの200文字以内で入力してください。')
    const tag = caseTag(leadId)
    return value.includes(tag) ? value.trim() : `${value.trim() || 'OEMのご相談について'} ${tag}`
}
export function mailText(value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.length > 30000 || value.includes('\0')) throw new MailError('本文を1〜30,000文字で入力してください。')
    return value.trim()
}
function addresses(value: string): string[] { return Array.from(value.toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []) }
export function isCaseParticipant(from: string, to: string, email: string) {
    const sender = addresses(from), recipients = addresses(to), customer = email.toLowerCase()
    return sender.length === 1 && ((sender[0] === OEM_MAILBOX && recipients.includes(customer)) || (sender[0] === customer && recipients.includes(OEM_MAILBOX)))
}
export async function getMailboxStatus() {
    const { data, error } = await db.from('oem_mailbox_connections').select('mailbox,updated_at').eq('mailbox', OEM_MAILBOX).maybeSingle()
    must(error)
    return { connected: !!data && mailConfigured(), configured: mailConfigured(), mailbox: OEM_MAILBOX }
}
export async function listConversation(lead: Lead, cursor?: string) {
    const offset = cursor === undefined ? 0 : Number(cursor)
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new MailError('履歴のページ指定が不正です。')
    const [{ data, error }, draftResult, status, unresolved] = await Promise.all([
        db.from(table).select(columns).eq('lead_id', lead.id).order('sent_at', { ascending: false }).order('id').range(offset, offset + 49),
        db.from('oem_conversation_drafts').select('subject,text_body').eq('lead_id', lead.id).maybeSingle(), getMailboxStatus(),
        db.from(table).select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).in('status', ['pending', 'sending', 'unknown']),
    ])
    must(error); must(draftResult.error); must(unresolved.error)
    return { ...status, hasUnresolved: !!unresolved.count, messages: (data || []).map(m => ({ id: m.id, requestId: m.request_id, direction: m.direction, subject: m.subject, text: m.text_body, from: m.from_address, to: m.to_address, sentAt: m.sent_at, status: m.status, attachments: m.attachments || [] })),
        draft: draftResult.data ? { subject: draftResult.data.subject, text: draftResult.data.text_body } : null,
        hasMore: data?.length === 50, nextCursor: data?.length === 50 ? String(offset + 50) : undefined }
}
async function storeThread(client: GmailClient, threadId: string, lead: Lead) {
    const thread = await client.thread(threadId)
    const messages = (thread.messages || []).map(m => normalizeGmailMessage(m, OEM_MAILBOX))
    // The case token and known participants must both match. Never ingest a mailbox-wide search.
    if (!messages.some(m => m.subject.includes(caseTag(lead.id)) && isCaseParticipant(m.from, m.to, lead.email))) return 0
    const link = await db.from('oem_conversation_threads').upsert({ gmail_thread_id: thread.id, lead_id: lead.id }, { onConflict: 'gmail_thread_id', ignoreDuplicates: true })
    must(link.error)
    const owner = await db.from('oem_conversation_threads').select('lead_id').eq('gmail_thread_id', thread.id).single()
    must(owner.error)
    if (owner.data?.lead_id !== lead.id) throw new MailError('別案件に紐づくメールは取り込めません。', 409)
    let count = 0
    for (const m of messages) {
        if (!isCaseParticipant(m.from, m.to, lead.email)) continue
        if (addresses(m.from)[0] === OEM_MAILBOX && m.direction !== 'outbound') continue
        // Explicit other case numbers prevent accidental cross-case thread merges.
        const tags = m.subject.match(/\[OEM-[0-9a-f-]{36}\]/gi) || []
        if (!tags.some(tag => tag.toLowerCase() === caseTag(lead.id).toLowerCase())) continue
        if (tags.some(tag => tag.toLowerCase() !== caseTag(lead.id).toLowerCase())) continue
        const values = { lead_id: lead.id, gmail_id: m.id, gmail_thread_id: thread.id, direction: m.direction, subject: m.subject, text_body: m.text.slice(0, 150000), from_address: m.from, to_address: m.to, sent_at: Number.isFinite(Date.parse(m.sentAt)) ? m.sentAt : new Date().toISOString(), status: m.direction === 'outbound' ? 'sent' : 'received', rfc_message_id: m.messageIdHeader, references_header: m.references.join(' '), attachments: m.attachments }
        // Reconcile an interrupted send by the stable RFC Message-ID, never by blind resend.
        const pending = m.direction === 'outbound' && m.messageIdHeader ? await db.from(table).select('id').eq('lead_id', lead.id).eq('rfc_message_id', m.messageIdHeader).maybeSingle() : null
        if (pending) must(pending.error)
        const saved = pending?.data
            ? await db.from(table).update(values).eq('id', pending.data.id).eq('lead_id', lead.id)
            : await db.from(table).upsert(values, { onConflict: 'gmail_id', ignoreDuplicates: true })
        must(saved.error); count++
    }
    return count
}
export async function syncConversation(lead: Lead, cursor?: string) {
    if (cursor && (cursor.length > 2048 || !/^[a-zA-Z0-9_=-]+$/.test(cursor))) throw new MailError('同期ページ指定が不正です。')
    const client = await connectedGmail()
    const result = await client.listThreads(`subject:"${caseTag(lead.id)}"`, cursor)
    let count = 0
    for (const thread of result.threads || []) count += await storeThread(client, thread.id, lead)
    return { success: true, hasMore: !!result.nextPageToken, nextCursor: result.nextPageToken, message: `${count}件のメールを確認しました。` }
}
export async function saveConversationDraft(lead: Lead, userId: string, subject: unknown, text: unknown) {
    const title = mailSubject(subject, lead.id)
    if (typeof text !== 'string' || text.length > 30000) throw new MailError('本文は30,000文字以内で入力してください。')
    const { error } = await db.from('oem_conversation_drafts').upsert({ lead_id: lead.id, subject: title, text_body: text, updated_by: userId })
    must(error); return { success: true }
}
export async function sendConversation(lead: Lead, userId: string, input: { subject?: unknown; text?: unknown; requestId?: unknown; attachments?: MimeAttachment[] }) {
    const requestId = uuid(input.requestId), subject = mailSubject(input.subject, lead.id), text = mailText(input.text)
    let attachments: MimeAttachment[]
    try { attachments = validateMailAttachments(input.attachments || []) } catch { throw new MailError('添付形式・ファイル名・合計3MB以下をご確認ください。') }
    const hash = hashMail(JSON.stringify({ leadId: lead.id, to: lead.email, subject, text, attachments }))
    const previous = await db.from(table).select('id,status,payload_hash').eq('request_id', requestId).maybeSingle(); must(previous.error)
    if (previous.data) {
        if (previous.data.payload_hash !== hash) throw new MailError('同じ送信IDの内容が変わっています。履歴を確認してください。', 409)
        return { success: previous.data.status === 'sent', status: previous.data.status, error: previous.data.status === 'sent' ? undefined : 'この送信は受付済みです。同期して状態を確認してください。重複防止のため再送していません。' }
    }
    const client = await connectedGmail() // Connection failures must not create a stuck outbox.
    const latest = await db.from(table).select('gmail_thread_id,rfc_message_id,references_header,subject').eq('lead_id', lead.id).in('status', ['sent', 'received']).not('gmail_id', 'is', null).order('sent_at', { ascending: false }).limit(1).maybeSingle(); must(latest.error)
    const parent = latest.data
    // Gmail requires matching subjects to append a thread; edited subject starts a new case thread.
    const threadId = parent && parent.subject?.replace(/^(re:\s*)+/i, '') === subject.replace(/^(re:\s*)+/i, '') ? parent.gmail_thread_id : undefined
    const messageId = `<oem-${requestId}@aizu-tv.com>`
    const safeRefs = (parent?.references_header || '').split(/\s+/).filter((v: string) => /^<[^<>\s]+@[^<>\s]+>$/.test(v)).slice(-15)
    const parentId = parent?.rfc_message_id && /^<[^<>\s]+@[^<>\s]+>$/.test(parent.rfc_message_id) ? parent.rfc_message_id : undefined
    const raw = buildMimeMessage({ from: OEM_MAILBOX, to: lead.email, subject, text, messageId, ...(threadId ? { inReplyTo: parentId, references: [...safeRefs, ...(parentId ? [parentId] : [])] } : {}), attachments })
    const inserted = await db.from(table).insert({ lead_id: lead.id, direction: 'outbound', subject, text_body: text, from_address: OEM_MAILBOX, to_address: lead.email, status: 'pending', request_id: requestId, payload_hash: hash, rfc_message_id: messageId, attachments: attachments.map(a => ({ id: '', name: a.name, size: Buffer.from(a.base64, 'base64').length, mimeType: a.type })), created_by: userId }).select('id').single()
    if (inserted.error?.code === '23505') return { success: false, status: 'sending', error: '同じ送信を処理中です。更新して確認してください。' }
    must(inserted.error)
    const id = inserted.data!.id
    const claimed = await db.rpc('claim_oem_conversation', { p_id: id }); must(claimed.error)
    if (!claimed.data?.length) throw new MailError('送信は既に処理されています。', 409)
    let sent: { id: string; threadId: string }
    try {
        sent = await client.send(raw, threadId || undefined)
        if (!sent.id || !sent.threadId) throw new GmailApiError(undefined, 'empty response', true)
    } catch (error) {
        const status = error instanceof GmailApiError && !error.uncertain ? 'failed' : 'unknown'
        await db.from(table).update({ status }).eq('id', id)
        return { success: false, status, error: status === 'unknown' ? '送信結果が未確認です。同期で確認してください。重複防止のため再送しないでください。' : 'Googleが送信を受け付けませんでした。接続と宛先を確認してください。' }
    }
    const saved = await db.from(table).update({ status: 'sent', gmail_id: sent.id, gmail_thread_id: sent.threadId, sent_at: new Date().toISOString() }).eq('id', id)
    if (saved.error) return { success: false, status: 'unknown', error: 'Googleは送信を受け付けましたが履歴保存を確認できません。再送せず同期してください。' }
    // Do not erase a shared draft that another administrator has edited in the meantime.
    await db.from('oem_conversation_drafts').delete().eq('lead_id', lead.id).eq('subject', subject).eq('text_body', text).eq('updated_by', userId)
    return { success: true, status: 'sent' }
}
export async function downloadConversationAttachment(lead: Lead, messageId: string, attachmentId: string) {
    const { data, error } = await db.from(table).select('gmail_id,attachments').eq('lead_id', lead.id).eq('id', uuid(messageId)).single(); must(error)
    const attachment = (data?.attachments as { id: string; name: string; size: number }[] | undefined)?.find(a => a.id === attachmentId)
    if (!data?.gmail_id || !attachmentId || !attachment) throw new MailError('添付ファイルが見つかりません。受信同期を行ってください。', 404)
    if (attachment.size > 3 * 1024 * 1024) throw new MailError('3MBを超える受信添付は現在ダッシュボードから取得できません。', 413)
    const result = await (await connectedGmail()).attachment(data.gmail_id, attachmentId)
    const bytes = Buffer.from(result.data, 'base64url')
    if (bytes.length > 3 * 1024 * 1024) throw new MailError('添付ファイルが大きすぎます。', 413)
    return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/g, '%27')}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
}
