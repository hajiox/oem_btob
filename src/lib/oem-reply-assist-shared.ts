export const REPLY_TEMPLATES = [
  { id: 'acknowledge', label: 'お問い合わせ受付' },
  { id: 'materials', label: '支給原料の確認' },
  { id: 'trial', label: '試作・初回特典のご案内' },
  { id: 'payment', label: '発注・お支払いのご案内' },
  { id: 'progress', label: '製造状況のご案内' },
  { id: 'shipping', label: '出荷状況のご案内' },
  { id: 'settlement', label: '変更・キャンセル精算' },
] as const
export type ReplyTemplateId = typeof REPLY_TEMPLATES[number]['id']
export type ReplySuggestion = {
  source: 'template' | 'ai'; templateId: ReplyTemplateId; snapshot: string
  subject: string; text: string; warnings: string[]; sourceMessageId: string | null
  contextSnapshot?: string
}
export type ReplyContextStamp = { templateId: ReplyTemplateId; contextSnapshot: string }
export type PreparedReply = ReplySuggestion & {
  question: string; sourceSubject: string | null; facts: string[]; aiConfigured: boolean
  aiTemplateText?: string; aiFacts?: string[]
}
export function replyTemplateId(value: unknown): ReplyTemplateId {
  if (typeof value !== 'string' || !REPLY_TEMPLATES.some(item => item.id === value)) throw new Error('定型文を選択してください。')
  return value as ReplyTemplateId
}
