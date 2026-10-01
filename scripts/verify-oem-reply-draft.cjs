/* Offline route guards for draft/save and send. No Gmail, DB, or external calls. */
const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript')
const lead = { id: '11111111-1111-4111-8111-111111111111', email: 'demo@example.invalid', company_name: '返信案テスト', contact_name: 'テスト担当' }
const snapshot = 'a'.repeat(64); let stale = false; let saved = 0; let sent = 0; let validated = 0
class MailError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
const originalLoad = Module._load
const mocks = {
  '@/lib/oem-mail-security': { requireMailAdmin: async () => ({ id: 'actor' }), checkMailOrigin: () => {}, requireOemMailLead: async () => lead, MailError, mailFailure: error => Response.json({ success: false, error: error.message }, { status: error.status || 503 }) },
  '@/lib/oem-conversations': { getMailboxStatus: async () => ({}), listConversation: async () => ({}), syncConversation: async () => ({}), saveConversationDraft: async (...args) => { saved++; assert.equal(args[5].contextSnapshot, snapshot); return { success: true } }, sendConversation: async () => { sent++; return { success: true } }, reviewConversationMessages: async () => ({}), handleConversationMessage: async () => ({}) },
  '@/lib/oem-reply-assist': { replyContextStamp: value => value, validateReplyFacts: async () => { validated++; if (stale) throw new MailError('stale', 409); return { success: true } } },
}
const file = path.resolve(__dirname, '../src/app/api/oem/mail/route.ts'); const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
Module._load = function (request, parent, isMain) { if (request in mocks) return mocks[request]; return originalLoad.call(this, request, parent, isMain) }
const mod = { exports: {} }; try { new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports) } finally { Module._load = originalLoad }
const post = body => mod.exports.POST(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
(async () => {
  const base = { leadId: lead.id, subject: `Re: [OEM-${lead.id}]`, text: '本文', expectedUpdatedAt: null, replyContext: { templateId: 'acknowledge', contextSnapshot: snapshot } }
  let response = await post({ action: 'draft', ...base }); assert.equal(response.status, 200); assert.equal(saved, 1); assert.equal(validated, 1)
  stale = true; response = await post({ action: 'draft', ...base }); assert.equal(response.status, 409); assert.equal(saved, 1); stale = false
  response = await post({ action: 'send', ...base, requestId: '22222222-2222-4222-8222-222222222222' }); assert.equal(response.status, 200); assert.equal(sent, 1)
  stale = true; response = await post({ action: 'send', ...base, requestId: '33333333-3333-4333-8333-333333333333' }); assert.equal(response.status, 409); assert.equal(sent, 1)
  console.log('OEM reply draft/send checks: PASS (fresh context required before save/send; stale guard prevents both; no external calls)')
})().catch(error => { console.error('OEM reply draft/send checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
