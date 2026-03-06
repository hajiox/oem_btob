'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export interface AuthState {
    error?: string
    message?: string
}

export async function signIn(
    prevState: AuthState,
    formData: FormData
): Promise<AuthState> {
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) {
        return { error: 'メールアドレスとパスワードを入力してください' }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return { error: 'メールアドレスまたはパスワードが正しくありません' }
    }

    redirect('/admin/dashboard')
}

export async function signOut(): Promise<void> {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/admin/login')
}
