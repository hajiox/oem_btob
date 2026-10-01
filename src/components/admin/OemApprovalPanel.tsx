'use client'

import { useCallback,useEffect,useState } from 'react'
import { getOemApprovals,issueOemApproval,getOemManufacturingApprovalGate,revokeOemApproval } from '@/actions/oemApprovals'
type State={ready:boolean;blocked:boolean}
type ApprovalRow={id:string;kind:string;name:string;version:string;status:string;order_id:string|null;acted_at:string|null;expires_at:string;request_changes_note:string|null;signer_name?:string|null;superseded_by?:string|null}
const kinds={trial:'試作',label:'ラベル',specification:'最終仕様'} as const
const statuses:Record<string,string>={pending:'確認待ち',approved:'承認済み',changes_requested:'修正依頼',expired:'期限切れ',rejected:'失効・旧版'}
export function OemApprovalPanel({leadId,orderId,onState}:{leadId:string;orderId?:string;onState?:(state:State)=>void}){
 const [rows,setRows]=useState<ApprovalRow[]>([]),[kind,setKind]=useState<keyof typeof kinds>('specification'),[name,setName]=useState(''),[version,setVersion]=useState('1'),[body,setBody]=useState(''),[message,setMessage]=useState(''),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false)
 const [request,setRequest]=useState<{id:string;input:string;expiresAt:string}|null>(null)
 const load=useCallback(async()=>{try{const r=await getOemApprovals(leadId);if(!r.success){setReady(false);onState?.({ready:false,blocked:true});setMessage(r.error||'承認情報を取得できませんでした');return}setRows(r.approvals as ApprovalRow[]);setReady(true);if(orderId){const g=await getOemManufacturingApprovalGate(orderId);onState?.({ready:g.success,blocked:g.blocked})}else onState?.({ready:true,blocked:false})}catch{setReady(false);onState?.({ready:false,blocked:true});setMessage('承認情報を取得できませんでした')}},[leadId,orderId,onState])
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('focus',refresh);const timer=window.setInterval(refresh,60000);return()=>{window.removeEventListener('focus',refresh);window.clearInterval(timer)}},[load])
 const issue=async()=>{if(busy||!ready)return;const inputKey=JSON.stringify({kind,name,version,body,orderId});const req=request?.input===inputKey?request:{id:crypto.randomUUID(),input:inputKey,expiresAt:new Date(Date.now()+7*86400000).toISOString()};setRequest(req);setBusy(true);setMessage('');try{const r=await issueOemApproval(leadId,{kind,content:{name,version,body},orderId,expiresAt:req.expiresAt,requestId:req.id});setMessage(('error'in r?r.error:'')||('message'in r?r.message:'')||'');if(r.success){if('url'in r&&r.url)setUrl(r.url);setRequest(null);await load()}}catch{setMessage('発行結果を確認できませんでした。同じ内容で確認してください。リンクを重ねて発行しないでください。')}finally{setBusy(false)}}
 return <section aria-label="顧客承認管理" style={{marginTop:16}}>
  <p style={muted}>お客様に見せる内容だけを固定保存します。仕様・料金を変更する手続きや、正式発注の規約同意とは別です。最新の確認対象が承認されるまで製造開始を保留します。新しい版を発行すると同じ対象の旧リンクは失効します。</p>
  <label>承認対象<select value={kind} onChange={e=>setKind(e.target.value as keyof typeof kinds)} style={input}>{Object.entries(kinds).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
  <label>内容名<input value={name} onChange={e=>setName(e.target.value)} maxLength={200} style={input}/></label>
  <label>版<input value={version} onChange={e=>setVersion(e.target.value)} maxLength={100} style={input}/></label>
  <label>お客様が確認する固定内容<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={20000} style={{...input,minHeight:130}}/></label>
  <button type="button" disabled={busy||!ready||!name.trim()||!version.trim()||!body.trim()} onClick={()=>void issue()} style={button}>{busy?'処理中…':'承認リンクを発行（メール送信なし）'}</button>
  <button type="button" disabled={busy} onClick={()=>void load()} style={{...button,marginLeft:8}}>承認状況を更新</button>
  {url&&<p style={{...muted,overflowWrap:'anywhere'}}>今回のURL（再表示不可）：<a href={url} target="_blank" rel="noreferrer" style={{color:'var(--admin-accent)'}}>{url}</a><br/>案件メールに貼り付け、内容と宛先を確認してから送信してください。</p>}
  {rows.map(row=><div key={row.id} style={{marginTop:12,padding:12,border:'1px solid var(--admin-border)',borderRadius:6}}><strong>{kinds[row.kind as keyof typeof kinds]||row.kind}：{row.name}（{row.version}）</strong><p style={muted}>{row.superseded_by?'旧版（新しい確認対象あり）':statuses[row.status]||row.status} ／ 確認期限：{new Date(row.expires_at).toLocaleDateString('ja-JP')}{row.acted_at?` ／ 回答：${new Date(row.acted_at).toLocaleString('ja-JP')}`:''}{row.signer_name?` ／ ${row.signer_name} 様`:''}</p>{row.request_changes_note&&<p style={{...muted,whiteSpace:'pre-wrap'}}>回答・失効理由：{row.request_changes_note}</p>}{row.status==='pending'&&!row.superseded_by&&<RevokeApproval leadId={leadId} id={row.id} onSaved={load}/>}</div>)}
  {message&&<p role="status" style={muted}>{message}</p>}
 </section>
}
function RevokeApproval({leadId,id,onSaved}:{leadId:string;id:string;onSaved:()=>Promise<void>}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const revoke=async()=>{if(busy||!reason.trim())return;setBusy(true);try{const r=await revokeOemApproval(leadId,id,reason);setMessage(r.error||r.message||'');if(r.success)await onSaved()}catch{setMessage('結果を確認できませんでした。承認状況を更新してください。')}finally{setBusy(false)}}
 return <details><summary style={{...muted,cursor:'pointer'}}>未回答リンクを失効する</summary><label>失効理由<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} style={input}/></label><button type="button" disabled={busy||!reason.trim()} onClick={()=>void revoke()} style={button}>このリンクを失効</button>{message&&<p role="status" style={muted}>{message}</p>}</details>
}
const muted={fontSize:13,color:'var(--admin-text-muted)',lineHeight:1.8}
const input={display:'block',width:'100%',marginTop:6,marginBottom:10,padding:'9px 11px',background:'var(--admin-bg)',color:'var(--admin-text)',border:'1px solid var(--admin-border)',borderRadius:6}
const button={padding:'8px 12px',marginTop:6,background:'var(--admin-bg)',color:'var(--admin-text)',border:'1px solid var(--admin-border)',borderRadius:6,cursor:'pointer'}
