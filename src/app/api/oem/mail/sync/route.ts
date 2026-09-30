import { timingSafeEqual } from 'node:crypto'
import { runOemMailboxSync } from '@/lib/oem-mail-sync'
import { mailFailure } from '@/lib/oem-mail-security'

export const runtime = 'nodejs'
export const maxDuration = 120

// This key only authorizes retrieval of OEM case mail. The scheduled response
// contains no message bodies, addresses, access tokens or customer metadata.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization') || ''
  const expected = secret ? `Bearer ${secret}` : ''
  if (!secret || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ success: false, error: '認証が必要です。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    return Response.json(await runOemMailboxSync(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return mailFailure(error) }
}
