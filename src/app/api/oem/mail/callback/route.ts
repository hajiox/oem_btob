import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { requireMailAdmin, hashMail, openMail, mailOrigin, MailError } from '@/lib/oem-mail-security'
import { saveGoogleConnection } from '@/lib/oem-gmail-auth'
export const runtime = 'nodejs'
export async function GET(request: NextRequest) {
    let success = false
    try {
        const user = await requireMailAdmin()
        const state = request.nextUrl.searchParams.get('state'), code = request.nextUrl.searchParams.get('code')
        if (!state || state.length > 100 || state !== request.cookies.get('oem_mail_oauth_state')?.value) throw new MailError('接続確認が無効です。')
        // Atomic consume: a callback cannot be replayed, even concurrently.
        const { data, error } = await adminClient.from('oem_oauth_states').delete().eq('state_hash', hashMail(state)).eq('user_id', user.id).gt('expires_at', new Date().toISOString()).select('verifier_encrypted').maybeSingle()
        if (error || !data || !code || code.length > 4096) throw new MailError('接続確認が期限切れです。')
        await saveGoogleConnection(code, openMail(data.verifier_encrypted, state), user.id)
        success = true
    } catch { /* Never put authorization codes, provider errors or tokens in output. */ }
    const response = NextResponse.redirect(`${mailOrigin()}/admin/dashboard?mail_connection=${success ? 'connected' : 'failed'}`, 303)
    response.cookies.delete({ name: 'oem_mail_oauth_state', path: '/api/oem/mail' })
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer')
    return response
}
