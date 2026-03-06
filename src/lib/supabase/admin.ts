import { createClient } from '@supabase/supabase-js'

// 管理用クライアント（Server Action / API Route のみで使用）
// RLSをバイパスするため、クライアントに絶対に露出させないこと
export const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)
