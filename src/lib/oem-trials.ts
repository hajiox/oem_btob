import { createHash } from 'node:crypto'
import { OEM_ADDITIONAL_TRIAL_FEE, OEM_NORMAL_TRIAL_FEE, OEM_INITIAL_TRIAL_FEE, OEM_NORMAL_LABEL_FEE, OEM_NORMAL_NUTRITION_FEE, OEM_NORMAL_PACKAGE_DESIGN_FEE, OEM_INITIAL_LABEL_FEE, OEM_INITIAL_NUTRITION_FEE, OEM_INITIAL_PACKAGE_DESIGN_FEE, OEM_NORMAL_OFFER_VALUE, OEM_INITIAL_OFFER_FEE } from './oem-offer-pricing'

export const OEM_TRIAL_INCLUDED = 2
export const OEM_TRIAL_ADDITIONAL_FEE = OEM_ADDITIONAL_TRIAL_FEE
export const OEM_TRIAL_BASE_FEE = OEM_NORMAL_TRIAL_FEE
export const OEM_TRIAL_INITIAL_FEE = OEM_INITIAL_TRIAL_FEE
export const OEM_TRIAL_LABEL_FEE = OEM_NORMAL_LABEL_FEE
export const OEM_TRIAL_NUTRITION_FEE = OEM_NORMAL_NUTRITION_FEE
export const OEM_TRIAL_PACKAGE_DESIGN_FEE = OEM_NORMAL_PACKAGE_DESIGN_FEE
export const OEM_TRIAL_INITIAL_LABEL_FEE = OEM_INITIAL_LABEL_FEE
export const OEM_TRIAL_INITIAL_NUTRITION_FEE = OEM_INITIAL_NUTRITION_FEE
export const OEM_TRIAL_INITIAL_PACKAGE_DESIGN_FEE = OEM_INITIAL_PACKAGE_DESIGN_FEE
export const OEM_TRIAL_NORMAL_VALUE = OEM_NORMAL_OFFER_VALUE
export const OEM_TRIAL_INITIAL_VALUE = OEM_INITIAL_OFFER_FEE

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
  if (typeof input.claimIncluded !== 'boolean') throw new Error('初回特典の適用を明示してください。')
  return { companyKey: normalizeCompanyKey(input.companyKey), identityEvidence: validateIdentityEvidence(input.identityEvidence), claimIncluded: input.claimIncluded, label: cleanOptional(input.label, 500), notes: cleanOptional(input.notes, 2000), requestId: input.requestId.toLowerCase() }
}
function cleanOptional(value: unknown, max: number): string | undefined { if (value == null || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > max) throw new Error('入力内容が長すぎます。'); return value.trim() }
export function trialSnapshotHash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
