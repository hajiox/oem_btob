/* eslint-disable @typescript-eslint/no-require-imports */
// User-authorized synthetic invoice demo; no real agreement, invoice debt, or bank entry.
const { randomUUID, createHash } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const NUMBER = 'DEMO-INVOICE-20260929'
const hash = text => createHash('sha256').update(text).digest('hex')
async function main() {
  const db = connection()
  try {
    await db.connect(); await db.query('BEGIN')
    const existing = await db.query('SELECT id,lead_id,status FROM public.oem_orders WHERE order_number=$1', [NUMBER])
    if (existing.rowCount) { console.log({ demo: NUMBER, ...existing.rows[0], reused: true }); await db.query('ROLLBACK'); return }
    const lead = await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status)
      VALUES('35e7d402-0443-4703-94a4-fc2873b8f933','【動作テスト・支払不要】請求書確認','テスト担当','ts@ai.aizu-tv.com','[]'::jsonb,106000,'won') RETURNING id`)
    const result = await db.query(`INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at)
      VALUES($1,1,$2,'accepted',106000,53000,'請求書の検証専用。食品100,000円＋送料等6,000円（いずれも税別の架空明細）。実際の発注・同意・請求・入金ではありません。','{"demo":true}'::jsonb,$3,'demo-only','テスト専用・規約同意の証拠ではありません','実取引なし',$4,$5,now()+interval '14 days',now()) RETURNING id`,
      [lead.rows[0].id, NUMBER, hash('invoice-demo-quote'), hash('demo-terms'), hash(randomUUID())])
    await db.query(`INSERT INTO public.oem_lead_events(lead_id,event_type,details) VALUES($1,'demo_created','{"demo":true,"note":"請求書検証。ts@ai.aizu-tv.comへテスト案内1通送信をユーザー承認済み。実際の支払不要。"}')`, [lead.rows[0].id])
    await db.query('COMMIT')
    console.log({ demo: NUMBER, orderId: result.rows[0].id, leadId: lead.rows[0].id, emailSent: false })
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); console.error({ code: error.code, message: error.message }); process.exitCode = 1 }
  finally { await db.end() }
}
main()
