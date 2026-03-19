'use server'

import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/types/database'

export async function getLeads(pageId?: string | null): Promise<{ leads: Lead[]; total: number }> {
    const supabase = await createClient()

    let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(50)

    if (pageId) {
        query = query.eq('page_id', pageId)
    }

    const { data, count } = await query

    return {
        leads: (data ?? []) as Lead[],
        total: count ?? 0,
    }
}
