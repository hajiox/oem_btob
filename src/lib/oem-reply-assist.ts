import 'server-only'
import { adminClient as db } from '@/lib/supabase/admin'
import { MailError, hashMail, uuid } from '@/lib/oem-mail-security'
import { cleanQuestion, prepareReplyContext, type ValidatedReplyLead } from '@/lib/oem-reply-context'
import { generateReplyWithGemini, replyAiModel } from '@/lib/oem-reply-ai'
import { replyTemplateId, type PreparedReply, type ReplySuggestion, type ReplyTemplateId, type ReplyContextStamp } from '@/lib/oem-reply-assist-shared'

export const DEFAULT_REPLY_INSTRUCTION = '確認済みの事実と定型文に沿って、簡潔で丁寧な返信案を作ってください。未確認の条件は約束せず、確認してご案内する表現にしてください。'
export function replySnapshot(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new MailError('返信案を再準備してください。')
  return value
}
function must(error: unknown) { if (error) throw new MailError('返信案の処理結果を保存・確認できませんでした。同じIDで結果を確認してください。', 503) }
function anonymous(value: string, lead: ValidatedReplyLead) { return cleanQuestion(value, lead).replace(/追跡番号：[^\n]+/g, '追跡番号：記録済み（AIには番号を渡しません）') }
export async function prepareReply(lead: ValidatedReplyLead, templateId: ReplyTemplateId): Promise<PreparedReply> {
  const prepared = await prepareReplyContext(lead, templateId)
  // Names/signatures remain local. Only the displayed, allowlisted facts go to Google.
  const body = prepared.text.split('\n\n').slice(1).join('\n\n')
  return { ...prepared, aiTemplateText: anonymous(body, lead), aiFacts: prepared.facts.map(fact => anonymous(fact, lead)) }
}
export async function validateReply(lead: ValidatedReplyLead, templateId: ReplyTemplateId, snapshot: unknown) {
  const current = await prepareReply(lead, templateId)
  if (current.snapshot !== replySnapshot(snapshot)) throw new MailError('案件・受信メール・共有下書きが変わりました。返信案を再準備してください。', 409)
  return { success: true }
}
export function replyContextStamp(value: unknown): ReplyContextStamp | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) throw new MailError('返信案の参照情報を確認してください。')
  const input = value as Record<string, unknown>
  let templateId: ReplyTemplateId
  try { templateId = replyTemplateId(input.templateId) } catch { throw new MailError('返信案の参照情報を確認してください。') }
  return { templateId, contextSnapshot: replySnapshot(input.contextSnapshot) }
}
export async function validateReplyFacts(lead: ValidatedReplyLead, stamp: ReplyContextStamp) {
  const current = await prepareReply(lead, stamp.templateId)
  if (current.contextSnapshot !== stamp.contextSnapshot) throw new MailError('返信案の作成後に案件・入金・受信メールが変わりました。返信案を再準備してください。', 409)
  return { success: true }
}
type Generation = { subject: string; text_body: string; warnings: string[] }
type GenerateInput = { snapshot: unknown; question: unknown; instruction: unknown; consentConfirmed: unknown; requestId: unknown }
export async function generateReply(lead: ValidatedReplyLead, actor: string, templateId: ReplyTemplateId, input: GenerateInput) {
  if (input.consentConfirmed !== true) throw new MailError('AIに送る内容を確認してください。')
  const requestId = uuid(input.requestId), snapshot = replySnapshot(input.snapshot)
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 6000 || input.question.includes('\0') || typeof input.instruction !== 'string' || input.instruction.length > 1000 || input.instruction.includes('\0')) throw new MailError('問い合わせ文と追加指示の長さ・内容を確認してください。')
  const question = input.question.trim(), instruction = input.instruction.trim() || DEFAULT_REPLY_INSTRUCTION
  if (anonymous(question, lead) !== question || anonymous(instruction, lead) !== instruction) throw new MailError('問い合わせ文・追加指示に氏名、メール、URL、機密情報などがあります。伏せてから内容を確認してください。')
  const prepared = await prepareReply(lead, templateId)
  if (prepared.snapshot !== snapshot) throw new MailError('案件・受信メール・共有下書きが変わりました。返信案を再準備してください。', 409)
  if (!prepared.aiConfigured) throw new MailError('AI返信案は未設定です。定型文をご利用ください。', 503)
  const model = replyAiModel()
  const requestHash = hashMail(JSON.stringify({ leadId: lead.id, actor, templateId, snapshot, question, instruction, model }))
  const claimed = await db.rpc('begin_oem_reply_generation', { p_id: requestId, p_lead: lead.id, p_actor: actor, p_hash: requestHash, p_snapshot: snapshot, p_template: templateId, p_model: model })
  must(claimed.error)
  const record = claimed.data?.[0] as { result: string; generation: Generation | null } | undefined
  if (record?.result === 'ready' && record.generation) return { success: true, candidate: { source: 'ai', templateId, snapshot, contextSnapshot: prepared.contextSnapshot, subject: record.generation.subject, text: record.generation.text_body, warnings: record.generation.warnings, sourceMessageId: prepared.sourceMessageId } satisfies ReplySuggestion }
  if (record?.result === 'rate_limit') throw new MailError('AI返信案は担当者ごとに1時間20回までです。定型文を使うか、時間をおいてください。', 429)
  if (record?.result === 'pending') throw new MailError('この生成は処理中、または結果未確認です。同じIDで結果を確認できます。再生成は行っていません。', 409)
  if (record?.result === 'failed') throw new MailError('この生成は失敗済みです。定型文を使うか、内容を確認して新しく準備してください。', 409)
  if (record?.result !== 'claimed') throw new MailError('返信案のID・案件・権限を確認してください。', 409)
  try {
    const generated = await generateReplyWithGemini({ question, instruction, templateText: prepared.aiTemplateText || '', facts: prepared.aiFacts || [] })
    await validateReply(lead, templateId, snapshot)
    const text = `${lead.company_name}\n${lead.contact_name} 様\n\n${generated.text}\n\n会津ブランド館`
    if (text.length > 10000) throw new MailError('返信案が長すぎます。定型文をご利用ください。', 503)
    const warnings = Array.from(new Set([...prepared.warnings, ...generated.warnings])).slice(0, 6)
    const finished = await db.rpc('finish_oem_reply_generation', { p_id: requestId, p_actor: actor, p_status: 'ready', p_subject: prepared.subject, p_text: text, p_warnings: warnings, p_failure: null })
    must(finished.error)
    if (finished.data !== true) throw new MailError('返信案の保存結果を確認できません。同じIDで結果を確認してください。', 503)
    return { success: true, candidate: { source: 'ai', templateId, snapshot, contextSnapshot: prepared.contextSnapshot, subject: prepared.subject, text, warnings, sourceMessageId: prepared.sourceMessageId } satisfies ReplySuggestion }
  } catch (error) {
    // Never retry Google on an uncertain result; the request ID is an immutable audit record.
    try { await db.rpc('finish_oem_reply_generation', { p_id: requestId, p_actor: actor, p_status: 'failed', p_subject: null, p_text: null, p_warnings: [], p_failure: error instanceof MailError && error.status === 409 ? 'context_changed' : 'generation_failed' }) } catch { /* Keep pending; no blind retry. */ }
    throw error
  }
}
