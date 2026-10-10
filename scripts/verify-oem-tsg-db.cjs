/* OEM TSG notification outbox checks. When explicitly run, uses the normal OEM connection; all work rolls back. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')

const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const id = () => randomUUID()
const leadInput = key => ({ page_id: PAGE, company_name: `  TSG synthetic ${key.slice(0, 8)}\r\n`, contact_name: 'Synthetic', email: `${key.slice(0, 8)}@example.com`, selected_options: [{ question: '商品', answer: '  検証\r\n商品 ' }, { question: 'OEM製造数', answer: ' 400\t個 ' }], estimated_total_price: 123000, notes: 'must not enter TSG payload' })
const mail = { customer: { from: 'test@example.com', to: 'test@example.com', subject: 'test', html: 'test' }, admin: { from: 'test@example.com', to: 'test@example.com', subject: 'test', html: 'test' } }

;(async () => {
  const db = connection()
  try {
    await db.connect(); await db.query('BEGIN')
    await db.query("select set_config('request.jwt.claim.role','service_role',true)")
    if (!(await db.query("select to_regclass('public.oem_tsg_notifications') as name")).rows[0].name) {
      const sql = fs.readFileSync('sql/028_oem_tsg_notifications.sql', 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
      await db.query(sql)
    }

    const key = id(); const lead = leadInput(key); const hash = id()
    const baselineCount = (await db.query('select count(*)::int n from public.oem_tsg_notifications')).rows[0].n
    const reserve = async (request = key, payload = lead, pageMail = mail, payloadHash = hash, rateLimit = 10) => (await db.query('select * from public.reserve_oem_lead($1,$2,$3,$4,$5,$6,3600,$7)', [request, payloadHash, hash, hash, payload, pageMail, rateLimit])).rows[0]
    const first = await reserve(); assert.equal(first.status, 'reserved')
    const notification = (await db.query('select * from public.oem_tsg_notifications where lead_id=$1', [first.lead_id])).rows[0]
    assert(notification); assert.equal(notification.status, 'pending'); assert.match(notification.source_key, new RegExp(`^oem:consultation:${first.lead_id}:received:v1$`))
    assert.equal(notification.payload.companyName, `TSG synthetic ${key.slice(0, 8)}`); assert.equal(notification.payload.productName, '検証 商品'); assert.equal(notification.payload.quantityLabel, '400 個'); assert.equal(notification.payload.estimatedTotalPrice, 123000)
    assert.equal(notification.payload.email, undefined); assert.equal(notification.payload.phone, undefined); assert.equal(notification.payload.notes, undefined)
    assert.equal((await reserve()).status, 'duplicate'); assert.equal((await reserve(key, lead, mail, 'different')).reason, 'idempotency_payload_mismatch'); assert.equal((await db.query('select count(*)::int n from public.oem_tsg_notifications where lead_id=$1', [first.lead_id])).rows[0].n, 1)
    assert.equal((await reserve(id(), { ...lead, page_id: '00000000-0000-4000-8000-000000000000' })).reason, 'invalid_request')
    assert.equal((await reserve(id(), lead, mail, id(), 1)).reason, 'rate_limited'); assert.equal((await db.query('select count(*)::int n from public.oem_tsg_notifications')).rows[0].n, baselineCount + 1)

    const claim = (await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rows[0]
    assert.equal(claim.status, 'sending'); assert.equal((await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rowCount, 0)
    await db.query("update public.oem_tsg_notifications set locked_until=now()-interval '1 second' where id=$1", [claim.id])
    const expiredClaim = (await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rows[0]
    assert.notEqual(expiredClaim.lease_token, claim.lease_token)
    assert.equal((await db.query('select public.finish_oem_tsg_notification($1,$2,$3,$4,$5)', [expiredClaim.id, claim.lease_token, null, 'old_token', true])).rows[0].finish_oem_tsg_notification, false)
    assert.equal((await db.query('select public.finish_oem_tsg_notification($1,$2,$3,$4,$5)', [expiredClaim.id, expiredClaim.lease_token, null, 'temporary_tsg_failure', true])).rows[0].finish_oem_tsg_notification, true)
    await db.query("update public.oem_tsg_notifications set attempts=100, next_attempt_at=now()-interval '1 second', locked_until=null where id=$1", [expiredClaim.id])
    const retryClaim = (await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rows[0]
    assert.notEqual(retryClaim.lease_token, claim.lease_token)
    assert.equal((await db.query('select public.finish_oem_tsg_notification($1,$2,$3,$4,$5)', [retryClaim.id, retryClaim.lease_token, null, 'high_attempt_retry', true])).rows[0].finish_oem_tsg_notification, true)
    const due = (await db.query('select extract(epoch from (next_attempt_at-now())) seconds from public.oem_tsg_notifications where id=$1', [expiredClaim.id])).rows[0].seconds; assert(due <= 3600 && due >= 3590, `retry delay must cap at 1h: ${due}`)
    await db.query("update public.oem_tsg_notifications set next_attempt_at=now()-interval '1 second', locked_until=null where id=$1", [expiredClaim.id])
    const sentClaim = (await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rows[0]
    assert.equal((await db.query('select public.finish_oem_tsg_notification($1,$2,$3,$4,$5)', [sentClaim.id, sentClaim.lease_token, id(), null, true])).rows[0].finish_oem_tsg_notification, true)
    assert.equal((await db.query('select * from public.claim_oem_tsg_notification($1)', [first.lead_id])).rowCount, 0)
    await db.query('SAVEPOINT immutable_payload')
    try { await assert.rejects(() => db.query("update public.oem_tsg_notifications set payload='{}'::jsonb where id=$1", [notification.id]), /immutable/) } finally { await db.query('ROLLBACK TO SAVEPOINT immutable_payload'); await db.query('RELEASE SAVEPOINT immutable_payload') }

    for (const role of ['anon', 'authenticated']) {
      await db.query(`set local role ${role}`); await db.query(`SAVEPOINT rls_${role}`)
      try { await assert.rejects(() => db.query('select * from public.oem_tsg_notifications'), e => ['42501'].includes(e.code)) } finally { await db.query(`ROLLBACK TO SAVEPOINT rls_${role}`); await db.query(`RELEASE SAVEPOINT rls_${role}`); await db.query('reset role') }
    }
    await db.query('reset role')
    await db.query('ROLLBACK')
    console.log('OEM TSG outbox checks PASS: atomic reserve, duplicate guard, payload minimization, lease/CAS, sent no-reclaim, immutable payload, RLS; rolled back, no external send.')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    console.error('OEM TSG outbox checks FAIL'); console.error(error.stack || error); process.exitCode = 1
  } finally { await db.end() }
})()
