'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(leadId: string, status: string) {
    const supabase = await createClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return { success: false, error: '認証エラー：権限がありません' }
        }

        const { error } = await supabase
            .from('leads')
            .update({ status })
            .eq('id', leadId)

        if (error) throw error

        revalidatePath('/admin/dashboard')
        return { success: true }
    } catch (error: any) {
        console.error('Update Lead Status Error:', error)
        return { success: false, error: error.message || 'ステータスの更新に失敗しました' }
    }
}
