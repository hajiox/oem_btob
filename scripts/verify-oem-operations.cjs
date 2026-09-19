/* In-memory verification of OEM intake idempotency/rate-limit contracts. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

function loadIntake(rpc) {
  const source = fs.readFileSync('src/lib/oem-intake.ts', 'utf8')
  const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(require.resolve('../package.json'))
  mod.filename = path.resolve('src/lib/oem-intake.ts')
  mod.paths = Module._nodeModulePaths(process.cwd())
  mod.require = id => id === '@/lib/supabase/admin' ? { adminClient: { rpc } } : id === 'next/headers' ? { headers: async () => ({ get: () => null }) } : require(id)
  mod._compile(out, mod.filename)
  return mod.exports
}

;(async () => {
  const calls = []
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'verify-only-secret'
  const intake = loadIntake(async (name, args) => {
    calls.push({ name, args })
    return { data: [{ status: 'reserved', lead_id: 'lead-1' }], error: null }
  })

  assert.equal(intake.stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}', 'stable object ordering')
  assert.equal(intake.stableStringify({ a: [2, 1] }), '{"a":[2,1]}', 'array order is preserved')
  const first = intake.buildOemIntakeHashes({ z: 1, a: 'x' }, ' Buyer@Example.com ', '203.0.113.4', 'secret')
  const second = intake.buildOemIntakeHashes({ a: 'x', z: 1 }, 'buyer@example.com', '203.0.113.4', 'secret')
  assert.deepEqual(first, second, 'hashes normalize email and object key order')
  assert.notEqual(first.payloadHash, first.emailHash)
  assert.notEqual(first.emailHash, first.ipHash)
  assert.equal((await intake.reserveOemLead({ idempotencyKey: 'not-a-uuid', payload: {}, email: 'buyer@example.com', lead: {} })).status, 'rejected', 'malformed key rejected before RPC')
  assert.equal(calls.length, 0, 'malformed key must not reach RPC')

  const reserved = await intake.reserveOemLead({
    idempotencyKey: '11111111-1111-4111-8111-111111111111', payload: { pageId: 'page', quoteProductId: 'product' },
    email: 'buyer@example.com', lead: { company_name: 'Example' }, ip: '203.0.113.4', windowSeconds: 60, rateLimit: 2,
  })
  assert.equal(reserved.status, 'reserved')
  assert.equal(reserved.leadId, 'lead-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'reserve_oem_lead')
  assert.equal(calls[0].args.p_idempotency_key, '11111111-1111-4111-8111-111111111111')
  assert.equal(calls[0].args.p_window_seconds, 60)
  assert.equal(calls[0].args.p_rate_limit, 2)
  assert.match(calls[0].args.p_payload_hash, /^[0-9a-f]{64}$/)
  assert.match(calls[0].args.p_email_hash, /^[0-9a-f]{64}$/)
  assert.match(calls[0].args.p_ip_hash, /^[0-9a-f]{64}$/)
  assert.equal(calls[0].args.p_email_hash, intake.buildOemIntakeHashes({ pageId: 'page', quoteProductId: 'product' }, 'buyer@example.com', '203.0.113.4').emailHash)

  const outcome = [
    { status: 'duplicate', lead_id: 'lead-1', reason: 'idempotency_payload_mismatch' },
    { status: 'rejected', reason: 'rate_limited', retry_after_seconds: 42 },
  ]
  const mapped = loadIntake(async () => ({ data: [outcome.shift()], error: null }))
  const duplicate = await mapped.reserveOemLead({ idempotencyKey: '22222222-2222-4222-8222-222222222222', payload: {}, email: 'a@example.com', lead: {}, ip: '198.51.100.1' })
  assert.equal(duplicate.status, 'duplicate')
  assert.equal(duplicate.leadId, 'lead-1')
  assert.equal(duplicate.reason, 'idempotency_payload_mismatch')
  const limited = await mapped.reserveOemLead({ idempotencyKey: '33333333-3333-4333-8333-333333333333', payload: {}, email: 'a@example.com', lead: {}, ip: '198.51.100.1' })
  assert.equal(limited.status, 'rejected')
  assert.equal(limited.retryAfterSeconds, 42)
  assert.equal(limited.reason, 'rate_limited')
  console.log('OEM operations checks: PASS (hash, UUID, RPC mapping; no DB writes)')
})().catch(error => { console.error('OEM operations checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
