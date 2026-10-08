/* eslint-disable @typescript-eslint/no-require-imports */
// Rollback-only portal/reorder verification. --with-migration validates 023 in this transaction.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const dateAtJst = offset => { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date) }
const TODAY = dateAtJst(0)
const YESTERDAY = dateAtJst(-1)
const id = () => crypto.randomUUID()
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const q = (db, sql, values = []) => db.query(sql, values)
const assert = (value, message) => { if (!value) throw new Error(message) }
async function rejected(db, sql, values, label) { await q(db, 'SAVEPOINT portal_reject'); let failed = false; try { await q(db, sql, values) } catch { failed = true } await q(db, 'ROLLBACK TO SAVEPOINT portal_reject'); assert(failed, `${label}: expected rejection`) }
const token = suffix => `portal-${suffix}-${id()}`
const expiry = () => new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString()

async function fixture(db, actor, suffix, options = [{ question: '商品', answer: '定番', key: 'product-1', product: '商品A' }], status = 'shipped', paidAmount = 1100) {
  const lead = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
    VALUES($1,$2,'検証担当',$3,$4::jsonb,0,'won','内部メモを公開してはいけない') RETURNING id`, [PAGE, `Portal ${suffix}`, `${suffix}@synthetic.example.invalid`, JSON.stringify(options)])
  const leadId = lead.rows[0].id; const orderId = id(); const orderNumber = `VERIFY-PORTAL-${suffix}-${id()}`
  await q(db, `INSERT INTO public.oem_orders(id,lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
    VALUES($1,$2,1,$3,$4,1000,500,1000,'公開仕様のサンプル','{"selectedOptions": [{"question":"商品","answer":"定番","key":"product-1","product":"商品A","internal_notes":"秘密"}],"private_cost":999999}', $5,'test','規約','秘密規約は返さない',$6,$7,'2099-01-01',now())`, [orderId, leadId, orderNumber, status, hash(orderNumber), hash(`terms-${orderId}`), hash(`order-${orderId}`)])
  await q(db, `INSERT INTO public.oem_order_fulfillment(order_id,planned_quantity,quantity_unit,completed_quantity,completed_on,shipped_on,carrier,tracking_number) VALUES($1,10,'個',10,$2,$3,'架空配送','TRACK-${suffix}')`, [orderId, YESTERDAY, TODAY])
  const plan = await q(db, `INSERT INTO public.oem_payment_plans(order_id,stage,expected_amount,payer_name) VALUES($1,'balance',1100,'架空支払人') RETURNING id`, [orderId])
  await q(db, `INSERT INTO public.oem_payment_receipts(plan_id,request_id,amount,paid_on,payer_name,note,confirmed_by) VALUES($1,$2,$3,$4,'架空支払人','検証用',$5)`, [plan.rows[0].id, id(), paidAmount, TODAY, actor])
  await q(db, `INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by)
    VALUES($1,$2,$3,'balance',$4,$5::jsonb,$6,$7,$8,$9)`, [orderId, leadId, plan.rows[0].id, `INV-${id()}`, JSON.stringify({ grossTotal: 1100, netTotal: 1000 }), hash(id()), id(), id(), actor])
  return { leadId, orderId }
}

async function manage(db, action, leadId, actor, tokenHash, expiry, linkId = null) {
  const result = await q(db, 'SELECT * FROM public.manage_oem_progress_link($1,$2,$3,$4,$5,$6)', [action, leadId, actor, tokenHash, expiry, linkId])
  return result.rows[0]
}
async function portal(db, bearer) { const result = await q(db, 'SELECT public.get_oem_progress_portal($1) AS data', [hash(bearer)]); return result.rows[0].data }
async function reorder(db, bearer, orderId, requestId, selection) {
  const result = await q(db, 'SELECT * FROM public.request_oem_reorder($1,$2,$3,$4::jsonb)', [hash(bearer), orderId, requestId, JSON.stringify(selection)])
  return result.rows[0]
}

async function main() {
  const db = connection(); let stage = 'connect'
  try {
    await db.connect(); await q(db, 'BEGIN')
    if (process.argv.includes('--with-migration')) {
      stage = 'migration'
      const invoiceApplied = await q(db, "SELECT to_regprocedure('public.issue_oem_document(uuid,text,uuid,uuid,jsonb)') AS function")
      const portalApplied = await q(db, "SELECT to_regclass('public.oem_progress_links') AS table")
      const files = []
      if (!invoiceApplied.rows[0].function) files.push('sql/022_oem_invoice_documents.sql')
      if (!portalApplied.rows[0].table) files.push('sql/023_oem_portal_reorder.sql')
      for (const file of files) {
        const sql = fs.readFileSync(file, 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
        await q(db, sql)
      }
    }
    const actorRow = await q(db, 'SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1'); assert(actorRow.rowCount, 'verification requires OEM admin'); const actor = actorRow.rows[0].user_id
    stage = 'permissions and issue/revoke/renew'
    const perms = await q(db, `SELECT has_function_privilege('anon','public.get_oem_progress_portal(text)','EXECUTE') AS anon, has_function_privilege('service_role','public.get_oem_progress_portal(text)','EXECUTE') AS service`); assert(!perms.rows[0].anon && perms.rows[0].service, 'portal RPC must be service-role-only')
    const source = await fixture(db, actor, id()); const issuedToken = token('issued'); const issued = await manage(db, 'issue', source.leadId, actor, hash(issuedToken), expiry()); assert(issued.result === 'issued', 'link issue')
    const projection = await portal(db, issuedToken); assert(projection?.order?.orderNumber, 'safe projection exists'); const serialized = JSON.stringify(projection); for (const forbidden of ['internal_notes','private_cost','架空支払人','秘密規約','synthetic.example.invalid']) assert(!serialized.includes(forbidden), `projection leaked ${forbidden}`); assert(projection.order.agreedAmount === 1100 && projection.order.outstandingAmount === 0, 'projection uses invoice gross and no outstanding')
    const expired = token('expired'); const exp = await manage(db, 'issue', source.leadId, actor, hash(expired), '2000-01-01'); assert(exp.result === 'invalid', 'past expiry rejected')
    const revoked = await manage(db, 'revoke', source.leadId, actor, null, null, issued.link_id); assert(revoked.result === 'revoked' && await portal(db, issuedToken) === null, 'revoked token rejected')
    const renewedToken = token('renewed'); const renewed = await manage(db, 'renew', source.leadId, actor, hash(renewedToken), expiry(), issued.link_id); assert(renewed.result === 'renewed' && await portal(db, renewedToken), 'renewed token works')
    await rejected(db, 'UPDATE public.oem_progress_links SET token_hash=$1 WHERE id=$2', [hash('tampered'), renewed.link_id], 'link token immutable')
    await rejected(db, 'DELETE FROM public.oem_progress_links WHERE id=$1', [renewed.link_id], 'link history immutable')
    stage = 'scope, eligibility and idempotency'
    const other = await fixture(db, actor, id()); const otherToken = token('other'); await manage(db, 'issue', other.leadId, actor, hash(otherToken), expiry()); const cross = await reorder(db, otherToken, source.orderId, id(), { selectedOptions: [], specification: 'x' }); assert(['state', 'unavailable'].includes(cross.result), 'cross-customer source rejected')
    const unpaid = await fixture(db, actor, id(), undefined, 'shipped', 1000); const unpaidToken = token('unpaid'); await manage(db, 'issue', unpaid.leadId, actor, hash(unpaidToken), expiry()); const unpaidResult = await reorder(db, unpaidToken, unpaid.orderId, id(), { selectedOptions: [], specification: 'x' }); assert(unpaidResult.result === 'state', 'net-paid but gross-unpaid source rejected')
    const requestId = id(); const first = await reorder(db, renewedToken, source.orderId, requestId, { selectedOptions: [{ internal_notes: 'override' }], specification: '顧客指定の安全仕様' }); assert(first.result === 'created', `eligible reorder: ${first.result}`)
    await rejected(db, 'DELETE FROM public.oem_reorder_requests WHERE request_id=$1', [requestId], 'reorder ledger immutable')
    const duplicate = await reorder(db, renewedToken, source.orderId, requestId, { selectedOptions: [{ internal_notes: 'override' }], specification: '顧客指定の安全仕様' }); assert(duplicate.result === 'duplicate' && duplicate.new_lead_id === first.new_lead_id, 'same request is idempotent')
    const drift = await reorder(db, renewedToken, source.orderId, requestId, { selectedOptions: [], specification: '別内容' }); assert(drift.result === 'conflict', 'request drift conflicts')
    const draft = await q(db, 'SELECT l.selected_options,c.final_spec_revision,l.estimated_total_price,l.status FROM public.leads l JOIN public.oem_lead_cases c ON c.lead_id=l.id WHERE l.id=$1', [first.new_lead_id]); assert(draft.rows[0].estimated_total_price === 0 && draft.rows[0].status === 'negotiating', 'reorder is zero-priced draft'); assert(!JSON.stringify(draft.rows[0].selected_options).includes('internal_notes'), 'client options cannot override source-safe selections'); assert(draft.rows[0].final_spec_revision === '顧客指定の安全仕様', 'requested specification is preserved as formal-spec default')
    const cancelled = await fixture(db, actor, id(), undefined, 'cancelled'); const cancelledToken = token('cancelled'); await manage(db, 'issue', cancelled.leadId, actor, hash(cancelledToken), expiry()); const blocked = await reorder(db, cancelledToken, cancelled.orderId, id(), { selectedOptions: [], specification: 'x' }); assert(blocked.result === 'state', 'cancelled source rejected')
    const settled = await fixture(db, actor, id()); await q(db, `INSERT INTO public.oem_settlements(order_id,revision,kind,state,material_stage,taxable8,taxable10,non_taxable,reason,agreement_note,original_snapshot,received_at_confirmation,confirmed_at,confirmed_by,created_by) VALUES($1,1,'adjustment','settled','not_applicable',0,1000,0,'検証','顧客確認','{}'::jsonb,1100,now(),$2,$2)`, [settled.orderId, actor]); const settledToken = token('settled'); await manage(db, 'issue', settled.leadId, actor, hash(settledToken), expiry()); const settledResult = await reorder(db, settledToken, settled.orderId, id(), { selectedOptions: [], specification: 'x' }); assert(settledResult.result === 'created', 'settled shipped source accepted')
    await q(db, 'ROLLBACK'); console.log('OEM portal/reorder verification: passed (rollback, permissions, safe projection, gross/outstanding, expiry, revoke, renew, cross-scope, shipped+settled eligibility, idempotency, tamper-safe selections, spec persistence, cancellation guard)')
  } catch (error) { await q(db, 'ROLLBACK').catch(() => {}); console.error('OEM portal/reorder verification failed:', { stage, code: error.code, message: error.message }); process.exitCode = 1 } finally { await db.end() }
}
main()
