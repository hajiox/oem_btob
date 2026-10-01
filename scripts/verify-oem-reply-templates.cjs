/* Pure local verification for the reply context redaction and templates.
 * This script does not load Next, Supabase, Gmail, or any network client. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(file, modules) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const sandbox = { exports: module.exports, module, console }
  sandbox.require = name => name === 'node:crypto' ? crypto : (modules[name] || {})
  vm.runInNewContext(compiled, sandbox, { filename: file })
  return sandbox.module.exports
}

const labels = { issued: '規約同意待ち', accepted: '正式発注受付済み', deposit_paid: '前金入金済み', in_production: '製造中', balance_due: '残額請求中', paid: '全額入金済み', shipped: '出荷済み', cancelled: 'キャンセル' }
const template = load('src/lib/oem-reply-templates.ts', {
  '@/lib/oem-conversations': { mailSubject: (subject, id) => `${subject} [OEM-${id}]` },
  '@/lib/oem-order-shared': { OEM_ORDER_STATUS_LABELS: labels },
})
const context = load('src/lib/oem-reply-context.ts', {
  'server-only': {},
  '@/lib/supabase/admin': { adminClient: {} },
  '@/lib/oem-terms': { OEM_TERMS_VERSION: '2026-09-27-v1' },
  '@/lib/oem-order-shared': { OEM_ORDER_STATUS_LABELS: labels },
  '@/lib/oem-reply-assist-shared': { replyTemplateId: value => value },
  '@/lib/oem-reply-templates': template,
})

function assert(condition, message) { if (!condition) throw new Error(message) }
const lead = { id: 'lead-1', email: 'client@example.com', company_name: 'Example株式会社', contact_name: '山田太郎' }
const redacted = context.cleanQuestion('山田太郎です。価格10000000、電話 03-1234-5678、https://example.com token=abcdef123456', lead)
assert(!redacted.includes('client@example.com') && !redacted.includes('03-1234-5678'), 'PII redaction failed')
assert(redacted.includes('10000000'), 'numeric price was incorrectly redacted')
assert(redacted.includes('[URL]') && redacted.includes('[機密情報]'), 'URL/secret redaction failed')
const long = context.cleanQuestion('x'.repeat(7000), lead)
assert(long.length <= 6000, 'question truncation exceeded 6000 characters')
const snapshotPayload = { order: { status: 'in_production', amount: 100000 }, inbound: { id: 'm1', text: '質問' } }
const firstHashes = context.replySnapshotHashes(snapshotPayload, { updated_at: '1', text_body: '下書きA' })
const changedDraftHashes = context.replySnapshotHashes(snapshotPayload, { updated_at: '2', text_body: '下書きB' })
const changedFactHashes = context.replySnapshotHashes({ ...snapshotPayload, order: { status: 'shipped', amount: 100000 } }, { updated_at: '1', text_body: '下書きA' })
assert(firstHashes.contextSnapshot === changedDraftHashes.contextSnapshot, 'context snapshot changed when only draft changed')
assert(firstHashes.snapshot !== changedDraftHashes.snapshot, 'full snapshot did not change when draft changed')
assert(firstHashes.contextSnapshot !== changedFactHashes.contextSnapshot, 'context snapshot ignored fact change')
const selected = context.safeSelectedOptions([
  { question: '商品', answer: 'カレー' },
  { question: '包装', answer: '化粧箱' },
  { question: 'レシピ・配合', answer: '秘密の配合' },
  { question: '同意', answer: 'はい' },
  { question: '商品', answer: 'x'.repeat(201) },
])
assert(selected.length === 2 && selected.every(item => item.answer !== '秘密の配合'), 'selected option allowlist failed')

const mock = {
  lead,
  order: { id: 'o1', revision: 1, status: 'in_production', formal_quote_amount: 100000, deposit_amount: 50000, final_amount: null, terms_version: '2026-09-27-v1', accepted_at: '2026-10-01T00:00:00Z' },
  fulfillment: { planned_quantity: 400, quantity_unit: '個', completed_quantity: null, shipped_on: null, carrier: '', tracking_number: '' },
  plans: [{ id: 'p1', stage: 'balance', expected_amount: 55000 }], receiptTotals: { deposit: 50000, balance: 0 }, settlement: null, cashNet: 0, ledgerReceived: 50000, settlementRemaining: null, legacyCancellation: false,
  draft: null, inbound: { id: 'm1' }, question: '', sourceSubject: '進捗確認', warnings: [], selectedOptions: [{ question: '商品', answer: 'カレー' }],
}
for (const id of ['payment', 'progress', 'shipping', 'settlement']) {
  const result = template.buildReplyTemplate(mock, id)
  assert(result.subject.length <= 200, `${id} subject exceeds 200 characters`)
  assert(result.text.includes('製造中') || id === 'settlement', `${id} omitted current status/facts`)
}
const legacy = { ...mock, order: null, plans: [], settlement: { id: 's1', kind: 'cancellation', state: 'confirmed', target_gross: 30000 }, settlementRemaining: 30000, legacyCancellation: true }
const settlement = template.buildReplyTemplate(legacy, 'settlement')
assert(!settlement.text.includes('資材手配前は30,000円'), 'legacy settlement template made a current policy promise')
console.log('reply template/context verification passed')
