/* eslint-disable @typescript-eslint/no-require-imports */
// User-authorized synthetic fulfillment demo. No real payment, bank operation, or email.
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')

const DEMO = 'DEMO-FULFILLMENT-20261001'
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

async function main() {
  const db = connection()
  try {
    await db.connect()
    await db.query('BEGIN')
    const found = await db.query(`SELECT o.id,o.lead_id,o.status,f.version FROM public.oem_orders o
      LEFT JOIN public.oem_order_fulfillment f ON f.order_id=o.id WHERE o.order_number=$1`, [DEMO])
    const preparePaid = process.argv.includes('--prepare-paid')
    if (!found.rowCount && preparePaid) throw new Error('Refusing --prepare-paid: exact demo fixture is not present')
    if (found.rowCount && preparePaid) {
      const row = found.rows[0]
      const exact = row.id && row.lead_id
      const identity = await db.query(`SELECT o.id,o.status,o.final_amount,l.email,l.company_name,l.page_id
        FROM public.oem_orders o JOIN public.leads l ON l.id=o.lead_id
        WHERE o.id=$1 AND o.order_number=$2 AND l.email='fulfillment-demo@example.invalid'
          AND l.company_name='【動作テスト・支払不要】製造・発送確認' AND l.page_id=$3`, [row.id, DEMO, PAGE])
      if (!exact || !identity.rowCount || identity.rows[0].page_id !== PAGE) throw new Error('Refusing --prepare-paid: demo identity does not match exactly')
      if (identity.rows[0].status !== 'balance_due') {
        console.log({ demo: DEMO, status: identity.rows[0].status, pending: true, reason: 'Complete the synthetic demo in the UI first', emailSent: false })
        await db.query('ROLLBACK'); return
      }
      const actor = await db.query('SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1')
      if (!actor.rowCount) throw new Error('No OEM admin actor is provisioned')
      const actorId = actor.rows[0].user_id
      const plan = await db.query('SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [row.id, 'balance', 50000, null, '【架空テスト】fulfillment-demo@example.invalid', null, actorId])
      if (!['saved', 'duplicate'].includes(plan.rows[0]?.result)) throw new Error(`Could not seed synthetic balance plan: ${plan.rows[0]?.result}`)
      const planId = plan.rows[0].plan_id
      const receipt = await db.query('SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [planId, crypto.randomUUID(), 50000, '2026-10-01', '【架空テスト】fulfillment-demo@example.invalid', '架空テスト・支払不要・実銀行入金なし', actorId])
      if (!['accepted', 'duplicate'].includes(receipt.rows[0]?.result)) throw new Error(`Could not record synthetic balance receipt: ${receipt.rows[0]?.result}`)
      await db.query(`INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
        VALUES($1,'demo_paid_prepared',$2::jsonb,$3)`, [row.lead_id, JSON.stringify({ demo: true, note: '架空テストの残金入金状態。実支払・銀行操作・メール送信なし。' }), actorId])
      await db.query('COMMIT')
      console.log({ demo: DEMO, orderId: row.id, status: 'paid', syntheticReceipt: true, emailSent: false }); return
    }
    if (found.rowCount) {
      console.log({ demo: DEMO, ...found.rows[0], reused: true, emailSent: false })
      await db.query('ROLLBACK'); return
    }
    const lead = await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
      VALUES($1,'【動作テスト・支払不要】製造・発送確認','デモ担当','fulfillment-demo@example.invalid','[]'::jsonb,100000,'won','架空テスト。実取引・同意・入金なし。') RETURNING id`, [PAGE])
    const leadId = lead.rows[0].id
    const order = await db.query(`INSERT INTO public.oem_orders
      (lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
      VALUES($1,1,$2,'accepted',100000,50000,100000,'架空テスト用OEM製造。架空の同意証跡のみ、実際の発注・入金ではありません。','{"demo":true}'::jsonb,$3,'demo-only','テスト専用・実同意の証拠ではありません','実取引なし',$4,$5,now()+interval '14 days',now()) RETURNING id`,
      [leadId, DEMO, hash('fulfillment-demo-quote'), hash('fulfillment-demo-terms'), hash(crypto.randomUUID())])
    const orderId = order.rows[0].id
    const actor = await db.query('SELECT user_id FROM public.oem_mail_admins ORDER BY user_id LIMIT 1')
    if (!actor.rowCount) throw new Error('No OEM admin actor is provisioned')
    const actorId = actor.rows[0].user_id
    const saved = await db.query('SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [orderId, actorId, 0, 'save', JSON.stringify({ plannedQuantity: 100, quantityUnit: '個', productionDueDate: '2026-09-30', shipmentDueDate: '2026-10-01', notes: '架空テスト。支払不要。' })])
    if (saved.rows[0]?.result !== 'saved') throw new Error(`Could not seed fulfillment plan: ${saved.rows[0]?.result}`)
    const depositPlan = await db.query('SELECT * FROM public.save_oem_payment_plan($1::uuid,$2::text,$3::integer,$4::date,$5::text,$6::timestamptz,$7::uuid)', [orderId, 'deposit', 50000, null, '【架空テスト】fulfillment-demo@example.invalid', null, actorId])
    if (depositPlan.rows[0]?.result !== 'saved') throw new Error(`Could not seed synthetic deposit plan: ${depositPlan.rows[0]?.result}`)
    const depositReceipt = await db.query('SELECT * FROM public.record_oem_payment_receipt($1::uuid,$2::uuid,$3::integer,$4::date,$5::text,$6::text,$7::uuid)', [depositPlan.rows[0].plan_id, crypto.randomUUID(), 50000, '2026-10-01', '【架空テスト】fulfillment-demo@example.invalid', '架空テスト・支払不要・実銀行入金なし', actorId])
    if (depositReceipt.rows[0]?.result !== 'accepted') throw new Error(`Could not record synthetic deposit receipt: ${depositReceipt.rows[0]?.result}`)
    const started = await db.query('SELECT * FROM public.update_oem_fulfillment($1::uuid,$2::uuid,$3::integer,$4::text,$5::jsonb)', [orderId, actorId, saved.rows[0].current_version, 'start', '{}'])
    if (started.rows[0]?.result !== 'started') throw new Error(`Could not seed in_production state: ${started.rows[0]?.result}`)
    await db.query(`INSERT INTO public.oem_lead_events(lead_id,event_type,details,created_by)
      VALUES($1,'demo_created',$2::jsonb,$3)`, [leadId, JSON.stringify({ demo: true, note: '製造・発送確認の架空テスト。depositは架空RPC receiptでゲートを通過、実支払・銀行操作・メール送信なし。' }), actorId])
    await db.query('COMMIT')
    console.log({ demo: DEMO, orderId, leadId, status: 'in_production', plannedQuantity: 100, productionDueDate: '2026-09-30', shipmentDueDate: '2026-10-01', emailSent: false })
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    console.error('OEM fulfillment demo preparation failed:', { code: error.code, message: error.message })
    process.exitCode = 1
  } finally { await db.end() }
}

main()
