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

    // 表示設定(is_visible=true)のステップを取得
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

    // 関連する質問を取得
    const { data: questionsData } = await supabase
        .from('form_questions')
        .select('*')
        .in('step_id', stepIds)
        .order('order_index')

    const questions = questionsData || []
    const questionIds = questions.map(q => q.id)

    // 関連する選択肢を取得
    const { data: optionsData } = await supabase
        .from('form_options')
        .select('*')
        .in('question_id', questionIds)
        .order('order_index')

    // ツリー構造に組み立てる
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
        
        // 1. お客様への自動返信
        await resend.emails.send({
            from: 'OEM自動見積り <onboarding@resend.dev>', // ドメイン認証後は info@yourdomain.com 等に変更可能
            to: formData.email,
            subject: '【自動回答】お見積り依頼を承りました',
            html: `
                <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
                    <p>${formData.companyName} ${formData.contactName} 様</p>
                    <p>この度はお見積りシミュレーションをご利用いただき、誠にありがとうございます。</p>
                    <p>以下の内容で承りました。内容を確認の上、担当者より3営業日以内にご連絡させていただきます。</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <h3 style="color: #6366f1;">概算お見積り内容</h3>
                    <p><strong>概算総額:</strong> ¥${formData.estimatedTotalPrice.toLocaleString()}（税込）</p>
                    <p><strong>ご回答内容の抜粋:</strong></p>
                    <ul style="padding-left: 20px;">
                        ${formData.selectedOptions.map((opt: any) => `<li><strong>${opt.question}:</strong> ${opt.answer}</li>`).join('')}
                    </ul>
                    <p><strong>備考事項:</strong><br>${formData.notes || 'なし'}</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">※本メールは自動送信されています。お心当たりのない場合は破棄してください。</p>
                </div>
            `
        })

        // 2. 管理者への通知 (Aizu TV様)
        await resend.emails.send({
            from: 'OEM System Notification <onboarding@resend.dev>',
            to: 'staff@aizu-tv.com', // 管理者通知先を更新
            subject: '【新規リード獲得】新しいお見積り依頼が届きました',
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>新しいリードを獲得しました</h2>
                    <p>管理画面から詳細を確認してください。</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; border: 1px solid #eee;">会社名</td><td style="padding: 8px; border: 1px solid #eee;">${formData.companyName}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">担当者</td><td style="padding: 8px; border: 1px solid #eee;">${formData.contactName}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">メール</td><td style="padding: 8px; border: 1px solid #eee;">${formData.email}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #eee;">概算見積額</td><td style="padding: 8px; border: 1px solid #eee;">¥${formData.estimatedTotalPrice.toLocaleString()}</td></tr>
                    </table>
                    <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}/admin/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 5px; margin-top: 20px;">管理画面で確認する</a></p>
                </div>
            `
        })

    } catch (mailError) {
        // メール送信エラーは致命的ではないため、ログ出力のみして処理を続行
        console.error('Email notification error:', mailError)
    }

    return { success: true }
}
