import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import FormEditorClient from './FormEditorClient'
import type { FormStep, FormQuestion, FormOption } from '@/types/database'

export const metadata: Metadata = {
    title: 'フォームエディタ | OEM管理',
}

export default async function FormEditorPage() {
    const supabase = await createClient()

    // 1. ステップを取得
    const { data: stepsData } = await supabase
        .from('form_steps')
        .select('*')
        .order('order_index')

    const steps = (stepsData ?? []) as FormStep[]

    // 2. 質問を取得
    const { data: questionsData } = await supabase
        .from('form_questions')
        .select('*')
        .order('order_index')

    const questions = (questionsData ?? []) as FormQuestion[]

    // 3. 選択肢を取得
    const { data: optionsData } = await supabase
        .from('form_options')
        .select('*')
        .order('order_index')

    const options = (optionsData ?? []) as FormOption[]

    return (
        <FormEditorClient
            initialSteps={steps}
            initialQuestions={questions}
            initialOptions={options}
        />
    )
}
