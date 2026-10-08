/* Rollback-only SQL027 verification. Synthetic fixtures only; no mail, bank, or production writes. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const id = () => crypto.randomUUID()
const issuer = { name: 'Fixture issuer', address: 'Fixture address', email: 'fixture@example.invalid', registrationNumber: '', bankName: 'Fixture bank', branchName: 'Main', accountType: '普通', accountNumber: '123456', accountHolder: 'Fixture issuer' }

async function main() {
  const db = connection(); let stage = 'connect'
  try {
    await db.connect(); await db.query('BEGIN')
    stage = 'migration'
    const existingTable = (await db.query("SELECT to_regclass('public.oem_additional_trial_payments') AS table_name")).rows[0].table_name
    if (!existingTable) {
      const sql = fs.readFileSync('sql/027_oem_additional_trial_payments.sql', 'utf8').replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
      await db.query(sql)
    }
    const admin = await db.query('SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1')
    assert.ok(admin.rowCount, 'admin fixture')
    const actor = admin.rows[0].user_id
    const before = Number((await db.query("SELECT count(*)::int n FROM public.oem_trials")).rows[0].n)
    const additionalBefore = Number((await db.query("SELECT count(*)::int n FROM public.oem_additional_trial_payments")).rows[0].n)
    const receiptBefore = Number((await db.query("SELECT count(*)::int n FROM public.oem_additional_trial_payment_receipts")).rows[0].n)
    const grants = (await db.query("SELECT has_table_privilege('service_role','public.oem_additional_trial_payments','SELECT') AS select_ok, has_table_privilege('service_role','public.oem_additional_trial_payments','INSERT') AS insert_ok, has_table_privilege('service_role','public.oem_additional_trial_payments','UPDATE') AS update_ok, has_table_privilege('service_role','public.oem_additional_trial_payment_receipts','INSERT') AS receipt_insert_ok")).rows[0]
    assert.equal(grants.select_ok, true, 'service_role select grant')
    assert.equal(grants.insert_ok, false, 'direct payment insert denied')
    assert.equal(grants.update_ok, false, 'direct payment update denied')
    assert.equal(grants.receipt_insert_ok, false, 'direct receipt insert denied')
    const rls = (await db.query("SELECT (SELECT relrowsecurity FROM pg_class WHERE oid='public.oem_additional_trial_payments'::regclass) AS payment_rls, (SELECT relrowsecurity FROM pg_class WHERE oid='public.oem_additional_trial_payment_receipts'::regclass) AS receipt_rls")).rows[0]
    assert.equal(rls.payment_rls, true, 'payment RLS')
    assert.equal(rls.receipt_rls, true, 'receipt RLS')
    const lead = async (label) => (await db.query("INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes) VALUES($1,$2,'Fixture',$3,'[]',1,'won','SQL027 rollback fixture') RETURNING id", [PAGE, label, `${id()}@example.invalid`])).rows[0].id
    const rpc = async (name, args) => (await db.query(`SELECT * FROM public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args)).rows[0]
    const paidPrepayment = async (leadId, companyKey, claimIncluded) => {
      const pre = await rpc('create_oem_trial_prepayment', [leadId, actor, companyKey, 'fixture-evidence', claimIncluded, id(), issuer])
      assert.equal(pre.result, 'issued', 'prepayment issued')
      const paid = await rpc('record_oem_trial_prepayment_receipt', [pre.prepayment_id, actor, id(), pre.gross_amount, new Date().toISOString().slice(0, 10), 'Fixture payer', 'SQL027'])
      assert.equal(paid.result, 'paid', 'prepayment paid')
      return pre
    }
    const createTrial = async (leadId, companyKey, claimIncluded, label, requestId = id()) => rpc('create_oem_trial', [leadId, actor, companyKey, 'fixture-evidence', claimIncluded, label, '', requestId])

    stage = 'automatic invoice snapshot'
    const leadId = await lead('Additional trial A'); const pre = await paidPrepayment(leadId, `extra-${id()}`, true)
    assert.equal((await createTrial(leadId, `extra-${id()}`, true, 'wrong-key')).result, 'payment_required', 'mismatched company key blocked')
    const companyKey = (await db.query('SELECT company_key FROM public.oem_trial_prepayments WHERE id=$1', [pre.prepayment_id])).rows[0].company_key
    assert.equal((await createTrial(leadId, companyKey, true, 'trial-1')).fee_advisory, 0)
    assert.equal((await createTrial(leadId, companyKey, true, 'trial-2')).fee_advisory, 0)
    const third = await createTrial(leadId, companyKey, true, 'trial-3')
    assert.equal(third.fee_advisory, 3000)
    const payment = (await db.query('SELECT * FROM public.oem_additional_trial_payments WHERE trial_id=$1', [third.trial_id])).rows[0]
    assert.ok(payment, 'automatic additional payment')
    assert.deepEqual([payment.taxable_amount, payment.tax_amount, payment.gross_amount], [3000, 300, 3300])
    assert.match(payment.invoice_number, /^EXTRA-\d{8}-[A-Z0-9]{8}$/)
    assert.equal(payment.snapshot.issuer.name, issuer.name)
    assert.equal(payment.snapshot.companyName, 'Additional trial A')
    assert.equal(payment.snapshot.additionalTrial, true)
    const jstDueDate = (await db.query("SELECT ((now() AT TIME ZONE 'Asia/Tokyo')::date + 14)::text AS due_date")).rows[0].due_date
    assert.equal(payment.snapshot.dueDate, jstDueDate)
    assert.equal((await db.query("SELECT count(*)::int n FROM public.oem_additional_trial_payments WHERE trial_id=$1", [third.trial_id])).rows[0].n, 1)
    const retryRequest = id(); const retryTrial = await createTrial(leadId, companyKey, true, 'trial-4', retryRequest); const retryDuplicate = await createTrial(leadId, companyKey, true, 'trial-4', retryRequest)
    assert.equal(retryDuplicate.result, 'duplicate', 'trial retry duplicate')
    assert.equal((await db.query('SELECT count(*)::int n FROM public.oem_additional_trial_payments WHERE trial_id=$1', [retryTrial.trial_id])).rows[0].n, 1, 'trial retry has one receivable')

    stage = 'receipt boundaries'
    const today = new Date().toISOString().slice(0, 10); const request = id()
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, request, 1000, today, 'Fixture payer', 'partial'])).result, 'partial')
    assert.equal((await rpc('void_oem_additional_trial_payment', [payment.id, actor, 'partial cannot void'])).result, 'state', 'partial payment cannot void')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, request, 1000, today, 'Fixture payer', 'partial'])).result, 'duplicate')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, request, 999, today, 'Fixture payer', 'different'])).result, 'conflict')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, id(), 2301, today, 'Fixture payer', 'over'])).result, 'overpayment')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, id(), 2300, today, 'Fixture payer', 'final'])).result, 'paid')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, id(), 1, today, 'Fixture payer', 'after'])).result, 'state')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, crypto.randomUUID(), id(), 1, today, 'Fixture payer', 'forbidden'])).result, 'forbidden')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment.id, actor, id(), 1, '2999-01-01', 'Fixture payer', 'future'])).result, 'invalid')

    stage = 'void and immutable boundaries'
    const lead2 = await lead('Additional trial B'); const pre2 = await paidPrepayment(lead2, `extra-${id()}`, false); const company2 = (await db.query('SELECT company_key FROM public.oem_trial_prepayments WHERE id=$1', [pre2.prepayment_id])).rows[0].company_key
    await createTrial(lead2, company2, false, 'trial-1'); await createTrial(lead2, company2, false, 'trial-2'); const third2 = await createTrial(lead2, company2, false, 'trial-3')
    const payment2 = (await db.query('SELECT * FROM public.oem_additional_trial_payments WHERE trial_id=$1', [third2.trial_id])).rows[0]
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment2.id, actor, request, 1, today, 'Other payment', 'request conflict'])).result, 'conflict', 'request conflict across payments')
    assert.equal((await rpc('void_oem_additional_trial_payment', [payment2.id, actor, 'customer cancelled'])).result, 'void')
    assert.equal((await rpc('record_oem_additional_trial_receipt', [payment2.id, actor, id(), 3300, today, 'Fixture payer', 'void'])).result, 'state')
    assert.equal((await rpc('void_oem_additional_trial_payment', [payment.id, actor, 'paid cannot void'])).result, 'state')
    await db.query('SAVEPOINT immutable')
    await assert.rejects(db.query('UPDATE public.oem_additional_trial_payments SET snapshot=$1 WHERE id=$2', [{ changed: true }, payment.id]), /immutable|additional trial/i)
    await db.query('ROLLBACK TO SAVEPOINT immutable')
    await assert.rejects(db.query('DELETE FROM public.oem_additional_trial_payments WHERE id=$1', [payment.id]), /immutable|additional trial/i)
    await db.query('ROLLBACK TO SAVEPOINT immutable')
    await assert.rejects(db.query('DELETE FROM public.oem_additional_trial_payment_receipts WHERE payment_id=$1', [payment.id]), /append-only|additional trial/i)
    await db.query('ROLLBACK TO SAVEPOINT immutable')

    const during = Number((await db.query('SELECT count(*)::int n FROM public.oem_additional_trial_payments')).rows[0].n)
    await db.query('ROLLBACK')
    const check = connection(); await check.connect()
    const afterTable = (await check.query("SELECT to_regclass('public.oem_additional_trial_payments') AS table_name")).rows[0].table_name
    const afterTrials = Number((await check.query('SELECT count(*)::int n FROM public.oem_trials')).rows[0].n)
    let afterAdditional = null; let afterReceipts = null
    if (afterTable) {
      afterAdditional = Number((await check.query('SELECT count(*)::int n FROM public.oem_additional_trial_payments')).rows[0].n)
      afterReceipts = Number((await check.query('SELECT count(*)::int n FROM public.oem_additional_trial_payment_receipts')).rows[0].n)
    }
    await check.end()
    assert.equal(afterTrials, before, 'trial rowcount restored')
    assert.equal(afterAdditional, existingTable ? additionalBefore : null, 'payment rowcount restored')
    assert.equal(afterReceipts, existingTable ? receiptBefore : null, 'receipt rowcount restored')
    console.log(JSON.stringify({ result: 'PASS', stage: 'all-boundaries', migration: existingTable ? 'already-present-not-reapplied' : 'transaction-only', baselineTrials: before, syntheticAdditionalPayments: during, voidedFixture: true, rowcountAfterRollback: { trials: afterTrials, additionalPayments: afterAdditional, receipts: afterReceipts }, rollback: 'confirmed' }))
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    console.error('verify-oem-additional-trial-payments: FAIL', { stage, code: error.code, message: error.message })
    process.exitCode = 1
  } finally { await db.end() }
}
main()
