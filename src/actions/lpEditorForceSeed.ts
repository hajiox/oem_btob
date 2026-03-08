'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function forceSeedInitialLpSections() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // まず既存のデータをすべて削除
    await supabase.from('lp_sections').delete().neq('id', '00000000-0000-0000-0000-000000000000') // 全件削除のためのハック

    // デフォルト画像リスト
    const initialImages = [
        { src: '/images/lp-hero.jpg', alt: '福島の食材を楽天1位の味で。小ロット400個からの地元食材OEM' },
        { src: '/images/lp-problems.jpg', alt: 'OEMは地獄？福島の食材で小ロット・低コスト・簡単フロー' },
        { src: '/images/lp-cases.jpg', alt: '農家・自治体・道の駅ホテルの活用事例' },
        { src: '/images/lp-reasons.jpg', alt: '福島専門のOEMプロ集団が企画から販売までフルサポート' },
        { src: '/images/lp-cta.jpg', alt: '先着10社様限定 今なら初期費用0円' },
    ]

    // 順番にINSERT
    for (let i = 0; i < initialImages.length; i++) {
        const img = initialImages[i]
        await supabase
            .from('lp_sections')
            .insert({
                image_url: img.src,
                title: img.alt,
                order_index: i,
                section_type: 'content',
                is_visible: true,
            })
    }

    revalidatePath('/')
    revalidatePath('/admin/lp-editor')
    return { success: true }
}
