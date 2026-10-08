/* Boundary matrix for trial prepayments. --with-migration runs in one transaction and always rolls back. */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')
const PAGE='35e7d402-0443-4703-94a4-fc2873b8f933'
const id=()=>crypto.randomUUID()
const issuer={name:'Fixture issuer',address:'Fixture address',email:'fixture@example.invalid',registrationNumber:'',bankName:'Fixture Bank',branchName:'Main',accountType:'普通',accountNumber:'123456',accountHolder:'Fixture'}
const assertResult=(row,expected,label)=>assert.equal(row?.result,expected,label)
async function main(){
 if(!process.argv.includes('--with-migration')){const sql=fs.readFileSync('sql/026_oem_trial_prepayments.sql','utf8');assert.match(sql,/create_oem_trial_prepayment/);assert.match(sql,/record_oem_trial_prepayment_receipt/);console.log(JSON.stringify({result:'PASS',mode:'static-only',migration:'use --with-migration for rollback fixture'}));return}
 const db=connection(); let stage='connect'; let inserted=0
 try {
  await db.connect(); await db.query('BEGIN')
  if(process.argv.includes('--with-migration')){
   stage='migration'
   const exists=await db.query("select to_regclass('public.oem_trial_prepayments') as name")
   if(!exists.rows[0].name){const sql=fs.readFileSync('sql/026_oem_trial_prepayments.sql','utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');await db.query(sql)}
  }
  const admin=await db.query('select user_id from public.oem_mail_admins limit 1');assert.ok(admin.rowCount,'admin fixture')
  const actor=admin.rows[0].user_id
  const beforeRows=(await db.query("select count(*)::int n from public.oem_trial_prepayments")).rows[0].n
  const newLead=async(name)=>{const r=await db.query("insert into public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes) values($1,$2,'Fixture',$3,'[]',1,'won','rollback boundary') returning id",[PAGE,name,`${id()}@example.invalid`]);inserted++;return r.rows[0].id}
  const lead=await newLead('Boundary One'), lead2=await newLead('Boundary Two'), lead3=await newLead('Boundary Three'), lead4=await newLead('Boundary Four'), lead5=await newLead('Boundary Legacy')
  const call=(name,args)=>db.query(`select * from public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})`,args).then(r=>r.rows[0])
  stage='issuer and plans'
  const company=`boundary-${id()}`; const request=id()
  assertResult(await call('create_oem_trial_prepayment',[lead,actor,company,'Evidence',true,request,{}]),'invalid','missing issuer')
  const first=await call('create_oem_trial_prepayment',[lead,actor,company,'Evidence',true,request,issuer]);assert.equal(first.gross_amount,5500)
  assertResult(await call('create_oem_trial_prepayment',[lead,actor,company,'Evidence',true,request,issuer]),'duplicate','same invoice retry')
  assertResult(await call('create_oem_trial_prepayment',[lead,actor,company,'Evidence',true,request,{...issuer,bankName:'Other'}]),'conflict','issuer mismatch')
  const normalReq=id();const normal=await call('create_oem_trial_prepayment',[lead2,actor,company,'Evidence',false,normalReq,issuer]);assert.equal(normal.gross_amount,11000,'normal 11,000 gross');assertResult(await call('create_oem_trial_prepayment',[lead2,actor,company,'Evidence',false,normalReq,issuer]),'duplicate','normal retry')
  assert.ok(['benefit_conflict','identity_conflict','conflict'].includes((await call('create_oem_trial_prepayment',[lead3,actor,company,'Evidence',true,id(),issuer])).result),'same company initial denied')
  stage='receipts'
  const partialReq=id();assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,partialReq,500,new Date().toISOString().slice(0,10),'Fixture','partial']),'partial','partial receipt')
  assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,partialReq,500,new Date().toISOString().slice(0,10),'Fixture','partial']),'duplicate','receipt retry')
  assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,partialReq,499,new Date().toISOString().slice(0,10),'Fixture','different']),'conflict','receipt payload conflict')
  assertResult(await call('create_oem_trial',[lead,actor,company,'Evidence',true,'blocked','',id()]),'payment_required','partial payment gate')
  assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,id(),500,'2999-01-01','Fixture','future']),'invalid','future paid_on')
  assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,id(),5001,new Date().toISOString().slice(0,10),'Fixture','over']),'overpayment','overpayment')
  assertResult(await call('record_oem_trial_prepayment_receipt',[first.prepayment_id,actor,id(),5000,new Date().toISOString().slice(0,10),'Fixture','balance']),'paid','completed receipt')
  stage='trials and void'
  const t1=await call('create_oem_trial',[lead,actor,company,'Evidence',true,'one','',id()]);assertResult(t1,'created','trial 1')
  const t2=await call('create_oem_trial',[lead,actor,company,'Evidence',true,'two','',id()]);assertResult(t2,'created','trial 2')
  assert.equal((await db.query('select count(*)::int n from public.oem_trial_prepayment_invoices where lead_id=$1',[lead])).rows[0].n,1,'two trials one invoice')
  const voidCompany=`void-${id()}`;const voidReq=id();const unpaid=await call('create_oem_trial_prepayment',[lead4,actor,voidCompany,'VoidEvidence',true,voidReq,issuer]);assertResult(await call('void_oem_trial_prepayment',[unpaid.prepayment_id,actor,'no bank receipt']),'void','unpaid void')
  assert.equal((await db.query('select benefit_lead_id from public.oem_trial_ledgers where company_key=$1',[voidCompany])).rows[0].benefit_lead_id,null,'void releases reservation')
  assertResult(await call('record_oem_trial_prepayment_receipt',[unpaid.prepayment_id,actor,id(),5500,new Date().toISOString().slice(0,10),'Fixture','void']),'state','void receipt blocked')
  const corrected={...issuer,bankName:'Corrected Fixture Bank'};const renewed=await call('create_oem_trial_prepayment',[lead4,actor,voidCompany,'VoidEvidence',true,id(),corrected]);assertResult(renewed,'issued','voided plan reissue');assert.equal(renewed.gross_amount,5500);assertResult(await call('create_oem_trial_prepayment',[lead4,actor,voidCompany,'VoidEvidence',true,voidReq,corrected]),'conflict','old request remains conflict');const history=(await db.query('select count(*)::int n from public.oem_trial_prepayment_invoices where lead_id=$1',[lead4])).rows[0].n;assert.equal(history,2,'void and active invoice history');const statuses=(await db.query("select count(*) filter(where status<>'void')::int active,count(*) filter(where status='void')::int void from public.oem_trial_prepayments where lead_id=$1",[lead4])).rows[0];assert.equal(statuses.active,1);assert.equal(statuses.void,1)
  assertResult(await call('void_oem_trial_prepayment',[first.prepayment_id,actor,'paid']),'state','paid void blocked')
  stage='immutable mutations'
  await db.query('savepoint immutable_receipt');try{await db.query('update public.oem_trial_prepayment_receipts set amount=1');throw Error('receipt update was allowed')}catch(e){assert.match(e.message,/append-only|immutable|trial prepayment receipts/i);await db.query('rollback to immutable_receipt')}
  await db.query('savepoint immutable_invoice');try{await db.query("delete from public.oem_trial_prepayment_invoices");throw Error('invoice delete was allowed')}catch(e){assert.match(e.message,/immutable|trial prepayment invoices/i);await db.query('rollback to immutable_invoice')}
  stage='legacy trial and security'
  const legacyCompany=`legacy-${id()}`, legacyLedger=id(), legacyTrial=id();await db.query("insert into public.oem_trial_ledgers(id,company_key,identity_evidence,confirmed_by) values($1,$2,'legacy',$3)",[legacyLedger,legacyCompany,actor]);await db.query("insert into public.oem_trials(id,ledger_id,lead_id,trial_number,project_number,identity_evidence,fee_advisory,included_claimed,request_id,request_snapshot,created_by,payment_required) values($1,$2,$3,1,1,'legacy',0,false,$4,'{}',$5,false)",[legacyTrial,legacyLedger,lead5,id(),actor]);assertResult(await call('record_oem_trial_result',[legacyTrial,actor,'pass','legacy complete',0]),'saved','legacy result')
  const continued=await call('create_oem_trial',[lead5,actor,legacyCompany,'legacy',false,'legacy continuation','',id()]);assertResult(continued,'created','legacy continuation');assert.equal((await db.query('select payment_required from public.oem_trials where id=$1',[continued.trial_id])).rows[0].payment_required,false,'legacy continuation remains unpaid')
  const legacyPlan=await call('create_oem_trial_prepayment',[lead5,actor,legacyCompany,'legacy',false,id(),issuer]);assertResult(legacyPlan,'legacy_contract','legacy new prepayment rejected')
  assertResult(await call('create_oem_trial',[lead3,actor,`new-${id()}`,'new',false,'new lead no payment','',id()]),'payment_required','new lead gate')
  const priv=await db.query("select has_function_privilege('anon','public.record_oem_trial_prepayment_receipt(uuid,uuid,uuid,integer,date,text,text)','EXECUTE') as allowed");assert.equal(priv.rows[0].allowed,false,'anonymous RPC denied')
  const trg=await db.query("select count(*)::int n from pg_trigger where tgname in ('oem_trial_prepayment_receipts_immutable','oem_trial_prepayment_invoices_immutable')");assert.equal(trg.rows[0].n,2,'immutable triggers')
  const rows=(await db.query('select count(*)::int n from public.oem_trial_prepayments')).rows[0].n
  await db.query('ROLLBACK');let restored=beforeRows;try{restored=(await db.query('select count(*)::int n from public.oem_trial_prepayments')).rows[0].n}catch{};assert.equal(restored,beforeRows,'rollback restored rowcount');console.log(JSON.stringify({result:'PASS',stage:'all-boundaries',fixturePrepayments:rows,syntheticLeads:inserted,rowcountBefore:beforeRows,rowcountAfterRollback:restored,rollback:'confirmed'}))
 } catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(`verify-oem-trial-prepayment-boundaries: FAIL [${stage}] ${e.message}`);process.exitCode=1} finally {await db.end()}
}
main()

