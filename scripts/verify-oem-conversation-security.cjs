/* Focused, offline checks for the OEM mail security boundary. */
const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript')
function load(relative, aliases = {}) {
  const file = path.resolve(__dirname, '..', relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd())
  const original = mod.require.bind(mod); mod.require = id => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : original(id)
  mod._compile(output, file); return mod.exports
}
const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }) }) }) }) }
const security = load('src/lib/oem-mail-security.ts', { '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }, '@/lib/supabase/admin': { adminClient: db }, '@/lib/oem-quote-validation': { OEM_PAGE_ID: '00000000-0000-4000-8000-000000000000' } })
assert.equal(security.caseTag('00000000-0000-4000-8000-000000000001'), '[OEM-00000000-0000-4000-8000-000000000001]')
assert.throws(() => security.uuid('not-a-uuid'))
assert.throws(() => security.uuid('00000000-0000-0000-0000-000000000001'))
assert.throws(() => security.openMail('not-base64', 'staff@aizu-tv.com'))
const conversations = load('src/lib/oem-conversations.ts', {
  '@/lib/supabase/admin': { adminClient: db }, '@/lib/oem-gmail-auth': { connectedGmail: async () => { throw new Error('not called') } },
  '@/lib/oem-gmail-client': { GmailApiError: class extends Error {}, normalizeGmailMessage() {}, buildMimeMessage() {}, validateMailAttachments() { return [] } },
  '@/lib/oem-mail-security': { MailError: security.MailError, OEM_MAILBOX: 'staff@aizu-tv.com', caseTag: security.caseTag, hashMail: security.hashMail, uuid: security.uuid, mailConfigured: () => true },
})
assert.equal(conversations.isCaseParticipant('Staff <staff@aizu-tv.com>', 'Buyer <buyer@example.com>', 'buyer@example.com'), true)
assert.equal(conversations.isCaseParticipant('buyer@example.com', 'staff@aizu-tv.com', 'buyer@example.com'), true)
assert.equal(conversations.isCaseParticipant('staff@aizu-tv.com, evil@example.com', 'buyer@example.com', 'buyer@example.com'), false)
assert.throws(() => conversations.mailSubject('bad\r\nBcc: x@example.com', '00000000-0000-4000-8000-000000000001'))
assert.throws(() => conversations.mailSubject('x'.repeat(201), '00000000-0000-4000-8000-000000000001'))
console.log('OEM conversation security checks: PASS (UUID, origin-independent helpers, participant isolation, header validation)')
