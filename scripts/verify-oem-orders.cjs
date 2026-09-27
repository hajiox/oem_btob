/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')

const OEM_PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
const hex = value => crypto.createHash('sha256').update(value).digest('hex')
const id = () => crypto.randomUUID()
function assert(condition, message) { if (!condition) throw new Error(message) }

async function insertOrder(client, leadId, revision, token, expiresAt = '2099-01-01T00:00:00.000Z') {
  const quoteHash = hex(`quote-${revision}`), termsHash = hex(`terms-${revision}`)
  const result = await client.query(`INSERT INTO public.oem_orders(
    lead_id,revision,order_number,formal_quote_amount,deposit_amount,specification,
    quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at
  ) VALUES($1,$2,$3,100001,50000,'検証用仕様','{}'::jsonb,$4,'test-v1','検証規約','検証本文',$5,$6,$7) RETURNING id`,
  [leadId, revision, `TEST-${id()}`, quoteHash, termsHash, hex(token), expiresAt])
  return { orderId: result.rows[0].id, quoteHash, termsHash }
}

async function main() {
  const client = connection()
  try {
    await client.connect(); await client.query('BEGIN')
    const tables = await client.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('oem_orders','oem_order_acceptances') ORDER BY relname")
    assert(tables.rowCount === 2 && tables.rows.every(row => row.relrowsecurity), 'order tables must exist with RLS enabled')
    const grants = await client.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('oem_orders','oem_order_acceptances') AND grantee IN ('anon','authenticated','PUBLIC')")
    assert(grants.rowCount === 0, 'public roles must not have direct order table privileges')
    const rpcGrants = await client.query(`SELECT
      has_function_privilege('anon','public.accept_oem_order(text,uuid,text,text,text,text,text,text)','EXECUTE') AS anon,
      has_function_privilege('authenticated','public.accept_oem_order(text,uuid,text,text,text,text,text,text)','EXECUTE') AS authenticated,
      has_function_privilege('service_role','public.accept_oem_order(text,uuid,text,text,text,text,text,text)','EXECUTE') AS service_role`)
    assert(!rpcGrants.rows[0].anon && !rpcGrants.rows[0].authenticated && rpcGrants.rows[0].service_role, 'only service_role may execute acceptance RPC')

    const lead = await client.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price)
      VALUES($1,'検証会社','検証担当','verify@example.invalid','[]'::jsonb,100001) RETURNING id`, [OEM_PAGE_ID])
    const leadId = lead.rows[0].id
    const token = `token-${id()}`
    const first = await insertOrder(client, leadId, 1, token)

    await client.query('SAVEPOINT before_illegal_advance')
    let blocked = false
    try { await client.query("UPDATE public.oem_orders SET status='deposit_paid' WHERE id=$1", [first.orderId]) }
    catch (error) { blocked = error.code === '23514' }
    await client.query('ROLLBACK TO SAVEPOINT before_illegal_advance')
    assert(blocked, 'database must block workflow advancement before acceptance')

    const requestId = id()
    const accepted = await client.query('SELECT * FROM public.accept_oem_order($1,$2,$3,$4,$5,$6,$7,$8)',
      [hex(token),requestId,'検証担当','test-v1',first.termsHash,first.quoteHash,hex('ip'),hex('ua')])
    assert(accepted.rows[0]?.result === 'accepted', 'valid acceptance must succeed')
    const repeated = await client.query('SELECT * FROM public.accept_oem_order($1,$2,$3,$4,$5,$6,$7,$8)',
      [hex(token),requestId,'検証担当','test-v1',first.termsHash,first.quoteHash,hex('ip'),hex('ua')])
    assert(repeated.rows[0]?.result === 'accepted', 'same acceptance request must be idempotent')
    const state = await client.query('SELECT status,accepted_at FROM public.oem_orders WHERE id=$1', [first.orderId])
    assert(state.rows[0].status === 'accepted' && state.rows[0].accepted_at, 'acceptance must atomically advance order')
    const leadState = await client.query('SELECT status FROM public.leads WHERE id=$1', [leadId])
    assert(leadState.rows[0].status === 'won', 'formal order must mark the lead won')

    const changedToken = `token-${id()}`
    const changed = await insertOrder(client, leadId, 2, changedToken)
    const mismatch = await client.query('SELECT * FROM public.accept_oem_order($1,$2,$3,$4,$5,$6,$7,$8)',
      [hex(changedToken),id(),'検証担当','test-v1',hex('wrong'),changed.quoteHash,hex('ip'),hex('ua')])
    assert(mismatch.rows[0]?.result === 'changed', 'terms hash mismatch must be rejected')

    const expiredToken = `token-${id()}`
    const expired = await insertOrder(client, leadId, 3, expiredToken, '2000-01-01T00:00:00.000Z')
    const expiredResult = await client.query('SELECT * FROM public.accept_oem_order($1,$2,$3,$4,$5,$6,$7,$8)',
      [hex(expiredToken),id(),'検証担当','test-v1',expired.termsHash,expired.quoteHash,hex('ip'),hex('ua')])
    assert(expiredResult.rows[0]?.result === 'expired', 'expired order link must be rejected')

    await client.query('ROLLBACK')
    console.log('OEM order verification: passed (RLS, privileges, consent gate, idempotency, hashes, expiry)')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('OEM order verification failed:', { code: error.code, message: error.message })
    process.exitCode = 1
  } finally { await client.end() }
}
main()
