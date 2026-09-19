const fs = require('node:fs')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
async function main() {
 const db=connection()
 try {
  await db.connect(); await db.query('BEGIN')
  const exists=await db.query("select to_regclass('public.oem_mail_deliveries') as name")
  if(!exists.rows[0].name) for(const file of ['008_oem_mail.sql','009_oem_intake.sql','010_oem_cases.sql','011_oem_intake_enforcement.sql']) await db.query(fs.readFileSync(`sql/${file}`,'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''))
  await db.query("select set_config('request.jwt.claim.role','service_role',true)")
  const key=randomUUID(), hash=randomUUID()
  const lead={page_id:PAGE,company_name:'TEST rollback only',contact_name:'Test',email:'test@example.invalid',selected_options:[],estimated_total_price:146000,notes:'transaction rollback'}
  const mail={customer:{from:'test@example.invalid',to:'test@example.invalid',subject:'test',html:'test'},admin:{from:'test@example.invalid',to:'test@example.invalid',subject:'test',html:'test'}}
  const reserve=async(k=key,h=hash,m=mail)=> (await db.query('select * from public.reserve_oem_lead($1,$2,$3,$4,$5,$6,3600,2)',[k,h,hash,hash,lead,m])).rows[0]
  const first=await reserve(); assert.equal(first.status,'reserved'); const id=first.lead_id
  assert.equal((await reserve()).status,'duplicate')
  assert.equal((await reserve(key,'different')).reason,'idempotency_payload_mismatch')
  assert.equal((await reserve(randomUUID(),hash,{})).reason,'invalid_request')
  assert.equal((await reserve(randomUUID())).status,'reserved')
  assert.equal((await reserve(randomUUID())).reason,'rate_limited')
  assert.equal((await db.query('select count(*)::int n from public.oem_mail_deliveries where lead_id=$1',[id])).rows[0].n,2)
  const mailId=(await db.query('select id from public.oem_mail_deliveries where lead_id=$1 limit 1',[id])).rows[0].id
  const claimed=(await db.query('select * from public.claim_oem_mail($1)',[mailId])).rows[0]; assert.equal(claimed.status,'sending')
  assert.equal((await db.query('select * from public.claim_oem_mail($1)',[mailId])).rowCount,0)
  await db.query("update public.oem_mail_deliveries set status='unknown' where id=$1",[mailId])
  assert.equal((await db.query('select * from public.claim_oem_mail($1)',[mailId])).rows[0].attempt_key,claimed.attempt_key)
  await db.query("update public.oem_mail_deliveries set status='unknown',first_attempt_at=now()-interval '25 hours' where id=$1",[mailId])
  assert.equal((await db.query('select * from public.claim_oem_mail($1)',[mailId])).rowCount,0)
  assert.equal((await db.query('select error_code from public.oem_mail_deliveries where id=$1',[mailId])).rows[0].error_code,'manual_check_required')
  await db.query('insert into public.oem_lead_cases(lead_id,final_spec_revision,customer_approval_evidence,customer_approval_at) values($1,$2,$3,now())',[id,'spec v1','test approval evidence'])
  await db.query('update public.oem_lead_cases set final_spec_revision=$2 where lead_id=$1',[id,'spec v2'])
  const changed=(await db.query('select * from public.oem_lead_cases where lead_id=$1',[id])).rows[0]
  assert.equal(changed.customer_approval_at,null)
  const ev=(await db.query("select details from public.oem_lead_events where lead_id=$1 and event_type='case_updated'",[id])).rows[0].details
  assert.equal(ev.final_spec_revision.before,'spec v1');assert.equal(ev.final_spec_revision.after,'spec v2')
  await db.query("update public.leads set status='contacted' where id=$1",[id])
  assert.equal((await db.query("select count(*)::int n from public.oem_lead_events where lead_id=$1 and event_type='status_changed'",[id])).rows[0].n,1)
  async function denied(sql,args=[]) { await db.query('SAVEPOINT denied'); try { await db.query(sql,args); throw new Error('Expected permission/constraint rejection') } catch(e) { assert.ok(['42501','23514'].includes(e.code),e.message) } finally { await db.query('ROLLBACK TO SAVEPOINT denied') } }
  await denied('update public.oem_lead_cases set customer_approval_at=now() where lead_id=$1',[id])
  const admin=(await db.query('select id from auth.users limit 1')).rows[0]
  assert.ok(admin,'Existing administrator required for RLS verification')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin.id])
  await db.query("select set_config('request.jwt.claim.role','authenticated',true)");await db.query('SET LOCAL ROLE authenticated')
  assert.equal((await db.query('select * from public.oem_lead_cases where lead_id=$1',[id])).rowCount,1)
  assert.equal((await db.query("update public.oem_lead_cases set internal_notes='stale' where lead_id=$1 and updated_at='2000-01-01' returning lead_id",[id])).rowCount,0)
  await denied('select * from public.oem_mail_deliveries')
  await db.query('RESET ROLE')
  await db.query("insert into public.leads(page_id,company_name,contact_name,email,estimated_total_price) select $1,$2,'Test','test@example.invalid',100 from generate_series(1,1005)",[PAGE,hash])
  await db.query('SET LOCAL ROLE authenticated')
  const stats=(await db.query('select * from public.oem_lead_stats($1,NULL,$2)',[PAGE,hash])).rows[0]
  assert.equal(Number(stats.total),1005);assert.equal(Number(stats.total_estimate),100500)
  await db.query('RESET ROLE');await db.query("select set_config('request.jwt.claim.sub','',true)")
  await db.query("select set_config('request.jwt.claim.role','anon',true)"); await db.query('SET LOCAL ROLE anon')
  await denied('select * from public.claim_oem_mail($1)',[mailId])
  await denied('select * from public.oem_lead_cases')
  await denied("insert into public.leads(page_id,company_name,contact_name,email) values($1,'test','test','test@example.invalid')",[PAGE])
  // Existing non-OEM insert policy remains compatible; transaction is rolled back.
  await db.query("insert into public.leads(page_id,company_name,contact_name,email) values(NULL,'test','test','test@example.invalid')")
  await db.query('RESET ROLE');await db.query("select set_config('request.jwt.claim.role','service_role',true)")
  await db.query('delete from public.leads where id=$1',[id]);assert.equal((await reserve()).reason,'invalid_request')
  await db.query('ROLLBACK'); console.log('OEM DB checks PASS: atomic queue, duplicate, rate, claims, uncertain retry, audit snapshots, approval invalidation, RLS, legacy compatibility. All test data rolled back; no email sent.')
 } catch(e) { await db.query('ROLLBACK').catch(()=>{}); console.error({code:e.code,message:e.message}); process.exitCode=1 } finally {await db.end()}
}
main()
