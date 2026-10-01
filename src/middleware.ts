import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
    // Bearer customer links must not leak in referrers or shared caches. These
    // routes do not need a Supabase login refresh and load no marketing tags.
    if (/^\/btob\/(order|invoice|approval|progress|document)\//.test(request.nextUrl.pathname)) {
        const response = NextResponse.next({ request })
        response.headers.set('Cache-Control', 'private, no-store, max-age=0')
        response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
        response.headers.set('Referrer-Policy', 'no-referrer')
        response.headers.set('X-Content-Type-Options', 'nosniff')
        response.headers.set('X-Frame-Options', 'DENY')
        return response
    }
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // セッションのリフレッシュ
    const { data: { user } } = await supabase.auth.getUser()

    // /admin 配下は認証必須（/admin/login は除外）
    if (
        request.nextUrl.pathname.startsWith('/admin') &&
        !request.nextUrl.pathname.startsWith('/admin/login') &&
        !user
    ) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/login'
        return NextResponse.redirect(url)
    }

    // 認証済みユーザーがログインページにアクセスしたらダッシュボードへ
    if (request.nextUrl.pathname === '/admin/login' && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/dashboard'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
