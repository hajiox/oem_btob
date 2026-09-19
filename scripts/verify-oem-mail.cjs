/* In-memory OEM mail queue/provider/auth contract checks. No live sends. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

function load(file, aliases) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = new Module(require.resolve('../package.json'))
  mod.filename = path.resolve(file); mod.paths = Module._nodeModulePaths(process.cwd())
  mod.require = id => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : require(id)
  mod._compile(out, mod.filename)
  return mod.exports
}

function chain(result) {
  const q = { select() { return q }, eq() { return q }, neq() { return q }, order() { return q }, update() { return q }, single() { return Promise.resolve(result) }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) } }
  return q
}

;(async () => {
  const pages = { email_from_name: 'OEM', email_from_address: 'from@example.com', admin_notification_email: 'admin@example.com', customer_email_subject: '受付', admin_email_subject: '新規', customer_email_intro: 'こんにちは', customer_email_closing: '終了', admin_email_intro: '通知' }
  const updates = []; const sends = []; let claim = { id: 'delivery-1', lead_id: 'lead-1', attempt_key: 'attempt-a', status: 'sending', payload: { to: 'buyer@example.com', from: 'OEM <from@example.com>', subject: '受付', html: '<p>ok</p>' } }
  const deliveryTable = {
    select() {
      return {
        eq() {
          return {
            neq() { return Promise.resolve({ data: [{ id: 'delivery-1' }], error: null }) },
            single() { return Promise.resolve({ data: claim, error: null }) },
          }
        },
      }
    },
    update(values) {
      updates.push(values)
      return { eq() { return { eq() { return { eq() { return Promise.resolve({ error: null }) } } } } } }
    },
  }
  const db = { from(table) { if (table === 'pages') return chain({ data: pages, error: null }); if (table === 'oem_mail_deliveries') return deliveryTable; return chain({ data: null, error: null }) }, rpc: async () => ({ data: claim ? [claim] : [], error: null }) }
  const fakeResend = { Resend: class { constructor() {} get emails() { return { send: async (payload, options) => { sends.push({ payload, options }); return { data: { id: 'provider-1' }, error: null } } } } } }
  process.env.RESEND_API_KEY = 'mock-only'
  const mail = load('src/lib/oem-mail.ts', { '@/lib/supabase/admin': { adminClient: db }, resend: fakeResend })
  const payloads = await mail.buildOemMailPayloads({ pageId: 'page', companyName: '<会社>', contactName: '担当&名', email: 'buyer@example.com', phone: '', notes: '<script>x</script>', estimatedTotalPrice: 12000, selectedOptions: [{ question: '仕様', answer: '<bad>' }] })
  assert(payloads.customer.html.includes('&lt;会社&gt;') && payloads.customer.html.includes('&lt;script&gt;x&lt;/script&gt;'), 'mail HTML must escape user values')
  assert.equal(payloads.customer.replyTo, 'from@example.com'); assert.equal(payloads.admin.replyTo, 'buyer@example.com')
  await mail.dispatchOemMail('delivery-1')
  assert.equal(sends.length, 1); assert.equal(sends[0].options.idempotencyKey, 'oem/delivery-1/attempt-a')
  assert.equal(updates.at(-1).status, 'sent'); assert.equal(updates.at(-1).provider_id, 'provider-1')

  const outcomes = [
    { error: { name: 'validation_error' } },
    { error: { name: 'rate_limit_exceeded' } },
    { throw: true },
  ]
  for (const outcome of outcomes) {
    const localUpdates = []
    const localDelivery = {
      update(v) {
        localUpdates.push(v)
        return { eq() { return { eq() { return { eq() { return Promise.resolve({ error: null }) } } } } } }
      },
    }
    const localDb = { rpc: async () => ({ data: [claim], error: null }), from: () => localDelivery }
    const sender = { Resend: class { get emails() { return { send: async () => outcome.throw ? (() => { throw new Error('network') })() : { data: null, error: outcome.error } } } } }
    const m = load('src/lib/oem-mail.ts', { '@/lib/supabase/admin': { adminClient: localDb }, resend: sender })
    await m.dispatchOemMail('delivery-1')
    assert.equal(localUpdates[0].status, outcome.error?.name === 'validation_error' ? 'failed' : 'unknown')
  }
  delete process.env.RESEND_API_KEY
  const noSenderUpdates = []
  const noSenderDelivery = {
    update(v) {
      noSenderUpdates.push(v)
      return { eq() { return { eq() { return { eq() { return Promise.resolve({ error: null }) } } } } } }
    },
  }
  const noSenderDb = { rpc: async () => ({ data: [claim], error: null }), from: () => noSenderDelivery }
  const noSender = load('src/lib/oem-mail.ts', { '@/lib/supabase/admin': { adminClient: noSenderDb }, resend: fakeResend }); await noSender.dispatchOemMail('delivery-1'); assert.equal(noSenderUpdates[0].status, 'failed'); assert.equal(noSenderUpdates[0].error_code, 'sender_not_configured')

  // Admin-only operations must fail closed, while retry converts operational
  // failures to its stable user-facing result.
  const actionDb = { from(table) { if (table === 'leads') return chain({ data: { id: 'lead-1' }, error: null }); return chain({ data: [], error: null }) } }
  const unauthClient = { auth: { getUser: async () => ({ data: { user: null } }) } }
  const actions = load('src/actions/oemMail.ts', {
    '@/lib/supabase/server': { createClient: async () => unauthClient },
    '@/lib/supabase/admin': { adminClient: actionDb },
    '@/lib/oem-quote-validation': { OEM_PAGE_ID: 'oem-page' },
    '@/lib/oem-mail': { dispatchOemMail: async () => { throw new Error('provider') } },
  })
  await assert.rejects(() => actions.getOemMailStatus('lead-1'), /認証が必要/)
  const unauthRetry = await actions.retryOemMail('delivery-1'); assert.deepEqual(unauthRetry, { success: false, error: '再送できませんでした。ログイン状態とメール設定を確認してください。' })

  // The claim RPC is the concurrency boundary: a no-row claim must not send/update.
  const emptyDb = { rpc: async () => ({ data: [], error: null }), from: () => { throw new Error('must not query/update') } }
  const empty = load('src/lib/oem-mail.ts', { '@/lib/supabase/admin': { adminClient: emptyDb }, resend: fakeResend }); await empty.dispatchOemMail('already-claimed')
  console.log('OEM mail checks: PASS (escaping, claim key, provider states, no-row concurrency)')
})().catch(error => { console.error('OEM mail checks: FAIL'); console.error(error.stack || error); process.exitCode = 1 })
