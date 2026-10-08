'use server'
import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { trialPrepaymentInvoiceUrl } from '@/lib/oem-trial-prepayment-invoices'
import { normalizeCompanyKey, validateIdentityEvidence } from '@/lib/oem-trials'
import type { TrialPrepayment, TrialPrepaymentInvoice, TrialPrepaymentIssuer } from '@/lib/oem-trial-payments-shared'
const fail=(e:unknown,fallback:string)=>({success:false,error:e instanceof MailError?e.message:fallback})
function validIssuer(value:unknown): value is TrialPrepaymentIssuer { if(!value||typeof value!=='object')return false; const v=value as Record<string,unknown>; const keys=['name','address','email','bankName','branchName','accountType','accountNumber','accountHolder']; if(keys.some(k=>typeof v[k]!=='string'||!(v[k] as string).trim()))return false; if(typeof v.email!=='string'||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)===false)return false; if(typeof v.accountNumber!=='string'||!/^[0-9]{1,30}$/.test(v.accountNumber))return false; if(typeof v.registrationNumber!=='string'||(v.registrationNumber&& !/^T[0-9]{13}$/.test(v.registrationNumber)))return false; return keys.every(k=>(v[k] as string).length<=500) }
function dateValue(value: unknown) { if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null; const parsed=new Date(`${value}T00:00:00.000Z`); return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:null }
export async function getOemTrialPrepayment(leadId:string) {
 try { await requireMailAdmin(); const lead=await requireOemMailLead(leadId)
  const {data,error}=await adminClient.from('oem_trial_prepayments').select('id,lead_id,company_key,identity_evidence,claim_included,taxable_amount,tax_amount,gross_amount,status,created_at,paid_at').eq('lead_id',lead.id).neq('status','void').maybeSingle(); if(error)throw error
  const prepayment=data as TrialPrepayment|null
  const [{data:invoices,error:invoiceError},{data:receipts,error:receiptError}]=await Promise.all([
   adminClient.from('oem_trial_prepayment_invoices').select('id,prepayment_id,lead_id,invoice_number,snapshot,issued_at,lifecycle_status,oem_trial_prepayments!inner(status)').eq('lead_id',lead.id).neq('oem_trial_prepayments.status','void').order('issued_at',{ascending:false}),
   prepayment ? adminClient.from('oem_trial_prepayment_receipts').select('id,prepayment_id,request_id,amount,paid_on,payer_name,note,confirmed_by,created_at').eq('prepayment_id',prepayment.id).order('created_at',{ascending:true}) : Promise.resolve({data:[],error:null}),
  ]); if(invoiceError)throw invoiceError;if(receiptError)throw receiptError
  return {success:true,prepayment,invoices:(invoices||[]).map(invoice=>({...invoice,invoiceUrl:trialPrepaymentInvoiceUrl(invoice.id)})) as (TrialPrepaymentInvoice & {invoiceUrl:string})[],receipts:receipts||[]}
 } catch(e){return {...fail(e,'試作前払い情報を取得できませんでした。'),prepayment:null,invoices:[],receipts:[]}}
}
export async function createOemTrialPrepayment(leadId:string,input:{companyKey:string;identityEvidence:string;claimIncluded:boolean;requestId:string;issuer:TrialPrepaymentIssuer}) {
 let attempted=false
 try { const user=await requireMailAdmin();const lead=await requireOemMailLead(leadId);const issuer=input?.issuer; const companyKey=normalizeCompanyKey(input?.companyKey);const evidence=validateIdentityEvidence(input?.identityEvidence); if(!uuid(input?.requestId)||typeof input?.claimIncluded!=='boolean'||!validIssuer(issuer))return {success:false,error:'試作前払いの入力内容を確認してください。'}
  attempted=true;const {data,error}=await adminClient.rpc('create_oem_trial_prepayment',{p_lead_id:lead.id,p_actor:user.id,p_company_key:companyKey,p_identity_evidence:evidence,p_claim_included:input.claimIncluded,p_request_id:uuid(input.requestId),p_issuer:issuer});if(error)throw error;const row=Array.isArray(data)?data[0]:data;const messages:Record<string,string>={legacy_contract:'既存の試作契約へ新料金は遡及しません。新規契約は別案件で登録してください。',identity_conflict:'企業キーの確認根拠が既存の初回特典台帳と一致しません。',benefit_conflict:'この企業の初回特典は別の案件に適用済みです。',conflict:'既存の試作前払い条件と異なる内容です。',forbidden:'試作前払いを作成できません。'};if(!['issued','duplicate'].includes(row?.result))return {success:false,error:messages[row?.result]||'試作前払いを作成できませんでした。'};revalidatePath('/admin/dashboard');return {success:true,duplicate:row.result==='duplicate',prepaymentId:row.prepayment_id as string,invoiceId:row.invoice_id as string,taxableAmount:Number(row.taxable_amount),taxAmount:Number(row.tax_amount),grossAmount:Number(row.gross_amount)}
 }catch(e){return {...fail(e,'試作前払いを作成できませんでした。'),uncertain:attempted}}
}
export async function recordOemTrialPrepaymentReceipt(prepaymentId:string,input:{requestId:string;amount:number;paidOn:string;payerName:string;note?:string}) {
 let attempted=false
 try {const user=await requireMailAdmin();const id=uuid(prepaymentId);const requestId=uuid(input?.requestId);const amount=input?.amount;const paidOn=dateValue(input?.paidOn); const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());const payer=typeof input?.payerName==='string'?input.payerName.trim():'';const note=typeof input?.note==='string'?input.note.trim():'';if(!paidOn||paidOn>today||!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!payer||payer.length>300||note.length>2000)return {success:false,error:'入金記録の入力内容を確認してください。'};attempted=true;const {data,error}=await adminClient.rpc('record_oem_trial_prepayment_receipt',{p_prepayment_id:id,p_actor:user.id,p_request_id:requestId,p_amount:amount,p_paid_on:paidOn,p_payer_name:payer,p_note:note||null});if(error)throw error;const row=Array.isArray(data)?data[0]:data;const messages:Record<string,string>={overpayment:'過入金は記録できません。',state:'無効な前払いです。',not_found:'試作前払いが見つかりません。',conflict:'同じ送信IDが別内容で使用されています。'};if(!['paid','partial','duplicate'].includes(row?.result))return {success:false,error:messages[row?.result]||'入金記録を保存できませんでした。'};revalidatePath('/admin/dashboard');return {success:true,status:row.result,receivedAmount:Number(row.received_amount),expectedAmount:Number(row.expected_amount)}
 }catch(e){return {...fail(e,'入金記録を保存できませんでした。'),uncertain:attempted}}
}



export async function voidOemTrialPrepayment(prepaymentId:string,reason:string){try{const user=await requireMailAdmin();const {data,error}=await adminClient.rpc('void_oem_trial_prepayment',{p_prepayment_id:uuid(prepaymentId),p_actor:user.id,p_reason:typeof reason==='string'?reason.trim():''});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(row?.result!=='void')return {success:false,error:'未入金の試作前払いだけ無効化できます。'};revalidatePath('/admin/dashboard');return {success:true}}catch(e){return fail(e,'試作前払いを無効化できませんでした。')}}
