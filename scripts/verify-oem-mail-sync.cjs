// Offline execution of the real background-sync and route handlers.
// Gmail/database calls are replaced; no credentials or customer mail are used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function load(relative, aliases) {
  const file = path.resolve(__dirname, '..', relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(file)
  mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd())
  const original = mod.require.bind(mod)
  mod.require = name => Object.hasOwn(aliases, name) ? aliases[name] : original(name)
  mod._compile(output, file)
  return mod.exports
}
class MailError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
class GmailApiError extends Error { constructor(status) { super('mock Google failure'); this.status = status } }
const OEM = '35e7d402-0443-4703-94a4-fc2873b8f933'
const lead = { id: '01234567-89ab-4cde-8fab-0123456789ab', email: 'test@example.invalid' }
const other = '01234567-89ab-4cde-8fab-0123456789ac'
const tag = `[OEM-${lead.id}]`
const inbound = subject => ({ subject, from: lead.email, to: 'staff@aizu-tv.com' })
const security = {
  MailError, OEM_MAILBOX: 'staff@aizu-tv.com',
  mailFailure: error => Response.json({ success: false, error: error.message }, { status: error.status || 503 }),
}

function fixture(checkpoint = { query_text: null, page_token: null, last_completed_at: null }) {
  const calls = { finish: [], stored: [], connected: 0, listed: [], threads: [] }
  const state = { claimed: checkpoint, listResult: { threads: [] }, listError: null, threadError: null, threads: new Map() }
  const client = {
    async listThreads(query, token) { calls.listed.push({ query, token }); if (state.listError) throw state.listError; return state.listResult },
    async thread(id) { calls.threads.push(id); if (state.threadError) throw state.threadError; return state.threads.get(id) },
    async send() { assert.fail('Background synchronization must never send mail') },
  }
  const db = {
    async rpc(name, payload) {
      if (name === 'claim_oem_mail_sync') return { data: state.claimed ? [state.claimed] : [], error: null }
      assert.equal(name, 'finish_oem_mail_sync'); calls.finish.push(payload); return { data: true, error: null }
    },
    from(table) {
      assert.equal(table, 'leads')
      let id, page
      const chain = { select() { return chain }, eq(key, value) { if (key === 'id') id = value; if (key === 'page_id') page = value; return chain }, async maybeSingle() { assert.equal(page, OEM); return { data: id === lead.id ? lead : null, error: null } } }
      return chain
    },
  }
  const exported = load('src/lib/oem-mail-sync.ts', {
    '@/lib/supabase/admin': { adminClient: db },
    '@/lib/oem-gmail-auth': { connectedGmail: async () => { calls.connected++; return client } },
    '@/lib/oem-gmail-client': { GmailApiError, normalizeGmailMessage: value => value },
    '@/lib/oem-conversations': {
      getMailboxStatus: async () => ({ connected: true }),
      isCaseParticipant: (from, to, email) => from === email && to === 'staff@aizu-tv.com',
      storeConversationThread: async (_client, id, foundLead, thread) => { assert.equal(foundLead.id, lead.id); assert.equal(thread.id, id); calls.stored.push(id); return 1 },
    },
    '@/lib/oem-mail-security': security,
    '@/lib/oem-quote-validation': { OEM_PAGE_ID: OEM },
  })
  return { ...exported, calls, state }
}

async function main() {
  const skipped = fixture(); skipped.state.claimed = null
  assert.equal((await skipped.runOemMailboxSync()).skipped, true)
  assert.equal(skipped.calls.connected, 0)

  const scan = fixture()
  scan.state.listResult = { threads: ['valid', 'unknown', 'merged', 'stranger', 'no-tag'].map(id => ({ id })), nextPageToken: 'page-two' }
  scan.state.threads.set('valid', { id: 'valid', messages: [inbound(tag)] })
  scan.state.threads.set('unknown', { id: 'unknown', messages: [inbound(`[OEM-${other}]`)] })
  scan.state.threads.set('merged', { id: 'merged', messages: [inbound(`${tag} [OEM-${other}]`)] })
  scan.state.threads.set('stranger', { id: 'stranger', messages: [{ ...inbound(tag), from: 'stranger@example.invalid' }] })
  scan.state.threads.set('no-tag', { id: 'no-tag', messages: [inbound('unrelated personal mail')] })
  assert.equal((await scan.runOemMailboxSync()).hasMore, true)
  assert.deepEqual(scan.calls.stored, ['valid'])
  assert.match(scan.calls.listed[0].query, /^subject:"OEM-" before:\d+$/)
  assert.equal(scan.calls.finish[0].p_page_token, 'page-two')
  assert.equal(scan.calls.finish[0].p_complete, false)

  const resume = fixture({ query_text: 'subject:"OEM-" after:1700000000 before:1700001000', page_token: 'page-two', last_completed_at: '2023-11-01T00:00:00Z' })
  await resume.runOemMailboxSync()
  assert.deepEqual(resume.calls.listed, [{ query: resume.state.claimed.query_text, token: 'page-two' }])
  assert.equal(resume.calls.finish[0].p_complete, true)

  const incremental = fixture({ query_text: null, page_token: null, last_completed_at: '2026-09-30T00:00:00Z' })
  await incremental.runOemMailboxSync()
  assert.match(incremental.calls.listed[0].query, new RegExp(`after:${Date.parse('2026-09-30T00:00:00Z') / 1000 - 86400} `))

  const failure = fixture(); failure.state.listError = new GmailApiError(503)
  await assert.rejects(() => failure.runOemMailboxSync(), error => error.status === 503)
  assert.match(failure.calls.finish[0].p_query_text, /before:\d+/)
  assert.equal(failure.calls.finish[0].p_complete, false)
  assert.equal(failure.calls.finish[0].p_page_token, null)
  assert(!failure.calls.finish[0].p_error.includes('mock'), 'raw provider detail must not leak')

  const expired = fixture({ query_text: 'subject:"OEM-" before:1700001000', page_token: 'expired', last_completed_at: null })
  expired.state.listError = new GmailApiError(400)
  await assert.rejects(() => expired.runOemMailboxSync())
  assert.equal(expired.calls.finish[0].p_query_text, null)
  assert.equal(expired.calls.finish[0].p_page_token, null)

  let runs = 0
  const cron = load('src/app/api/oem/mail/sync/route.ts', {
    '@/lib/oem-mail-sync': { runOemMailboxSync: async () => { runs++; return { success: true } } },
    '@/lib/oem-mail-security': security,
  })
  const previous = process.env.CRON_SECRET
  try {
    process.env.CRON_SECRET = 'offline-test-key'
    assert.equal((await cron.GET(new Request('https://example.invalid/sync'))).status, 401)
    assert.equal((await cron.GET(new Request('https://example.invalid/sync', { headers: { authorization: 'Bearer incorrect' } }))).status, 401)
    assert.equal(runs, 0)
    assert.equal((await cron.GET(new Request('https://example.invalid/sync', { headers: { authorization: 'Bearer offline-test-key' } }))).status, 200)
    assert.equal(runs, 1)
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous }
  const routeCalls = []
  let authenticated = false
  const attention = load('src/app/api/oem/mail/attention/route.ts', {
    'next/server': {},
    '@/lib/oem-mail-security': {
      ...security,
      checkMailOrigin: request => { if (request.headers.get('origin') !== 'https://example.invalid') throw new MailError('origin rejected', 403) },
      requireMailAdmin: async () => { if (!authenticated) throw new MailError('authentication required', 401); return { id: 'mock-admin' } },
      requireOemMailLead: async id => { if (id !== lead.id) throw new MailError('case rejected', 404); return lead },
    },
    '@/lib/oem-conversations': {
      listMailAttention: async offset => { routeCalls.push(['list', offset]); return { success: true, alerts: [] } },
      reviewConversationMessages: async (found, actor, ids) => { routeCalls.push(['review', found.id, actor, ids]); return { success: true } },
      handleConversationMessage: async (found, actor, id, handled) => { routeCalls.push(['handle', found.id, actor, id, handled]); return { success: true } },
    },
    '@/lib/oem-mail-sync': {
      getOemSyncStatus: async () => ({ connected: true }),
      runOemMailboxSync: async () => { routeCalls.push(['sync']); return { success: true } },
    },
  })
  const getRequest = { nextUrl: new URL('https://example.invalid/attention?offset=50') }
  const postRequest = (payload, origin = 'https://example.invalid') => new Request('https://example.invalid/attention', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal((await attention.GET(getRequest)).status, 401)
  assert.equal((await attention.POST(postRequest({ action: 'sync' }))).status, 401)
  assert.equal(routeCalls.length, 0)
  authenticated = true
  assert.equal((await attention.POST(postRequest({ action: 'sync' }, 'https://evil.invalid'))).status, 403)
  assert.equal((await attention.POST(postRequest({ action: 'review', leadId: other, messageIds: [] }))).status, 404)
  assert.equal(routeCalls.length, 0)
  assert.equal((await attention.GET(getRequest)).status, 200)
  assert.deepEqual(routeCalls.pop(), ['list', 50])
  assert.equal((await attention.POST(postRequest({ action: 'review', leadId: lead.id, messageIds: ['mock-message'] }))).status, 200)
  assert.deepEqual(routeCalls.pop(), ['review', lead.id, 'mock-admin', ['mock-message']])
  assert.equal((await attention.POST(postRequest({ action: 'handle', leadId: lead.id, messageId: 'mock-message', handled: true }))).status, 200)
  assert.deepEqual(routeCalls.pop(), ['handle', lead.id, 'mock-admin', 'mock-message', true])
  console.log('OEM automatic mail sync: PASS (case/participant isolation, pagination, retry checkpoints, lease skip, cron/API authentication, CSRF and case boundaries; offline, no email sent)')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
