'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, mailOrigin, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { evidenceHash } from '@/lib/oem-orders'
import { approvalTokenHash, tokenPair, validateApprovalContent, validateApprovalKind, type ApprovalAction, type ApprovalKind } from '@/lib/oem-approvals'
const fail = (error: unknown, fallback: string) => ({ success:false, error:error instanceof MailError ? error.message : fallback })
type ApprovalResult={success:boolean;error?:string;message?:string;url?:string;duplicate?:boolean;approvalId?:string;status?:'approved'|'changes_requested'}

export async function issueOemApproval(leadId:string,input:{kind:ApprovalKind;content:unknown;orderId?:string;expiresAt:string;requestId:string}):Promise<ApprovalResult> {
 try {
  const user=await requireMailAdmin(), lead=await requireOemMailLead(leadId)
  const kind=validateApprovalKind(input?.kind), content=validateApprovalContent(input?.content), request=uuid(input?.requestId)
  const expiry=Date.parse(input?.expiresAt), orderId=input?.orderId?uuid(input.orderId):null
  if(!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+90*86400000) throw new MailError('承認リンクの期限を確認してください。')
  const pair=tokenPair()
  const {data,error}=await adminClient.rpc('issue_oem_approval',{p_lead_id:lead.id,p_order_id:orderId,p_actor:user.id,p_kind:kind,p_name:content.name,p_version:content.version,p_body:content.body,p_content_hash:content.hash,p_token_hash:pair.hash,p_expires_at:new Date(expiry).toISOString(),p_request_id:request})
  if(error)throw error
  const row=Array.isArray(data)?data[0]:data
  if(!['issued','duplicate'].includes(row?.result)) throw new MailError(row?.result==='conflict'?'同じ発行IDで異なる内容が指定されています。':'発行対象・期限・内容を確認してください。製造開始後や取消済みの発注には発行できません。')
  revalidatePath('/admin/dashboard')
  return {success:true,duplicate:row.result==='duplicate',approvalId:row.approval_id,...(row.result==='issued'?{url:`${mailOrigin()}/btob/approval/${pair.token}`} : {}),message:row.result==='duplicate'?'同じリクエストは保存済みです。URLは再表示できません。必要なら新しい版を発行してください。':'承認リンクを保存しました。メールは送信していません。'}
 }catch(error){return fail(error,'承認リンクの発行結果を確認できませんでした。履歴を更新してください。')}
}
export async function getOemApprovals(leadId:string):Promise<{success:boolean;error?:string;approvals:unknown[]}> {
 try {
  await requireMailAdmin();const lead=await requireOemMailLead(leadId)
  const rows=[];let offset=0
  while(true){const {data,error}=await adminClient.from('oem_approvals').select('id,kind,name,version,content_hash,status,expires_at,order_id,issued_at,acted_at,request_changes_note,signer_name,superseded_by').eq('lead_id',lead.id).order('issued_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)break;offset+=500}
  return {success:true,approvals:rows}
 }catch(error){return {...fail(error,'承認情報を取得できませんでした。'),approvals:[]}}
}
export async function getOemManufacturingApprovalGate(orderId:string) {
 try {
  await requireMailAdmin();const id=uuid(orderId)
  const order=await adminClient.from('oem_orders').select('lead_id').eq('id',id).maybeSingle()
  if(order.error||!order.data)throw new MailError('正式発注が見つかりません。')
  await requireOemMailLead(order.data.lead_id)
  const {data,error}=await adminClient.rpc('oem_order_manufacturing_gate',{p_order_id:id});if(error)throw error
  return {success:true,ready:data===true,blocked:data!==true}
 }catch{return {success:false,ready:false,blocked:true,error:'顧客承認状態を確認できませんでした。'}}
}
export async function actOemApproval(token:string,action:ApprovalAction,note='',signerName='',contentHash='',actionRequestId=''):Promise<ApprovalResult> {
 try {
  if(!['approve','request_changes'].includes(action)||typeof note!=='string'||note.length>2000||typeof signerName!=='string'||!signerName.trim()||signerName.trim().length>200||! /^[0-9a-f]{64}$/.test(contentHash)||(action==='request_changes'&&!note.trim()))throw new MailError('署名者名・コメント・操作内容を確認してください。')
  const request=uuid(actionRequestId), h=await headers()
  const ip=h.get('x-forwarded-for')?.split(',')[0]?.trim()||h.get('x-real-ip')||'unknown',ua=h.get('user-agent')||'unknown'
  const {data,error}=await adminClient.rpc('act_oem_approval',{p_token_hash:approvalTokenHash(token),p_action:action,p_note:note.trim(),p_ip:evidenceHash(ip),p_user_agent:evidenceHash(ua),p_signer_name:signerName.trim(),p_action_request_id:request,p_content_hash:contentHash})
  if(error)throw error
  const row=Array.isArray(data)?data[0]:data
  if(!['approved','changes_requested','duplicate'].includes(row?.result)||!['approved','changes_requested'].includes(row?.status))throw new MailError(({expired:'承認リンクの期限が切れています。',changed:'旧版または失効したリンクです。担当者に最新のリンクをご依頼ください。',conflict:'すでに別の回答が記録されています。担当者へご確認ください。'} as Record<string,string>)[row?.result]||'承認内容・発注状態を確認できませんでした。')
  revalidatePath('/admin/dashboard');return {success:true,status:row.status as 'approved'|'changes_requested',duplicate:row.result==='duplicate'}
 }catch(error){return fail(error,'回答の保存結果を確認できませんでした。同じ内容で再確認してください。')}
}
export async function revokeOemApproval(leadId:string,approvalId:string,reason:string):Promise<ApprovalResult> {
 try {
  const user=await requireMailAdmin(),lead=await requireOemMailLead(leadId),id=uuid(approvalId)
  if(typeof reason!=='string'||!reason.trim()||reason.trim().length>1000)throw new MailError('失効理由を入力してください。')
  const scoped=await adminClient.from('oem_approvals').select('id').eq('id',id).eq('lead_id',lead.id).maybeSingle();if(scoped.error||!scoped.data)throw new MailError('承認リンクが見つかりません。')
  const {data,error}=await adminClient.rpc('revoke_oem_approval',{p_approval_id:id,p_actor:user.id,p_reason:reason.trim()});if(error)throw error
  const row=Array.isArray(data)?data[0]:data;if(!['revoked','duplicate'].includes(row?.result))throw new MailError('この承認はすでに回答済み、または失効しています。')
  revalidatePath('/admin/dashboard');return {success:true,message:'未回答リンクを失効しました。'}
 }catch(error){return fail(error,'失効結果を確認できませんでした。履歴を更新してください。')}
}
