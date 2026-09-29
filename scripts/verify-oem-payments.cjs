/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const id = () => crypto.randomUUID()
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

async function main() {
  const client = connection()
  try {
    await client.connect(); await client.query('BEGIN')
    if (process.argv.includes('--with-migration')) {
      const fs = require('node:fs')
      const sql = fs.readFileSync('sql/014_oem_payments.sql', 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
      await client.query(sql)
    }
    const tables = await client.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('oem_payment_plans','oem_payment_receipts') ORDER BY relname")
    assert(tables.rowCount === 2 && tables.rows.every(row => row.relrowsecurity), 'payment tables must exist with RLS enabled')
    const grants = await client.query("SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('oem_payment_plans','oem_payment_receipts') AND grantee IN ('anon','authenticated','PUBLIC')")
    assert(grants.rowCount === 0, 'public roles must not have payment table privileges')
    const funcs = await client.query(`SELECT has_function_privilege('anon','public.record_oem_payment_receipt(uuid,uuid,integer,date,text,text,uuid)','EXECUTE') AS anon, has_function_privilege('authenticated','public.record_oem_payment_receipt(uuid,uuid,integer,date,text,text,uuid)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.record_oem_payment_receipt(uuid,uuid,integer,date,text,text,uuid)','EXECUTE') AS service_role`)
    assert(!funcs.rows[0].anon && !funcs.rows[0].authenticated && funcs.rows[0].service_role, 'only service_role may execute receipt RPC')
    const actor = await client.query('SELECT a.user_id AS id FROM public.oem_mail_admins a LIMIT 1')
    assert(actor.rowCount, 'verification requires one auth user')
    const user = actor.rows[0].id
    const lead = await client.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price) VALUES($1,'入金検証会社','検証担当','payment-verify@example.invalid','[]'::jsonb,100000) RETURNING id`, [PAGE])
    const leadId = lead.rows[0].id
    const order = await client.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,status,accepted_at,final_amount) VALUES($1,1,$2,100000,50000,'検証','{}'::jsonb,$3,'test','規約','本文',$4,$5,'2099-01-01','accepted',now(),100000) RETURNING id`, [leadId, `PAY-${id()}`, hash('q'), hash('t'), hash(id())])
    const orderId = order.rows[0].id
    const plan = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [orderId, 'deposit', 100, null, '検証会社', null, user])
    assert(plan.rows[0].result === 'saved', 'deposit plan must save')
    const planId = plan.rows[0].plan_id
    const future = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [planId, id(), 10, '2099-01-01', '検証会社', '', user])
    assert(future.rows[0].result === 'invalid', 'future paid date must be rejected')
    const requestId = id()
    const partial = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [planId, requestId, 40, '2026-09-01', '検証会社', '', user])
    assert(partial.rows[0].result === 'partial', 'partial receipt must remain partial')
    const duplicate = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [planId, requestId, 40, '2026-09-01', '検証会社', '', user])
    assert(duplicate.rows[0].result === 'duplicate', 'same request must be idempotent')
    const over = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [planId, id(), 70, '2026-09-02', '検証会社', '', user])
    assert(over.rows[0].result === 'excess', 'overpayment must be recorded without transition')
    const state = await client.query('SELECT status FROM public.oem_orders WHERE id=$1', [orderId])
    assert(state.rows[0].status === 'accepted', 'excess must not advance order')
    const planVersion = await client.query('SELECT updated_at::text AS updated_at FROM public.oem_payment_plans WHERE id=$1', [planId])
    const conflict = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [orderId, 'deposit', 200, null, '検証会社', planVersion.rows[0].updated_at, user])
    assert(conflict.rows[0].result === 'receipt_exists', 'receipt amount must not be changed')
    const unauthorized = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [orderId, 'deposit', 100, null, '検証会社', plan.rows[0].updated_at, id()])
    assert(unauthorized.rows[0].result === 'forbidden', 'non-mail-admin actor must be rejected')
    await client.query('SAVEPOINT skipped_transition')
    let skipped = false
    try { await client.query("UPDATE public.oem_orders SET status='paid' WHERE id=$1", [orderId]) } catch (error) { skipped = error.code === '23514' }
    await client.query('ROLLBACK TO SAVEPOINT skipped_transition')
    assert(skipped, 'skipped order transition must be rejected')
    const alerts = await client.query('SELECT * FROM public.get_oem_payment_alerts(100,0) WHERE order_id=$1', [orderId])
    assert(alerts.rows[0]?.kind === 'excess', 'excess alert must be returned')
    const unconfigured = await client.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,status,accepted_at,final_amount) VALUES($1,3,$2,100000,50000,'検証','{}'::jsonb,$3,'test','規約','本文',$4,$5,'2099-01-01','accepted',now(),100000) RETURNING id`, [leadId, `PAY-${id()}`, hash('q3'), hash('t3'), hash(id())])
    const unconfiguredAlerts = await client.query('SELECT * FROM public.get_oem_payment_alerts(100,0) WHERE order_id=$1', [unconfigured.rows[0].id])
    assert(unconfiguredAlerts.rows[0]?.kind === 'unconfigured' && unconfiguredAlerts.rows[0].stage === 'deposit', 'unconfigured accepted order must alert as deposit')
    const overduePlan = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [unconfigured.rows[0].id, 'deposit', 100, '2020-01-01', '検証会社', null, user])
    const overdueAlerts = await client.query('SELECT * FROM public.get_oem_payment_alerts(100,0) WHERE order_id=$1', [unconfigured.rows[0].id])
    assert(overduePlan.rows[0].result === 'saved' && overdueAlerts.rows[0]?.kind === 'overdue', 'overdue plan must alert')
    const exactOrder = await client.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,status,accepted_at,final_amount) VALUES($1,2,$2,100000,50000,'検証','{}'::jsonb,$3,'test','規約','本文',$4,$5,'2099-01-01','accepted',now(),100000) RETURNING id`, [leadId, `PAY-${id()}`, hash('q2'), hash('t2'), hash(id())])
    const exactOrderId = exactOrder.rows[0].id
    const exactPlan = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [exactOrderId, 'deposit', 100, null, '検証会社', null, user])
    const exactReceipt = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [exactPlan.rows[0].plan_id, id(), 100, '2026-09-03', '検証会社', '', user])
    assert(exactReceipt.rows[0].result === 'accepted', 'exact receipt must advance deposit status')
    const exactAlerts = await client.query('SELECT * FROM public.get_oem_payment_alerts(100,0) WHERE order_id=$1', [exactOrderId])
    assert(exactAlerts.rowCount === 0, 'exact payment must remove alert')
    await client.query("UPDATE public.oem_orders SET status='in_production' WHERE id=$1", [exactOrderId])
    await client.query("UPDATE public.oem_orders SET status='balance_due' WHERE id=$1", [exactOrderId])
    const balancePlan = await client.query('SELECT * FROM public.save_oem_payment_plan($1,$2,$3,$4,$5,$6,$7)', [exactOrderId, 'balance', 200, null, '検証会社', null, user])
    const balanceReceipt = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [balancePlan.rows[0].plan_id, id(), 200, '2026-09-04', '検証会社', '', user])
    assert(balanceReceipt.rows[0].result === 'accepted', 'exact balance receipt must advance paid status')
    const paidAgain = await client.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,$4,$5,$6,$7)', [balancePlan.rows[0].plan_id, id(), 200, '2026-09-05', '検証会社', '', user])
    assert(paidAgain.rows[0].result === 'state', 'paid order must reject stale receipt')
    const shipped = await client.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,status,accepted_at,final_amount) VALUES($1,4,$2,100000,50000,'検証','{}'::jsonb,$3,'test','規約','本文',$4,$5,'2099-01-01','shipped',now(),100000) RETURNING id`, [leadId, `PAY-${id()}`, hash('q4'), hash('t4'), hash(id())])
    const shippedAlerts = await client.query('SELECT * FROM public.get_oem_payment_alerts(100,0) WHERE order_id=$1', [shipped.rows[0].id])
    assert(shippedAlerts.rowCount === 0, 'shipped order without plan must not be an unconfigured alert')
    await client.query('ROLLBACK')
    console.log('OEM payment verification: passed (RLS, privileges, date, partial, duplicate, excess, transition guard, alert)')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('OEM payment verification failed:', { code: error.code, message: error.message })
    process.exitCode = 1
  } finally { await client.end() }
}
main()
