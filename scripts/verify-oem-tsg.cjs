// Execute the real notification sender and cron handler with in-memory RPC/fetch.
// No environment files, production database or network endpoints are accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

const ROOT = path.resolve(__dirname, '..')
const LEAD = '01234567-89ab-4cde-8fab-0123456789ab'
const POST = '23456789-abcd-4cde-8fab-0123456789ab'
const DELIVERY = '34567890-abcd-4cde-8fab-0123456789ab'
const LEASE = '45678901-abcd-4cde-8fab-0123456789ab'
const SECRET = 'offline-only-notification-secret-123456789'
const ENDPOINT = 'https://v0-line-blush.vercel.app/api/integrations/oem/consultation-received'
const PAYLOAD = Object.freeze({
  schemaVersion: 1,
  event: 'consultation_received',
  sourceKey: `oem:consultation:${LEAD}:received:v1`,
  leadId: LEAD,
  receivedAt: '2026-10-10T05:00:00.000Z',
  companyName: '検証用農園',
  productName: 'レトルトカレー',
  quantityLabel: '約400個',
  estimatedTotalPrice: 146000,
})

function load(relative, aliases) {
  const file = path.join(ROOT, relative)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = new Module(file)
  mod.filename = file
  mod.paths = Module._nodeModulePaths(ROOT)
  mod.require = name => {
    if (Object.hasOwn(aliases, name)) return aliases[name]
    if (name.startsWith('node:')) return require(name)
    throw new Error(`Unmocked notification dependency: ${name}`)
  }
  mod._compile(output, file)
  return mod.exports
}

async function withEnv(changes, action) {
  const previous = new Map(Object.keys(changes).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return await action()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function row(overrides = {}) {
  return { id: DELIVERY, lead_id: LEAD, source_key: PAYLOAD.sourceKey, lease_token: LEASE, payload: { ...PAYLOAD }, ...overrides }
}

function fixture({ rows = [row()], response = () => Response.json({ success: true, postId: POST, duplicate: false }, { status: 201 }), finishResult = true, claimError = null, finishError = null } = {}) {
  const pending = [...rows]
  const calls = { claim: [], finish: [], fetch: [] }
  const db = {
    async rpc(name, input) {
      if (name === 'claim_oem_tsg_notification') {
        calls.claim.push(input)
        const next = pending.shift()
        return { data: next ? [next] : [], error: claimError }
      }
      assert.equal(name, 'finish_oem_tsg_notification', 'only claim/finish notification RPCs are allowed')
      calls.finish.push(input)
      return { data: finishResult, error: finishError }
    },
    from() { assert.fail('sender must not query arbitrary tables') },
  }
  global.fetch = async (url, options) => {
    calls.fetch.push({ url: String(url), options })
    return response(url, options)
  }
  return { ...load('src/lib/oem-tsg-notifications.ts', { '@/lib/supabase/admin': { adminClient: db } }), calls }
}

function assertOutcome(result, expected) {
  assert.deepEqual(result, { enabled: true, claimed: 1, sent: 0, retried: 0, blocked: 0, ...expected })
}

function assertFinished(test, retryable, postId = null) {
  assert.equal(test.calls.finish.length, 1)
  const finished = test.calls.finish[0]
  assert.equal(finished.p_id, DELIVERY)
  assert.equal(finished.p_lease_token, LEASE, 'finish must retain the claimed lease token')
  assert.equal(finished.p_post_id, postId)
  assert.equal(finished.p_retryable, retryable)
  if (postId) assert.equal(finished.p_error_code, null)
  else {
    assert.equal(typeof finished.p_error_code, 'string')
    assert(finished.p_error_code.length > 0 && finished.p_error_code.length < 100)
    assert(!finished.p_error_code.includes('sentinel'), 'raw remote/network errors must not be persisted')
    assert(!finished.p_error_code.includes(SECRET), 'credentials must not appear in stored errors')
  }
}

async function senderChecks() {
  const valid = fixture({ rows: [] })
  assert.deepEqual(valid.validateOemTsgPayload(PAYLOAD), PAYLOAD)
  const boundaries = { ...PAYLOAD, companyName: '会'.repeat(200), productName: '品'.repeat(200), quantityLabel: '数'.repeat(200), estimatedTotalPrice: Number.MAX_SAFE_INTEGER }
  assert.deepEqual(valid.validateOemTsgPayload(boundaries), boundaries)
  assert.equal(valid.validateOemTsgPayload({ ...PAYLOAD, estimatedTotalPrice: 0 }).estimatedTotalPrice, 0)
  assert.equal(valid.validateOemTsgPayload({ ...PAYLOAD, companyName: '🍎'.repeat(200) }).companyName, '🍎'.repeat(200), 'Unicode text limit counts code points')
  assert.equal(valid.validateOemTsgPayload({ ...PAYLOAD, receivedAt: '2026-10-10T14:00:00+09:00' }).receivedAt, '2026-10-10T14:00:00+09:00')
  const invalid = [null, [], 'payload', { ...PAYLOAD, schemaVersion: 2 }, { ...PAYLOAD, event: 'other' },
    { ...PAYLOAD, leadId: 'not-a-uuid' }, { ...PAYLOAD, sourceKey: 'oem:consultation:other:received:v1' },
    { ...PAYLOAD, receivedAt: 'not-a-date' }, { ...PAYLOAD, estimatedTotalPrice: -1 },
    { ...PAYLOAD, estimatedTotalPrice: 1.5 }, { ...PAYLOAD, estimatedTotalPrice: Number.MAX_SAFE_INTEGER + 1 },
    { ...PAYLOAD, estimatedTotalPrice: NaN }, { ...PAYLOAD, estimatedTotalPrice: Infinity },
    { ...PAYLOAD, estimatedTotalPrice: '146000' }, { ...PAYLOAD, boardId: LEAD },
    { ...PAYLOAD, content: 'arbitrary text' }, { ...PAYLOAD, email: 'never-send@example.invalid' }]
  for (const key of ['companyName', 'productName', 'quantityLabel']) {
    for (const value of ['', '   ', 'x'.repeat(201), '🍎'.repeat(201), 'line\nbreak', 'tab\tvalue', 'null\0value', 'delete\u007fvalue', 'control\u0085value']) invalid.push({ ...PAYLOAD, [key]: value })
  }
  for (const input of invalid) assert.throws(() => valid.validateOemTsgPayload(input), 'invalid or extra fields must fail closed')

  for (const env of [
    { OEM_TSG_NOTIFICATIONS_ENABLED: undefined },
    { OEM_TSG_NOTIFICATIONS_ENABLED: 'false' },
    { OEM_TSG_NOTIFICATIONS_ENABLED: 'TRUE' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'development' },
  ]) {
    await withEnv(env, async () => {
      const disabled = fixture()
      assert.deepEqual(await disabled.dispatchOemTsgNotifications(), { enabled: false, claimed: 0, sent: 0, retried: 0, blocked: 0 })
      assert.equal(disabled.calls.claim.length, 0)
      assert.equal(disabled.calls.finish.length, 0)
      assert.equal(disabled.calls.fetch.length, 0)
    })
  }

  for (const secret of [undefined, 'x'.repeat(31)]) {
    await withEnv({ OEM_TSG_NOTIFICATION_SECRET: secret }, async () => {
      const unconfigured = fixture()
      await assert.rejects(() => unconfigured.dispatchOemTsgNotifications(), /notification_not_configured/)
      assert.equal(unconfigured.calls.claim.length, 0)
      assert.equal(unconfigured.calls.finish.length, 0)
      assert.equal(unconfigured.calls.fetch.length, 0)
    })
  }

  for (const vercel of [undefined, 'production']) {
    await withEnv({ VERCEL_ENV: vercel, OEM_TSG_NOTIFICATION_SECRET: 'x'.repeat(32) }, async () => {
      const sent = fixture()
      assertOutcome(await sent.dispatchOemTsgNotifications({ leadId: LEAD, limit: 1 }), { sent: 1 })
      assert.deepEqual(sent.calls.claim, [{ p_lead_id: LEAD }])
      assertFinished(sent, false, POST)
      assert.equal(sent.calls.fetch.length, 1)
      const request = sent.calls.fetch[0]
      assert.equal(request.url, ENDPOINT)
      assert.equal(request.options.method, 'POST')
      assert.equal(request.options.redirect, 'error')
      assert.equal(request.options.cache, 'no-store')
      assert(request.options.signal instanceof AbortSignal, 'remote call must have a timeout signal')
      const headers = new Headers(request.options.headers)
      assert.equal(headers.get('authorization'), `Bearer ${'x'.repeat(32)}`)
      assert.match(headers.get('content-type'), /^application\/json/)
      assert.equal(headers.get('cookie'), null)
      assert.equal(headers.get('x-tsg-integration-secret'), null, 'shared integration credentials must not be used')
      assert.deepEqual(JSON.parse(request.options.body), PAYLOAD, 'send only the validated event snapshot')
    })
  }

  const duplicate = fixture({ response: () => Response.json({ success: true, postId: POST, duplicate: true }) })
  assertOutcome(await duplicate.dispatchOemTsgNotifications({ limit: 1 }), { sent: 1 })
  assertFinished(duplicate, false, POST)

  for (const status of [400, 409, 422, 401, 403, 404, 408, 429, 500, 503]) {
    const retryable = ![400, 409, 422].includes(status)
    const failed = fixture({ response: () => Response.json({ error: `remote sentinel ${SECRET}` }, { status }) })
    assertOutcome(await failed.dispatchOemTsgNotifications({ limit: 1 }), retryable ? { retried: 1 } : { blocked: 1 })
    assertFinished(failed, retryable)
    assert.deepEqual(JSON.parse(failed.calls.fetch[0].options.body), PAYLOAD)
  }

  for (const error of [new TypeError(`network sentinel ${SECRET}`), new DOMException('timeout sentinel', 'TimeoutError'), new DOMException('abort sentinel', 'AbortError')]) {
    const failed = fixture({ response: async () => { throw error } })
    assertOutcome(await failed.dispatchOemTsgNotifications({ limit: 1 }), { retried: 1 })
    assertFinished(failed, true)
  }

  let attempts = 0
  const resumed = fixture({ rows: [row(), row()], response: () => {
    if (++attempts === 1) throw new TypeError('response lost after remote commit')
    return Response.json({ success: true, postId: POST, duplicate: true })
  } })
  assertOutcome(await resumed.dispatchOemTsgNotifications({ limit: 1 }), { retried: 1 })
  assertOutcome(await resumed.dispatchOemTsgNotifications({ limit: 1 }), { sent: 1 })
  assert.equal(resumed.calls.fetch[0].options.body, resumed.calls.fetch[1].options.body, 'uncertain outcomes must retry the identical snapshot and sourceKey')
  assert.equal(resumed.calls.finish[0].p_retryable, true)
  assert.equal(resumed.calls.finish[1].p_post_id, POST)

  for (const response of [
    () => Response.json({ success: false, postId: POST, duplicate: false }),
    () => Response.json({ ok: true, postId: POST, duplicate: false }),
    () => Response.json({ success: true, postId: 'invalid', duplicate: false }),
    () => Response.json({ success: true, postId: POST, duplicate: 'false' }),
    () => new Response('non-JSON sentinel', { status: 200 }),
    () => Response.json({ success: true, postId: POST, duplicate: false }, { status: 202 }),
  ]) {
    const ambiguous = fixture({ response })
    assertOutcome(await ambiguous.dispatchOemTsgNotifications({ limit: 1 }), { retried: 1 })
    assertFinished(ambiguous, true)
  }

  const malformed = fixture({ rows: [row({ payload: { ...PAYLOAD, boardId: LEAD } })] })
  assertOutcome(await malformed.dispatchOemTsgNotifications({ limit: 1 }), { blocked: 1 })
  assert.equal(malformed.calls.fetch.length, 0)
  assertFinished(malformed, false)
  for (const claimed of [row({ source_key: 'oem:consultation:other:received:v1' }), row({ lead_id: '01234567-89ab-4cde-8fab-0123456789ac' })]) {
    const inconsistent = fixture({ rows: [claimed] })
    assertOutcome(await inconsistent.dispatchOemTsgNotifications({ limit: 1 }), { blocked: 1 })
    assert.equal(inconsistent.calls.fetch.length, 0, 'claimed record identity must match the payload before sending')
    assertFinished(inconsistent, false)
  }

  const empty = fixture({ rows: [] })
  assert.deepEqual(await empty.dispatchOemTsgNotifications(), { enabled: true, claimed: 0, sent: 0, retried: 0, blocked: 0 })
  assert.equal(empty.calls.fetch.length, 0)
  assert.equal(empty.calls.finish.length, 0)

  const concurrent = fixture()
  const workers = await Promise.all([concurrent.dispatchOemTsgNotifications({ limit: 1 }), concurrent.dispatchOemTsgNotifications({ limit: 1 })])
  assert.equal(workers.reduce((sum, value) => sum + value.sent, 0), 1, 'only the successful claim may send')
  assert.equal(concurrent.calls.fetch.length, 1)
  assert.equal(concurrent.calls.finish.length, 1)

  const batchRows = ['b', 'c', 'd'].map(suffix => {
    const leadId = LEAD.slice(0, -1) + suffix
    const sourceKey = `oem:consultation:${leadId}:received:v1`
    return row({ id: DELIVERY.slice(0, -1) + suffix, lead_id: leadId, source_key: sourceKey, payload: { ...PAYLOAD, leadId, sourceKey } })
  })
  const bounded = fixture({ rows: batchRows })
  assert.deepEqual(await bounded.dispatchOemTsgNotifications({ limit: 2 }), { enabled: true, claimed: 2, sent: 2, retried: 0, blocked: 0 })
  assert.equal(bounded.calls.claim.length, 2)
  assert(bounded.calls.claim.every(input => input.p_lead_id === null))

  const lostLease = fixture({ finishResult: false })
  await assert.rejects(() => lostLease.dispatchOemTsgNotifications({ limit: 1 }), /status_save_failed/)
  assert.equal(lostLease.calls.fetch.length, 1, 'a lost finish lease must not trigger a second remote post')
  const saveFailure = fixture({ finishError: { message: 'database sentinel' } })
  await assert.rejects(() => saveFailure.dispatchOemTsgNotifications({ limit: 1 }))
  const claimFailure = fixture({ claimError: { message: 'database sentinel' } })
  await assert.rejects(() => claimFailure.dispatchOemTsgNotifications({ limit: 1 }))
  assert.equal(claimFailure.calls.fetch.length, 0)
}

async function cronChecks() {
  let runs = 0
  let fail = false
  const cron = load('src/app/api/oem/notifications/sync/route.ts', {
    'next/server': { NextResponse: { json: (...args) => Response.json(...args) } },
    '@/lib/oem-tsg-notifications': {
      dispatchOemTsgNotifications: async () => {
        runs++
        if (fail) throw new Error(`private sentinel ${SECRET}`)
        return { enabled: true, claimed: 0, sent: 0, retried: 0, blocked: 0 }
      },
    },
  })
  const request = authorization => new Request('https://example.invalid/api/oem/notifications/sync', { headers: authorization ? { authorization } : {} })
  await withEnv({ CRON_SECRET: undefined }, async () => {
    assert.equal((await cron.GET(request('Bearer offline-cron-key'))).status, 401)
  })
  await withEnv({ CRON_SECRET: 'offline-cron-key' }, async () => {
    for (const auth of [undefined, 'Bearer incorrect', 'Bearer offline-cron-kez']) {
      const denied = await cron.GET(request(auth))
      assert.equal(denied.status, 401)
      assert.match(denied.headers.get('cache-control'), /no-store/)
    }
    assert.equal(runs, 0, 'cron authentication must happen before dispatch')
    const accepted = await cron.GET(request('Bearer offline-cron-key'))
    assert.equal(accepted.status, 200)
    assert.match(accepted.headers.get('cache-control'), /no-store/)
    assert.equal(runs, 1)
    fail = true
    let failed
    const originalError = console.error
    try {
      console.error = (...args) => assert(!JSON.stringify(args).includes('sentinel'), 'cron logs must not disclose sender/provider error detail')
      failed = await cron.GET(request('Bearer offline-cron-key'))
    } finally { console.error = originalError }
    assert.equal(failed.status, 503)
    assert.match(failed.headers.get('cache-control'), /no-store/)
    assert(!(await failed.text()).includes('sentinel'), 'cron must not disclose sender/provider error detail')
  })
}

async function main() {
  const originalFetch = global.fetch
  global.fetch = async () => { throw new Error('Unmocked network access is forbidden') }
  try {
    await withEnv({ OEM_TSG_NOTIFICATIONS_ENABLED: 'true', OEM_TSG_NOTIFICATION_SECRET: SECRET, VERCEL_ENV: 'production' }, async () => {
      await senderChecks()
      await cronChecks()
    })
    console.log('OEM TSG notifications: PASS (payload isolation, disabled/preview guard, fixed destination, HTTP/network retry, idempotent snapshots, lease/CAS, cron authentication; offline only)')
  } finally { global.fetch = originalFetch }
}
main().catch(error => { console.error('OEM TSG notifications: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
