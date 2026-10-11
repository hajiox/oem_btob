// Additive schema and synthetic intake checks in one rollback. No workers or email dispatch.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE='35e7d402-0443-4703-94a4-fc2873b8f933'
;(async()=>{
  const db=connection()
  try {
    await db.connect();await db.query('BEGIN')
    const installed=(await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='intake_kind'")).rowCount
    if(!installed)await db.query(fs.readFileSync('sql/029_oem_direct_consultation.sql','utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''))
    await db.query("select set_config('request.jwt.claim.role','service_role',true)")
    const key=randomUUID(),hash=randomUUID()
    const lead={page_id:PAGE,company_name:'合成相談テスト・ROLLBACK',contact_name:'テスト',email:'rollback@example.invalid',phone:null,notes:null,selected_options:[{question:'商品',answer:'商品未定'},{question:'受付区分',answer:'相談のみ・見積未算定'},{question:'相談テーマ',answer:'使いたい食材'}],intake_kind:'consultation',consultation_theme:'ingredients',estimated_total_price:null}
    const mail={customer:{subject:'合成相談受付',html:'offline'},admin:{subject:'合成相談通知',html:'offline'}}
    const reserve=async(p=lead,k=key,h=hash,limit=5)=>(await db.query('select * from public.reserve_oem_lead($1,$2,$3,$4,$5,$6,3600,$7)',[k,h,hash,hash,p,mail,limit])).rows[0]
    const first=await reserve();assert.equal(first.status,'reserved')
    const saved=(await db.query('select intake_kind,consultation_theme,estimated_total_price,status from public.leads where id=$1',[first.lead_id])).rows[0]
    assert.deepEqual(saved,{intake_kind:'consultation',consultation_theme:'ingredients',estimated_total_price:null,status:'new'})
    const payload=(await db.query('select payload from public.oem_tsg_notifications where lead_id=$1',[first.lead_id])).rows[0].payload
    assert.equal(payload.schemaVersion,2);assert.equal(payload.estimatedTotalPrice,null);assert.equal(payload.quantityLabel,'未定（相談のみ）');assert.equal(Object.keys(payload).length,9)
    assert.equal((await db.query('select * from public.claim_oem_tsg_notification($1)',[first.lead_id])).rowCount,0,'old/default worker must hold v2')
    const v2Claim=(await db.query('select * from public.claim_oem_tsg_notification_batch($1,true)',[first.lead_id])).rows[0]
    assert.equal(v2Claim.payload.schemaVersion,2);assert.equal(v2Claim.attempts,1)
    assert.equal((await reserve()).status,'duplicate');assert.equal((await reserve(lead,key,randomUUID())).reason,'idempotency_payload_mismatch')
    const counts=(await db.query('select (select count(*)::int from public.oem_mail_deliveries where lead_id=$1) mails,(select count(*)::int from public.oem_orders where lead_id=$1) orders,(select count(*)::int from public.oem_trials where lead_id=$1) trials,(select count(*)::int from public.oem_invoices where lead_id=$1) invoices,(select count(*)::int from public.oem_trial_prepayments where lead_id=$1) trial_payments',[first.lead_id])).rows[0]
    assert.deepEqual(counts,{mails:2,orders:0,trials:0,invoices:0,trial_payments:0})
    for(const invalid of [{...lead,estimated_total_price:0},{...lead,consultation_theme:null},{...lead,consultation_theme:'unknown'},{...lead,page_id:randomUUID()},{...lead,intake_kind:'unknown'}])assert.equal((await reserve(invalid,randomUUID())).reason,'invalid_request')
    assert.equal((await reserve(lead,randomUUID(),randomUUID(),1)).reason,'rate_limited')
    const quote={...lead,intake_kind:'quote',consultation_theme:null,estimated_total_price:146000}
    const quoted=await reserve(quote,randomUUID(),randomUUID(),50);assert.equal(quoted.status,'reserved')
    const old=(await db.query('select l.estimated_total_price,n.payload from public.leads l join public.oem_tsg_notifications n on n.lead_id=l.id where l.id=$1',[quoted.lead_id])).rows[0]
    assert.equal(old.estimated_total_price,146000);assert.equal(old.payload.schemaVersion,1);assert.equal(old.payload.estimatedTotalPrice,146000)
    for(const role of ['anon','authenticated']){
      for(const signature of ['public.reserve_oem_lead(uuid,text,text,text,jsonb,jsonb,integer,integer)','public.claim_oem_tsg_notification_batch(uuid,boolean)']){
        const has=(await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed
        assert.equal(has,false)
      }
    }
    await db.query('SAVEPOINT null_guard')
    try{await assert.rejects(()=>db.query('update public.leads set estimated_total_price=0 where id=$1',[first.lead_id]),e=>e.code==='23514')}finally{await db.query('ROLLBACK TO SAVEPOINT null_guard')}
    await db.query('ROLLBACK')
    console.log('Consultation DB checks PASS: additive migration, null estimate, theme, atomic mail/outbox, duplicate/conflict/rate limit, quote v1 compatibility, role denial, no trial/order/invoice; all rolled back.')
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Consultation DB checks FAIL',error);process.exitCode=1}finally{await db.end()}
})()
