import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'

export const OEM_MAILBOX = 'staff@aizu-tv.com'
export const MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']
export class MailError extends Error {
    constructor(message: string, public status = 400) { super(message) }
}
export function mailOrigin() {
    const url = new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://oem.aizubrandhall.com')
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new MailError('メール連携URLの設定が不正です。', 503)
    return url.origin
}
export function checkMailOrigin(request: Request) {
    if (request.headers.get('origin') !== mailOrigin()) throw new MailError('同じサイトから操作してください。', 403)
}
export function uuid(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new MailError('案件または送信IDが不正です。')
    return value.toLowerCase()
}
export function caseTag(leadId: string) { return `[OEM-${uuid(leadId)}]` }
export function hashMail(value: string) { return createHash('sha256').update(value).digest('hex') }
function encryptionKey() {
    const encoded = process.env.OEM_MAIL_ENCRYPTION_KEY || ''
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new MailError('メール暗号鍵が未設定です。', 503)
    return key
}
export function mailConfigured() {
    try { encryptionKey(); return !!(process.env.OEM_GOOGLE_CLIENT_ID && process.env.OEM_GOOGLE_CLIENT_SECRET) } catch { return false }
}
export function sealMail(value: string, purpose: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
    cipher.setAAD(Buffer.from(purpose))
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64')
}
export function openMail(value: string, purpose: string) {
    const bytes = Buffer.from(value, 'base64')
    if (bytes.length < 29) throw new MailError('接続情報を確認できません。', 503)
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12))
    cipher.setAAD(Buffer.from(purpose)); cipher.setAuthTag(bytes.subarray(-16))
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8')
}
export async function requireMailAdmin() {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new MailError('管理者としてログインしてください。', 401)
    const { data, error } = await adminClient.from('oem_mail_admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (error || !data) throw new MailError('メール管理権限がありません。管理者に確認してください。', 403)
    return user
}
export async function requireOemMailLead(id: unknown) {
    const { data, error } = await adminClient.from('leads').select('id,email,company_name,contact_name').eq('id', uuid(id)).eq('page_id', OEM_PAGE_ID).single()
    if (error || !data) throw new MailError('OEM案件が見つかりません。', 404)
    if (!/^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(data.email)) throw new MailError('案件の宛先を確認してください。')
    return data as { id: string; email: string; company_name: string; contact_name: string }
}
export function mailFailure(error: unknown) {
    return Response.json({ success: false, error: error instanceof MailError ? error.message : 'メール処理を完了できませんでした。接続状態を確認してください。' }, { status: error instanceof MailError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } })
}
