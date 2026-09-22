import { randomBytes } from 'node:crypto'

export type GmailThread = { id: string; messages?: GmailMessage[] }
export type GmailMessage = { id: string; threadId?: string; payload?: GmailPayload; internalDate?: string; labelIds?: string[]; snippet?: string }
export type GmailPayload = { mimeType?: string; filename?: string; headers?: Array<{ name?: string; value?: string }>; body?: { data?: string; size?: number; attachmentId?: string }; parts?: GmailPayload[] }
export type NormalizedGmailMessage = { id: string; threadId: string; direction: 'inbound' | 'outbound'; subject: string; text: string; from: string; to: string; sentAt: string; messageIdHeader: string; references: string[]; attachments: Array<{ id: string; name: string; size: number; mimeType: string }> }

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TIMEOUT_MS = 15_000
const MAX_ATTACHMENTS = 3 * 1024 * 1024
const ALLOWED_MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

export class GmailApiError extends Error { constructor(public status: number | undefined, message: string, public uncertain: boolean) { super(message); this.name = 'GmailApiError' } }

function b64urlBytes(value: string): Uint8Array { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return new Uint8Array(); try { return Buffer.from(normalized + '='.repeat((4 - normalized.length % 4) % 4), 'base64') } catch { return new Uint8Array() } }
function b64urlDecode(value: string, charset = 'utf-8'): string { try { return new TextDecoder(charset, { fatal: false }).decode(b64urlBytes(value)) } catch { return new TextDecoder('utf-8').decode(b64urlBytes(value)) } }
function b64urlEncode(value: Uint8Array | string): string { const b = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value); return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') }
function header(headers: GmailPayload['headers'], name: string): string { return (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '' }
function decodeHeader(value: string): string { return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, kind, data) => { try { const bytes = kind.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_m: string, x: string) => String.fromCharCode(parseInt(x, 16))), 'binary'); return new TextDecoder(String(charset).toLowerCase().replace(/^iso-2022-jp$/, 'utf-8'), { fatal: false }).decode(bytes) } catch { return data } }) }
function htmlToText(html: string): string { return decodeEntities(html.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<style[\s\S]*?<\/style\s*>/gi, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()) }
function decodeEntities(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|[0-9]+);/gi, entity => { const map: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }; if (map[entity.toLowerCase()]) return map[entity.toLowerCase()]; const n = entity.toLowerCase().startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10); return Number.isFinite(n) ? String.fromCodePoint(Math.min(n, 0x10ffff)) : entity }) }
function charsetOf(payload: GmailPayload): string { const contentType = header(payload.headers, 'Content-Type'); return contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8' }
function collectTextParts(payload: GmailPayload | undefined, out: { plain?: string; html?: string }): void { if (!payload || payload.filename) return; const mime = payload.mimeType?.toLowerCase(); if (mime === 'text/plain' && payload.body?.data && out.plain === undefined) out.plain = b64urlDecode(payload.body.data, charsetOf(payload)); else if (mime === 'text/html' && payload.body?.data && out.html === undefined) out.html = b64urlDecode(payload.body.data, charsetOf(payload)); (payload.parts || []).forEach(part => collectTextParts(part, out)) }
function bodyText(payload: GmailPayload | undefined): string { const found: { plain?: string; html?: string } = {}; collectTextParts(payload, found); if (found.plain) return found.plain; return found.html ? htmlToText(found.html) : '' }
function emailOnly(value: string): string { const m = value.match(/<\s*([^>]+)\s*>/); return (m ? m[1] : value).trim().toLowerCase() }

export function normalizeGmailMessage(message: GmailMessage, mailbox: string): NormalizedGmailMessage {
  const p = message.payload || {}, from = decodeHeader(header(p.headers, 'From')), to = decodeHeader(header(p.headers, 'To'))
  const refs = `${header(p.headers, 'References')} ${header(p.headers, 'In-Reply-To')}`.trim().split(/\s+/).filter(Boolean)
  const attachments: NormalizedGmailMessage['attachments'] = []
  const visit = (part: GmailPayload) => { if (part.filename && (part.body?.attachmentId || part.body?.data)) attachments.push({ id: part.body?.attachmentId || '', name: decodeHeader(part.filename), size: part.body?.size || (part.body?.data ? Math.floor(part.body.data.length * 3 / 4) : 0), mimeType: part.mimeType || 'application/octet-stream' }); (part.parts || []).forEach(visit) }
  visit(p)
  // Gmail's SENT system label is authoritative; a spoofed From header must never
  // turn an incoming message into a locally recorded outbound send.
  return { id: message.id, threadId: message.threadId || '', direction: message.labelIds?.includes('SENT') ? 'outbound' : 'inbound', subject: decodeHeader(header(p.headers, 'Subject')), text: bodyText(p), from, to, sentAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : decodeHeader(header(p.headers, 'Date')), messageIdHeader: header(p.headers, 'Message-ID'), references: refs, attachments }
}

function rejectHeader(value: string, field: string): void { if (/[\r\n]/.test(value)) throw new Error(`invalid ${field}`) }
function encodeWord(value: string): string { return /[^\x20-\x7e]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : value }
function address(value: string, field: string): string { rejectHeader(value, field); const v = value.trim(); if (!/^(?:[^<>\s@,]+(?:\s+[^<>\r\n<>]*?)?\s*<[^<>\s@,]+@[^<>\s@,]+>|[^<>\s@,]+@[^<>\s@,]+)$/.test(v)) throw new Error(`invalid ${field}`); return v }
export type MimeAttachment = { name: string; type: string; base64: string }
export function validateMailAttachments(attachments: MimeAttachment[] = []): MimeAttachment[] { if (!Array.isArray(attachments) || attachments.length > 10) throw new Error('too many attachments'); let total = 0; return attachments.map(a => { if (!a || typeof a.name !== 'string' || typeof a.type !== 'string' || typeof a.base64 !== 'string' || a.name.length < 1 || a.name.length > 180 || /[\r\n\\/]/.test(a.name) || /[<>:"|?*\x00-\x1f]/.test(a.name)) throw new Error('invalid attachment name'); const ext = a.name.toLowerCase().split('.').pop() || ''; const type = ALLOWED_MIME[ext]; if (!type || a.type.toLowerCase() !== type) throw new Error('attachment type not allowed'); if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.base64)) throw new Error('invalid attachment encoding'); const bytes = Buffer.from(a.base64, 'base64'); if (bytes.toString('base64') !== a.base64) throw new Error('invalid attachment encoding'); if (bytes.length > MAX_ATTACHMENTS || (total += bytes.length) > MAX_ATTACHMENTS) throw new Error('attachments too large'); return { ...a, type } }) }
function fold(value: string): string { return value.match(/.{1,76}/g)?.join('\r\n') || '' }
export function buildMimeMessage(input: { from: string; to: string; subject: string; text: string; messageId: string; inReplyTo?: string; references?: string[]; attachments?: MimeAttachment[] }): string {
  const from = address(input.from, 'from'), to = address(input.to, 'to'); [input.subject, input.messageId, input.inReplyTo || '', ...(input.references || [])].forEach((v, i) => rejectHeader(v, `header${i}`)); if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(input.messageId)) throw new Error('invalid messageId'); if (input.inReplyTo && !/^<[^<>\s@]+@[^<>\s@]+>$/.test(input.inReplyTo)) throw new Error('invalid inReplyTo'); if ((input.references || []).some(v => !/^<[^<>\s@]+@[^<>\s@]+>$/.test(v))) throw new Error('invalid references'); const attachments = validateMailAttachments(input.attachments); const boundary = `=_oem_${randomBytes(12).toString('hex')}`
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: ${encodeWord(input.subject)}`, `Message-ID: ${input.messageId}`, ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []), ...(input.references?.length ? [`References: ${input.references.join(' ')}`] : []), 'MIME-Version: 1.0']
  if (!attachments.length) return b64urlEncode(`${headers.join('\r\n')}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.text}`)
  const lines = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', input.text]
  attachments.forEach(a => lines.push(`--${boundary}`, `Content-Type: ${a.type}; name*=utf-8''${encodeURIComponent(a.name)}`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename*=utf-8''${encodeURIComponent(a.name)}`, '', fold(a.base64)))
  lines.push(`--${boundary}--`, ''); return b64urlEncode(lines.join('\r\n'))
}

export class GmailClient {
  constructor(private readonly accessToken: string) { if (!accessToken || /[\r\n]/.test(accessToken)) throw new Error('invalid access token') }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); try { const response = await fetch(`${GMAIL_API}${path}`, { ...init, cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(init.headers || {}) } }); if (!response.ok) { const uncertain = response.status >= 500 || response.status === 0; throw new GmailApiError(response.status, `Gmail API request failed (${response.status})`, uncertain) } return await response.json() as T } catch (e) { if (e instanceof GmailApiError) throw e; throw new GmailApiError(undefined, 'Gmail API transport failed', true) } finally { clearTimeout(timer) } }
  profile() { return this.request<{ emailAddress: string }>('/profile') }
  listThreads(query: string, pageToken?: string) { return this.request<{ threads: Array<{ id: string }>; nextPageToken?: string }>(`/threads?maxResults=10&q=${encodeURIComponent(query)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`) }
  thread(id: string) { if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid thread id'); return this.request<GmailThread>(`/threads/${id}?format=full`) }
  send(rawBase64Url: string, threadId?: string) { if (!/^[A-Za-z0-9_-]+$/.test(rawBase64Url) || (threadId && !/^[A-Za-z0-9_-]+$/.test(threadId))) throw new Error('invalid message'); return this.request<{ id: string; threadId: string }>('/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: rawBase64Url, ...(threadId ? { threadId } : {}) }) }) }
  attachment(messageId: string, attachmentId: string) { if (!/^[A-Za-z0-9_-]+$/.test(messageId) || !/^[A-Za-z0-9_-]+$/.test(attachmentId)) throw new Error('invalid attachment id'); return this.request<{ data: string; size: number }>(`/messages/${messageId}/attachments/${attachmentId}`) }
  listMessages(query: string) { return this.request<{ messages: Array<{ id: string; threadId: string }> }>(`/messages?q=${encodeURIComponent(query)}`) }
}
