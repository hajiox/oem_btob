'use server'
import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { validateTrialInput, type TrialInput } from '@/lib/oem-trials'

export async function getOemTrials(leadId: string) {
  try {
    await requireMailAdmin(); const lead = await requireOemMailLead(leadId)
    const { data, error } = await adminClient.from('oem_trials').select('id,trial_number,project_number,status,result,result_notes,identity_evidence,ledger_id,fee_advisory,included_claimed,version,label,created_at,completed_at,oem_trial_ledgers(company_key,included_used,benefit_lead_id)').eq('lead_id',lead.id).order('project_number')
    if(error)throw error
    const trials=(data||[]).map(row=>{const value=row as unknown as Record<string,unknown>;const ledger=value.oem_trial_ledgers as Record<string,unknown>|null;return {...value,trial_number:Number(value.project_number),benefit:ledger?{companyKey:String(ledger.company_key),includedUsed:Number(ledger.included_used),isCurrentBenefit:ledger.benefit_lead_id===lead.id}:null}})
    return {success:true,trials,benefit:trials[0]?.benefit||null}
  }
  catch (e) { return { success: false, error: e instanceof MailError ? e.message : '試作情報を取得できませんでした。', trials: [] } }
}
export async function createOemTrial(leadId: string, input: TrialInput) {
  try {
    const user = await requireMailAdmin(); const lead = await requireOemMailLead(leadId); const parsed = validateTrialInput(input)
    const { data, error } = await adminClient.rpc('create_oem_trial', { p_lead_id: lead.id, p_actor: user.id, p_company_key: parsed.companyKey, p_identity_evidence: parsed.identityEvidence, p_claim_included: parsed.claimIncluded, p_label: parsed.label || null, p_notes: parsed.notes || null, p_request_id: parsed.requestId })
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data; const result = String(row?.result || '')
    if (!['created','duplicate'].includes(result)) return { success: false, error: ({ identity_conflict:'企業識別キーの確認根拠が一致しません。この案件では同じ企業キー・確認根拠を使用してください。', benefit_conflict:'この企業の初回無料特典は別の案件に適用済みです。', conflict:'同じ登録IDで異なる内容が指定されています。履歴を確認してください。' } as Record<string,string>)[result] || '試作を登録できませんでした。' }
    revalidatePath('/admin/dashboard'); return { success: true, duplicate: result === 'duplicate', trialId: row?.trial_id as string, trialNumber: row?.trial_number as number, feeAdvisory: Number(row?.fee_advisory || 0), message: result === 'duplicate' ? '同じリクエストは登録済みです。' : '試作を登録しました。' }
  } catch (e) { return { success: false, error: e instanceof MailError ? e.message : '試作を登録できませんでした。入力内容・履歴を確認してください。' } }
}
export async function recordOemTrialResult(trialId: string, result: string, notes: string, expectedVersion: number) {
  try { const user = await requireMailAdmin(); const id = uuid(trialId); if (!['pass','fail','needs_revision','cancelled'].includes(result) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || typeof notes !== 'string' || notes.trim().length > 2000) return { success: false, error: '試作結果を確認してください。' }; const { data, error } = await adminClient.rpc('record_oem_trial_result', { p_trial_id: id, p_actor: user.id, p_result: result, p_notes: notes.trim(), p_expected_version: expectedVersion }); if (error) throw error; const row = Array.isArray(data) ? data[0] : data; if (row?.result !== 'saved') return { success: false, error: row?.result === 'conflict' ? '他の管理者が更新しました。' : '試作結果を保存できませんでした。' }; revalidatePath('/admin/dashboard'); return { success: true } } catch (e) { return { success: false, error: e instanceof MailError ? e.message : '試作結果を保存できませんでした。' } }
}
