'use server'

import { createClient } from '@/lib/supabase/server'
import type { FormStep, FormQuestion, FormOption } from '@/types/database'

export type FormStepWithItems = FormStep & {
    questions: (FormQuestion & {
        options: FormOption[]
    })[]
}

export async function getActiveForm(): Promise<FormStepWithItems[]> {
    const supabase = await createClient()

    // 表示設定(is_visible=true)のステップを取得
    const { data: stepsData } = await supabase
        .from('form_steps')
        .select('*')
        .eq('is_visible', true)
        .order('order_index')

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

    return { success: true }
}
