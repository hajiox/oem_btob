'use client'
import { useRef,useState } from 'react'
import type { actOemApproval } from '@/actions/oemApprovals'
export default function ApprovalForm({token,contentHash,action}:{token:string;contentHash:string;action:typeof actOemApproval}) {
 const [note,setNote]=useState(''),[name,setName]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[message,setMessage]=useState('')
 const busyRef=useRef(false),request=useRef<{id:string;payload:string}|null>(null)
 const run=async(value:'approve'|'request_changes')=>{
  if(busyRef.current||done||!name.trim()||!confirmed)return
  const payload=JSON.stringify({value,note:note.trim(),name:name.trim(),contentHash})
  if(request.current?.payload!==payload)request.current={id:crypto.randomUUID(),payload}
  busyRef.current=true;setBusy(true);setMessage('')
  try{const r=await action(token,value,note,name,contentHash,request.current.id);setMessage(r.success?('status'in r&&r.status==='approved'?'承認を記録しました。':'修正依頼を記録しました。'):r.error||'保存できませんでした。');if(r.success)setDone(true)}catch{setMessage('保存結果を確認できませんでした。同じ内容で再確認してください。')}finally{busyRef.current=false;setBusy(false)}
 }
 return <section style={{marginTop:20}}><label>確認者のお名前<input required value={name} disabled={busy||done} onChange={e=>setName(e.target.value)} maxLength={200} style={field}/></label><label>コメント（修正依頼の場合は必須）<textarea value={note} disabled={busy||done} onChange={e=>setNote(e.target.value)} maxLength={2000} style={{...field,minHeight:80}}/></label><label style={{display:'flex',gap:8,marginTop:16}}><input type="checkbox" checked={confirmed} disabled={busy||done} onChange={e=>setConfirmed(e.target.checked)}/>表示中の内容と版を確認しました</label><div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:14}}><button type="button" style={button} disabled={busy||done||!name.trim()||!confirmed} onClick={()=>void run('approve')}>この内容を承認する</button><button type="button" style={button} disabled={busy||done||!name.trim()||!confirmed||!note.trim()} onClick={()=>void run('request_changes')}>修正を依頼する</button></div>{message&&<p role="status">{message}</p>}</section>
}
const field={display:'block',width:'100%',padding:10,marginTop:6,marginBottom:12,border:'1px solid #b8c8c0',borderRadius:6}
const button={padding:'10px 16px',border:'1px solid #b8c8c0',borderRadius:6,background:'#edf5ef',color:'#18332a',cursor:'pointer'}
