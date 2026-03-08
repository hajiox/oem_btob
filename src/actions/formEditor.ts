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

        const { steps } = data

        // ==========
        // 注意: 簡単のため、「一度すべてのステップ/質問/選択肢を削除して再登録する」か
        // 「削除フラグを使って差分だけ更新する」方法がありますが、
        // ここではデモや初期実装として扱いやすい「ID指定によるUPSERT（上書き更新・挿入）」を基盤にします。
        // 今回は安全のため、現状あるものをすべて取得して、クライアントから送られてこなくなったものをDeleteする方式を取ります。
        // ==========

        // 1. 各項目のUpsert
        const dbSteps = steps.map((s: any) => ({
            id: s.id,
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

        // UPSERT処理
        // 注意: form_questions.depends_on_option_id は form_options を参照する外部キーのため、
        // options が存在しない段階で questions を保存すると制約違反になる。
        // そのため 3段階で保存する:
        //   1. questions を depends_on_option_id=null で保存
        //   2. options を保存
        //   3. depends_on_option_id を持つ questions だけ更新

        // Step 1: form_steps を UPSERT
        if (dbSteps.length > 0) {
            const { error: stepsError } = await supabase.from('form_steps').upsert(dbSteps)
            if (stepsError) throw stepsError
        }

        // Step 2: form_questions を depends_on_option_id=null で UPSERT
        if (dbQuestions.length > 0) {
            const questionsWithoutDeps = dbQuestions.map((q: any) => ({
                ...q,
                depends_on_option_id: null
            }))
            const { error: questionsError } = await supabase.from('form_questions').upsert(questionsWithoutDeps)
            if (questionsError) throw questionsError
        }

        // Step 3: form_options を UPSERT（question_id の参照先が既に存在する）
        if (dbOptions.length > 0) {
            const { error: optionsError } = await supabase.from('form_options').upsert(dbOptions)
            if (optionsError) throw optionsError
        }

        // Step 4: depends_on_option_id を持つ questions だけ更新（option_id の参照先が既に存在する）
        const questionsWithDeps = dbQuestions.filter((q: any) => q.depends_on_option_id)
        if (questionsWithDeps.length > 0) {
            const { error: depsError } = await supabase.from('form_questions').upsert(questionsWithDeps)
            if (depsError) throw depsError
        }

        // ==========
        // 削除処理 (クライアント側で削除済みのアイテムを抽出してDBから消す)
        // 既存のID一覧を取得し、送信されたデータに含まれないものを削除
        // ==========
        if (data.deletedStepIds?.length > 0) {
            await supabase.from('form_steps').delete().in('id', data.deletedStepIds)
        }
        if (data.deletedQuestionIds?.length > 0) {
            await supabase.from('form_questions').delete().in('id', data.deletedQuestionIds)
        }
        if (data.deletedOptionIds?.length > 0) {
            await supabase.from('form_options').delete().in('id', data.deletedOptionIds)
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
