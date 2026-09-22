import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { requireMailAdmin, checkMailOrigin, mailConfigured, mailFailure, MailError, sealMail, hashMail, MAIL_SCOPES, OEM_MAILBOX } from '@/lib/oem-mail-security'
import { googleCallbackUrl } from '@/lib/oem-gmail-auth'
export const runtime = 'nodejs'
export async function POST(request: Request) {
    try {
        checkMailOrigin(request)
        const user = await requireMailAdmin()
        if (!mailConfigured()) throw new MailError('Google連携の環境設定が必要です。', 503)
        const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
        const { error } = await adminClient.from('oem_oauth_states').insert({ state_hash: hashMail(state), user_id: user.id, verifier_encrypted: sealMail(verifier, state), expires_at: new Date(Date.now() + 600000).toISOString() })
        if (error) throw new MailError('Google連携を開始できませんでした。', 503)
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        url.search = new URLSearchParams({ client_id: process.env.OEM_GOOGLE_CLIENT_ID!, redirect_uri: googleCallbackUrl(), response_type: 'code', scope: MAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', login_hint: OEM_MAILBOX, state, code_challenge: Buffer.from(hashMail(verifier), 'hex').toString('base64url'), code_challenge_method: 'S256' }).toString()
        const response = NextResponse.redirect(url, 303)
        response.cookies.set('oem_mail_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/oem/mail', maxAge: 600 })
        response.headers.set('Cache-Control', 'no-store'); return response
    } catch (error) { return mailFailure(error) }
}
