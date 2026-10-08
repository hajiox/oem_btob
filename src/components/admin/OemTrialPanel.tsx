'use client'

import { useCallback, useEffect, useState } from 'react'
import { createOemTrial, getOemTrials, recordOemTrialResult } from '@/actions/oemTrials'
import { OEM_SPECIAL_INGREDIENT_NOTE } from '@/lib/oem-offer-pricing'
import { OemTrialPaymentPanel } from './OemTrialPaymentPanel'
type TrialRow = { id: string; trial_number: number; status: string; result: string | null; result_notes: string | null; fee_advisory: number; version: number; payment_required: boolean; label: string | null }
const results = { pass: '試作完了', fail: '不適合', needs_revision: '再試作が必要', cancelled: '取下げ' } as const
export function OemTrialPanel({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<TrialRow[]>([])
  const [companyKey, setCompanyKey] = useState('')
  const [evidence, setEvidence] = useState('')
  const [claim, setClaim] = useState(false)
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [request, setRequest] = useState<{ id: string; input: string } | null>(null)
  const [benefit, setBenefit] = useState<{companyKey:string;includedUsed:number;isCurrentBenefit:boolean} | null>(null)
  const restoreIdentity = useCallback((value: { companyKey: string; identityEvidence: string; claimIncluded: boolean }) => {
    setCompanyKey(value.companyKey); setEvidence(value.identityEvidence); setClaim(value.claimIncluded)
  }, [])
  const [trialPaid, setTrialPaid] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await getOemTrials(leadId)
      if (!r.success) { setReady(false); setMessage(r.error || '試作情報を取得できませんでした'); return }
      setRows(r.trials as TrialRow[]); setReady(true)
      if ('benefit' in r && r.benefit && typeof r.benefit === 'object') { setBenefit(r.benefit); setCompanyKey(previous=>previous||r.benefit!.companyKey); const first=r.trials[0] as {identity_evidence?:string};setEvidence(previous=>previous||first?.identity_evidence||'') } else setBenefit(null)
    } catch { setReady(false); setMessage('試作情報を取得できませんでした') }
  }, [leadId])
  useEffect(() => { void load() }, [load])
  const legacyContract = rows.some(row => row.payment_required === false)
  const create = async () => {
    if (busy || !ready) return
    const inputKey = JSON.stringify({ companyKey, evidence, claim, label })
    const key = request?.input === inputKey ? request.id : crypto.randomUUID()
    setRequest({ id:key, input:inputKey }); setBusy(true); setMessage('')
    try {
      const r = await createOemTrial(leadId, { companyKey, identityEvidence:evidence, label, claimIncluded:claim, requestId:key })
      setMessage(r.error || r.message || '')
      if (r.success) { setRequest(null); setLabel(''); await load() }
    } catch { setMessage('登録結果を確認できませんでした。同じ内容で再確認してください。新しい試作を重ねて登録しないでください。') }
    finally { setBusy(false) }
  }
  return <section aria-label="試作管理" style={{ marginTop:16 }}>
    <p style={muted}>{OEM_SPECIAL_INGREDIENT_NOTE}</p>
    <p style={muted}>初回特典は1企業・個人1名につき1回、同じ案件の試作2回まで。通常は試作2回まで10,000円、原材料表示5,000円、栄養成分表示（計算値）5,000円、簡易パッケージデザイン30,000円（合計50,000円）、初回特典では試作2回まで5,000円、その他3項目は各0円です。追加試作は1回3,000円（いずれも税別）。原料・製造費・送料は無料ではありません。試作費は独立した試作前払い請求として管理します。</p>
    {benefit && <p style={muted}>登録済み企業キー：{benefit.companyKey} ／ 初回特典：{benefit.isCurrentBenefit ? `この案件に適用（${benefit.includedUsed}/2回利用）` : 'この案件には適用されていません'}</p>}
    {legacyContract ? <p style={muted}>既存の試作契約です。新しい前払い料金を遡って請求せず、従来の契約条件で継続します。新規契約は別案件として登録してください。</p> : <OemTrialPaymentPanel leadId={leadId} companyKey={companyKey} identityEvidence={evidence} claimIncluded={claim} onPaid={setTrialPaid} onIdentity={restoreIdentity} />}
    <div style={{ display:'grid', gap:12 }}>
      <label>企業・個人の識別キー<input value={companyKey} onChange={e=>setCompanyKey(e.target.value)} maxLength={200} style={input} placeholder="同じ企業では同じキーを使用" /></label>
      <label>同一企業・本人の確認根拠<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={2000} style={input} placeholder="既存取引先番号、企業情報・担当者確認など" /></label>
      <label>試作名<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={500} style={input} /></label>
      <label style={muted}><input type="checkbox" checked={claim} onChange={e=>setClaim(e.target.checked)} /> 初回特典（試作2回まで・1企業または個人1名につき1回）の対象と確認し、今回の案件へ適用する</label>
    </div>
    <button type="button" disabled={busy || !ready || (!trialPaid && !legacyContract) || !companyKey.trim() || !evidence.trim()} onClick={()=>void create()} style={button}>{busy ? '処理中…' : trialPaid || legacyContract ? '試作を登録' : '入金確認後に試作を登録'}</button>
    <button type="button" disabled={busy} onClick={()=>void load()} style={{ ...button, marginLeft:8 }}>履歴を更新</button>
    {rows.map(row=><TrialResult key={row.id} row={row} onSaved={load} />)}
    {message && <p role="status" style={muted}>{message}</p>}
  </section>
}
function TrialResult({ row, onSaved }: { row:TrialRow; onSaved:()=>Promise<void> }) {
  const [result,setResult]=useState<keyof typeof results>('pass')
  const [notes,setNotes]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const save=async()=>{setBusy(true);try{const r=await recordOemTrialResult(row.id,result,notes,row.version);setMessage(r.success?'結果を保存しました':r.error||'保存できませんでした');if(r.success)await onSaved()}catch{setMessage('保存結果を確認できませんでした。履歴を更新してください。')}finally{setBusy(false)}}
  return <div style={{ marginTop:14,padding:14,border:'1px solid var(--admin-border)',borderRadius:8 }}>
    <strong>試作{row.trial_number} {row.label||''}</strong>　{row.status==='pending'?'結果未記録':results[row.result as keyof typeof results]||'記録済み'}
    <p style={muted}>追加試作費（税別・参考）：{row.fee_advisory?`${row.fee_advisory.toLocaleString()}円`:'なし（標準料金内または初回特典）'}</p>
    {row.result_notes&&<p style={{...muted,whiteSpace:'pre-wrap'}}>{row.result_notes}</p>}
    {row.status==='pending'&&<><label>結果<select value={result} onChange={e=>setResult(e.target.value as keyof typeof results)} style={input}>{Object.entries(results).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label><label>結果メモ<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={2000} style={input}/></label><button type="button" disabled={busy} onClick={()=>void save()} style={button}>結果を保存</button></>}
    {message&&<p role="status" style={muted}>{message}</p>}
  </div>
}
const muted={fontSize:13,color:'var(--admin-text-muted)',lineHeight:1.8}
const input={display:'block',width:'100%',marginTop:6,marginBottom:8,padding:'9px 11px',background:'var(--admin-bg)',color:'var(--admin-text)',border:'1px solid var(--admin-border)',borderRadius:6}
const button={padding:'8px 12px',marginTop:10,background:'var(--admin-bg)',color:'var(--admin-text)',border:'1px solid var(--admin-border)',borderRadius:6,cursor:'pointer'}
