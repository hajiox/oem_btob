import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import FormEditorClient from './FormEditorClient'
import type { FormStep, FormQuestion, FormOption, Product } from '@/types/database'

export const metadata: Metadata = {
    title: 'フォームエディタ | OEM管理',
}

export default async function FormEditorPage({ params }: { params: { pageId: string } }) {
    const { pageId } = await params
    const supabase = await createClient()

    const { data: pageData } = await supabase
        .from('pages')
        .select('slug')
        .eq('id', pageId)
        .single()
    const slug = pageData?.slug || ''

    const { data: stepsData } = await supabase
        .from('form_steps')
        .select('*')
        .eq('page_id', pageId)
        .order('order_index')

    const steps = (stepsData ?? []) as FormStep[]

    const { data: questionsData } = await supabase
        .from('form_questions')
        .select('*')
        .order('order_index')

    const questions = (questionsData ?? []) as FormQuestion[]

    const { data: optionsData } = await supabase
        .from('form_options')
        .select('*')
        .order('order_index')

    const options = (optionsData ?? []) as FormOption[]

    const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('page_id', pageId)
        .order('order_index')

    const products = (productsData ?? []) as Product[]

    return (
        <FormEditorClient
            initialSteps={steps}
            initialQuestions={questions}
            initialOptions={options}
            initialProducts={products}
            pageId={pageId}
            slug={slug}
        />
    )
}

