import { createHash, randomBytes } from 'node:crypto'
import { MailError } from './oem-mail-security'

export type ApprovalKind = 'trial' | 'label' | 'specification'
export type ApprovalAction = 'approve' | 'request_changes'
export const APPROVAL_KINDS: ApprovalKind[] = ['trial', 'label', 'specification']
export function tokenPair() { const token = randomBytes(32).toString('hex'); return { token, hash: createHash('sha256').update(token).digest('hex') } }
export function approvalTokenHash(token: unknown): string { if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) throw new Error('承認リンクが不正です。'); return createHash('sha256').update(token.toLowerCase()).digest('hex') }
export function validateApprovalKind(value: unknown): ApprovalKind { if (!APPROVAL_KINDS.includes(value as ApprovalKind)) throw new MailError('承認種別が不正です。'); return value as ApprovalKind }
export function validateApprovalContent(content: unknown): { name: string; version: string; body: string; hash: string } {
  if (!content || typeof content !== 'object') throw new MailError('承認内容を入力してください。')
  const c = content as Record<string, unknown>
  if (typeof c.name !== 'string' || typeof c.version !== 'string' || typeof c.body !== 'string') throw new MailError('承認内容を確認してください。')
  const name = c.name.trim(), version = c.version.trim(), body = c.body.trim()
  if (!name || !version || !body || name.length > 200 || version.length > 100 || body.length > 20000 || /[\r\n]/.test(name + version)) throw new MailError('承認内容を確認してください。')
  return { name, version, body, hash: createHash('sha256').update(`${name}\n${version}\n${body}`).digest('hex') }
}
