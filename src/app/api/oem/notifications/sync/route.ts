import { timingSafeEqual } from 'node:crypto'
import { dispatchOemTsgNotifications } from '@/lib/oem-tsg-notifications'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    const supplied = request.headers.get('authorization') || ''
    const expected = secret ? `Bearer ${secret}` : ''
    const headers = { 'Cache-Control': 'no-store' }
    if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
        || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        return Response.json({ success: false, error: '認証が必要です。' }, { status: 401, headers })
    }
    try {
        const result = await dispatchOemTsgNotifications()
        if (result.retried || result.blocked) console.error('OEM TSG notification delivery pending', { retried: result.retried, blocked: result.blocked })
        return Response.json({ success: true, ...result }, { headers })
    } catch {
        console.error('OEM TSG notification worker unavailable')
        return Response.json({ success: false, error: '通知処理を完了できませんでした。' }, { status: 503, headers })
    }
}
