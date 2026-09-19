'use server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'
import { dispatchOemMail } from '@/lib/oem-mail'

async function requireAdmin() {
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) throw new Error('認証が必要です。再ログインしてください。')
    return user
}
export async function getOemMailStatus(leadId: string) {
    await requireAdmin()
    const { data: lead } = await adminClient.from('leads').select('id').eq('id', leadId).eq('page_id', OEM_PAGE_ID).single()
    if (!lead) throw new Error('対象のOEM案件が見つかりません。')
    const { data, error } = await adminClient.from('oem_mail_deliveries').select('id,kind,status,attempts,updated_at,error_code,provider_id').eq('lead_id', leadId).order('kind')
    if (error) throw new Error('メール状況を取得できませんでした。')
    return data || []
}
export async function retryOemMail(deliveryId: string) {
    try {
        await requireAdmin()
        const { data: delivery } = await adminClient.from('oem_mail_deliveries').select('lead_id').eq('id', deliveryId).single()
        if (!delivery) throw new Error('送信記録が見つかりません。')
        const { data: lead } = await adminClient.from('leads').select('id').eq('id', delivery.lead_id).eq('page_id', OEM_PAGE_ID).single()
        if (!lead) throw new Error('対象のOEM案件が見つかりません。')
        await dispatchOemMail(deliveryId)
        return { success: true }
    } catch {
        return { success: false, error: '再送できませんでした。ログイン状態とメール設定を確認してください。' }
    }
}
