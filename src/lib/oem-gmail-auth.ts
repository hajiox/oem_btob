import { adminClient } from '@/lib/supabase/admin'
import { GmailClient } from '@/lib/oem-gmail-client'
import { MAIL_SCOPES, OEM_MAILBOX, MailError, mailConfigured, mailOrigin, openMail, sealMail } from '@/lib/oem-mail-security'

export function googleCallbackUrl() { return `${mailOrigin()}/api/oem/mail/callback` }
type TokenResult = { access_token: string; refresh_token?: string; scope?: string }
export async function exchangeGoogleToken(params: Record<string, string>): Promise<TokenResult> {
    if (!mailConfigured()) throw new MailError('Googleメール連携の環境設定が必要です。', 503)
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ ...params, client_id: process.env.OEM_GOOGLE_CLIENT_ID!, client_secret: process.env.OEM_GOOGLE_CLIENT_SECRET! }),
    })
    if (!response.ok) throw new MailError('Googleとの接続が無効です。再接続してください。', 503)
    const data = await response.json() as TokenResult
    if (!data.access_token) throw new MailError('Google接続情報を確認できません。', 503)
    return data
}
export async function saveGoogleConnection(code: string, verifier: string, userId: string) {
    const token = await exchangeGoogleToken({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: googleCallbackUrl() })
    if (!token.scope || MAIL_SCOPES.some(scope => !token.scope!.split(' ').includes(scope))) throw new MailError('メールの閲覧と送信の両方の許可が必要です。')
    const profile = await new GmailClient(token.access_token).profile()
    if (profile.emailAddress.toLowerCase() !== OEM_MAILBOX) throw new MailError(`${OEM_MAILBOX} を選択してください。`)
    if (!token.refresh_token) throw new MailError('継続接続の許可を取得できませんでした。もう一度接続してください。')
    const { error } = await adminClient.from('oem_mailbox_connections').upsert({ mailbox: OEM_MAILBOX, encrypted_refresh_token: sealMail(token.refresh_token, OEM_MAILBOX), connected_by: userId, updated_at: new Date().toISOString() })
    if (error) throw new MailError('接続情報を保存できませんでした。', 503)
}
export async function connectedGmail() {
    const { data, error } = await adminClient.from('oem_mailbox_connections').select('encrypted_refresh_token').eq('mailbox', OEM_MAILBOX).maybeSingle()
    if (error || !data) throw new MailError('先にGoogle Workspaceを接続してください。', 409)
    const token = await exchangeGoogleToken({ grant_type: 'refresh_token', refresh_token: openMail(data.encrypted_refresh_token, OEM_MAILBOX) })
    return new GmailClient(token.access_token)
}
