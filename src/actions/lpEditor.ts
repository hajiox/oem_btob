'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { LpSection } from '@/types/database'

// LP画像一覧を取得
export async function getLpSections(): Promise<LpSection[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('lp_sections')
        .select('*')
        .order('order_index', { ascending: true })

    if (error) throw error
    return (data ?? []) as LpSection[]
}

// LP画像を追加
export async function addLpSection(imageUrl: string, title: string = '') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // 現在の最大order_indexを取得
    const { data: existing } = await supabase
        .from('lp_sections')
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1)

    const nextOrder = existing && existing.length > 0 ? existing[0].order_index + 1 : 0

    const { error } = await supabase
        .from('lp_sections')
        .insert({
            image_url: imageUrl,
            title: title || null,
            order_index: nextOrder,
            section_type: 'content',
            is_visible: true,
        })

    if (error) return { success: false, error: error.message }
    revalidatePath('/')
    revalidatePath('/admin/lp-editor')
    return { success: true }
}

// LP画像を削除
export async function deleteLpSection(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await supabase
        .from('lp_sections')
        .delete()
        .eq('id', id)

    if (error) return { success: false, error: error.message }
    revalidatePath('/')
    revalidatePath('/admin/lp-editor')
    return { success: true }
}

// LP画像の並び順を更新
export async function reorderLpSections(orderedIds: string[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // 各IDにorder_indexを設定
    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from('lp_sections')
            .update({ order_index: i })
            .eq('id', orderedIds[i])

        if (error) return { success: false, error: error.message }
    }

    revalidatePath('/')
    revalidatePath('/admin/lp-editor')
    return { success: true }
}

// LP画像のalt/titleを更新
export async function updateLpSectionTitle(id: string, title: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await supabase
        .from('lp_sections')
        .update({ title })
        .eq('id', id)

    if (error) return { success: false, error: error.message }
    revalidatePath('/')
    revalidatePath('/admin/lp-editor')
    return { success: true }
}
