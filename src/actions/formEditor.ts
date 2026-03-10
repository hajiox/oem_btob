'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveFormEditorData(data: any) {
    const supabase = await createClient()

    try {
        // 認証チェック
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: '認証エラー：権限がありません' }
        }

        const { steps, pageId } = data
        if (!pageId) return { success: false, error: 'ページIDが指定されていません' }

        // 1. 各項目の組み立て
        const dbSteps = steps.map((s: any) => ({
            id: s.id,
            page_id: pageId,
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
                        is_base_price: o.is_base_price,
                        description: o.description,
                        image_url: o.image_url
                    })
                })
            })
        })

        // ==========
        // 保存順序（外部キー制約を考慮）:
        //   form_questions.depends_on_option_id → form_options.id
        //   form_options.question_id → form_questions.id
        //   form_questions.step_id → form_steps.id
        //
        // 安全な順序:
        //   1. 全questionsのdepends_on_option_idをnullにクリア (DB上の既存データがFK違反しないように)
        //   2. 削除: options → questions → steps (参照される側を後に)
        //   3. UPSERT: steps → questions(null) → options
        //   4. depends_on_option_idを復元
        // ==========

        // Step 1: DB上の全questionsのdepends_on_option_idをnullにクリア
        // これにより、削除やUPSERT時にFK制約違反が起きなくなる
        const allQuestionIds = dbQuestions.map((q: any) => q.id)
        if (allQuestionIds.length > 0) {
            const { error: clearError } = await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', allQuestionIds)
            // 新規questionはまだDB上に存在しないのでエラーを無視
            if (clearError && !clearError.message.includes('0 rows')) {
                console.log('Clear depends_on_option_id (non-critical):', clearError.message)
            }
        }

        // 削除予定のquestionのdepends_on_option_idもクリア
        if (data.deletedQuestionIds?.length > 0) {
            await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('id', data.deletedQuestionIds)
        }

        // また、削除予定のoptionを参照しているquestionのdepends_on_option_idもクリア
        if (data.deletedOptionIds?.length > 0) {
            await supabase
                .from('form_questions')
                .update({ depends_on_option_id: null })
                .in('depends_on_option_id', data.deletedOptionIds)
        }

        // Step 2: 削除処理（参照する側を先に削除）
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

        // Step 3: UPSERT (steps → questions(depends_on_option_id=null) → options)
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

        // Step 4: depends_on_option_idを復元（optionsがすべて存在する状態で安全に設定）
        const questionsWithDeps = dbQuestions.filter((q: any) => q.depends_on_option_id)
        if (questionsWithDeps.length > 0) {
            const { error } = await supabase.from('form_questions').upsert(questionsWithDeps)
            if (error) throw error
        }

        // 保存完了後、キャッシュを再検証して即座に画面に反映させる
        revalidatePath('/admin/form-editor')
        revalidatePath('/')

        return { success: true }
    } catch (error: any) {
        console.error('Save Form Editor Data Error:', error)
        return { success: false, error: error.message || '予期せぬエラーが発生しました' }
    }
}
