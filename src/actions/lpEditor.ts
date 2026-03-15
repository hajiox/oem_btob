'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { LpSection } from '@/types/database'

// LP画像一覧を取得
export async function getLpSections(pageId: string): Promise<LpSection[]> {
    if (!pageId) return []
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('lp_sections')
        .select('*')
        .eq('page_id', pageId)
        .order('order_index', { ascending: true })

    if (error) throw error
    return (data ?? []) as LpSection[]
}

// LP画像を追加
export async function addLpSection(pageId: string, imageUrl: string, title: string = '') {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // 現在の最大order_indexを取得
    const { data: existing } = await supabase
        .from('lp_sections')
        .select('order_index')
        .eq('page_id', pageId)
        .order('order_index', { ascending: false })
        .limit(1)

    const nextOrder = existing && existing.length > 0 ? existing[0].order_index + 1 : 0

    const { error } = await supabase
        .from('lp_sections')
        .insert({
            page_id: pageId,
            image_url: imageUrl,
            title: title || null,
            order_index: nextOrder,
            section_type: 'content',
            is_visible: true,
        })

    if (error) return { success: false, error: error.message }
    // ルーティングに合わせて再検証を柔軟にする
    revalidatePath('/', 'layout')
    return { success: true }
}

// LP画像を削除
export async function deleteLpSection(pageId: string, id: string) {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await supabase
        .from('lp_sections')
        .delete()
        .eq('id', id)
        .eq('page_id', pageId)

    if (error) return { success: false, error: error.message }
    revalidatePath('/', 'layout')
    return { success: true }
}

// LP画像の並び順を更新
export async function reorderLpSections(pageId: string, orderedIds: string[]) {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
            .from('lp_sections')
            .update({ order_index: i })
            .eq('id', orderedIds[i])
            .eq('page_id', pageId)

        if (error) return { success: false, error: error.message }
    }

    revalidatePath('/', 'layout')
    return { success: true }
}

// LPセクションの情報を更新
export async function updateLpSection(
    pageId: string,
    id: string,
    updates: {
        title?: string | null
        description?: string | null
        section_type?: LpSection['section_type']
        is_visible?: boolean
    }
) {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    const { error } = await supabase
        .from('lp_sections')
        .update(updates)
        .eq('id', id)
        .eq('page_id', pageId)

    if (error) return { success: false, error: error.message }
    revalidatePath('/', 'layout')
    return { success: true }
}

/** @deprecated updateLpSection を使用してください */
export async function updateLpSectionTitle(pageId: string, id: string, title: string) {
    return updateLpSection(pageId, id, { title })
}

// デフォルト画像をDBに初期登録（シード）する
export async function seedInitialLpSections(pageId: string) {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()

    // すでに画像がある場合は何もしない
    const { count } = await supabase
        .from('lp_sections')
        .select('*', { count: 'exact', head: true })
        .eq('page_id', pageId)

    if (count && count > 0) return { success: true }

    const initialImages = [
        { src: '/images/lp-hero.jpg', alt: '福島の食材を楽天1位の味で。小ロット400個からの地元食材OEM' },
        { src: '/images/lp-problems.jpg', alt: 'OEMは地獄？福島の食材で小ロット・低コスト・簡単フロー' },
        { src: '/images/lp-cases.jpg', alt: '農家・自治体・道の駅ホテルの活用事例' },
        { src: '/images/lp-reasons.jpg', alt: '福島専門のOEMプロ集団が企画から販売までフルサポート' },
        { src: '/images/lp-cta.jpg', alt: '先着10社様限定 今なら初期費用0円' },
    ]

    for (let i = 0; i < initialImages.length; i++) {
        const img = initialImages[i]
        await supabase
            .from('lp_sections')
            .insert({
                page_id: pageId,
                image_url: img.src,
                title: img.alt,
                order_index: i,
                section_type: 'content',
                is_visible: true,
            })
    }

    revalidatePath('/', 'layout')
    return { success: true }
}
