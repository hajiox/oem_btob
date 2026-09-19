'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'

export type OemLeadCase = {
    lead_id: string; internal_notes: string | null; next_followup_at: string | null
    raw_material_condition: string | null; trial_notes: string | null; recipe_notes: string | null
    work_time_notes: string | null; yield_notes: string | null; issue_notes: string | null
    final_spec_revision: string | null; customer_approval_evidence: string | null; customer_approval_at: string | null
    updated_at: string
}
export type OemLeadEvent = { id: string; lead_id: string; event_type: string; details: Record<string, unknown>; created_by: string | null; created_at: string }

async function getAuthenticatedOemLead(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, error: '認証エラー：権限がありません' }
    const { data: lead, error } = await supabase.from('leads').select('id, page_id').eq('id', leadId).single()
    if (error || !lead || lead.page_id !== OEM_PAGE_ID) return { user, error: 'OEMリードが見つかりません' }
    return { user, lead, error: null }
}

export async function getOemLeadCase(leadId: string, historyPage = 0) {
    const supabase = await createClient(); const access = await getAuthenticatedOemLead(supabase, leadId)
    if (access.error) return { success: false as const, error: access.error, case: null, events: [] as OemLeadEvent[], eventsTotal: 0 }
    const [{ data: caseData, error: caseError }, { data: events, count: eventsTotal, error: eventsError }] = await Promise.all([
        supabase.from('oem_lead_cases').select('*').eq('lead_id', leadId).maybeSingle(),
        supabase.from('oem_lead_events').select('*', { count: 'exact' }).eq('lead_id', leadId).order('created_at', { ascending: false }).order('id').range(Math.max(0, Math.floor(historyPage)) * 100, Math.max(0, Math.floor(historyPage)) * 100 + 99),
    ])
    if (caseError || eventsError) return { success: false as const, error: caseError?.message || eventsError?.message || 'ケース情報の取得に失敗しました', case: null, events: [] as OemLeadEvent[], eventsTotal: 0 }
    return { success: true as const, case: caseData as OemLeadCase | null, events: ((events ?? []) as OemLeadEvent[]).reverse(), eventsTotal: eventsTotal ?? (events ?? []).length }
}

const CASE_FIELDS = ['internal_notes', 'next_followup_at', 'raw_material_condition', 'trial_notes', 'recipe_notes', 'work_time_notes', 'yield_notes', 'issue_notes', 'final_spec_revision', 'customer_approval_evidence', 'customer_approval_at'] as const
type OemLeadCaseInput = Partial<Pick<OemLeadCase, typeof CASE_FIELDS[number]>>

export async function updateOemLeadCase(leadId: string, input: OemLeadCaseInput & { expected_updated_at?: string }) {
    const supabase = await createClient(); const access = await getAuthenticatedOemLead(supabase, leadId)
    if (access.error || !access.user) return { success: false, error: access.error || '認証エラー' }
    if (!input || typeof input !== 'object') return { success: false, error: '入力内容を確認してください' }
    if (input.expected_updated_at && (!/^\d{4}-\d{2}-\d{2}T/.test(input.expected_updated_at) || Number.isNaN(Date.parse(input.expected_updated_at)))) return { success: false, error: '最新のケース情報を読み込んでから保存してください' }
    for (const key of CASE_FIELDS) if (key in input && input[key] !== null && typeof input[key] !== 'string') return { success: false, error: '入力内容を確認してください' }
    const patch = Object.fromEntries(CASE_FIELDS.filter(key => key in input).map(key => [key, typeof input[key] === 'string' ? input[key]!.trim() || null : null]))
    if (Object.keys(patch).length === 0) return { success: false, error: '更新内容がありません' }
    for (const key of CASE_FIELDS) if (key in patch && typeof patch[key] === 'string' && patch[key]!.length > 10000) return { success: false, error: '入力が長すぎます' }
    for (const key of ['next_followup_at', 'customer_approval_at'] as const) if (patch[key] && Number.isNaN(Date.parse(String(patch[key])))) return { success: false, error: '日付を確認してください' }
    const { data: existingCase, error: readError } = await supabase.from('oem_lead_cases').select('lead_id,final_spec_revision,customer_approval_evidence,customer_approval_at,updated_at').eq('lead_id', leadId).maybeSingle()
    if (readError) return { success: false, error: '最新情報を取得できませんでした' }
    const current = existingCase
    if (current && !input.expected_updated_at) return { success: false, error: '最新のケース情報を読み込んでから保存してください' }
    const effectiveEvidence = 'customer_approval_evidence' in patch ? patch.customer_approval_evidence : existingCase?.customer_approval_evidence
    const effectiveApprovalAt = 'customer_approval_at' in patch ? patch.customer_approval_at : existingCase?.customer_approval_at
    if (!!effectiveEvidence !== !!effectiveApprovalAt) return { success: false, error: '承認根拠と承認日を両方入力してください' }
    const effectiveSpec = 'final_spec_revision' in patch ? patch.final_spec_revision : existingCase?.final_spec_revision
    if (effectiveApprovalAt && !effectiveSpec) return { success: false, error: '承認対象の最終仕様を入力してください' }
    if (existingCase && 'final_spec_revision' in patch && patch.final_spec_revision !== existingCase.final_spec_revision && !('customer_approval_evidence' in patch) && !('customer_approval_at' in patch)) {
        patch.customer_approval_evidence = null; patch.customer_approval_at = null
    }
    const result = current
        ? await supabase.from('oem_lead_cases').update(patch).eq('lead_id', leadId).eq('updated_at', input.expected_updated_at!).select('lead_id').maybeSingle()
        : await supabase.from('oem_lead_cases').insert({ lead_id: leadId, ...patch }).select('lead_id').maybeSingle()
    const error = result.error
    if (!error && current && !result.data) return { success: false, error: '他の管理者が更新しました。再読み込みしてください' }
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/dashboard'); return { success: true }
}

export async function updateLeadStatus(leadId: string, status: string) {
    if (!['new', 'contacted', 'quoted', 'negotiating', 'won', 'lost'].includes(status)) return { success: false, error: 'ステータスが正しくありません' }
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: '認証エラー：権限がありません' }
        }

        const { error } = await supabase
            .from('leads')
            .update({ status })
            .eq('id', leadId)

        if (error) throw error

        revalidatePath('/admin/dashboard')
        return { success: true }
    } catch (error: any) {
        console.error('Update Lead Status Error:', error)
        return { success: false, error: error.message || 'ステータスの更新に失敗しました' }
    }
}

export async function deleteLead(leadId: string) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: '認証エラー：権限がありません' }
        }

        const { error } = await supabase
            .from('leads')
            .delete()
            .eq('id', leadId)

        if (error) throw error

        revalidatePath('/admin/dashboard')
        return { success: true }
    } catch (error: any) {
        console.error('Delete Lead Error:', error)
        return { success: false, error: error.message || 'リードの削除に失敗しました' }
    }
}
