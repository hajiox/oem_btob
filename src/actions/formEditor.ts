'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ========== 商品CRUD ==========
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

export async function saveProduct(product: any) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await supabase.from('products').upsert(product)
    if (error) return { success: false, error: error.message }
    revalidatePath('/')
    return { success: true }
}

export async function deleteProduct(productId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // 商品に紐づくステップのproduct_idをNULLに (orphan防止)
    await supabase.from('form_steps').update({ product_id: null }).eq('product_id', productId)
    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/')
    return { success: true }
}

// ========== フォーム保存 ==========
export async function saveFormEditorData(data: any) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: '認証エラー：権限がありません' }
        }

        const { steps, pageId } = data
        if (!pageId) return { success: false, error: 'ページIDが指定されていません' }

        // 1. 各項目の組み立て (product_id を含む)
        const dbSteps = steps.map((s: any) => ({
            id: s.id,
            page_id: pageId,
            product_id: s.product_id || null,
            order_index: s.order_index,
            step_title: s.step_title,
            step_description: s.step_description,
            is_visible: s.is_visible
        }))

        const dbQuestions: any[] = []
        const dbOptions: any[] = []

        steps.forEach((s: any) => {
            s.questions.forEach((q: any) => {
                dbQuestions.push({
                    id: q.id,
                    step_id: s.id,
                    order_index: q.order_index,
                    question_text: q.question_text,
                    input_type: q.input_type,
                    is_required: q.is_required,
                    help_text: q.help_text,
                    depends_on_option_id: q.depends_on_option_id || null
                })

                q.options.forEach((o: any) => {
                    dbOptions.push({
                        id: o.id,
                        question_id: q.id,
                        order_index: o.order_index,
                        label: o.label,
                        price_modifier: o.price_modifier,
                        price_modifier_type: o.price_modifier_type || 'fixed',
                        is_base_price: o.is_base_price,
                        description: o.description,
                        image_url: o.image_url
                    })
                })
            })
        })

        // 保存順序（外部キー制約を考慮）
        const allQuestionIds = dbQuestions.map((q: any) => q.id)
        if (allQuestionIds.length > 0) {
            const { error: clearError } = await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', allQuestionIds)
            if (clearError && !clearError.message.includes('0 rows')) {
                console.log('Clear depends_on_option_id (non-critical):', clearError.message)
            }
        }

        if (data.deletedQuestionIds?.length > 0) {
            await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', data.deletedQuestionIds)
        }

        if (data.deletedOptionIds?.length > 0) {
            await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('depends_on_option_id', data.deletedOptionIds)
        }

        // 削除処理
        if (data.deletedOptionIds?.length > 0) {
            const { error } = await supabase.from('form_options').delete().in('id', data.deletedOptionIds)
            if (error) throw error
        }
        if (data.deletedQuestionIds?.length > 0) {
            const { error } = await supabase.from('form_questions').delete().in('id', data.deletedQuestionIds)
            if (error) throw error
        }
        if (data.deletedStepIds?.length > 0) {
            const { error } = await supabase.from('form_steps').delete().in('id', data.deletedStepIds)
            if (error) throw error
        }

        // UPSERT
        if (dbSteps.length > 0) {
            const { error } = await supabase.from('form_steps').upsert(dbSteps)
            if (error) throw error
        }

        if (dbQuestions.length > 0) {
            const questionsWithoutDeps = dbQuestions.map((q: any) => ({
                ...q,
                depends_on_option_id: null
            }))
            const { error } = await supabase.from('form_questions').upsert(questionsWithoutDeps)
            if (error) throw error
        }

        if (dbOptions.length > 0) {
            const { error } = await supabase.from('form_options').upsert(dbOptions)
            if (error) throw error
        }

        // depends_on_option_id復元
        const questionsWithDeps = dbQuestions.filter((q: any) => q.depends_on_option_id)
        if (questionsWithDeps.length > 0) {
            const { error } = await supabase.from('form_questions').upsert(questionsWithDeps)
            if (error) throw error
        }

        revalidatePath('/admin/form-editor')
        revalidatePath('/')

        return { success: true }
    } catch (error: any) {
        console.error('Save Form Editor Data Error:', error)
        return { success: false, error: error.message || '予期せぬエラーが発生しました' }
    }
}
