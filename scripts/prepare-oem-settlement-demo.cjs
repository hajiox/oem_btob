/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic settlement fixtures. Persists only with explicit --commit; no email or real transfer.
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const TODAY = '2026-10-01'
const SUFFIX = process.env.OEM_SETTLEMENT_DEMO_SUFFIX || new Date().toISOString().slice(0, 10).replaceAll('-', '')
const CANCEL = `DEMO-SETTLEMENT-CANCEL-${SUFFIX}`
const ADJUST = `DEMO-SETTLEMENT-ADJUST-${SUFFIX}`
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const id = () => crypto.randomUUID()
const assert = (value, message) => { if (!value) throw new Error(message) }
const q = (db, sql, values = []) => db.query(sql, values)

async function existing(db, orderNumber) {
  const row = await q(db, `SELECT o.id,o.lead_id,o.status,l.company_name,l.email FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id WHERE o.order_number=$1 AND l.page_id=$2`, [orderNumber, PAGE])
  return row.rows[0] || null
}
async function createOrder(db, orderNumber, company, status) {
  const found = await existing(db, orderNumber)
  if (found) return { ...found, reused: true }
  const lead = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
    VALUES($1,$2,'デモ担当',$3,'[]'::jsonb,100000,'won','【動作テスト・支払不要】精算デモ。実取引・実入金・メールなし。') RETURNING id`, [PAGE, company, `${orderNumber.toLowerCase()}@example.invalid`])
  const leadId = lead.rows[0].id
  const order = await q(db, `INSERT INTO public.oem_orders
    (lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
    VALUES($1,1,$2,$3,100000,50000,100000,$4,'{"demo":true}'::jsonb,$5,'demo-only','デモ専用規約','実取引なし',$6,$7,'2099-01-01',now()) RETURNING id`, [leadId, orderNumber, status, company, hash(`${orderNumber}-quote`), hash(`${orderNumber}-terms`), hash(id())])
  return { id: order.rows[0].id, lead_id: leadId, status, company_name: company, email: `${orderNumber.toLowerCase()}@example.invalid`, reused: false }
}
async function deposit(db, order, actor) {
  const plan = await q(db, 'SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [order.id, 'deposit', 50000, null, order.email, null, actor])
  assert(['saved', 'duplicate'].includes(plan.rows[0]?.result), `deposit plan: ${plan.rows[0]?.result}`)
  const receipt = await q(db, 'SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [plan.rows[0].plan_id, id(), 50000, TODAY, order.email, '【動作テスト・支払不要】実銀行入金なし', actor])
  assert(['accepted', 'duplicate'].includes(receipt.rows[0]?.result), `deposit receipt: ${receipt.rows[0]?.result}`)
}
async function adjustmentFulfillment(db, order, actor) {
  const saved = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [order.id, actor, 0, 'save', JSON.stringify({ plannedQuantity: 100, quantityUnit: '個', productionDueDate: '2026-09-30', shipmentDueDate: TODAY, notes: '【動作テスト・支払不要】' })])
  assert(['saved', 'duplicate'].includes(saved.rows[0]?.result), `fulfillment save: ${saved.rows[0]?.result}`)
  const started = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [order.id, actor, saved.rows[0].current_version, 'start', '{}'])
  assert(['started', 'duplicate'].includes(started.rows[0]?.result), `fulfillment start: ${started.rows[0]?.result}`)
  const completed = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [order.id, actor, started.rows[0].current_version, 'complete', JSON.stringify({ completedQuantity: 100, completedOn: TODAY, finalAmount: 100000 })])
  assert(['completed', 'duplicate'].includes(completed.rows[0]?.result), `fulfillment complete: ${completed.rows[0]?.result}`)
}
async function main() {
  const db = connection()
  try {
    await db.connect(); await q(db, 'BEGIN')
    const actorRow = await q(db, 'SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1'); assert(actorRow.rowCount, 'No OEM admin actor is provisioned')
    const actor = actorRow.rows[0].user_id
    const cancel = await createOrder(db, CANCEL, '【動作テスト・支払不要】キャンセル返金確認', 'accepted')
    const adjust = await createOrder(db, ADJUST, '【動作テスト・支払不要】追加精算確認', 'accepted')
    if (!cancel.reused) { await deposit(db, cancel, actor); await q(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2', ['deposit_paid', cancel.id]) }
    if (!adjust.reused) { await deposit(db, adjust, actor); await adjustmentFulfillment(db, adjust, actor) }
    const out = { cancel: { orderId: cancel.id, status: (await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [cancel.id])).rows[0].status }, adjustment: { orderId: adjust.id, status: (await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [adjust.id])).rows[0].status } }
    if (process.argv.includes('--commit')) await q(db, 'COMMIT'); else await q(db, 'ROLLBACK')
    console.log(JSON.stringify(out))
  } catch (error) {
    await q(db, 'ROLLBACK').catch(() => {})
    console.error(JSON.stringify({ error: error.message }))
    process.exitCode = 1
  } finally { await db.end() }
}
main()
