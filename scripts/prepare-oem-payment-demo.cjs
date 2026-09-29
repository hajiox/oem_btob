/* eslint-disable @typescript-eslint/no-require-imports */
// Explicitly synthetic admin demonstration. No email, bank operation, or real consent.
const { randomUUID, createHash } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const NUMBER = 'DEMO-PAYMENT-20260929'
const hash = text => createHash('sha256').update(text).digest('hex')
async function main() {
  const client = connection()
  try {
    await client.connect(); await client.query('BEGIN')
    const existing = await client.query('SELECT id,lead_id,status FROM public.oem_orders WHERE order_number=$1', [NUMBER])
    if (existing.rowCount) { console.log({ demo: NUMBER, ...existing.rows[0], reused: true }); await client.query('ROLLBACK'); return }
    const lead = await client.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status)
      VALUES('35e7d402-0443-4703-94a4-fc2873b8f933','【動作テスト・実取引なし】入金確認','テスト担当','payment-demo@example.invalid','[]'::jsonb,100000,'won') RETURNING id`)
    const result = await client.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
      VALUES($1,1,$2,'accepted',100000,50000,'画面動作の検証専用。実際の発注・同意・請求・入金ではありません。','{"demo":true}'::jsonb,$3,'demo-only','テスト専用・規約同意の証拠ではありません','実取引なし',$4,$5,now()+interval '14 days',now()) RETURNING id`,
      [lead.rows[0].id, NUMBER, hash('demo-quote'), hash('demo-terms'), hash(randomUUID())])
    await client.query(`INSERT INTO public.oem_lead_events(lead_id,event_type,details) VALUES($1,'demo_created','{"demo":true,"note":"手動入金UI検証専用。実取引・法的同意なし。メール送信なし。"}')`, [lead.rows[0].id])
    await client.query('COMMIT')
    console.log({ demo: NUMBER, orderId: result.rows[0].id, leadId: lead.rows[0].id, emailSent: false })
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error({ code: e.code, message: e.message }); process.exitCode = 1 }
  finally { await client.end() }
}
main()
