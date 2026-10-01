'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getOemSettlementData, updateOemSettlement } from '@/actions/oemSettlements'
import type { OemOrder } from '@/lib/oem-orders'
import type { OemSettlement, SettlementAction, SettlementData, SettlementInput, SettlementKind, SettlementSaveInput } from '@/lib/oem-settlements-shared'
import { settlementTotals, SETTLEMENT_CHANGED as SETTLEMENT_EVENT, SETTLEMENT_STATE_LABELS } from '@/lib/oem-settlements-shared'
import { PAYMENT_CHANGED } from './OemPaymentPanel'

type Props = { order: OemOrder; onChanged?: () => void | Promise<void>; onState?: (state: { ready: boolean; hasSettlement: boolean; blocked: boolean; canReissue: boolean }) => void }
const cancellable = ['accepted', 'deposit_paid', 'in_production', 'balance_due', 'paid']
const adjustable = ['balance_due', 'paid', 'shipped']
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
const inputStyle = { display: 'block', width: '100%', marginTop: 6, padding: '9px 10px', border: '1px solid var(--admin-border)', borderRadius: 5, background: 'var(--admin-bg)', color: 'var(--admin-text)', colorScheme: 'dark', fontSize: 14 }
const button = { padding: '8px 12px', border: '1px solid var(--admin-border)', borderRadius: 6, background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }
const primary = { ...button, background: 'var(--admin-accent)', color: '#fff', fontWeight: 700 }
const muted = { color: 'var(--admin-text-muted)', fontSize: 13 }
const danger = { color: '#fca5a5', fontSize: 13 }
export const SETTLEMENT_CHANGED = SETTLEMENT_EVENT

function requestId() { return crypto.randomUUID() }
const snapshotLabels: Record<string, string> = { order_number: '元の発注番号', status: '確定前の工程', formal_quote_amount: '正式見積額（税別）', deposit_amount: '前金額（税別）', final_amount: '製造後の金額（税別）', specification: '商品仕様', terms_version: '規約版', terms_sha256: '規約の保存証跡', original_received: '確定時の純受領額', payment_plans: '元の支払予定', invoice_ids: '元の請求書証跡', accepted_at: '規約同意日時' }
function originalConditions(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return null
  return Object.entries(snapshot).map(([key, value]) => <div key={key}><strong>{snapshotLabels[key] || key}</strong>：{typeof value === 'object' && value !== null ? '（詳細は保存済みスナップショット）' : String(value)}</div>)
}

export function OemSettlementPanel({ order, onChanged, onState }: Props) {
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const sequence = useRef(0)
  const onStateRef = useRef(onState)
  const requestRef = useRef<{ id: string; payload: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState<SettlementKind>('adjustment')
  const [stage, setStage] = useState<SettlementSaveInput['materialStage']>('not_applicable')
  const [taxable8, setTaxable8] = useState('')
  const [taxable10, setTaxable10] = useState('')
  const [nonTaxable, setNonTaxable] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reason, setReason] = useState('')
  const [agreementNote, setAgreementNote] = useState('')
  const [customerConfirmed, setCustomerConfirmed] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [cashDirection, setCashDirection] = useState<'receipt' | 'refund'>('receipt')
  const [cashAmount, setCashAmount] = useState('')
  const [cashDate, setCashDate] = useState(today)
  const [counterparty, setCounterparty] = useState('')
  const [cashNote, setCashNote] = useState('')
  const [bankConfirmed, setBankConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState(false)

  const latest = data?.latest || null
  const blocked = latest?.state === 'draft' || latest?.state === 'confirmed'
  const hasSettlement = Boolean(latest && latest.state !== 'void')
  const canReissue = order.status === 'cancelled' && (!order.accepted_at || (latest?.state === 'settled' && latest.kind === 'cancellation'))
  const canCancel = cancellable.includes(order.status) || (order.status === 'cancelled' && Boolean(order.accepted_at))
  const canAdjust = adjustable.includes(order.status)

  const load = useCallback(async (overwrite = false) => {
    const current = ++sequence.current
    setLoading(true)
    try {
      const result = await getOemSettlementData(order.id)
      if (current !== sequence.current) return
      if (!result.success || !result.data) { setError(('error' in result && result.error) || '精算情報を取得できませんでした'); setData(null); return }
      const next = result.data as SettlementData
      setData(next); setError('')
      const draft = next.latest?.state === 'draft' ? next.latest : null
      if (overwrite && draft) { setForm(draft) }
    } catch { if (current === sequence.current) { setData(null); setError('精算情報を取得できませんでした') } }
    finally { if (current === sequence.current) setLoading(false) }
  }, [order.id])
  function setForm(item: OemSettlement) {
    setKind(item.kind); setStage(item.material_stage); setTaxable8(String(item.taxable8)); setTaxable10(String(item.taxable10)); setNonTaxable(String(item.non_taxable)); setDueDate(item.due_date || ''); setReason(item.reason); setAgreementNote(item.agreement_note)
  }
  useEffect(() => { void load(true) }, [load])
  useEffect(() => { onStateRef.current = onState }, [onState])
  useEffect(() => { onStateRef.current?.({ ready: Boolean(data && !error && !loading), hasSettlement, blocked, canReissue }) }, [data, error, loading, hasSettlement, blocked, canReissue])
  useEffect(() => { if (data?.remaining != null) setCashDirection(data.remaining < 0 ? 'refund' : 'receipt') }, [data?.remaining])
  useEffect(() => { const refresh = () => { if (!busyRef.current) void load(false) }; window.addEventListener(SETTLEMENT_CHANGED, refresh); window.addEventListener(PAYMENT_CHANGED, refresh); return () => { window.removeEventListener(SETTLEMENT_CHANGED, refresh); window.removeEventListener(PAYMENT_CHANGED, refresh) } }, [load])

  const totals = useMemo(() => { try { return settlementTotals(Number(taxable8) || 0, Number(taxable10) || 0, Number(nonTaxable) || 0) } catch { return { tax8: 0, tax10: 0, gross: 0 } } }, [taxable8, taxable10, nonTaxable])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busyRef.current || !data) return
    const input: SettlementSaveInput = { kind, materialStage: kind === 'adjustment' ? 'not_applicable' : stage, taxable8: Number(taxable8), taxable10: Number(taxable10), nonTaxable: Number(nonTaxable), dueDate: dueDate || null, reason, agreementNote }
    await dispatch('save', input, latest?.state === 'draft' ? latest.id : null, latest?.state === 'draft' ? latest.version : 0, '下書きを保存しました')
  }
  const dispatch = async (action: SettlementAction, input: SettlementInput, settlementId: string | null, version: number, okMessage: string) => {
    if (busyRef.current) return
    const payload = JSON.stringify({ action, input, settlementId, version })
    if (uncertain && requestRef.current?.payload !== payload) { setMessage('前回の結果を同じ内容で再確認してください'); return }
    if (!requestRef.current || requestRef.current.payload !== payload) requestRef.current = { id: requestId(), payload }
    await mutate(action, input, settlementId, version, requestRef.current.id, okMessage)
  }
  const mutate = async (action: SettlementAction, input: SettlementInput, settlementId: string | null, version: number, id: string, okMessage: string) => {
    busyRef.current = true; setBusy(true); setMessage(''); setError('')
    try {
      const result = await updateOemSettlement(order.id, settlementId, action, input, version, id)
      if (!result.success) { setUncertain(Boolean(result.uncertain)); setMessage(result.uncertain ? '結果を確認できません。同じ送信IDで再確認してください（二重登録されません）。' : result.error || '保存できませんでした'); return }
      setUncertain(false); requestRef.current = null; setMessage(result.message || okMessage); setCustomerConfirmed(false); setEditing(false)
      if (action === 'record_cash') { setCashAmount(''); setCounterparty(''); setCashNote(''); setBankConfirmed(false) }
      await load(true); window.dispatchEvent(new Event(SETTLEMENT_CHANGED)); window.dispatchEvent(new Event(PAYMENT_CHANGED)); await onChanged?.()
    } catch { setUncertain(true); setMessage('通信が切れました。同じ送信IDで再確認してください（二重登録されません）。') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const confirm = () => { if (!latest || latest.state !== 'draft' || editing || !customerConfirmed) { setMessage(editing ? '先に下書きを保存してください' : 'お客様との合意確認にチェックしてください'); return } void dispatch('confirm', { customerConfirmed: true }, latest.id, latest.version, '精算を確定しました') }
  const voidDraft = () => { if (!latest || latest.state !== 'draft' || !voidReason.trim()) { setMessage('取下げ理由を入力してください'); return } void dispatch('void', { reason: voidReason }, latest.id, latest.version, '下書きを取り下げました') }
  const recordCash = (event: React.FormEvent) => {
    event.preventDefault(); if (busyRef.current || !latest || latest.state !== 'confirmed' || !bankConfirmed || data?.remaining === 0) { setMessage('銀行明細確認と精算残額を確認してください'); return }
    void dispatch('record_cash', { direction: cashDirection, amount: Number(cashAmount), happenedOn: cashDate, counterparty, note: cashNote, bankConfirmed }, latest.id, latest.version, '入出金を記録しました')
  }

  if (order.status === 'issued') return null
  return <section aria-label="精算管理" style={{ marginTop: 20, borderTop: '1px solid var(--admin-border)', paddingTop: 18 }} onClick={e => e.stopPropagation()}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><h4 style={{ margin: 0 }}>精算管理</h4>{latest && <span style={{ ...muted, color: latest.state === 'draft' ? '#fbbf24' : latest.state === 'confirmed' ? '#67e8f9' : '#4ade80' }}>{SETTLEMENT_STATE_LABELS[latest.state]}</span>}</div>
    <p style={muted}>顧客へのメール送信・銀行振込は行いません。銀行明細を確認した管理者が手動で記録します。</p>
    {error && <p role="alert" style={danger}>{error} <button type="button" style={button} onClick={() => void load(true)}>再読み込み</button></p>}
    {loading && !data && <p>精算情報を読み込み中…</p>}
    {data && <>
      <div style={summary}><span>元の入金：{yen(data.originalReceived)}</span><span>精算受取：{yen(data.settlementReceived)}</span><span>精算返金：{yen(data.settlementRefunded)}</span><strong>純受領：{yen(data.netReceived)}</strong><span>{data.remaining == null ? '残額未計算' : data.remaining > 0 ? `追加請求 ${yen(data.remaining)}` : data.remaining < 0 ? `返金 ${yen(Math.abs(data.remaining))}` : '残額なし'}</span></div>
      {latest && <details><summary>精算内容・合意根拠（改訂{latest.revision}）</summary><div style={{ ...muted, whiteSpace: 'pre-wrap', marginTop: 8 }}><p>対象税込総額：{yen(latest.target_gross)}（税8% {yen(latest.taxable8)}／税10% {yen(latest.taxable10)}／非課税 {yen(latest.non_taxable)}）</p><p>理由：{latest.reason}</p><p>合意根拠：{latest.agreement_note}</p>{latest.original_snapshot && <div><strong>元の見積・入金スナップショット（読み取り専用）</strong>{originalConditions(latest.original_snapshot)}</div>}</div></details>}
      {data.history.length > 0 && <details style={{ marginTop: 12 }}><summary>精算改訂履歴（読み取り専用）</summary>{data.history.map(item => <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--admin-border)', fontSize: 13 }}><strong>改訂{item.revision}：{item.kind === 'cancellation' ? 'キャンセル' : '金額調整'} ／ {SETTLEMENT_STATE_LABELS[item.state]}</strong><div style={muted}>対象税込総額 {yen(item.target_gross)} ／ 更新 {new Date(item.updated_at).toLocaleString('ja-JP')}</div><div style={muted}>理由：{item.reason}</div>{item.void_reason && <div style={{ ...muted, color: '#fca5a5' }}>取下げ理由：{item.void_reason}</div>}</div>)}</details>}
      {!blocked && (canCancel || canAdjust) && <button type="button" disabled={busy || uncertain} style={{ ...button, marginTop: 10 }} onClick={() => { if (editing) { setEditing(false); return }; if (!latest || latest.state !== 'draft') { setTaxable8(''); setTaxable10(''); setNonTaxable(''); setReason(''); setAgreementNote(''); setDueDate(''); setKind(canCancel ? 'cancellation' : 'adjustment'); setStage(canCancel ? 'before' : 'not_applicable') }; setEditing(true) }}>{editing ? '入力を閉じる' : latest?.state === 'settled' || latest?.state === 'void' ? '新しい改訂を作成' : '精算下書きを作成'}</button>}
      {latest?.state === 'draft' && <button type="button" disabled={busy || uncertain} style={{ ...button, marginTop: 10 }} onClick={() => { setForm(latest); setCustomerConfirmed(false); setEditing(previous => !previous) }}>{editing ? '変更を破棄して入力を閉じる' : '下書き内容を編集'}</button>}
      {uncertain && requestRef.current && <div role="alert" style={card}><p style={danger}>前回の結果を確認するまで別の処理はできません。現在の入力変更は使用せず、前回と同じ内容・送信IDで確認します。</p><button type="button" disabled={busy} style={button} onClick={() => { if (busyRef.current || !requestRef.current) return; const previous = JSON.parse(requestRef.current.payload) as { action: SettlementAction; input: SettlementInput; settlementId: string | null; version: number }; void mutate(previous.action, previous.input, previous.settlementId, previous.version, requestRef.current.id, '前回の処理結果を確認しました') }}>前回の処理結果を再確認</button></div>}
      {editing && <form onSubmit={save} style={card}><div style={grid}><label>精算種別<select value={kind} onChange={e => { const nextKind = e.target.value as SettlementKind; setKind(nextKind); setStage(nextKind === 'adjustment' ? 'not_applicable' : 'before') }} disabled={busy || Boolean(latest?.state === 'draft')} style={inputStyle}><option value="adjustment" disabled={!canAdjust}>金額調整</option><option value="cancellation" disabled={!canCancel}>キャンセル</option></select></label><label>資材手配状況<select value={stage} onChange={e => setStage(e.target.value as SettlementSaveInput['materialStage'])} disabled={busy || kind === 'adjustment'} style={inputStyle}><option value="not_applicable" disabled={kind === 'cancellation'}>金額調整（資材区分対象外）</option><option value="before">資材手配前（キャンセル料3万円）</option><option value="after">資材手配後（実費）</option></select></label><label>精算期限<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} disabled={busy} /></label></div><div style={grid}><label>税8%対象（税抜）<input type="number" min="0" step="1" value={taxable8} onChange={e => setTaxable8(e.target.value)} style={inputStyle} disabled={busy} /></label><label>税10%対象（税抜）<input type="number" min="0" step="1" value={taxable10} onChange={e => setTaxable10(e.target.value)} style={inputStyle} disabled={busy} /></label><label>非課税・不課税<input type="number" min="0" step="1" value={nonTaxable} onChange={e => setNonTaxable(e.target.value)} style={inputStyle} disabled={busy} /></label></div><p style={muted}>{kind === 'cancellation' ? 'キャンセル料・実費の合意総額を入力します。' : '発注全体の変更後の最終合意総額を入力します（変更差額のみではありません）。'}税込合意総額プレビュー：<strong>{yen(totals.gross)}</strong>（税8% {yen(totals.tax8)}／税10% {yen(totals.tax10)}）。キャンセル料は既存条件に基づき手入力してください（自動計算しません）。</p><label>精算理由<textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, minHeight: 65, resize: 'vertical' }} disabled={busy} /></label><label>お客様との合意根拠（メール・証跡）<textarea required maxLength={4000} value={agreementNote} onChange={e => setAgreementNote(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} disabled={busy} /></label><button type="submit" disabled={busy || uncertain} style={primary}>下書きを保存</button></form>}
      {latest?.state === 'draft' && <div style={card}><label style={check}><input type="checkbox" checked={customerConfirmed} onChange={e => setCustomerConfirmed(e.target.checked)} disabled={busy || editing} />保存済みの精算対象・理由・合意根拠を確認し、管理者としてお客様との合意を確認しました</label><button type="button" onClick={confirm} disabled={busy || editing || !customerConfirmed} style={primary}>精算を確定</button><div style={{ marginTop: 14 }}><label>取下げ理由<textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} maxLength={2000} style={{ ...inputStyle, minHeight: 55 }} disabled={busy} /></label><button type="button" onClick={voidDraft} disabled={busy || !voidReason.trim()} style={{ ...button, color: '#fca5a5', marginTop: 8 }}>下書きを取り下げ</button></div></div>}
      {latest?.state === 'confirmed' && data.remaining !== 0 && <form onSubmit={recordCash} style={card}><h5 style={{ margin: '0 0 8px' }}>入出金を記録</h5><p style={muted}>残額に合わせて方向を固定します（{cashDirection === 'receipt' ? '追加受取' : '返金'}）。部分額も記録できます。</p><div style={grid}><label>金額<input required type="number" min="1" max={Math.max(1, Math.abs(data.remaining || 100000000))} step="1" value={cashAmount} onChange={e => setCashAmount(e.target.value)} style={inputStyle} disabled={busy || uncertain} /></label><label>入出金日<input required type="date" max={today()} value={cashDate} onChange={e => setCashDate(e.target.value)} style={inputStyle} disabled={busy || uncertain} /></label></div><div style={grid}><label>振込人・返金先名義<input required maxLength={200} value={counterparty} onChange={e => setCounterparty(e.target.value)} style={inputStyle} disabled={busy || uncertain} /></label><label>銀行確認メモ<input required maxLength={2000} value={cashNote} onChange={e => setCashNote(e.target.value)} style={inputStyle} disabled={busy || uncertain} /></label></div><label style={check}><input type="checkbox" checked={bankConfirmed} onChange={e => setBankConfirmed(e.target.checked)} disabled={busy} />銀行明細で実際の入出金を確認しました</label><button type="submit" disabled={busy || uncertain && !requestRef.current || !bankConfirmed} style={primary}>{uncertain ? '同じ内容で結果を再確認' : '入出金を記録'}</button></form>}
      {latest?.id && <a href={`/admin/settlements/${latest.id}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, color: 'var(--admin-accent)' }}>精算管理書類を印刷・表示</a>}
      {data.cash.length > 0 && <details style={{ marginTop: 14 }}><summary>入出金履歴（読み取り専用）</summary>{data.cash.map(item => <div key={item.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--admin-border)', fontSize: 13 }}>{item.happened_on}　<strong>{item.direction === 'receipt' ? '受取' : '返金'} {yen(item.amount)}</strong>　{item.counterparty}<div style={muted}>{item.note || 'メモなし'} ／ 記録日時 {new Date(item.created_at).toLocaleString('ja-JP')}</div></div>)}</details>}
      {data.historyHasMore || data.cashHasMore ? <p style={muted}>履歴の一部のみ表示しています。全件表示には対応していません。</p> : null}
    </>}
    {message && <p role="status" style={message.includes('できません') || message.includes('確認') || uncertain ? danger : { color: '#7dd3fc', fontSize: 13 }}>{message}</p>}
  </section>
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 12 }
const card = { marginTop: 14, padding: 14, border: '1px solid var(--admin-border)', borderRadius: 8, background: 'var(--admin-bg)' }
const check = { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', ...muted }
const summary = { display: 'flex', flexWrap: 'wrap' as const, gap: 14, margin: '14px 0', fontSize: 13 }
