'use server'

import { createClient } from '@/lib/supabase/server'
import type { FormStep, FormQuestion, FormOption } from '@/types/database'
import { Resend } from 'resend'

export type FormStepWithItems = FormStep & {
    questions: (FormQuestion & {
        options: FormOption[]
    })[]
}

export async function getActiveForm(pageId?: string): Promise<FormStepWithItems[]> {
    const supabase = await createClient()

    let query = supabase
        .from('form_steps')
        .select('*')
        .eq('is_visible', true)
        .order('order_index')

    if (pageId) {
        query = query.eq('page_id', pageId)
    }

    const { data: stepsData } = await query

    if (!stepsData || stepsData.length === 0) return []

    const stepIds = stepsData.map(s => s.id)

    const { data: questionsData } = await supabase
        .from('form_questions')
        .select('*')
        .in('step_id', stepIds)
        .order('order_index')

    const questions = questionsData || []
    const questionIds = questions.map(q => q.id)

    const { data: optionsData } = await supabase
        .from('form_options')
        .select('*')
        .in('question_id', questionIds)
        .order('order_index')

    return stepsData.map((step) => ({
        ...step,
        questions: questions
            .filter((q) => q.step_id === step.id)
            .map((q) => ({
                ...q,
                options: (optionsData || []).filter((o) => o.question_id === q.id)
            }))
    }))
}

// 商品一覧取得（公開用）
export async function getPublicProducts(pageId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('products')
        .select('*')
        .eq('page_id', pageId)
        .eq('is_visible', true)
        .order('order_index')
    return data || []
}

// 商品別フォームステップ取得
export async function getFormStepsForProduct(pageId: string, productId: string): Promise<FormStepWithItems[]> {
    const supabase = await createClient()

    // 対象商品のステップ + 共通ステップ(product_id IS NULL) を取得
    const { data: stepsData } = await supabase
        .from('form_steps')
        .select('*')
        .eq('page_id', pageId)
        .eq('is_visible', true)
        .or(`product_id.eq.${productId},product_id.is.null`)
        .order('order_index')

    if (!stepsData || stepsData.length === 0) return []

    const stepIds = stepsData.map(s => s.id)

    const { data: questionsData } = await supabase
        .from('form_questions')
        .select('*')
        .in('step_id', stepIds)
        .order('order_index')

    const questions = questionsData || []
    const questionIds = questions.map(q => q.id)

    const { data: optionsData } = await supabase
        .from('form_options')
        .select('*')
        .in('question_id', questionIds)
        .order('order_index')

    return stepsData.map((step) => ({
        ...step,
        questions: questions
            .filter((q) => q.step_id === step.id)
            .map((q) => ({
                ...q,
                options: (optionsData || []).filter((o) => o.question_id === q.id)
            }))
    }))
}

export async function submitLead(formData: {
    pageId?: string
    companyName: string
    contactName: string
    email: string
    phone: string
    selectedOptions: any
    estimatedTotalPrice: number
    notes: string
}) {
    const supabase = await createClient()

    const { error } = await supabase.from('leads').insert([{
        page_id: formData.pageId || null,
        company_name: formData.companyName,
        contact_name: formData.contactName,
        email: formData.email,
        phone: formData.phone || null,
        selected_options: formData.selectedOptions,
        estimated_total_price: formData.estimatedTotalPrice,
        notes: formData.notes || null,
        status: 'new' // 初期ステータス
    }])

    if (error) {
        console.error('Lead Submission Error:', error)
        return { success: false, error: '送信に失敗しました。少し時間をおいて再度お試しください。' }
    }

    // --- 自動メール送信処理 (Resend) ---
    try {
        const resend = new Resend(process.env.RESEND_API_KEY)

        // ページ固有のメール設定を取得
        let emailFromName = 'OEM自動見積り'
        let emailFromAddress = 'staff@aizu-tv.com'
        let adminEmail = 'staff@aizu-tv.com'
        let customerSubject = '【自動回答】お見積り依頼を承りました'
        let adminSubject = '【新規リード獲得】新しいお見積り依頼が届きました'
        let customerIntro = 'この度はお見積りシミュレーションをご利用いただき、誠にありがとうございます。\n以下の内容で承りました。内容を確認の上、担当者より3営業日以内にご連絡させていただきます。'
        let customerClosing = '※本メールは自動送信されています。お心当たりのない場合は破棄してください。'
        let adminIntro = '新しいリードを獲得しました。管理画面から詳細を確認してください。'

        if (formData.pageId) {
            const { data: pageData } = await supabase.from('pages').select('email_from_name, email_from_address, admin_notification_email, customer_email_subject, admin_email_subject, customer_email_intro, customer_email_closing, admin_email_intro').eq('id', formData.pageId).single()
            if (pageData) {
                emailFromName = pageData.email_from_name || emailFromName
                emailFromAddress = pageData.email_from_address || emailFromAddress
                adminEmail = pageData.admin_notification_email || adminEmail
                customerSubject = pageData.customer_email_subject || customerSubject
                adminSubject = pageData.admin_email_subject || adminSubject
                customerIntro = pageData.customer_email_intro || customerIntro
                customerClosing = pageData.customer_email_closing || customerClosing
                adminIntro = pageData.admin_email_intro || adminIntro
            }
        }
        
        // 改行をHTMLのbrタグに変換
        const introHtml = customerIntro.split('\n').map(line => `<p>${line}</p>`).join('')
        const closingHtml = customerClosing.split('\n').map(line => `<p>${line}</p>`).join('')
        const adminIntroHtml = adminIntro.split('\n').map(line => `<p>${line}</p>`).join('')

        // 1. お客様への自動返信
        const customerResult = await resend.emails.send({
            from: `${emailFromName} <${emailFromAddress}>`,
            to: formData.email,
            subject: customerSubject,
            html: `
                <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
                    <p>${formData.companyName} ${formData.contactName} 様</p>
                    ${introHtml}
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <h3 style="color: #6366f1;">概算お見積り内容</h3>
                    <p><strong>概算総額:</strong> ¥${formData.estimatedTotalPrice.toLocaleString()}（税込）</p>
                    <p><strong>ご回答内容の抜粋:</strong></p>
                    <ul style="padding-left: 20px;">
                        ${formData.selectedOptions.map((opt: any) => `<li><strong>${opt.question}:</strong> ${opt.answer}</li>`).join('')}
                    </ul>
                    <p><strong>備考事項:</strong><br>${formData.notes || 'なし'}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">${closingHtml}</p>
                </div>
            `
        })

        if (customerResult.error) {
            console.error('Customer email failed:', customerResult.error)
        }

        // 2. 管理者への通知
        const adminResult = await resend.emails.send({
            from: `OEM System Notification <${emailFromAddress}>`,
            to: adminEmail,
            subject: adminSubject,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    ${adminIntroHtml}
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; border: 1px solid #eee;">会社名</td><td style="padding: 8px; border: 1px solid #eee;">${formData.companyName}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">担当者</td><td style="padding: 8px; border: 1px solid #eee;">${formData.contactName}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">メール</td><td style="padding: 8px; border: 1px solid #eee;">${formData.email}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">概算見積額</td><td style="padding: 8px; border: 1px solid #eee;">¥${formData.estimatedTotalPrice.toLocaleString()}</td></tr>
                    </table>
                    <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://oem.aizubrandhall.com'}/admin/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 5px; margin-top: 20px;">管理画面で確認する</a></p>
                </div>
            `
        })

        if (adminResult.error) {
            console.error('Admin notification email failed:', adminResult.error)
        }

    } catch (mailError) {
        // 例外キャッチ
        console.error('Email notification exception:', mailError)
    }

    return { success: true }
}
