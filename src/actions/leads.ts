'use server'

import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'
import type { Lead } from '@/types/database'

export type LeadListOptions = { pageId?: string | null; page?: number; pageSize?: number; search?: string; status?: Lead['status'] | 'all' }
export type EnrichedLead = Lead & { followupAt: string | null; followupOverdue: boolean; mailAttention: boolean }
export type LeadListResult = { leads: EnrichedLead[]; total: number; stats: { total: number; new: number; negotiating: number; totalEstimate: number }; page: number; pageSize: number }

export async function getLeads(options: LeadListOptions | string | null = {}): Promise<LeadListResult> {
    const normalized: LeadListOptions = typeof options === 'string' || options === null ? { pageId: options } : options
    const page = Math.max(1, Math.floor(normalized.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(normalized.pageSize ?? 50)))
    const search = (normalized.search?.trim() ?? '').slice(0,200).replace(/[%,_()."\\]/g, '')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    // Supabase's fluent query builder has no exported common type across tables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (query: any) => {
        if (normalized.pageId) query = query.eq('page_id', normalized.pageId)
        if (normalized.status && normalized.status !== 'all') query = query.eq('status', normalized.status)
        if (search) query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
        return query
    }
    const listQuery = applyFilters(supabase.from('leads').select('*', { count: 'exact' })).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
    const [{ data, count, error }, { data: statsRows, error: statsError }] = await Promise.all([listQuery, supabase.rpc('oem_lead_stats', { p_page_id: normalized.pageId || null, p_status: normalized.status === 'all' ? null : normalized.status || null, p_search: search })])
    if (error) throw error
    if (statsError) throw statsError
    const stats = statsRows?.[0]
    const rawLeads = (data ?? []) as Lead[]
    const oemIds = rawLeads.filter(lead => lead.page_id === OEM_PAGE_ID).map(lead => lead.id)
    const [cases, mails] = oemIds.length ? await Promise.all([
        adminClient.from('oem_lead_cases').select('lead_id,next_followup_at').in('lead_id', oemIds),
        adminClient.from('oem_mail_deliveries').select('lead_id,status,locked_at,updated_at').in('lead_id', oemIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }]
    if (cases.error || mails.error) throw new Error('OEM運用情報を取得できませんでした')
    const caseByLead = new Map((cases.data ?? []).map(row => [row.lead_id, row.next_followup_at]))
    const mailByLead = new Set((mails.data ?? []).filter(row => row.status === 'pending' || row.status === 'failed' || row.status === 'unknown' || (row.status === 'sending' && row.locked_at && new Date(row.locked_at).getTime() < Date.now() - 5 * 60_000)).map(row => row.lead_id))
    const enriched = rawLeads.map(lead => { const followupAt = caseByLead.get(lead.id) ?? null; return { ...lead, followupAt, followupOverdue: !!followupAt && new Date(followupAt).getTime() < Date.now(), mailAttention: mailByLead.has(lead.id) } })
    return { leads: enriched, total: count ?? 0, stats: { total: Number(stats?.total || 0), new: Number(stats?.new_count || 0), negotiating: Number(stats?.negotiating_count || 0), totalEstimate: Number(stats?.total_estimate || 0) }, page, pageSize }
}
