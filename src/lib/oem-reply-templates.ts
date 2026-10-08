import { mailSubject } from '@/lib/oem-conversations'
import { OEM_SPECIAL_INGREDIENT_NOTE } from '@/lib/oem-offer-pricing'
import { OEM_ORDER_STATUS_LABELS } from '@/lib/oem-order-shared'
import type { ReplyTemplateId, ReplySuggestion } from '@/lib/oem-reply-assist-shared'
import type { ReplyContext, ValidatedReplyLead } from '@/lib/oem-reply-context'
const yen = (v: number) => `¥${v.toLocaleString('ja-JP')}`
const salutation = (lead: ValidatedReplyLead) => `${lead.company_name}\n${lead.contact_name} 様`
function safeSubject(c: ReplyContext) {
  const base = c.sourceSubject?.trim() ? (/^re:/i.test(c.sourceSubject) ? c.sourceSubject : `Re: ${c.sourceSubject}`) : 'OEMのご相談について'
  return mailSubject(base.slice(0, 140), c.lead.id)
}
const factsFor = (c: ReplyContext) => {
  const out = [c.order ? `発注状態：${OEM_ORDER_STATUS_LABELS[c.order.status as keyof typeof OEM_ORDER_STATUS_LABELS]}` : c.legacyCancellation || c.settlement?.kind === 'cancellation' ? '発注状態：キャンセル済み' : '正式発注：未発行']
  if (c.order && !c.settlement) { out.push(`正式見積額（税別）：${yen(c.order.formal_quote_amount)}`, `前金額（税別）：${yen(c.order.deposit_amount)}`); if (c.order.final_amount !== null) out.push(`製造後の最終金額（税別）：${yen(c.order.final_amount)}`) }
  for (const plan of c.plans) {
    const stage = plan.stage === 'deposit' ? '前金' : '残額'
    out.push(`${stage}の請求予定額（税込）：${yen(plan.expected_amount)}／銀行明細確認済み入金合計（税込）：${yen(c.receiptTotals[plan.stage])}／未入金額（税込）：${yen(Math.max(0, plan.expected_amount - c.receiptTotals[plan.stage]))}`)
  }
  if (c.fulfillment?.planned_quantity != null) out.push(`製造予定数量：${c.fulfillment.planned_quantity}${c.fulfillment.quantity_unit}`)
  if (c.fulfillment?.completed_quantity != null) out.push(`完成数量：${c.fulfillment.completed_quantity}${c.fulfillment.quantity_unit}`)
  if (c.fulfillment?.shipped_on) out.push(`出荷日：${c.fulfillment.shipped_on}${c.fulfillment.carrier ? `（配送会社：${c.fulfillment.carrier}）` : ''}`)
  if (c.fulfillment?.tracking_number) out.push(`追跡番号：${c.fulfillment.tracking_number}`)
  if (!c.order && !c.legacyCancellation && !c.settlement && c.selectedOptions.length) out.push(`ご相談仕様（確定前）：${c.selectedOptions.map(item => `${item.question}＝${item.answer}`).join('／')}`)
  if (c.settlement && c.settlement.state !== 'draft') out.push(`精算：${c.settlement.kind === 'cancellation' ? 'キャンセル' : '金額調整'}／${c.settlement.state === 'settled' ? '精算完了' : '確定・入出金待ち'}／合意総額（税込）：${yen(c.settlement.target_gross)}／${(c.settlementRemaining ?? 0) < 0 ? '返金額' : '残額'}（税込）：${yen(Math.abs(c.settlementRemaining ?? 0))}`)
  if (c.legacyCancellation) out.push('旧発注はキャンセル済み。旧発注の金額を現在の請求額として扱わない。')
  return out
}
const factText = (facts: string[], test: RegExp) => facts.filter(item => test.test(item)).join('\n') || '該当する確定情報は現在確認できません。'
export function buildReplyTemplate(c: ReplyContext, id: ReplyTemplateId): ReplySuggestion & { facts: string[] } {
  const facts = factsFor(c); const status = c.order ? OEM_ORDER_STATUS_LABELS[c.order.status as keyof typeof OEM_ORDER_STATUS_LABELS] : c.legacyCancellation || c.settlement?.kind === 'cancellation' ? 'キャンセル済み' : '正式発注前'
  const paymentFacts = factText(facts, /請求予定額|入金合計|合意総額|残額/)
  const progressFacts = factText(facts, /発注状態|製造予定数量|完成数量/)
  const shippingFacts = factText(facts, /発注状態|出荷日|配送会社|追跡番号/)
  const settlementFacts = factText(facts, /精算|残額/)
  const cancelled = c.legacyCancellation || c.settlement?.kind === 'cancellation'
  const paymentExplanation = c.settlement ? c.settlement.state === 'draft' ? '精算は調整中です。請求・返金の確定内容は確認してご案内します。' : '通常の支払予定ではなく、上記の確定精算情報をご確認ください。' : cancelled ? '通常の製造代金の請求ではありません。キャンセル精算の確定内容を確認してご案内します。' : c.order?.status === 'paid' || c.order?.status === 'shipped' ? '通常の製造代金は入金確認済みです。変更等による別途精算がある場合は、確定内容を確認してご案内します。' : c.order?.status === 'balance_due' ? '完成後の残額精算の段階です。記録済みの請求・入金状況をご確認ください。残額の入金確認後に出荷します。' : c.order?.status === 'deposit_paid' || c.order?.status === 'in_production' ? '製造着手金は入金確認済みです。完成数量と最終金額の確定後に、着手金を差し引いた残額をご案内します。' : '初回試作費5,000円（税別・税込5,500円）は試作着手前に先入金いただき、入金確認後に試作を開始します。試作のみで終了でき、製造に進む場合は別途、製造代金50％の着手金と出荷前精算金が発生します。試作費は製造代金に二重計上しません。'
  const bodies: Record<ReplyTemplateId, string> = {
    acknowledge: `${salutation(c.lead)}\n\nお問い合わせありがとうございます。内容を確認のうえ、ご案内します。${c.order || c.legacyCancellation || c.settlement ? `現在の発注状態は「${status}」です。` : '現在はご相談・概算確認の段階で、正式発注や料金は確定しておりません。'}${!c.order && !c.legacyCancellation && !c.settlement && c.selectedOptions.length ? `\n\nご相談仕様（確定前）：${c.selectedOptions.map(item => `${item.question}＝${item.answer}`).join('／')}` : ''}`,
    materials: `${salutation(c.lead)}\n\n支給原料について、原料名・状態・ご用意可能な量をお知らせください。原料は原則1種類まで、当店への発送は元払いです。受入可否や加工可否、価格調整は原料確認後に正式見積でご案内します。お茶は原料支給が必須です。`,
    trial: `${salutation(c.lead)}\n\n初回特典は、1企業につき1回（個人は1名につき1回）で、試作2回まで・原材料表示・栄養成分表示（計算値）・簡易パッケージデザインが対象です。試作費5,000円（税別・税込5,500円）は試作着手前に先入金いただき、入金確認後に試作を開始します。試作のみで終了でき、製造発注の義務はありません。製造に進む場合は別途、製造代金50％の着手金と出荷前精算金が発生し、試作費は製造代金に二重計上しません。通常料金は試作2回まで10,000円、原材料表示5,000円、栄養成分表示（計算値）5,000円、簡易パッケージデザイン30,000円（合計50,000円、すべて税別）です。初回特典ではその他3項目は各0円です。追加試作は1回3,000円（税別）です。${OEM_SPECIAL_INGREDIENT_NOTE}。特典の適用可否は、ご利用状況を確認してご案内します。`,
    payment: `${salutation(c.lead)}\n\n現在の発注状態は「${status}」です。確認済みの支払・精算情報は以下のとおりです。\n${paymentFacts}\n${paymentExplanation}`,
    progress: `${salutation(c.lead)}\n\nご注文の現在の状態は「${status}」です。確認済みの進捗情報は以下のとおりです。\n${progressFacts}\n納期は試作、原料準備、包装仕様、製造状況等により異なるため、確定情報のみ別途ご案内します。`,
    shipping: `${salutation(c.lead)}\n\nご注文の現在の状態は「${status}」です。確認済みの出荷情報は以下のとおりです。\n${shippingFacts}\n${cancelled ? 'キャンセル済みのため、新たな出荷のご案内ではありません。精算内容は確認してご案内します。' : c.fulfillment?.shipped_on ? '上記は記録済みの出荷情報です。' : '出荷前に残額の入金を確認します。出荷予定は確認してご案内します。'}`,
    settlement: `${salutation(c.lead)}\n\n変更・キャンセル精算について、個別発注の規約版・資材手配状況・合意内容を確認してご案内します。\n${settlementFacts}\n${c.settlement?.state === 'draft' ? '現在の精算は下書きであり、確定した請求・返金の案内ではありません。' : c.settlement ? '上記は確認済みの精算情報です。' : '確定した精算情報は現在確認できません。'}`,
  }
  return { source: 'template', templateId: id, snapshot: '', subject: safeSubject(c), text: bodies[id], warnings: c.warnings, sourceMessageId: c.inbound?.id || null, facts }
}
