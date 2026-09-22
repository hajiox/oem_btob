const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/oem-gmail-client.ts')
const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd()); mod._compile(out, file); const gmail = mod.exports

const plain = Buffer.from('hello\nworld').toString('base64url')
const msg = { id: 'm1', threadId: 't1', labelIds: ['SENT'], internalDate: '1700000000000', payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: 'staff@aizu-tv.com' }, { name: 'To', value: 'buyer@example.com' }, { name: 'Subject', value: '=?UTF-8?B?44GT44KT44Gr?=' }, { name: 'Message-ID', value: '<m1@example>' }], parts: [{ mimeType: 'text/plain', body: { data: plain } }, { mimeType: 'application/pdf', filename: 'quote.pdf', body: { attachmentId: 'a1', size: 12 } }] } }
const n = gmail.normalizeGmailMessage(msg, 'staff@aizu-tv.com'); assert.equal(n.direction, 'outbound'); assert.equal(n.text, 'hello\nworld'); assert.equal(n.attachments[0].id, 'a1')
const spoofed = { ...msg, id: 'm-spoof', labelIds: ['INBOX'], payload: { ...msg.payload, headers: msg.payload.headers.map(h => h.name === 'From' ? { ...h, value: 'staff@aizu-tv.com' } : h) } }; assert.equal(gmail.normalizeGmailMessage(spoofed, 'staff@aizu-tv.com').direction, 'inbound')
const nested = gmail.normalizeGmailMessage({ id: 'm2', threadId: 't1', payload: { mimeType: 'multipart/mixed', parts: [{ mimeType: 'application/pdf', filename: 'x.pdf', body: { data: Buffer.from('%PDF').toString('base64url') } }, { mimeType: 'text/html', body: { data: Buffer.from('<script>bad()</script><p>Hello &amp; all</p>').toString('base64url') } }] } }, 'buyer@example.com'); assert.equal(nested.text, 'Hello & all')
assert.throws(() => gmail.buildMimeMessage({ from: 'x\r\nBcc:evil@example.com', to: 'a@b.com', subject: 'x', text: 'x', messageId: '<x@b>' }), /invalid/)
assert.throws(() => gmail.validateMailAttachments([{ name: 'bad.exe', type: 'application/octet-stream', base64: 'AA' }]), /not allowed/)
assert.throws(() => gmail.validateMailAttachments([{ name: 'x.pdf', type: 'application/pdf', base64: 'A' }]), /encoding/)
const raw = gmail.buildMimeMessage({ from: 'staff@aizu-tv.com', to: 'buyer@example.com', subject: '見積り', text: '本文', messageId: '<x@example>', attachments: [{ name: '資料 日本.pdf', type: 'application/pdf', base64: Buffer.from('pdf').toString('base64') }] })
const decoded = Buffer.from(raw, 'base64url').toString(); assert.match(decoded, /multipart\/mixed/); assert.match(decoded, /filename\*=utf-8''/); assert.match(decoded, /Message-ID: <x@example>/)
assert(!decoded.split('\r\n').some(line => /^\s/.test(line) && !line.startsWith(' ')), 'unexpected MIME folding')

const oldFetch = global.fetch
global.fetch = async (_url, init) => { assert.equal(init.cache, 'no-store'); assert.match(init.headers.Authorization, /^Bearer /); return { ok: false, status: 503, json: async () => ({}) } }
;(async () => { await assert.rejects(() => new gmail.GmailClient('token').profile(), e => e instanceof gmail.GmailApiError && e.uncertain === true && e.status === 503); global.fetch = oldFetch; console.log('OEM Gmail client checks: PASS (MIME safety, parsing, bounds, transport uncertainty)') })().catch(e => { global.fetch = oldFetch; console.error('OEM Gmail client checks: FAIL'); console.error(e.stack || e); process.exitCode = 1 })
