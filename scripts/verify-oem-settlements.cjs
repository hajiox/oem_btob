/* eslint-disable @typescript-eslint/no-require-imports */
// Rollback-only settlement verification. --with-migration applies 018 inside this transaction.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const TODAY = '2026-10-01'
const id = () => crypto.randomUUID()
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const assert = (value, message) => { if (!value) throw new Error(message) }
const q = (db, sql, values = []) => db.query(sql, values)

async function rpc(db, orderId, actor, settlementId, version, action, input, requestId = id()) {
  const r = await q(db, 'SELECT * FROM public.update_oem_settlement($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::uuid,$7::jsonb)', [orderId, settlementId, actor, version, action, requestId, JSON.stringify(input)])
  return r.rows[0]
}
async function result(db, args, expected, label) {
  const row = await rpc(db, ...args)
  assert(row?.result === expected, `${label}: expected ${expected}, got ${row?.result}`)
  return row
}
async function rejected(db, sql, values, label) {
  await q(db, 'SAVEPOINT settlement_reject')
  let failed = false
  try { await q(db, sql, values) } catch { failed = true }
  await q(db, 'ROLLBACK TO SAVEPOINT settlement_reject')
  assert(failed, `${label}: expected rejection`)
}
async function fixture(db, suffix, status = 'accepted', amount = 100000) {
  const lead = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
    VALUES($1,$2,'検証担当',$3,'[]'::jsonb,$4,'won','精算検証。実取引なし。') RETURNING id`, [PAGE, `Settlement verification ${suffix}`, `${suffix}@example.invalid`, amount])
  const leadId = lead.rows[0].id
  const order = await q(db, `INSERT INTO public.oem_orders
    (lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
    VALUES($1,1,$2,$3,$4,$5,$4,'精算検証仕様','{}'::jsonb,$6,'test','検証規約','実取引なし',$7,$8,'2099-01-01',CASE WHEN $3='issued' THEN NULL ELSE now() END) RETURNING id`, [leadId, `VERIFY-SETTLEMENT-${suffix}-${id()}`, status, amount, Math.floor(amount / 2), hash(suffix), hash(`terms-${suffix}`), hash(id())])
  return { leadId, orderId: order.rows[0].id }
}
async function deposit(db, orderId, actor, amount = 50000) {
  const plan = await q(db, 'SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [orderId, 'deposit', amount, null, '架空テスト', null, actor])
  assert(['saved', 'duplicate'].includes(plan.rows[0]?.result), `deposit plan: ${plan.rows[0]?.result}`)
  const receipt = await q(db, 'SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [plan.rows[0].plan_id, id(), amount, TODAY, '架空テスト', '架空テスト・支払不要', actor])
  assert(['accepted', 'duplicate'].includes(receipt.rows[0]?.result), `deposit receipt: ${receipt.rows[0]?.result}`)
}
async function main() {
  const db = connection(); let stage = 'connect'
  try {
    await db.connect(); await q(db, 'BEGIN')
    if (process.argv.includes('--with-migration')) {
      stage = 'migration'
      const sql = fs.readFileSync('sql/018_oem_settlements.sql', 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
      await q(db, sql)
    }
    stage = 'schema and permissions'
    const tables = await q(db, "SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('oem_settlements','oem_settlement_cash')")
    assert(tables.rowCount === 2 && tables.rows.every(row => row.relrowsecurity), 'settlement tables must enable RLS')
    const grants = await q(db, "SELECT table_name FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('oem_settlements','oem_settlement_cash') AND grantee IN ('anon','authenticated','PUBLIC')")
    assert(!grants.rowCount, 'settlement tables must not grant public access')
    const fn = await q(db, "SELECT has_function_privilege('anon','public.update_oem_settlement(uuid,uuid,uuid,integer,text,uuid,jsonb)','EXECUTE') AS anon, has_function_privilege('authenticated','public.update_oem_settlement(uuid,uuid,uuid,integer,text,uuid,jsonb)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.update_oem_settlement(uuid,uuid,uuid,integer,text,uuid,jsonb)','EXECUTE') AS service_role")
    assert(!fn.rows[0].anon && !fn.rows[0].authenticated && fn.rows[0].service_role, 'settlement RPC must be service_role-only')
    const actorRow = await q(db, 'SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1'); assert(actorRow.rowCount, 'verification requires OEM admin')
    const actor = actorRow.rows[0].user_id
    const nonOem = await q(db, 'SELECT id FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.oem_mail_admins a WHERE a.user_id=u.id) LIMIT 1')
    const outsider = nonOem.rows[0]?.id || id()

    stage = 'scope, issued withdrawal, zero settlement, and alerts'
    const normalOrder = await fixture(db, `normal-alert-${id()}`, 'accepted')
    const issued = await fixture(db, `issued-withdraw-${id()}`, 'issued')
    const issuedCancel = await q(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2 RETURNING status', ['cancelled', issued.orderId]); assert(issuedCancel.rows[0]?.status === 'cancelled', 'issued withdrawal remains allowed')
    const zero = await fixture(db, `zero-${id()}`)
    let zeroDraft = await result(db, [zero.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: 'ゼロ精算', agreementNote: '確認' }], 'saved', 'zero settlement draft')
    zeroDraft = await result(db, [zero.orderId, actor, zeroDraft.settlement_id, zeroDraft.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'zero settlement confirm')
    const zeroState = await q(db, 'SELECT state FROM public.oem_settlements WHERE id=$1', [zeroDraft.settlement_id]); assert(zeroState.rows[0].state === 'settled', 'zero target with zero original settles immediately')
    const retryOrder = await fixture(db, `save-retry-${id()}`, 'accepted')
    const retryInput = { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: '同一送信再試行', agreementNote: '確認' }
    const retryRequest = '30000000-0000-4000-8000-000000000001'
    const retryDraft = await result(db, [retryOrder.orderId, actor, null, 0, 'save', retryInput, retryRequest], 'saved', 'save idempotency seed')
    await result(db, [retryOrder.orderId, actor, retryDraft.settlement_id, retryDraft.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'save idempotency confirm')
    const retryAgain = await result(db, [retryOrder.orderId, actor, null, 0, 'save', retryInput, retryRequest], 'duplicate', 'old save request remains idempotent after confirm')
    assert(retryAgain.settlement_id === retryDraft.settlement_id, 'old save request points to original settlement')
    const legacyCancelled = await fixture(db, `legacy-cancelled-${id()}`, 'cancelled')
    const alerts = await q(db, 'SELECT * FROM public.get_oem_settlement_alerts($1,$2)', [100, 0])
    assert(!alerts.rows.some(row => row.order_id === normalOrder.orderId), 'normal accepted order is absent from settlement alerts')
    assert(!alerts.rows.some(row => row.order_id === issued.orderId), 'issued withdrawal is absent from settlement alerts')
    assert(alerts.rows.some(row => row.order_id === legacyCancelled.orderId && row.kind === 'unconfigured'), 'legacy cancelled accepted order is unconfigured')

    stage = 'input, tax basis, permissions, draft and conflict'
    const directCancel = await fixture(db, `direct-cancel-${id()}`)
    await rejected(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2', ['cancelled', directCancel.orderId], 'accepted direct cancellation without settlement')
    const cancel = await fixture(db, `cancel-${id()}`); await deposit(db, cancel.orderId, actor)
    let row = await result(db, [cancel.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: '資材手配前キャンセル・全額返金', agreementNote: 'お客様確認済み' }], 'saved', 'cancellation draft')
    const sid = row.settlement_id; assert(row.current_version === 1, 'draft starts at version 1')
    await result(db, [cancel.orderId, outsider, sid, row.current_version, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 30000, nonTaxable: 0, dueDate: TODAY, reason: 'x', agreementNote: 'x' }], 'forbidden', 'non-OEM actor')
    await result(db, [cancel.orderId, actor, sid, 999, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: 'x', agreementNote: 'x' }], 'conflict', 'optimistic conflict')
    const noChange = await q(db, 'SELECT version,reason FROM public.oem_settlements WHERE id=$1', [sid]); assert(noChange.rows[0].version === 1, 'conflict must not mutate draft')
    row = await result(db, [cancel.orderId, actor, sid, row.current_version, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: '資材手配前キャンセル・全額返金', agreementNote: 'お客様確認済み' }], 'saved', 'same draft update')
    const invalid = await rpc(db, cancel.orderId, actor, sid, row.current_version, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: -1, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: 'x', agreementNote: 'x' }); assert(invalid.result === 'invalid', 'negative tax input must reject')

    stage = 'customer agreement and cancellation settlement'
    await result(db, [cancel.orderId, actor, sid, row.current_version, 'confirm', { customerConfirmed: false }], 'invalid', 'confirmation requires customer agreement')
    row = await result(db, [cancel.orderId, actor, sid, row.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'confirm cancellation')
    const cancelled = await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [cancel.orderId]); assert(cancelled.rows[0].status === 'cancelled', 'confirmed cancellation must cancel order')
    await rejected(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2', ['accepted', cancel.orderId], 'cancelled order reversal')
    const cashRequest = '20000000-0000-4000-8000-000000000001'
    const cash = await result(db, [cancel.orderId, actor, sid, row.current_version, 'record_cash', { direction: 'refund', amount: 25000, happenedOn: TODAY, counterparty: '架空返金先', note: '部分返金', bankConfirmed: true }, cashRequest], 'recorded', 'partial refund')
    const cashDuplicate = await result(db, [cancel.orderId, actor, sid, cash.current_version, 'record_cash', { direction: 'refund', amount: 25000, happenedOn: TODAY, counterparty: '架空返金先', note: '部分返金', bankConfirmed: true }, cashRequest], 'duplicate', 'cash idempotent retry after version change')
    assert(cashDuplicate.current_version === cash.current_version, 'cash duplicate does not increment version')
    await result(db, [cancel.orderId, actor, sid, cash.current_version, 'record_cash', { direction: 'refund', amount: 24999, happenedOn: TODAY, counterparty: '架空返金先', note: '別内容', bankConfirmed: true }, cashRequest], 'conflict', 'cash different payload conflict')
    const cash2 = await result(db, [cancel.orderId, actor, sid, cash.current_version, 'record_cash', { direction: 'refund', amount: 25000, happenedOn: TODAY, counterparty: '架空返金先', note: '最終返金', bankConfirmed: true }], 'recorded', 'second refund')
    assert(cash.settlement_id === cash2.settlement_id, 'cash remains on settlement')
    const net = await q(db, 'SELECT public.oem_settlement_net_received($1::uuid) AS net', [cancel.orderId]); assert(Number(net.rows[0].net) === 0, 'final refund must clear received balance')
    const future = await rpc(db, cancel.orderId, actor, sid, cash2.current_version, 'record_cash', { direction: 'refund', amount: 1, happenedOn: '2099-01-01', counterparty: 'x', note: 'x', bankConfirmed: true }); assert(['invalid', 'state'].includes(future.result), 'future cash date must reject')
    await rejected(db, 'UPDATE public.oem_settlements SET reason=$1 WHERE id=$2', ['改変', sid], 'confirmed settlement immutable')
    await rejected(db, 'DELETE FROM public.oem_settlement_cash WHERE settlement_id=$1', [sid], 'cash append-only')
    const nextInput = { kind: 'cancellation', materialStage: 'after', taxable8: 0, taxable10: 0, nonTaxable: 1000, dueDate: TODAY, reason: '後続精算', agreementNote: '確認' }
    let next = await result(db, [cancel.orderId, actor, null, 0, 'save', nextInput], 'saved', 'new cancellation revision after settled prior')
    next = await result(db, [cancel.orderId, actor, next.settlement_id, next.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'confirm changed cancellation total')
    next = await result(db, [cancel.orderId, actor, next.settlement_id, next.current_version, 'record_cash', { direction: 'receipt', amount: 1000, happenedOn: TODAY, counterparty: '架空入金元', note: '後続精算', bankConfirmed: true }], 'recorded', 'settle changed cancellation total')
    const historyData = await q(db, 'SELECT public.get_oem_settlement_data($1::uuid,$2::uuid) AS data', [cancel.orderId, actor])
    const history = historyData.rows[0].data
    assert(history.latest?.state === 'settled' && history.history.some(item => item.id === sid && item.state === 'settled'), 'prior settled state remains settled after later cash')

    stage = 'adjustment collection and payment/invoice freezes'
    const adjust = await fixture(db, `adjust-${id()}`, 'accepted'); await deposit(db, adjust.orderId, actor)
    const plan = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [adjust.orderId, actor, 0, 'save', JSON.stringify({ plannedQuantity: 100, quantityUnit: '個', productionDueDate: '2026-09-30', shipmentDueDate: TODAY, notes: '架空テスト' })]); assert(plan.rows[0]?.result === 'saved', `adjust fulfillment save: ${plan.rows[0]?.result}`)
    const started = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [adjust.orderId, actor, plan.rows[0].current_version, 'start', '{}']); assert(started.rows[0]?.result === 'started', `adjust fulfillment start: ${started.rows[0]?.result}`)
    const completed = await q(db, 'SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [adjust.orderId, actor, started.rows[0].current_version, 'complete', JSON.stringify({ completedQuantity: 100, completedOn: TODAY, finalAmount: 100000 })]); assert(completed.rows[0]?.result === 'completed', `adjust fulfillment complete: ${completed.rows[0]?.result}`)
    const depositPlanRow = await q(db, 'SELECT id FROM public.oem_payment_plans WHERE order_id=$1 AND stage=$2', [adjust.orderId, 'deposit'])
    const originalInvoice = await q(db, `INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by)
      VALUES($1,$2,$3,'deposit',$4,'{}'::jsonb,$5,$6,$7,$8) RETURNING id`, [adjust.orderId, adjust.leadId, depositPlanRow.rows[0].id, `VERIFY-INV-${id()}`, hash(id()), id(), id(), actor]); assert(originalInvoice.rowCount === 1, 'original invoice fixture')
    row = await result(db, [adjust.orderId, actor, null, 0, 'save', { kind: 'adjustment', materialStage: 'not_applicable', taxable8: 0, taxable10: 100000, nonTaxable: 0, dueDate: TODAY, reason: '最終精算', agreementNote: 'お客様確認済み' }], 'saved', 'adjustment draft')
    const aid = row.settlement_id
    row = await result(db, [adjust.orderId, actor, aid, row.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'confirm adjustment')
    await rejected(db, 'UPDATE public.oem_settlements SET reason=$1 WHERE id=$2', ['変更不可', aid], 'confirmed reason frozen')
    await rejected(db, 'UPDATE public.oem_settlements SET due_date=$1 WHERE id=$2', [TODAY, aid], 'confirmed due date frozen')
    await rejected(db, 'UPDATE public.oem_settlements SET material_stage=$1 WHERE id=$2', ['after', aid], 'confirmed material stage frozen')
    await rejected(db, 'UPDATE public.oem_settlements SET taxable10=999 WHERE id=$1', [aid], 'confirmed amount frozen')
    await rejected(db, 'UPDATE public.oem_settlements SET original_snapshot=\'{}\'::jsonb WHERE id=$1', [aid], 'confirmed snapshot frozen')
    await rejected(db, 'UPDATE public.oem_payment_plans SET expected_amount=expected_amount+1 WHERE order_id=$1', [adjust.orderId], 'active settlement freezes plans')
    await rejected(db, 'INSERT INTO public.oem_payment_receipts(plan_id,request_id,amount,paid_on,payer_name,note,confirmed_by) SELECT id,$2,1,$3,\'x\',\'x\',$4 FROM public.oem_payment_plans WHERE order_id=$1 LIMIT 1', [adjust.orderId, id(), TODAY, actor], 'active settlement freezes receipts')
    const collect = await result(db, [adjust.orderId, actor, aid, row.current_version, 'record_cash', { direction: 'receipt', amount: 30000, happenedOn: TODAY, counterparty: '架空入金元', note: '追加精算', bankConfirmed: true }], 'recorded', 'partial collection')
    assert(collect.current_version === row.current_version + 1, 'cash increments settlement version')
    const collect2 = await result(db, [adjust.orderId, actor, aid, collect.current_version, 'record_cash', { direction: 'receipt', amount: 30000, happenedOn: TODAY, counterparty: '架空入金元', note: '追加精算', bankConfirmed: true }], 'recorded', 'final collection')
    const adjusted = await q(db, 'SELECT status FROM public.oem_orders WHERE id=$1', [adjust.orderId]); assert(adjusted.rows[0].status === 'paid', 'fully collected adjustment marks paid')
    await rejected(db, 'UPDATE public.oem_payment_plans SET expected_amount=expected_amount+1 WHERE order_id=$1', [adjust.orderId], 'settled original payment plan update blocked')
    await rejected(db, 'DELETE FROM public.oem_payment_plans WHERE order_id=$1', [adjust.orderId], 'settled original payment plan delete blocked')
    await rejected(db, 'INSERT INTO public.oem_payment_plans(order_id,stage,expected_amount) VALUES($1,$2,1)', [adjust.orderId, 'balance'], 'settled original payment plan insert blocked')
    await rejected(db, 'INSERT INTO public.oem_payment_receipts(plan_id,request_id,amount,paid_on,payer_name,note,confirmed_by) VALUES($1,$2,1,$3,$4,$5,$6)', [depositPlanRow.rows[0].id, id(), TODAY, 'x', 'x', actor], 'settled original receipt insert blocked')
    await rejected(db, 'INSERT INTO public.oem_invoices(order_id,lead_id,plan_id,stage,invoice_number,snapshot,input_hash,request_id,send_request_id,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)', [adjust.orderId, adjust.leadId, depositPlanRow.rows[0].id, 'deposit', `VERIFY-INV-BLOCK-${id()}`, '{}', hash(id()), id(), id(), actor], 'settled original invoice insert blocked')
    await rejected(db, 'UPDATE public.oem_invoices SET snapshot=$1::jsonb WHERE id=$2', ['{"changed":true}', originalInvoice.rows[0].id], 'settled original invoice update blocked')
    await rejected(db, 'DELETE FROM public.oem_invoices WHERE id=$1', [originalInvoice.rows[0].id], 'settled original invoice delete blocked')
    const over = await rpc(db, adjust.orderId, actor, aid, collect2.current_version, 'record_cash', { direction: 'receipt', amount: 1, happenedOn: TODAY, counterparty: 'x', note: 'x', bankConfirmed: true }); assert(['invalid', 'state'].includes(over.result), 'overcollection must reject')
    const wrongDirection = await rpc(db, adjust.orderId, actor, aid, collect2.current_version, 'record_cash', { direction: 'refund', amount: 1, happenedOn: TODAY, counterparty: 'x', note: 'x', bankConfirmed: true }); assert(['invalid', 'state'].includes(wrongDirection.result), 'wrong cash direction must reject')

    stage = 'idempotency, void, revision and shipped guards'
    const voided = await fixture(db, `void-${id()}`)
    const first = await result(db, [voided.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'after', taxable8: 0, taxable10: 0, nonTaxable: 50000, dueDate: TODAY, reason: '実費', agreementNote: '確認' }, '10000000-0000-4000-8000-000000000001'], 'saved', 'void draft')
    const duplicate = await result(db, [voided.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'after', taxable8: 0, taxable10: 0, nonTaxable: 50000, dueDate: TODAY, reason: '実費', agreementNote: '確認' }, '10000000-0000-4000-8000-000000000001'], 'duplicate', 'same request id')
    assert(duplicate.settlement_id === first.settlement_id, 'same request id returns same settlement')
    await result(db, [voided.orderId, actor, first.settlement_id, 0, 'save', { kind: 'cancellation', materialStage: 'after', taxable8: 0, taxable10: 0, nonTaxable: 1, dueDate: TODAY, reason: '別内容', agreementNote: '確認' }, '10000000-0000-4000-8000-000000000001'], 'conflict', 'different payload request conflict')
    const vr = await result(db, [voided.orderId, actor, first.settlement_id, first.current_version, 'void', { reason: '誤入力のため取下げ' }], 'voided', 'void draft')
    const normal = await result(db, [voided.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: '通常キャンセル精算', agreementNote: '確認' }], 'saved', 'void restores normal')
    assert(normal.settlement_id !== first.settlement_id, 'void permits new draft')
    const pendingManufacture = await fixture(db, `pending-manufacture-${id()}`, 'in_production')
    await rejected(db, 'UPDATE public.oem_orders SET status=$1 WHERE id=$2', ['cancelled', pendingManufacture.orderId], 'in-production direct cancellation blocked')
    const acceptedAdjust = await fixture(db, `accepted-adjust-${id()}`); const acceptedDraft = await rpc(db, acceptedAdjust.orderId, actor, null, 0, 'save', { kind: 'adjustment', materialStage: 'not_applicable', taxable8: 0, taxable10: 0, nonTaxable: 1, dueDate: TODAY, reason: 'x', agreementNote: 'x' }); assert(acceptedDraft.result === 'state', 'accepted adjustment save blocked')
    const shipped = await fixture(db, `shipped-${id()}`, 'shipped'); const shippedDraft = await rpc(db, shipped.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'after', taxable8: 0, taxable10: 0, nonTaxable: 1, dueDate: TODAY, reason: 'x', agreementNote: 'x' }); assert(shippedDraft.result === 'state', 'shipped cancellation save blocked')
    const newRevision = await q(db, `INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes) VALUES($1,'Revision test','担当','${id()}@example.invalid','[]'::jsonb,1,'won','test') RETURNING id`, [PAGE])
    const old = await fixture(db, `revision-${id()}`); await deposit(db, old.orderId, actor); const oldDraft = await result(db, [old.orderId, actor, null, 0, 'save', { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 0, dueDate: TODAY, reason: 'x', agreementNote: 'x' }], 'saved', 'revision hold draft')
    await result(db, [old.orderId, actor, oldDraft.settlement_id, oldDraft.current_version, 'confirm', { customerConfirmed: true }], 'confirmed', 'revision hold confirm')
    await rejected(db, `INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at) VALUES($1,2,$2,'issued',1,0,'x','{}'::jsonb,$3,'t','t','t',$4,$5,'2099-01-01')`, [old.leadId, `VERIFY-REVISION-${id()}`, hash(id()), hash(id()), hash(id())], 'unsettled cancellation revision hold')
    const settledRevision = await q(db, `INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at) VALUES($1,2,$2,'issued',1,0,'x','{}'::jsonb,$3,'t','t','t',$4,$5,'2099-01-01') RETURNING id`, [cancel.leadId, `VERIFY-SETTLED-REVISION-${id()}`, hash(id()), hash(id()), hash(id())])
    assert(settledRevision.rowCount === 1, 'settled cancellation permits next revision')
    void newRevision
    await q(db, 'ROLLBACK')
    console.log('OEM settlement verification: passed (permissions, tax, draft/conflict, agreement, cancellation refund, adjustment collection, idempotency, freezes, append-only, guards)')
  } catch (error) {
    await q(db, 'ROLLBACK').catch(() => {})
    console.error('OEM settlement verification failed:', { stage, code: error.code, message: error.message, where: error.where })
    process.exitCode = 1
  } finally { await db.end() }
}
main()
