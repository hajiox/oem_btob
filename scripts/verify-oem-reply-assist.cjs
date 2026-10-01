/* Offline contract checks for the reply-assist orchestrator and route. No Google, DB, or mail. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const lead = { id: '11111111-1111-4111-8111-111111111111', email: 'demo@example.invalid', company_name: '返信案テスト', contact_name: 'テスト担当' }
const snapshot = 'a'.repeat(64)
const originalLoad = Module._load
const MailError = class MailError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
let state
const prepared = () => ({ source: 'template', templateId: 'acknowledge', snapshot: state.currentSnapshot, contextSnapshot: state.contextSnapshot, subject: 'Re: OEM', text: 'テンプレート', warnings: [], sourceMessageId: 'inbound-1', question: '仕様を確認したいです。', facts: ['正式発注：未発行'], aiConfigured: true, aiTemplateText: '定型文', aiFacts: ['正式発注：未発行'] })
function loadTs(file, mocks) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const previous = Module._load; Module._load = function (request, parent, isMain) { if (request in mocks) return mocks[request]; if (request === 'server-only') return {}; return previous.call(this, request, parent, isMain) }
  const module = { exports: {} }
  try { new Function('require', 'module', 'exports', compiled)(require, module, module.exports) } finally { Module._load = previous }
  return module.exports
}

async function orchestratorChecks() {
  let rpcCalls; let providerCalls
  state = { currentSnapshot: snapshot, contextSnapshot: snapshot, begin: 'claimed', finish: true, provider: { text: '確認してご案内します。', warnings: [] } }
  const assist = loadTs(path.resolve(__dirname, '../src/lib/oem-reply-assist.ts'), {
    '@/lib/supabase/admin': { adminClient: {} },
    '@/lib/oem-mail-security': { MailError, hashMail: value => `h:${value.length}`, uuid: value => { if (!/^[0-9a-f-]{36}$/.test(value)) throw new MailError('bad id'); return value } },
    '@/lib/oem-reply-context': { cleanQuestion: value => value, prepareReplyContext: async () => prepared() },
    '@/lib/oem-reply-ai': { generateReplyWithGemini: async () => { providerCalls++; if (state.provider instanceof Error) throw state.provider; return state.provider }, replyAiModel: () => 'gemini-2.5-flash' },
    '@/lib/oem-reply-assist-shared': { replyTemplateId: value => { if (value !== 'acknowledge') throw new Error('bad'); return value } },
  })
  const db = { rpc: async (name, args) => { rpcCalls.push([name, args]); if (name === 'begin_oem_reply_generation') return { data: [{ result: state.begin, generation: state.generation || null }], error: null }; return { data: state.finish, error: null } } }
  // Re-load with the controllable DB mock (the module captures db at import time).
  rpcCalls = []; providerCalls = 0; state.begin = 'claimed'; state.finish = true
  const mod = loadTs(path.resolve(__dirname, '../src/lib/oem-reply-assist.ts'), {
    '@/lib/supabase/admin': { adminClient: db }, '@/lib/oem-mail-security': { MailError, hashMail: value => `h:${value.length}`, uuid: value => value }, '@/lib/oem-reply-context': { cleanQuestion: value => value, prepareReplyContext: async () => prepared() }, '@/lib/oem-reply-ai': { generateReplyWithGemini: async () => { providerCalls++; if (state.provider instanceof Error) throw state.provider; const result = state.provider; if (state.flipAfterProvider) state.currentSnapshot = 'c'.repeat(64); return result }, replyAiModel: () => 'gemini-2.5-flash' }, '@/lib/oem-reply-assist-shared': { replyTemplateId: value => { if (value !== 'acknowledge') throw new Error('bad'); return value } },
  })
  const input = { snapshot, question: '問い合わせ', instruction: '', consentConfirmed: true, requestId: '22222222-2222-4222-8222-222222222222' }
  state.contextSnapshot = snapshot
  assert.equal(prepared().contextSnapshot, snapshot)
  assert(prepared().aiFacts.every(fact => !fact.includes('下書き')), 'AI facts must exclude draft text')
  assert.deepEqual(mod.replyContextStamp({ templateId: 'acknowledge', contextSnapshot: snapshot }), { templateId: 'acknowledge', contextSnapshot: snapshot })
  const stamp = { templateId: 'acknowledge', contextSnapshot: snapshot }; assert.equal((await mod.prepareReply(lead, 'acknowledge')).contextSnapshot, snapshot); state.contextSnapshot = 'd'.repeat(64); await assert.rejects(() => mod.validateReplyFacts(lead, 'acknowledge', stamp), /変わりました/); state.contextSnapshot = snapshot; assert.throws(() => mod.replyContextStamp({ templateId: 'bad', contextSnapshot: snapshot }))
  const first = await mod.generateReply(lead, 'admin-1', 'acknowledge', input); assert.equal(first.success, true); assert.equal(providerCalls, 1); assert.equal(rpcCalls.filter(c => c[0] === 'begin_oem_reply_generation').length, 1); assert(rpcCalls.some(c => c[0] === 'finish_oem_reply_generation'))
  state.begin = 'ready'; state.generation = { subject: '保存済み', text_body: '保存済み本文', warnings: [] }; providerCalls = 0; const ready = await mod.generateReply(lead, 'admin-1', 'acknowledge', input); assert.equal(ready.candidate.text, '保存済み本文'); assert.equal(providerCalls, 0)
  for (const result of ['pending', 'failed']) { state.begin = result; providerCalls = 0; await assert.rejects(() => mod.generateReply(lead, 'admin-1', 'acknowledge', input)); assert.equal(providerCalls, 0) }
  state.begin = 'claimed'; state.currentSnapshot = 'b'.repeat(64); providerCalls = 0; await assert.rejects(() => mod.generateReply(lead, 'admin-1', 'acknowledge', input), /再準備/); assert.equal(providerCalls, 0)
  state.currentSnapshot = snapshot; state.provider = new Error('provider down'); providerCalls = 0; await assert.rejects(() => mod.generateReply(lead, 'admin-1', 'acknowledge', input)); assert.equal(providerCalls, 1); assert(rpcCalls.filter(c => c[0] === 'finish_oem_reply_generation').length >= 2)
  state.provider = { text: '確認してご案内します。', warnings: [] }; state.flipAfterProvider = true; state.currentSnapshot = snapshot; providerCalls = 0; await assert.rejects(() => mod.generateReply(lead, 'admin-1', 'acknowledge', input), /再準備/); assert.equal(providerCalls, 1); state.flipAfterProvider = false
  await assert.rejects(() => mod.generateReply(lead, 'admin-1', 'acknowledge', { ...input, consentConfirmed: false }))
  return mod
}

async function routeChecks() {
  let origin = true; let admin = true; let leadLookup = true; const calls = []
  const route = loadTs(path.resolve(__dirname, '../src/app/api/oem/reply-assist/route.ts'), {
    '@/lib/oem-mail-security': { requireMailAdmin: async () => { if (!admin) throw new MailError('denied', 403); return { id: 'actor' } }, checkMailOrigin: () => { if (!origin) throw new MailError('origin', 403) }, requireOemMailLead: async () => { if (!leadLookup) throw new MailError('scope', 404); return lead }, MailError, mailFailure: error => Response.json({ success: false, error: error.message }, { status: error.status || 503 }) },
    '@/lib/oem-reply-assist': { prepareReply: async () => ({ snapshot, contextSnapshot: snapshot, subject: 'x', text: 'x', warnings: [], sourceMessageId: null }), validateReply: async () => ({ success: true }), validateReplyFacts: async () => ({ success: true }), replyContextStamp: value => value, generateReply: async (...args) => { calls.push(args); return { success: true } } },
    '@/lib/oem-reply-assist-shared': { replyTemplateId: value => { if (value !== 'acknowledge') throw new Error('bad'); return value } },
  })
  const post = async body => route.POST(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
  let response = await post({ action: 'generate', leadId: lead.id, templateId: 'acknowledge', snapshot, question: 'q', instruction: '', consentConfirmed: true, requestId: '22222222-2222-4222-8222-222222222222' }); assert.equal(response.status, 200); assert.equal(calls.length, 1)
  response = await post({ action: 'generate', leadId: lead.id, templateId: 'acknowledge', snapshot, question: 'q', instruction: '', consentConfirmed: true, requestId: '22222222-2222-4222-8222-222222222222', extra: 'reject' }); assert.equal(response.status, 400)
  admin = false; response = await post({ action: 'prepare', leadId: lead.id, templateId: 'acknowledge' }); assert.equal(response.status, 403); admin = true
  origin = false; response = await post({ action: 'prepare', leadId: lead.id, templateId: 'acknowledge' }); assert.equal(response.status, 403); origin = true
  leadLookup = false; response = await post({ action: 'prepare', leadId: lead.id, templateId: 'acknowledge' }); assert.equal(response.status, 404)
  leadLookup = true; response = await post({ action: 'prepare', leadId: lead.id, templateId: 'acknowledge', extra: 'x' }); assert.equal(response.status, 400)
  response = await post({ action: 'validate', leadId: lead.id, templateId: 'acknowledge', snapshot, contextSnapshot: snapshot }); assert.equal(response.status, 400)
  response = await post({ action: 'validate', leadId: lead.id, templateId: 'acknowledge', contextSnapshot: snapshot }); assert.equal(response.status, 200)
  response = await post({ action: 'generate', leadId: lead.id, templateId: 'acknowledge', snapshot, question: 'x'.repeat(25000), instruction: '', consentConfirmed: true, requestId: '22222222-2222-4222-8222-222222222222' }); assert.equal(response.status, 413)
}

(async () => { await orchestratorChecks(); await routeChecks(); console.log('OEM reply assist checks: PASS (consent, snapshots, ledger states, provider failure, route auth/scope/body contract; no external calls)') })().catch(error => { console.error('OEM reply assist checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
