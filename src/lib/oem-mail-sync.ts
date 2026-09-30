import { randomUUID } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { connectedGmail } from '@/lib/oem-gmail-auth'
import { GmailApiError, normalizeGmailMessage } from '@/lib/oem-gmail-client'
import { getMailboxStatus, isCaseParticipant, storeConversationThread } from '@/lib/oem-conversations'
import { MailError, OEM_MAILBOX } from '@/lib/oem-mail-security'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'

type SyncCheckpoint = {
  query_text: string | null
  page_token: string | null
  last_completed_at: string | null
}

// A persisted page token and lease let a later invocation continue a large
// mailbox scan. Reimports do not reset review or response records.
export async function runOemMailboxSync({ force = false }: { force?: boolean } = {}) {
  const leaseId = randomUUID()
  const claimed = await adminClient.rpc('claim_oem_mail_sync', { p_lease_id: leaseId, p_force: force })
  if (claimed.error) throw new MailError('メール自動取得の状態を確認できませんでした。', 503)
  const checkpoint = claimed.data?.[0] as SyncCheckpoint | undefined
  if (!checkpoint) return { success: true, skipped: true, message: '直近の取得結果を表示しています。' }

  const cutoff = Math.floor(Date.now() / 1000)
  const lastCompleted = checkpoint.last_completed_at ? Date.parse(checkpoint.last_completed_at) : NaN
  const after = Number.isFinite(lastCompleted) ? ` after:${Math.max(0, Math.floor(lastCompleted / 1000) - 86400)}` : ''
  // Freeze both ends throughout pagination; the next sweep catches mail that
  // arrived during this sweep. No untagged mailbox messages are imported.
  const query = checkpoint.query_text || `subject:"OEM-"${after} before:${cutoff}`
  let nextPage: string | null = checkpoint.page_token
  let count = 0
  try {
    const client = await connectedGmail()
    const result = await client.listThreads(query, checkpoint.page_token || undefined)
    nextPage = result.nextPageToken || null
    const threads = result.threads || []
    // Ten threads per page, three concurrent requests, to keep the scheduled
    // invocation bounded without silently dropping a remaining page.
    for (let start = 0; start < threads.length; start += 3) {
      const batch = await Promise.allSettled(threads.slice(start, start + 3).map(async ({ id }) => {
        const thread = await client.thread(id)
        const messages = (thread.messages || []).map(message => normalizeGmailMessage(message, OEM_MAILBOX))
        const tags = new Set(messages.flatMap(message => Array.from(message.subject.matchAll(/\[OEM-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]/gi), match => match[1].toLowerCase())))
        // Ambiguous case merges require manual investigation, never guessing.
        if (tags.size !== 1) return 0
        const leadId = Array.from(tags)[0]
        const lookup = await adminClient.from('leads').select('id,email').eq('id', leadId).eq('page_id', OEM_PAGE_ID).maybeSingle()
        if (lookup.error) throw new MailError('メールの案件を確認できませんでした。', 503)
        const lead = lookup.data
        if (!lead || !messages.some(message => isCaseParticipant(message.from, message.to, lead.email))) return 0
        return storeConversationThread(client, id, lead, thread)
      }))
      for (const result of batch) {
        if (result.status === 'rejected') throw result.reason
        count += result.value
      }
    }
    const saved = await adminClient.rpc('finish_oem_mail_sync', {
      p_lease_id: leaseId, p_query_text: query, p_page_token: nextPage, p_complete: !nextPage, p_error: null,
    })
    if (saved.error || !saved.data) throw new MailError('メール取得の進捗を保存できませんでした。', 503)
    return { success: true, skipped: false, hasMore: !!nextPage, message: nextPage ? `${count}件を確認しました。続きは次の自動取得で確認します。` : `${count}件のメールを確認しました。` }
  } catch (error) {
    const expiredPage = error instanceof GmailApiError && error.status === 400 && !!checkpoint.page_token
    const message = expiredPage
      ? '取得の続きの期限が切れました。次回は同じ期間から再確認します。'
      : error instanceof MailError ? error.message : 'Googleからメールを取得できませんでした。次回に再確認します。'
    const saved = await adminClient.rpc('finish_oem_mail_sync', {
      p_lease_id: leaseId,
      p_query_text: expiredPage ? null : query,
      p_page_token: expiredPage ? null : checkpoint.page_token,
      p_complete: false,
      p_error: message,
    })
    if (saved.error || !saved.data) throw new MailError('メール取得状態の保存を確認できませんでした。', 503)
    throw new MailError(message, 503)
  }
}

export async function getOemSyncStatus() {
  const [{ data, error }, status] = await Promise.all([
    adminClient.from('oem_mail_sync_state').select('last_completed_at,last_run_at,last_error').eq('mailbox', OEM_MAILBOX).maybeSingle(),
    getMailboxStatus(),
  ])
  if (error) throw new MailError('メール取得状態を確認できませんでした。', 503)
  return { connected: status.connected, lastCompletedAt: data?.last_completed_at || null, lastRunAt: data?.last_run_at || null, lastError: data?.last_error || null }
}
