'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import { getOemDocuments,issueOemDocument } from '@/actions/oemDocuments'
import type { OemOrder } from '@/lib/oem-orders'
import type { OemDocument,OemDocumentType } from '@/lib/oem-documents-shared'
export function OemDocumentPanel({order,readOnly=false}:{order:OemOrder;readOnly?:boolean}) {
 const [documents,setDocuments]=useState<OemDocument[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[url,setUrl]=useState('')
 const requests=useRef<Partial<Record<OemDocumentType,string>>>({}),busyRef=useRef(false)
 const load=useCallback(async()=>{try{const r=await getOemDocuments(order.id);if(!r.success)throw new Error(r.error||'書面を取得できませんでした');setDocuments(r.documents);setReady(true)}catch{setReady(false);setMessage('書面を取得できませんでした。再読み込みしてください。')}},[order.id])
 useEffect(()=>{void load()},[load])
 const issue=async(type:OemDocumentType)=>{
  if(busyRef.current||readOnly||!ready)return
  const request=requests.current[type]||crypto.randomUUID();requests.current[type]=request
  busyRef.current=true;setBusy(true);setMessage('')
  try{const r=await issueOemDocument(order.id,type,request);setMessage(r.message||r.error||'');if(r.success){if(r.url)setUrl(r.url);await load()}}catch{setMessage('発行結果を確認できませんでした。同じ書面の確認ボタンから再確認してください。')}finally{busyRef.current=false;setBusy(false)}
 }
 return <section aria-label="納品書・領収書" style={{marginTop:16}}><p style={muted}>出荷済みの完成数量を納品書に、全額入金・精算が確認できた金額を領収書に固定保存します。発行後の書面は上書きしません。メール送信は別操作です。</p>
  {documents.map(d=><div key={d.id} style={{padding:12,marginBottom:8,border:'1px solid var(--admin-border)',borderRadius:6}}><strong>{d.document_type==='receipt'?'領収書':'納品書'}</strong>　{d.document_number}　<a href={`/admin/documents/${encodeURIComponent(d.id)}`} target="_blank" rel="noreferrer" style={{color:'var(--admin-accent)'}}>表示・印刷・PDF保存</a></div>)}
  {!readOnly&&<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{(['delivery_note','receipt'] as const).map(type=><button key={type} type="button" disabled={busy||!ready||documents.some(d=>d.document_type===type)||(type==='delivery_note'?order.status!=='shipped':!['paid','shipped'].includes(order.status))} style={button} onClick={()=>void issue(type)}>{type==='receipt'?'領収書':'納品書'}を発行</button>)}</div>}
  <button type="button" disabled={busy} style={{...button,marginTop:8}} onClick={()=>void load()}>書面履歴を更新</button>
  {url&&<p style={{...muted,overflowWrap:'anywhere'}}>今回のお客様用URL：<a href={url} target="_blank" rel="noreferrer" style={{color:'var(--admin-accent)'}}>{url}</a></p>}{message&&<p role="status" style={muted}>{message}</p>}
 </section>
}
const muted={color:'var(--admin-text-muted)',fontSize:13,lineHeight:1.8}
const button={padding:'8px 12px',border:'1px solid var(--admin-border)',borderRadius:5,background:'transparent',color:'var(--admin-text)',cursor:'pointer'}
