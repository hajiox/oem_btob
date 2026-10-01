/* Offline contract checks for the Gemini OEM reply-draft helper. Never calls Google. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const sourcePath = require('node:path').resolve(__dirname, '../src/lib/oem-reply-ai.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const filename = sourcePath.replace(/\.ts$/, '.cjs.contract.tmp')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/oem-mail-security') return { MailError: class MailError extends Error { constructor(message, status = 400) { super(message); this.status = status } } }
  return originalLoad.call(this, request, parent, isMain)
}
const mod = { exports: {} }
try { new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports) } finally { Module._load = originalLoad }
const { generateReplyWithGemini } = mod.exports
const input = { question: '仕様を教えてください。', instruction: '丁寧に返信してください。', templateText: '標準仕様は400個です。', facts: ['標準仕様は400個です。'] }
const responseFor = payload => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] }) })
async function run() {
  let calls = 0; const originalFetch = global.fetch
  process.env.GEMINI_API_KEY = 'test-key'; delete process.env.OEM_REPLY_AI_MODEL
  global.fetch = async (url, init) => { calls++; assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'); assert.equal(init.headers['x-goog-api-key'], 'test-key'); const body = JSON.parse(init.body); assert.equal(body.generationConfig.responseMimeType, 'application/json'); assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0); return responseFor({ text: '標準仕様は400個です。', warnings: [] }) }
  const result = await generateReplyWithGemini(input); assert.equal(result.model, 'gemini-2.5-flash'); assert.equal(result.warnings.length, 1); assert.equal(calls, 1)
  global.fetch = async () => responseFor({ text: '価格は500円です。', warnings: [] }); await assert.rejects(() => generateReplyWithGemini(input), /数値/)
  global.fetch = async () => responseFor({ text: '標準仕様は4000個です。', warnings: [] }); await assert.rejects(() => generateReplyWithGemini({ ...input, facts: ['400.0個'], templateText: '400.0個' }), /数値/)
  global.fetch = async () => responseFor({ text: '口座番号を案内します。', warnings: [] }); await assert.rejects(() => generateReplyWithGemini(input), /安全/)
  global.fetch = async () => responseFor({ text: '承知しました。', warnings: [], extra: true }); await assert.rejects(() => generateReplyWithGemini(input), /形式/)
  global.fetch = async () => responseFor({ text: '承知しました。', warnings: Array(5).fill('確認') }); await assert.rejects(() => generateReplyWithGemini(input), /形式/)
  global.fetch = async () => new Response('x'.repeat(65537)); await assert.rejects(() => generateReplyWithGemini(input), /大きすぎ/)
  global.fetch = async () => responseFor({ text: 'https://example.com をご覧ください。', warnings: [] }); await assert.rejects(() => generateReplyWithGemini(input), /安全/)
  global.fetch = async () => ({ ok: true, text: async () => '{' }); await assert.rejects(() => generateReplyWithGemini(input), /応答/)
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }) }); await assert.rejects(() => generateReplyWithGemini(input), /完了/)
  delete process.env.GEMINI_API_KEY; await assert.rejects(() => generateReplyWithGemini(input), /設定/)
  global.fetch = originalFetch
  console.log('OEM reply AI checks: PASS (offline fetch contract, strict JSON, numeric/URL fail-closed, missing key, finish reason)')
}
run().catch(error => { console.error('OEM reply AI checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
