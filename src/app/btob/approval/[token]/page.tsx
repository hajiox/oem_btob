import type { Metadata } from 'next'
import { adminClient } from '@/lib/supabase/admin'
import { approvalTokenHash } from '@/lib/oem-approvals'
import { actOemApproval } from '@/actions/oemApprovals'
import ApprovalForm from './ApprovalForm'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'商品内容の確認・承認｜会津ブランド館',robots:{index:false,follow:false,nocache:true}}
export default async function ApprovalPage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params
 let hash:string
 try{hash=approvalTokenHash(token)}catch{return unavailable()}
 const {data,error}=await adminClient.from('oem_approvals').select('id,kind,name,version,content_body,content_hash,status,expires_at,superseded_by,signer_name,acted_at,oem_orders(status),leads!inner(page_id)').eq('token_hash',hash).eq('leads.page_id','35e7d402-0443-4703-94a4-fc2873b8f933').maybeSingle()
 const order=Array.isArray(data?.oem_orders)?data.oem_orders[0]:data?.oem_orders
 if(error||!data||!['pending','approved','changes_requested'].includes(data.status)||data.superseded_by||order?.status==='cancelled'||new Date(data.expires_at)<=new Date())return unavailable()
 const kind=({trial:'試作',label:'ラベル',specification:'最終仕様'} as Record<string,string>)[data.kind]||'商品内容'
 return <main style={shell}><div style={card}><p style={{fontWeight:800,color:'#1d6b4f'}}>会津ブランド館</p><h1 style={{fontSize:26,marginBottom:16}}>内容の確認・承認</h1><p>{kind}：{data.name}（版 {data.version}）</p><article style={article}>{data.content_body}</article><p style={{fontSize:13,color:'#52645e'}}>表示中の内容の確認です。正式発注の規約同意・価格変更の手続きとは別です。</p>{data.status==='pending'?<ApprovalForm token={token} contentHash={data.content_hash} action={actOemApproval}/>:<p role="status">{data.status==='approved'?'承認':'修正依頼'}を記録済みです。{data.signer_name} 様／{data.acted_at?new Date(data.acted_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):''}</p>}</div></main>
}
function unavailable(){return <main style={shell}><div style={card}><h1 style={{fontSize:24}}>承認リンクを確認できません</h1><p>期限切れ・失効・旧版のリンクです。担当者へ最新のリンクをご依頼ください。</p></div></main>}
const shell={minHeight:'100vh',padding:'40px 20px 80px',background:'#f3f5f4',color:'#18332a'}
const card={maxWidth:760,margin:'0 auto',padding:28,background:'#fff',border:'1px solid #dbe3df',borderRadius:14}
const article={whiteSpace:'pre-wrap' as const,overflowWrap:'anywhere' as const,padding:20,border:'1px solid #dbe3df',borderRadius:10,lineHeight:1.8}
