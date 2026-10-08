'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function forceSeedInitialLpSections(pageId: string) {
    if (!pageId) return { success: false, error: 'ページIDが指定されていません' }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '認証エラー' }

    // 現在のページのLPを全削除
    await supabase.from('lp_sections').delete().eq('page_id', pageId)

    // デフォルト画像リスト
    const initialImages = [
        { src: '/images/lp-hero.jpg', alt: '福島の食材を楽天1位の味で。小ロット400個からの地元食材OEM' },
        { src: '/images/lp-problems.jpg', alt: 'OEMは地獄？福島の食材で小ロット・低コスト・簡単フロー' },
        { src: '/images/lp-cases.jpg', alt: '農家・自治体・道の駅ホテルの活用事例' },
        { src: '/images/lp-reasons.jpg', alt: '福島専門のOEMプロ集団が企画から販売までフルサポート' },
        { src: '/images/lp-cta.jpg', alt: '初回特典：試作費10,000円→5,000円（50%OFF）。原材料表示・栄養成分表示・簡易パッケージデザインは各0円。試作で特殊食材の使用の場合は別途お見積りとなります' },
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

    revalidatePath('/')
    return { success: true }
}
