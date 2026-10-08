/* eslint-disable @typescript-eslint/no-require-imports */
// Rollback-only functional verification for OEM fulfillment. No email or external call.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const dateAtJst = offset => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date) }
const TODAY = dateAtJst(0)
const YESTERDAY = dateAtJst(-1)
const TOMORROW = dateAtJst(1)
const id = () => crypto.randomUUID()
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const assert = (value, message) => { if (!value) throw new Error(message) }
const q = (db, sql, values = []) => db.query(sql, values)

async function expectRpc(db, values, result, label) {
  const rows = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', values)
  assert(rows.rows[0]?.result === result, `${label}: expected ${result}, got ${rows.rows[0]?.result}`)
  return rows.rows[0]
}
async function rejected(db, sql, values, label) {
  await q(db, 'SAVEPOINT expected_rejection')
  let failed = false
  try { await q(db, sql, values) } catch { failed = true }
  await q(db, 'ROLLBACK TO SAVEPOINT expected_rejection')
  assert(failed, `${label}: expected database rejection`)
}
async function invalidOrRejected(db, values, label) {
  await q(db, 'SAVEPOINT invalid_input')
  try {
    const rows = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', values)
    assert(rows.rows[0]?.result === 'invalid', `${label}: expected invalid, got ${rows.rows[0]?.result}`)
  } catch (error) {
    // Malformed/date values may be rejected by a table constraint after the RPC returns.
    if (error.message.includes('expected invalid')) throw error
  }
  await q(db, 'ROLLBACK TO SAVEPOINT invalid_input')
}
async function expectOneOf(db, values, results, label) {
  const rows = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', values)
  assert(results.includes(rows.rows[0]?.result), `${label}: expected ${results.join(' or ')}, got ${rows.rows[0]?.result}`)
  return rows.rows[0]
}
async function leadAndOrder(db, suffix, status = 'accepted') {
  const lead = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
    VALUES($1,$2,'検証担当',$3,'[]'::jsonb,100000,'won','架空テスト。実取引なし。') RETURNING id`, [PAGE, `Fulfillment verification ${suffix}`, `${suffix}@example.invalid`])
  const leadId = lead.rows[0].id
  const order = await q(db, `INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
    VALUES($1,1,$2,$3,100000,50000,100000,'架空テスト仕様','{}'::jsonb,$4,'test','テスト規約','実取引なし',$5,$6,'2099-01-01',CASE WHEN $3='issued' THEN NULL ELSE now() END) RETURNING id`, [leadId, `VERIFY-FULFILLMENT-${suffix}-${id()}`, status, hash(suffix), hash(`terms-${suffix}`), hash(id())])
  return { leadId, orderId: order.rows[0].id }
}
async function legacyOrder(db, suffix, status) {
  const lead = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
    VALUES($1,$2,'検証担当',$3,'[]'::jsonb,100000,'won','legacy架空テスト。実取引なし。') RETURNING id`, [PAGE, `Legacy fulfillment ${suffix}`, `${suffix}@example.invalid`])
  const order = await q(db, `INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
    VALUES($1,1,$2,$3,100000,50000,100000,'legacy架空テスト仕様','{}'::jsonb,$4,'test','テスト規約','実取引なし',$5,$6,'2099-01-01',now()) RETURNING id`, [lead.rows[0].id, `VERIFY-LEGACY-${suffix}-${id()}`, status, hash(suffix), hash(`legacy-terms-${suffix}`), hash(id())])
  return order.rows[0].id
}
async function receipt(db, orderId, actorId) {
  const plan = await q(db, 'SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [orderId, 'deposit', 50000, null, '架空テスト', null, actorId])
  assert(plan.rows[0]?.result === 'saved', `deposit plan: ${plan.rows[0]?.result}`)
  const paid = await q(db, 'SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [plan.rows[0].plan_id, id(), 50000, TODAY, '架空テスト', '架空テスト・支払不要', actorId])
  assert(paid.rows[0]?.result === 'accepted', `deposit receipt: ${paid.rows[0]?.result}`)
}

async function main() {
  const db = connection(); let stage = 'connect'
  try {
    await db.connect(); await q(db, 'BEGIN')
    if (process.argv.includes('--with-migration')) {
      stage = 'migration'
      const sql = fs.readFileSync('sql/017_oem_fulfillment.sql', 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
      const applied = await q(db, "SELECT to_regclass('public.oem_order_fulfillment') AS table")
      if (!applied.rows[0].table) await q(db, sql)
    }
    stage = 'schema and privileges'
    const table = await q(db, "SELECT relrowsecurity FROM pg_class WHERE relname='oem_order_fulfillment'")
    assert(table.rowCount === 1 && table.rows[0].relrowsecurity, 'fulfillment table must enable RLS')
    const grants = await q(db, "SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='oem_order_fulfillment' AND grantee IN ('anon','authenticated','PUBLIC')")
    assert(!grants.rowCount, 'public roles must not access fulfillment table')
    const fn = await q(db, "SELECT has_function_privilege('anon','public.update_oem_fulfillment(uuid,uuid,integer,text,jsonb)','EXECUTE') AS anon, has_function_privilege('authenticated','public.update_oem_fulfillment(uuid,uuid,integer,text,jsonb)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.update_oem_fulfillment(uuid,uuid,integer,text,jsonb)','EXECUTE') AS service_role")
    assert(!fn.rows[0].anon && !fn.rows[0].authenticated && fn.rows[0].service_role, 'fulfillment RPC must be service_role-only')
    const actorRow = await q(db, 'SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1'); assert(actorRow.rowCount, 'verification requires OEM admin')
    const actor = actorRow.rows[0].user_id
    const nonOem = await q(db, 'SELECT id FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.oem_mail_admins a WHERE a.user_id=u.id) LIMIT 1')
    const outsider = nonOem.rows[0]?.id || id()

    stage = 'normal plan and start gates'
    const base = await leadAndOrder(db, 'normal'); let r = await expectRpc(db, [base.orderId, actor, 0, 'save', { plannedQuantity: 100, quantityUnit: '個', productionDueDate: YESTERDAY, shipmentDueDate: TODAY }], 'saved', 'save plan'); assert(r.current_version === 1, 'save increments version')
    const stateBeforeStart = await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [base.orderId]); assert(stateBeforeStart.rows[0].status === 'accepted', 'save must not start production')
    await expectRpc(db, [base.orderId, actor, 1, 'start', {}], 'state', 'start before deposit')
    await receipt(db, base.orderId, actor)
    r = await expectRpc(db, [base.orderId, actor, 1, 'start', {}], 'started', 'start after deposit')
    const started = await q(db, 'SELECT status,planned_quantity,version FROM public.oem_orders o JOIN public.oem_order_fulfillment f ON f.order_id=o.id WHERE o.id=$1', [base.orderId]); assert(started.rows[0].status === 'in_production' && started.rows[0].planned_quantity === 100, 'start state persisted')

    stage = 'input, permission, conflict, and atomicity'
    await expectRpc(db, [base.orderId, outsider, 2, 'save', { notes: 'x' }], 'forbidden', 'non-OEM actor')
    await expectRpc(db, [base.orderId, actor, 999, 'save', { notes: 'x' }], 'conflict', 'optimistic conflict')
    const beforeConflict = await q(db, 'SELECT status,version,notes FROM public.oem_orders o JOIN public.oem_order_fulfillment f ON f.order_id=o.id WHERE o.id=$1', [base.orderId])
    const conflict = await expectRpc(db, [base.orderId, actor, 1, 'save', { notes: 'must not persist' }], 'conflict', 'stale conflict unchanged')
    const afterConflict = await q(db, 'SELECT status,version,notes FROM public.oem_orders o JOIN public.oem_order_fulfillment f ON f.order_id=o.id WHERE o.id=$1', [base.orderId]); assert(JSON.stringify(beforeConflict.rows[0]) === JSON.stringify(afterConflict.rows[0]) && conflict.current_version === 2, 'conflict changes neither state nor fields')
    await expectRpc(db, [base.orderId, actor, 2, 'save', { plannedQuantity: 0 }], 'invalid', 'quantity lower bound')
    await expectRpc(db, [base.orderId, actor, 2, 'save', { unexpectedField: true }], 'invalid', 'unknown input field')
    await expectRpc(db, [base.orderId, actor, 2, 'no_such_action', {}], 'invalid', 'unknown action')
    await expectRpc(db, [base.orderId, actor, 2, 'save', { quantityUnit: '   ' }], 'invalid', 'blank quantity unit')
    await expectRpc(db, [base.orderId, actor, 2, 'save', { plannedQuantity: 100, productionDueDate: TOMORROW, shipmentDueDate: TODAY }], 'invalid', 'due date order')
    await invalidOrRejected(db, [base.orderId, actor, 2, 'complete', { completedQuantity: 99, completedOn: '1899-12-31', finalAmount: 100000 }], 'pre-1900 actual date')
    await invalidOrRejected(db, [base.orderId, actor, 2, 'complete', { completedQuantity: 99, completedOn: '2099-01-01', finalAmount: 100000 }], 'future actual date')
    await rejected(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2', ['balance_due', base.orderId], 'status trigger missing completion')
    const afterReject = await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [base.orderId]); assert(afterReject.rows[0].status === 'in_production', 'rejected transition rolled back')

    stage = 'complete, price independence, read-only quantity'
    r = await expectRpc(db, [base.orderId, actor, 2, 'complete', { completedQuantity: 98, completedOn: TODAY, finalAmount: 100000 }], 'completed', 'complete')
    const complete = await q(db, 'SELECT status,final_amount FROM public.oem_orders WHERE id=$1', [base.orderId]); assert(complete.rows[0].status === 'balance_due' && complete.rows[0].final_amount === 100000, 'complete advances balance_due without price rewrite')
    await expectOneOf(db, [base.orderId, actor, r.current_version, 'save', { plannedQuantity: 99 }], ['state', 'invalid'], 'quantity freeze after complete')
    const paid = await leadAndOrder(db, 'paid'); await expectRpc(db, [paid.orderId, actor, 0, 'save', { plannedQuantity: 20, quantityUnit: '個', shipmentDueDate: TODAY }], 'saved', 'paid plan')
    await receipt(db, paid.orderId, actor); await expectRpc(db, [paid.orderId, actor, 1, 'start', {}], 'started', 'paid fixture start')
    const pr = await expectRpc(db, [paid.orderId, actor, 2, 'complete', { completedQuantity: 20, completedOn: TODAY, finalAmount: 100000 }], 'completed', 'paid fixture complete')
    const balancePlan = await q(db, 'SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [paid.orderId, 'balance', 50000, null, '架空テスト', null, actor]); assert(balancePlan.rows[0]?.result === 'saved', 'balance plan')
    const balanceReceipt = await q(db, 'SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [balancePlan.rows[0].plan_id, id(), 50000, TODAY, '架空テスト', '架空テスト・支払不要', actor]); assert(balanceReceipt.rows[0]?.result === 'accepted', 'balance receipt')
    const ship = await expectRpc(db, [paid.orderId, actor, pr.current_version, 'ship', { shippedOn: TODAY, carrier: '検証運送', trackingNumber: 'SYNTHETIC' }], 'shipped', 'ship')
    assert(ship.current_version === 4, 'ship version')
    await expectRpc(db, [paid.orderId, actor, ship.current_version, 'save', { plannedQuantity: 1 }], 'state', 'shipped read-only')
    await expectRpc(db, [paid.orderId, actor, ship.current_version, 'ship', { shippedOn: TODAY, carrier: '別運送' }], 'state', 'duplicate ship')

    stage = 'legacy completion and paid shipping'
    const legacyBalance = await legacyOrder(db, 'balance', 'balance_due')
    const legacyBefore = await q(db, 'SELECT status,final_amount FROM public.oem_orders WHERE id=$1', [legacyBalance])
    await expectRpc(db, [legacyBalance, actor, 0, 'record_completion', { completedQuantity: 7, completedOn: TODAY }], 'completion_recorded', 'legacy balance completion')
    const legacyAfter = await q(db, 'SELECT status,final_amount FROM public.oem_orders WHERE id=$1', [legacyBalance])
    assert(legacyAfter.rows[0].status === 'balance_due' && legacyAfter.rows[0].final_amount === legacyBefore.rows[0].final_amount, 'legacy completion must not change status or final price')
    const legacyPaid = await legacyOrder(db, 'paid', 'paid')
    const legacyPaidDone = await expectRpc(db, [legacyPaid, actor, 0, 'record_completion', { completedQuantity: 7, completedOn: TODAY }], 'completion_recorded', 'legacy paid completion')
    const legacyShipped = await expectRpc(db, [legacyPaid, actor, legacyPaidDone.current_version, 'ship', { shippedOn: TODAY, carrier: '検証運送' }], 'shipped', 'legacy paid ship without plan/start')
    assert(legacyShipped.current_version === 2, 'legacy paid ship version')

    stage = 'alerts and cancellation exclusion'
    const cancelled = await leadAndOrder(db, 'cancelled', 'cancelled'); await expectRpc(db, [cancelled.orderId, actor, 0, 'save', { plannedQuantity: 1 }], 'state', 'cancelled excluded mutation')
    const alerts = await q(db, 'SELECT * FROM public.get_oem_fulfillment_alerts($1::integer,$2::integer)', [50, 0]); assert(alerts.rows.every(row => row.status !== 'cancelled' && row.status !== 'shipped'), 'cancelled/shipped excluded from alerts')
    assert(alerts.rows.every(row => row.total_count >= alerts.rows.length), 'alerts total_count is baseline-aware')
    const ready = alerts.rows.find(row => row.order_id === paid.orderId); assert(!ready, 'shipped order has no ready-to-ship alert')
    await q(db, 'ROLLBACK')
    console.log('OEM fulfillment verification: passed (RLS, actor, gates, input, conflict, atomicity, completion, price independence, shipping, alerts)')
  } catch (error) {
    await q(db, 'ROLLBACK').catch(() => {})
    console.error('OEM fulfillment verification failed:', { stage, code: error.code, message: error.message })
    process.exitCode = 1
  } finally { await db.end() }
}
main()
