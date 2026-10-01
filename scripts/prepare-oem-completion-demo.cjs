/* eslint-disable @typescript-eslint/no-require-imports */
// Only creates/reuses explicitly synthetic demo cases. No email or real banking.
const {randomUUID,createHash}=require('node:crypto')
const fs=require('node:fs')
const {connection}=require('./oem-db-migrate.cjs')
const PAGE='35e7d402-0443-4703-94a4-fc2873b8f933'
const hash=value=>createHash('sha256').update(value).digest('hex')
const assert=(v,m)=>{if(!v)throw new Error(m)}
async function main(){
 const db=connection()
 try{
  await db.connect();await db.query('BEGIN')
  if(process.argv.includes('--with-migrations')){
   if(process.argv.includes('--commit'))throw new Error('Test migrations cannot be committed by the demo helper')
   for(const file of ['020_oem_fulfillment_hold_alerts.sql','021_oem_trials_approvals.sql','022_oem_invoice_documents.sql','023_oem_portal_reorder.sql'])await db.query(fs.readFileSync(`sql/${file}`,'utf8').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''))
  }
  const actor=(await db.query('SELECT user_id FROM public.oem_mail_admins LIMIT 1')).rows[0]?.user_id
  assert(actor,'OEM admin required')
  const result={}
  for(const key of ['trial','invoice','documents','portal']){
   const marker=`DEMO-COMPLETION-${key.toUpperCase()}-20261001`
   let lead=(await db.query('SELECT id FROM public.leads WHERE page_id=$1 AND notes=$2',[PAGE,marker])).rows[0]
   if(!lead)lead=(await db.query("INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes) VALUES($1,$2,'架空テスト担当',$3,$4,100000,'negotiating',$5) RETURNING id",[PAGE,`OEM追加機能テスト・支払不要（${{trial:'試作承認',invoice:'請求書訂正',documents:'書類',portal:'進捗再注文'}[key]}）`,`${key}-completion@example.invalid`,JSON.stringify([{question:'作りたい商品',answer:'カレー'},{question:'包装',answer:'化粧箱'}]),marker])).rows[0]
   result[key]={leadId:lead.id}
   if(key==='trial')continue
   let order=(await db.query('SELECT id,status FROM public.oem_orders WHERE lead_id=$1 ORDER BY revision DESC LIMIT 1',[lead.id])).rows[0]
   if(!order){
    const quote={demo:true,selectedOptions:[{question:'作りたい商品',answer:'カレー'}]}
    order=(await db.query("INSERT INTO public.oem_orders(lead_id,revision,order_number,status,formal_quote_amount,deposit_amount,final_amount,specification,quote_snapshot,quote_sha256,terms_version,terms_title,terms_body,terms_sha256,access_token_hash,expires_at,accepted_at,created_by) VALUES($1,1,$2,'accepted',100000,50000,NULL,'合成テスト：カレー100個。実契約・支払・発送なし。',$3,$4,'demo','架空規約','動作テストのみ。実際の取引規約同意ではありません。',$5,$6,'2099-01-01',now(),$7) RETURNING id,status",[lead.id,marker,quote,hash(JSON.stringify(quote)),hash('demo'),hash(randomUUID()),actor])).rows[0]
    if(key!=='invoice'){
     const issue=await db.query('SELECT * FROM public.issue_oem_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[order.id,randomUUID(),hash(`invoice-${marker}`),'deposit','2026-10-31','架空テスト：支払不要',94000,6000,0,{name:'テスト発行者（架空）',address:'架空住所',email:'sender@example.invalid',registrationNumber:'',bankName:'架空銀行',branchName:'架空支店',accountType:'普通',accountNumber:'0000000',accountHolder:'架空'},actor])
     assert(issue.rows[0]?.result==='issued',`invoice ${issue.rows[0]?.result}`)
     const plan=(await db.query("SELECT id,expected_amount FROM public.oem_payment_plans WHERE order_id=$1 AND stage='deposit'",[order.id])).rows[0]
     const paid=await db.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,CURRENT_DATE,$4,$5,$6)',[plan.id,randomUUID(),plan.expected_amount,'架空名義','合成テスト。実銀行確認・入金なし。支払不要',actor])
     assert(paid.rows[0]?.result==='accepted',`deposit ${paid.rows[0]?.result}`)
     const saved=await db.query("SELECT * FROM public.update_oem_fulfillment($1,$2,0,'save',$3)",[order.id,actor,{plannedQuantity:100,quantityUnit:'個',productionDueDate:'2026-10-01',shipmentDueDate:'2026-10-01',notes:'合成テスト。実製造・実発送なし。'}]);assert(saved.rows[0]?.result==='saved',`save ${saved.rows[0]?.result}`)
     const start=await db.query("SELECT * FROM public.update_oem_fulfillment($1,$2,$3,'start','{}')",[order.id,actor,saved.rows[0].current_version]);assert(start.rows[0]?.result==='started',`start ${start.rows[0]?.result}`)
     const done=await db.query("SELECT * FROM public.update_oem_fulfillment($1,$2,$3,'complete',$4)",[order.id,actor,start.rows[0].current_version,{completedQuantity:105,completedOn:'2026-10-01',finalAmount:100000}]);assert(done.rows[0]?.result==='completed',`complete ${done.rows[0]?.result}`)
     const finalInvoice=await db.query('SELECT * FROM public.issue_oem_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[order.id,randomUUID(),hash(`balance-${marker}`),'balance','2026-10-31','架空テスト：支払不要',94000,6000,0,{name:'テスト発行者（架空）',address:'架空住所',email:'sender@example.invalid',registrationNumber:'',bankName:'架空銀行',branchName:'架空支店',accountType:'普通',accountNumber:'0000000',accountHolder:'架空'},actor]);assert(finalInvoice.rows[0]?.result==='issued',`balance invoice ${finalInvoice.rows[0]?.result}`)
     const bp=(await db.query("SELECT id,expected_amount FROM public.oem_payment_plans WHERE order_id=$1 AND stage='balance'",[order.id])).rows[0]
     const bpPaid=await db.query('SELECT * FROM public.record_oem_payment_receipt($1,$2,$3,CURRENT_DATE,$4,$5,$6)',[bp.id,randomUUID(),bp.expected_amount,'架空名義','合成テスト。実銀行確認・入金なし。支払不要',actor]);assert(bpPaid.rows[0]?.result==='accepted',`balance ${bpPaid.rows[0]?.result}`)
     const ship=await db.query("SELECT * FROM public.update_oem_fulfillment($1,$2,$3,'ship',$4)",[order.id,actor,done.rows[0].current_version,{shippedOn:'2026-10-01',carrier:'テスト配送（架空・実発送なし）',trackingNumber:'DEMO-NOT-SHIPPED'}]);assert(ship.rows[0]?.result==='shipped',`ship ${ship.rows[0]?.result}`)
    }
   }
   result[key].orderId=order.id
  }
  const ids=Object.values(result).map(r=>r.leadId)
  const outgoing=(await db.query("SELECT count(*)::int n FROM public.oem_conversation_messages WHERE lead_id=ANY($1::uuid[]) AND direction='outbound'",[ids])).rows[0].n
  assert(outgoing===0,'Demo must have no outbound mail')
  await db.query(process.argv.includes('--commit')?'COMMIT':'ROLLBACK')
  console.log(JSON.stringify({result,committed:process.argv.includes('--commit'),outbound:outgoing}))
 }catch(e){await db.query('ROLLBACK').catch(()=>{});console.error('Completion demo failed',{code:e.code,message:e.message});process.exitCode=1}finally{await db.end()}
}
main()
