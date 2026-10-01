/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic fixtures only, always rolled back. No email or banking.
const fs = require('node:fs')
const { randomUUID, createHash } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const hash = text => createHash('sha256').update(text).digest('hex')
const check = (value, message) => { if (!value) throw new Error(message) }
async function main() {
 const db = connection()
 try {
  await db.connect(); await db.query('BEGIN')
  if (process.argv.includes('--with-migration')) await db.query(fs.readFileSync('sql/020_oem_fulfillment_hold_alerts.sql','utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''))
  const actor = (await db.query('SELECT user_id FROM public.oem_mail_admins LIMIT 1')).rows[0]?.user_id
  check(actor, 'OEM admin required')
  const lead = (await db.query("INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes) VALUES('35e7d402-0443-4703-94a4-fc2873b8f933','出荷保留テスト・支払不要','テスト','hold@example.invalid','[]',100000,'won','合成・実取引なし') RETURNING id")).rows[0].id
  const order = (await db.query("INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at) VALUES($1,1,$2,'paid',100000,50000,100000,'合成','{}',$3,'test','test','test',$3,$4,'2099-01-01',now()) RETURNING id",[lead,`VERIFY-HOLD-${randomUUID()}`,hash('test'),hash(randomUUID())])).rows[0].id
  await db.query("INSERT INTO public.oem_order_fulfillment(order_id,planned_quantity,completed_quantity,quantity_unit,shipment_due_date,completed_on) VALUES($1,100,100,'個','2099-01-01',CURRENT_DATE)",[order])
  const alerts = async () => (await db.query('SELECT * FROM public.get_oem_fulfillment_alerts(50,0)')).rows.find(r=>r.order_id===order)
  check((await alerts())?.kind==='ready_to_ship','paid order should be ready before settlement')
  const sid = (await db.query("INSERT INTO public.oem_settlements(order_id,revision,kind,material_stage,taxable8,taxable10,non_taxable,reason,agreement_note,created_by) VALUES($1,1,'adjustment','not_applicable',0,0,100000,'合成','合成',$2) RETURNING id",[order,actor])).rows[0].id
  check((await alerts())?.kind==='settlement_hold','active settlement must take precedence over ready-to-ship')
  await db.query('SAVEPOINT reject_ship')
  let rejected=false
  try { await db.query("UPDATE public.oem_order_fulfillment SET carrier='合成' WHERE order_id=$1",[order]) } catch { rejected=true }
  await db.query('ROLLBACK TO SAVEPOINT reject_ship')
  check(rejected,'existing DB gate must still stop shipment')
  await db.query("UPDATE public.oem_settlements SET state='void',void_reason='合成取下げ',version=version+1 WHERE id=$1",[sid])
  check((await alerts())?.kind==='ready_to_ship','void settlement restores ready classification')
  const grants=(await db.query("SELECT has_function_privilege('anon','public.get_oem_fulfillment_alerts(integer,integer)','EXECUTE') anon,has_function_privilege('authenticated','public.get_oem_fulfillment_alerts(integer,integer)','EXECUTE') auth")).rows[0]
  check(!grants.anon&&!grants.auth,'alerts must remain service-only')
  await db.query('ROLLBACK'); console.log('OEM hold alerts: PASS (ready → hold → ready, DB shipment gate, service-only; ROLLBACK)')
 } catch(error) { await db.query('ROLLBACK').catch(()=>{}); console.error('OEM hold alerts failed',{code:error.code,message:error.message}); process.exitCode=1 }
 finally { await db.end() }
}
main()
