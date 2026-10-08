import { Resend } from 'resend'
import { adminClient } from '@/lib/supabase/admin'
import { OEM_SPECIAL_INGREDIENT_NOTE } from '@/lib/oem-offer-pricing'

export type OemMailPayload = { from: string; to: string; subject: string; html: string; replyTo?: string }
export type OemMailPayloads = { customer: OemMailPayload; admin: OemMailPayload }
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export async function buildOemMailPayloads(input: {
    pageId: string; companyName: string; contactName: string; email: string; phone: string;
    notes: string; estimatedTotalPrice: number; selectedOptions: unknown;
}): Promise<OemMailPayloads> {
    const { data: page, error } = await adminClient.from('pages').select('email_from_name,email_from_address,admin_notification_email,customer_email_subject,admin_email_subject,customer_email_intro,customer_email_closing,admin_email_intro').eq('id', input.pageId).single()
    if (error || !page) throw new Error('mail_settings_unavailable')
    const fromAddress = page.email_from_address || 'staff@aizu-tv.com'
    const paragraphs = (text: string) => escapeHtml(text).split('\n').map(line => `<p>${line}</p>`).join('')
    const specialIngredientNotice = paragraphs(OEM_SPECIAL_INGREDIENT_NOTE)
    const answers = (Array.isArray(input.selectedOptions) ? input.selectedOptions : []).map(opt => `<li><strong>${escapeHtml(opt.question ?? opt.question_text ?? opt.step_title)}:</strong> ${escapeHtml(opt.answer ?? opt.selected_label)}</li>`).join('')
    const details = `<h3>概算お見積り内容</h3><p>製造概算：¥${input.estimatedTotalPrice.toLocaleString()}（税別・試作費別）</p><p>初回特典は1企業（個人は1名）につき1回限りです。試作費5,000円（税別・税込5,500円）は試作着手前に全額先入金いただき、入金確認後に試作を開始します。試作は2回までで、試作のみで終了でき、製造発注の義務はありません。原材料表示・栄養成分表示（計算値）・簡易パッケージデザインは各0円です。初回特典対象外の場合は通常料金が適用されます。製造へ進む場合は、試作費とは別に製造代金50％の着手金と、完成数量確定後の出荷前精算金が発生します。試作費は製造代金に二重計上しません。追加試作は1回3,000円（税別）です。${OEM_SPECIAL_INGREDIENT_NOTE}。原料・製造費・送料は特典対象外です。</p><p>販売シミュレーションの粗利率・粗利は商品原価ベースの参考値で、試作・表示・デザインの初回費用、送料・発送梱包手数料、販売手数料、消費税などを含みません。</p><ul>${answers}</ul><p>ご要望：<br>${escapeHtml(input.notes || 'なし').replace(/\n/g, '<br>')}</p>`
    return {
        customer: {
            from: `${page.email_from_name || 'OEM自動見積り'} <${fromAddress}>`, to: input.email,
            subject: page.customer_email_subject || '【自動回答】お見積り依頼を承りました', replyTo: fromAddress,
            html: `<div style="font-family:sans-serif;line-height:1.8"><p>${escapeHtml(input.companyName)} ${escapeHtml(input.contactName)} 様</p>${paragraphs(page.customer_email_intro || 'ご相談を承りました。担当者より3営業日以内にご連絡します。')}${details}${specialIngredientNotice}${paragraphs(page.customer_email_closing || '本メールは自動送信です。')}</div>`,
        },
        admin: {
            from: `OEM System Notification <${fromAddress}>`, to: page.admin_notification_email || fromAddress,
            subject: page.admin_email_subject || '【新規リード獲得】新しいお見積り依頼が届きました', replyTo: input.email,
            html: `<div style="font-family:sans-serif;line-height:1.8">${paragraphs(page.admin_email_intro || 'OEMのご相談が届きました。')}<p>${escapeHtml(input.companyName)} / ${escapeHtml(input.contactName)}</p><p>メール：${escapeHtml(input.email)}<br>電話：${escapeHtml(input.phone || '未登録')}</p>${details}${specialIngredientNotice}<p><a href="${escapeHtml(process.env.NEXT_PUBLIC_BASE_URL || 'https://oem.aizubrandhall.com')}/admin/dashboard">管理画面で確認</a></p></div>`,
        },
    }
}

export async function dispatchOemMail(deliveryId: string) {
    const { data, error } = await adminClient.rpc('claim_oem_mail', { p_id: deliveryId })
    if (error) throw new Error('mail_claim_failed')
    const delivery = data?.[0]
    if (!delivery) return
    let result: { status: string; provider_id?: string; error_code?: string }
    try {
        if (!process.env.RESEND_API_KEY) {
            result = { status: 'failed', error_code: 'sender_not_configured' }
        } else {
            const response = await new Resend(process.env.RESEND_API_KEY).emails.send(delivery.payload as OemMailPayload, { idempotencyKey: `oem/${delivery.id}/${delivery.attempt_key}` })
            // Server/provider failures can be ambiguous: retain the same key on retry.
            result = response.error
                ? { status: ['validation_error', 'missing_required_field', 'invalid_access', 'restricted_api_key', 'invalid_api_key'].includes(response.error.name) ? 'failed' : 'unknown', error_code: response.error.name }
                : response.data?.id ? { status: 'sent', provider_id: response.data.id } : { status: 'unknown', error_code: 'empty_provider_result' }
        }
    } catch {
        result = { status: 'unknown', error_code: 'provider_connection_error' }
    }
    const saved = await adminClient.from('oem_mail_deliveries').update({ ...result, updated_at: new Date().toISOString() }).eq('id', deliveryId).eq('attempt_key', delivery.attempt_key).eq('status', 'sending')
    if (saved.error) throw new Error('mail_status_save_failed')
}

export async function dispatchOemLeadMail(leadId: string) {
    const { data, error } = await adminClient.from('oem_mail_deliveries').select('id').eq('lead_id', leadId).neq('status', 'sent')
    if (error) throw new Error('mail_queue_unavailable')
    // Independent attempts: a customer-mail failure must not suppress the admin mail.
    const results = await Promise.allSettled((data || []).map(row => dispatchOemMail(row.id)))
    if (results.some(result => result.status === 'rejected')) console.error('OEM mail status requires attention', { leadId })
}
