'use server'

import { revalidatePath } from 'next/cache'
import type { FormOption, FormQuestion, FormStep, Product } from '@/types/database'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ProductPayload = Pick<
    Product,
    'id' | 'page_id' | 'name' | 'description' | 'image_url' | 'base_price' | 'base_price_type' | 'order_index' | 'is_visible'
>

type EditorOption = FormOption
type EditorQuestion = FormQuestion & { options: EditorOption[] }
type EditorStep = FormStep & { questions: EditorQuestion[] }

type SaveFormEditorInput = {
    pageId: string
    products: Product[]
    steps: EditorStep[]
    deletedStepIds: string[]
    deletedQuestionIds: string[]
    deletedOptionIds: string[]
}

type DbStep = Pick<FormStep, 'id' | 'page_id' | 'product_id' | 'order_index' | 'step_title' | 'step_description' | 'is_visible'>
type DbQuestion = Pick<FormQuestion, 'id' | 'step_id' | 'order_index' | 'question_text' | 'input_type' | 'is_required' | 'help_text' | 'depends_on_option_id'>
type DbOption = Pick<FormOption, 'id' | 'question_id' | 'order_index' | 'label' | 'price_modifier' | 'price_modifier_type' | 'is_base_price' | 'description' | 'image_url' | 'next_step_id' | 'go_to_estimate'>

const choiceInputTypes: FormQuestion['input_type'][] = ['radio', 'checkbox', 'select', 'select_text', 'select_number']

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

function toProductPayload(product: Product): ProductPayload {
    return {
        id: product.id,
        page_id: product.page_id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        base_price: product.base_price,
        base_price_type: product.base_price_type,
        order_index: product.order_index,
        is_visible: product.is_visible,
    }
}

async function requireUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function getProducts(pageId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('page_id', pageId)
        .order('order_index')
    if (error) return []
    return data || []
}

export async function saveProduct(product: Product) {
    const user = await requireUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await adminClient.from('products').upsert(toProductPayload(product))
    if (error) return { success: false, error: error.message }
    revalidatePath(`/admin/pages/${product.page_id}/form-editor`)
    revalidatePath('/')
    return { success: true }
}

export async function deleteProduct(productId: string) {
    const user = await requireUser()
    if (!user) return { success: false, error: '認証エラー' }

    try {
        const { data: productSteps, error: stepReadError } = await adminClient
            .from('form_steps')
            .select('id')
            .eq('product_id', productId)
        if (stepReadError) throw stepReadError

        const stepIds = (productSteps || []).map(step => step.id)
        if (stepIds.length > 0) {
            const { data: questions, error: questionReadError } = await adminClient
                .from('form_questions')
                .select('id')
                .in('step_id', stepIds)
            if (questionReadError) throw questionReadError

            const questionIds = (questions || []).map(question => question.id)
            if (questionIds.length > 0) {
                const { error: dependencyError } = await adminClient
                    .from('form_questions')
                    .update({ depends_on_option_id: null })
                    .in('id', questionIds)
                if (dependencyError) throw dependencyError

                const { error: optionDeleteError } = await adminClient
                    .from('form_options')
                    .delete()
                    .in('question_id', questionIds)
                if (optionDeleteError) throw optionDeleteError

                const { error: questionDeleteError } = await adminClient
                    .from('form_questions')
                    .delete()
                    .in('id', questionIds)
                if (questionDeleteError) throw questionDeleteError
            }

            const { error: stepDeleteError } = await adminClient
                .from('form_steps')
                .delete()
                .in('id', stepIds)
            if (stepDeleteError) throw stepDeleteError
        }

        const { error: productDeleteError } = await adminClient.from('products').delete().eq('id', productId)
        if (productDeleteError) throw productDeleteError

        revalidatePath('/')
        return { success: true }
    } catch (error: unknown) {
        return { success: false, error: getErrorMessage(error, '削除に失敗しました') }
    }
}

export async function saveFormEditorData(data: SaveFormEditorInput) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: '認証エラー：権限がありません' }
        if (!data.pageId) return { success: false, error: 'ページIDが指定されていません' }

        const productIds = new Set(data.products.map(product => product.id))
        if (data.products.some(product => product.page_id !== data.pageId)) {
            return { success: false, error: 'ページに属さない商品が含まれています' }
        }
        if (data.steps.some(step => !step.product_id || !productIds.has(step.product_id))) {
            return { success: false, error: '商品に属さない質問があります' }
        }

        for (const product of data.products) {
            const previousOptionIds = new Set<string>()
            const productSteps = data.steps
                .filter(step => step.product_id === product.id)
                .sort((a, b) => a.order_index - b.order_index)
            const stepOrderById = new Map(productSteps.map((step, index) => [step.id, index]))

            for (const [stepIndex, step] of productSteps.entries()) {
                for (const question of step.questions) {
                    if (question.depends_on_option_id && !previousOptionIds.has(question.depends_on_option_id)) {
                        return { success: false, error: `「${step.step_title}」の表示条件が無効です` }
                    }
                    if (choiceInputTypes.includes(question.input_type)) {
                        question.options.forEach(option => previousOptionIds.add(option.id))
                    }
                    for (const option of question.options) {
                        if (option.go_to_estimate && option.next_step_id) {
                            return { success: false, error: `「${option.label}」の行き先が重複しています` }
                        }
                        if (option.next_step_id) {
                            const targetIndex = stepOrderById.get(option.next_step_id)
                            const targetStep = productSteps[targetIndex ?? -1]
                            if (targetIndex === undefined || targetIndex <= stepIndex || !targetStep?.is_visible) {
                                return { success: false, error: `「${option.label}」の行き先STEPが無効です` }
                            }
                        }
                    }
                }
            }
        }

        const dbProducts = data.products.map((product, orderIndex) => ({
            ...toProductPayload(product),
            page_id: data.pageId,
            order_index: orderIndex,
        }))
        const dbSteps: DbStep[] = data.steps.map(step => ({
            id: step.id,
            page_id: data.pageId,
            product_id: step.product_id,
            order_index: step.order_index,
            step_title: step.step_title,
            step_description: step.step_description,
            is_visible: step.is_visible,
        }))
        const dbQuestions: DbQuestion[] = data.steps.flatMap(step =>
            step.questions.map(question => ({
                id: question.id,
                step_id: step.id,
                order_index: question.order_index,
                question_text: question.question_text,
                input_type: question.input_type,
                is_required: question.is_required,
                help_text: question.help_text,
                depends_on_option_id: question.depends_on_option_id || null,
            })),
        )
        const dbOptions: DbOption[] = data.steps.flatMap(step =>
            step.questions.flatMap(question =>
                question.options.map(option => ({
                    id: option.id,
                    question_id: question.id,
                    order_index: option.order_index,
                    label: option.label,
                    price_modifier: option.price_modifier,
                    price_modifier_type: option.price_modifier_type || 'fixed',
                    is_base_price: option.is_base_price,
                    description: option.description,
                    image_url: option.image_url,
                    next_step_id: option.next_step_id || null,
                    go_to_estimate: Boolean(option.go_to_estimate),
                })),
            ),
        )

        if (dbProducts.length > 0) {
            const { error } = await adminClient.from('products').upsert(dbProducts)
            if (error) throw error
        }

        const allQuestionIds = dbQuestions.map(question => question.id)
        if (allQuestionIds.length > 0) {
            const { error } = await adminClient
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', allQuestionIds)
            if (error && !error.message.includes('0 rows')) throw error
        }

        if (data.deletedQuestionIds.length > 0) {
            const { error } = await adminClient
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', data.deletedQuestionIds)
            if (error) throw error
        }

        if (data.deletedOptionIds.length > 0) {
            const { error } = await adminClient
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('depends_on_option_id', data.deletedOptionIds)
            if (error) throw error

            const { error: deleteError } = await adminClient
                .from('form_options')
                .delete()
                .in('id', data.deletedOptionIds)
            if (deleteError) throw deleteError
        }

        if (data.deletedQuestionIds.length > 0) {
            const { error } = await adminClient
                .from('form_questions')
                .delete()
                .in('id', data.deletedQuestionIds)
            if (error) throw error
        }

        if (data.deletedStepIds.length > 0) {
            const { error: routeClearError } = await adminClient
                .from('form_options')
                .update({ next_step_id: null, go_to_estimate: false })
                .in('next_step_id', data.deletedStepIds)
            if (routeClearError) throw routeClearError

            const { error } = await adminClient
                .from('form_steps')
                .delete()
                .in('id', data.deletedStepIds)
            if (error) throw error
        }

        if (dbSteps.length > 0) {
            const { error } = await adminClient.from('form_steps').upsert(dbSteps)
            if (error) throw error
        }

        if (dbQuestions.length > 0) {
            const questionsWithoutDependencies = dbQuestions.map(question => ({
                ...question,
                depends_on_option_id: null,
            }))
            const { error } = await adminClient.from('form_questions').upsert(questionsWithoutDependencies)
            if (error) throw error
        }

        if (dbOptions.length > 0) {
            const { error } = await adminClient.from('form_options').upsert(dbOptions)
            if (error) throw error
        }

        const questionsWithDependencies = dbQuestions.filter(question => question.depends_on_option_id)
        if (questionsWithDependencies.length > 0) {
            const { error } = await adminClient.from('form_questions').upsert(questionsWithDependencies)
            if (error) throw error
        }

        revalidatePath(`/admin/pages/${data.pageId}/form-editor`)
        revalidatePath('/')
        return { success: true }
    } catch (error: unknown) {
        console.error('Save Form Editor Data Error:', error)
        return { success: false, error: getErrorMessage(error, '予期せぬエラーが発生しました') }
    }
}
