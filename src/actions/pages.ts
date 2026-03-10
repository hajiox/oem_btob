'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Page } from '@/types/database'

export async function getPages(): Promise<Page[]> {
    const supabase = await createClient()
    const { data } = await supabase.from('pages').select('*').order('created_at', { ascending: false })
    return data || []
}

export async function getPageById(id: string): Promise<Page | null> {
    if (!id) return null
    const supabase = await createClient()
    const { data } = await supabase.from('pages').select('*').eq('id', id).single()
    return data || null
}

export async function createPage(slug: string, title: string, description: string = '') {
    const supabase = await createClient()
    const { error } = await supabase.from('pages').insert({ slug, title, description })
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/')
    return { success: true }
}

export async function updatePage(id: string, slug: string, title: string, description: string = '') {
    const supabase = await createClient()
    const { error } = await supabase.from('pages').update({ slug, title, description }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/')
    return { success: true }
}

export async function updatePageSeo(
    id: string,
    data: {
        seo_title?: string | null
        seo_description?: string | null
        og_title?: string | null
        og_description?: string | null
        og_image_url?: string | null
        favicon_url?: string | null
    }
) {
    const supabase = await createClient()
    const { error } = await supabase.from('pages').update(data).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/')
    revalidatePath('/', 'layout')
    return { success: true }
}

export async function deletePage(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/')
    return { success: true }
}

export async function duplicateLpFromPage(sourcePageId: string, targetPageId: string) {
    const supabase = await createClient()

    // ソースLPを取得
    const { data: lpSections } = await supabase.from('lp_sections').select('*').eq('page_id', sourcePageId)
    if (!lpSections || lpSections.length === 0) return { success: false, error: 'コピー元のLPが見つかりません' }

    // ターゲットの既存LPを削除（上書き）
    await supabase.from('lp_sections').delete().eq('page_id', targetPageId)

    // 重複挿入
    const inserts = lpSections.map(s => ({
        page_id: targetPageId,
        order_index: s.order_index,
        section_type: s.section_type,
        image_url: s.image_url,
        title: s.title,
        description: s.description,
        is_visible: s.is_visible
    }))

    const { error } = await supabase.from('lp_sections').insert(inserts)
    if (error) return { success: false, error: error.message }

    revalidatePath('/admin/')
    return { success: true }
}

export async function duplicateFormFromPage(sourcePageId: string, targetPageId: string) {
    const supabase = await createClient()

    // ターゲットの既存フォームを削除
    await supabase.from('form_steps').delete().eq('page_id', targetPageId)

    // ソースを取得してディープコピー
    const { data: stps } = await supabase.from('form_steps').select('*').eq('page_id', sourcePageId).order('order_index')
    if (!stps || stps.length === 0) return { success: false, error: 'コピー元のフォームが見つかりません' }

    // step, question, option の紐付けを保持しながらコピーする必要がある
    for (const step of stps) {
        // 新しいstep作成
        const { data: newStep, error: stepErr } = await supabase.from('form_steps').insert({
            page_id: targetPageId,
            order_index: step.order_index,
            step_title: step.step_title,
            step_description: step.step_description,
            is_visible: step.is_visible
        }).select().single()

        if (stepErr || !newStep) continue

        // questions
        const { data: questions } = await supabase.from('form_questions').select('*').eq('step_id', step.id)
        if (!questions) continue

        // 依存関係（depends_on_option_id）を維持するためのマッピング
        // option の古いID -> 新しいID
        // とりあえず今回は単一ページ内のフォームコピーとして素直に階層コピーする
        // depends_on_option_id は複雑になるため一旦nullにして後で修正する簡易フロー

        for (const q of questions) {
            const { data: newQ, error: qErr } = await supabase.from('form_questions').insert({
                step_id: newStep.id,
                order_index: q.order_index,
                question_text: q.question_text,
                input_type: q.input_type,
                is_required: q.is_required,
                help_text: q.help_text,
                depends_on_option_id: null // 複雑なので一旦クリア
            }).select().single()

            if (qErr || !newQ) continue

            const { data: options } = await supabase.from('form_options').select('*').eq('question_id', q.id)
            if (!options || options.length === 0) continue

            const optsInsert = options.map(o => ({
                question_id: newQ.id,
                order_index: o.order_index,
                label: o.label,
                price_modifier: o.price_modifier,
                is_base_price: o.is_base_price,
                description: o.description,
                image_url: o.image_url
            }))

            await supabase.from('form_options').insert(optsInsert)
        }
    }

    revalidatePath('/admin/')
    return { success: true }
}
