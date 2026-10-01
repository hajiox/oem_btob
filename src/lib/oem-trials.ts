import { createHash } from 'node:crypto'

export const OEM_TRIAL_INCLUDED = 2
export const OEM_TRIAL_ADDITIONAL_FEE = 3000
export const OEM_TRIAL_BASE_FEE = 10000
export const OEM_TRIAL_NORMAL_VALUE = 50000

export type TrialResult = 'pending' | 'pass' | 'fail' | 'needs_revision' | 'cancelled'
export type TrialInput = { companyKey: string; identityEvidence: string; claimIncluded: boolean; label?: string; notes?: string; requestId: string }

export function normalizeCompanyKey(value: unknown): string {
  if (typeof value !== 'string') throw new Error('企業識別キーを入力してください。')
  const key = value.trim().normalize('NFKC').toLowerCase()
  if (!key || key.length > 200 || key.includes('\n')) throw new Error('企業識別キーを確認してください。')
  return key
}
export function validateIdentityEvidence(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) throw new Error('本人・企業確認の根拠を入力してください。')
  return value.trim()
}
export function validateTrialInput(input: TrialInput): TrialInput {
  if (!input || typeof input !== 'object' || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error('リクエストIDが不正です。')
  if (typeof input.claimIncluded !== 'boolean') throw new Error('無料特典の適用を明示してください。')
  return { companyKey: normalizeCompanyKey(input.companyKey), identityEvidence: validateIdentityEvidence(input.identityEvidence), claimIncluded: input.claimIncluded, label: cleanOptional(input.label, 500), notes: cleanOptional(input.notes, 2000), requestId: input.requestId.toLowerCase() }
}
function cleanOptional(value: unknown, max: number): string | undefined { if (value == null || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > max) throw new Error('入力内容が長すぎます。'); return value.trim() }
export function trialSnapshotHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
