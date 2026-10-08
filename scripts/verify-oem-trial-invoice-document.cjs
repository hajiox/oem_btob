/* Pure invoice document regression fixture. No DB, mail, or customer mutation. */
'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),src=path.join(root,'src'),oldExt=Module._extensions['.ts'],oldResolve=Module._resolveFilename,oldLoad=Module._load
process.env.OEM_INTAKE_HASH_SECRET='invoice-fixture-secret'
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},fileName:file}).outputText,file)
Module._resolveFilename=function(req,parent,isMain,opts){return oldResolve.call(this,req.startsWith('@/')?path.join(src,req.slice(2)):req,parent,isMain,opts)}
Module._load=function(req,parent,isMain){
 if(req==='server-only')return {}
 if(req==='@/lib/supabase/admin')return {adminClient:{from(){return {select(){return {eq(){return {eq(){return {neq(){return {maybeSingle:async()=>({data:null,error:null})}}}}}}}}}}}}
 if(req==='@/lib/oem-mail-security')return {mailOrigin:()=> 'https://fixture.invalid',uuid(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error('bad uuid');return value.toLowerCase()}}
 return oldLoad.call(this,req,parent,isMain)
}
async function main(){try{
 const lib=require(path.join(root,'src/lib/oem-trial-prepayment-invoices.ts'))
 const id='11111111-1111-4111-8111-111111111111'
 const note='試作で特殊食材の使用の場合は別途お見積りとなります'
 const issuer={name:'Fixture <Issuer>',address:'A&B',email:'fixture@example.invalid',registrationNumber:'T1234567890123',bankName:'Bank',branchName:'Main',accountType:'普通',accountNumber:'123456',accountHolder:'Fixture'}
 const invoice={id,prepayment_id:'22222222-2222-4222-8222-222222222222',lead_id:'33333333-3333-4333-8333-333333333333',invoice_number:'TRIAL-FIXTURE-1',issued_at:'2026-10-08T00:00:00Z',lifecycle_status:'active',snapshot:{version:1,invoiceNumber:'TRIAL-FIXTURE-1',leadId:'33333333-3333-4333-8333-333333333333',companyName:'<Company>',contactName:'A&B',description:'初回試作費（2回までの試作契約）',taxableAmount:5000,taxAmount:500,grossAmount:5500,companyKey:'fixture',issuedDate:'2026-10-08',dueDate:'2026-10-22',issuer,taxRate:10,specialIngredientNote:note,trialOnly:true}}
 const body=await lib.trialPrepaymentInvoiceResponse(invoice).text()
 assert.match(body,/¥5,000/);assert.match(body,/消費税（10%）/);assert.match(body,/¥500/);assert.match(body,/¥5,500/)
 assert.match(body,/初回特典は1企業（個人は1名）につき1回限り/);assert.match(body,/試作2回までを含みます/);assert.match(body,new RegExp(note));assert.match(body,/試作のみで終了でき、/);assert.match(body,/製造発注の義務はありません/);assert.match(body,/製造へ進む場合は試作費を含まない製造請求/)
 assert.match(body,/&lt;Company&gt;/);assert.match(body,/A&amp;B/);assert.match(body,/Fixture &lt;Issuer&gt;/);assert.match(body,/T1234567890123/);assert.match(body,/nonce=/);assert.match(body,/@page/)
 const url=lib.trialPrepaymentInvoiceUrl(id);assert.match(url,/^https:\/\/fixture\.invalid\/btob\/trial-invoice\/11111111-1111-4111-8111-111111111111\.[A-Za-z0-9_-]{43}$/)
 const bad=await lib.getTrialPrepaymentInvoiceForToken(`${id}.${'A'.repeat(43)}`);assert.equal(bad,null,'invalid signature rejected')
 assert.equal((await lib.unavailableTrialPrepaymentInvoice().text()).includes('請求書を表示できません'),true)
 console.log(JSON.stringify({result:'PASS',amounts:{taxable:5000,tax:500,gross:5500},initialOnce:true,specialNote:true,trialOnly:true,htmlEscaping:true,invalidSignature:true,noDb:true,noMail:true}))
}catch(e){console.error(`verify-oem-trial-invoice-document: FAIL ${e.stack||e.message}`);process.exitCode=1}finally{Module._extensions['.ts']=oldExt;Module._resolveFilename=oldResolve;Module._load=oldLoad}}
main()
