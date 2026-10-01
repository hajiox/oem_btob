import { randomBytes } from 'node:crypto'
import { adminClient } from '@/lib/supabase/admin'
import { requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { getOemSettlementData } from '@/actions/oemSettlements'
import { SETTLEMENT_STATE_LABELS, type OemSettlement } from '@/lib/oem-settlements-shared'

export const dynamic = 'force-dynamic'
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
const yen = (value: number) => `¥${Number(value).toLocaleString('ja-JP')}`
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireMailAdmin()
    const id = uuid((await params).id)
    const { data: settlement, error } = await adminClient.from('oem_settlements').select('*').eq('id', id).single()
    if (error || !settlement) throw new Error('not found')
    const { data: order, error: orderError } = await adminClient.from('oem_orders').select('id,lead_id,order_number,formal_quote_amount,final_amount').eq('id', settlement.order_id).single()
    if (orderError || !order) throw new Error('not found')
    const lead = await requireOemMailLead(order.lead_id)
    const result = await getOemSettlementData(order.id)
    if (!result.success || !result.data) throw new Error('unavailable')
    const s = settlement as OemSettlement, data = result.data
    const current = data.latest?.id === s.id
    const remaining = s.target_gross - data.netReceived
    const nonce = randomBytes(18).toString('base64')
    const cash = data.cash.filter(item => item.settlement_id === s.id)
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>精算確認書 ${escape(order.order_number)} 第${s.revision}版</title><style nonce="${nonce}">
      body{font-family:system-ui,sans-serif;color:#17202c;max-width:860px;margin:32px auto;padding:0 24px;line-height:1.7}h1{font-size:26px}h2{font-size:18px;margin-top:28px}.notice{padding:12px;border:1px solid #ddd;background:#f6f7f8}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}.money{text-align:right}.memo{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:10px 16px;cursor:pointer}@media print{button{display:none}body{margin:0;max-width:none}.notice{background:none}}
    </style></head><body><button id="print">印刷・PDF保存</button><h1>変更・キャンセル精算確認書（控え）</h1>
    <p>${escape(lead.company_name)} ${escape(lead.contact_name)} 様<br>発注番号：${escape(order.order_number)} ／ 精算第${s.revision}版<br>種別：${s.kind === 'cancellation' ? 'キャンセル' : '合意金額の変更'} ／ ${escape(SETTLEMENT_STATE_LABELS[s.state])}</p>
    <p class="notice">${s.state === 'draft' ? '下書きです。確定した請求・返金の案内ではありません。' : !current ? '過去の精算履歴です。現在の請求・返金額として使用しないでください。' : '本書はお客様との合意内容・入出金の管理控えです。元の正式見積・請求書を上書きするものではありません。'} 銀行振込・返金は自動実行されません。</p>
    <h2>${s.kind === 'cancellation' ? '合意済みの費用総額' : '変更後の発注全体の合意総額'}</h2><table>
    <tr><td>8％対象額（税抜）</td><td class="money">${yen(s.taxable8)}</td></tr><tr><td>8％消費税</td><td class="money">${yen(s.tax8)}</td></tr>
    <tr><td>10％対象額（税抜）</td><td class="money">${yen(s.taxable10)}</td></tr><tr><td>10％消費税</td><td class="money">${yen(s.tax10)}</td></tr>
    <tr><td>非課税・不課税額</td><td class="money">${yen(s.non_taxable)}</td></tr><tr><th>合意総額</th><th class="money">${yen(s.target_gross)}</th></tr>
    <tr><td>確定時の実受領額（返金控除後）</td><td class="money">${s.received_at_confirmation === null ? '未確定' : yen(s.received_at_confirmation)}</td></tr>
    ${current ? `<tr><td>現在の実受領額（全入出金の差引）</td><td class="money">${yen(data.netReceived)}</td></tr><tr><th>${remaining > 0 ? '追加受領が必要' : remaining < 0 ? '返金が必要' : '差額なし・精算完了'}</th><th class="money">${yen(Math.abs(remaining))}</th></tr>` : ''}</table>
    <p>精算期限：${escape(s.due_date || '未設定')} ／ 確定日時：${escape(s.confirmed_at ? new Date(s.confirmed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '未確定')}</p>
    <h2>理由・合意の根拠</h2><p class="memo">${escape(s.reason)}</p><p class="memo">${escape(s.agreement_note)}</p>
    <h2>銀行確認済みの精算入出金</h2><table><tr><th>日付</th><th>種類</th><th>名義</th><th class="money">金額</th></tr>${cash.map(item => `<tr><td>${escape(item.happened_on)}</td><td>${item.direction === 'receipt' ? '受領' : '返金'}</td><td>${escape(item.counterparty)}</td><td class="money">${yen(item.amount)}</td></tr>`).join('') || '<tr><td colspan="4">記録なし</td></tr>'}</table>
    ${data.cashHasMore ? '<p>履歴は直近100件の範囲です。全件の証跡が必要な場合は別途確認してください。</p>' : ''}
    <p class="notice">元の正式見積（税別）：${yen(order.formal_quote_amount)}。個別の条件や税区分は合意内容に基づき確認してください。</p>
    <script nonce="${nonce}">document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` } })
  } catch { return new Response('精算確認書を表示できません。管理画面のログインと対象案件をご確認ください。', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Type': 'text/plain; charset=utf-8' } }) }
}
