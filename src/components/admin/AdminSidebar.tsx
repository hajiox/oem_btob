'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/actions/auth'

const navItems = [
    {
        href: '/admin/dashboard',
        label: 'ダッシュボード',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
    },
    {
        href: '/admin/lp-editor',
        label: 'LPエディタ',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
        ),
    },
    {
        href: '/admin/form-editor',
        label: 'フォームエディタ',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
        ),
    },
]

export function AdminSidebar() {
    const pathname = usePathname()

    return (
        <aside
            className="fixed left-0 top-0 bottom-0 w-64 flex flex-col border-r z-40"
            style={{
                background: 'var(--admin-sidebar)',
                borderColor: 'var(--admin-border)',
            }}
        >
            {/* ロゴ */}
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--admin-border)' }}>
                <Link href="/admin/dashboard" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--admin-accent)] to-[var(--color-accent)] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                        <span className="text-sm">🍽️</span>
                    </div>
                    <div>
                        <span className="text-sm font-bold text-white block leading-tight">OEM管理</span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">Admin Panel</span>
                    </div>
                </Link>
            </div>

            {/* ナビゲーション */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive
                                    ? 'text-white shadow-md'
                                    : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5'
                                }`}
                            style={isActive ? { background: 'var(--admin-accent)' } : undefined}
                        >
                            <span className={`${isActive ? 'text-white' : 'text-[var(--color-text-muted)] group-hover:text-white'} transition-colors`}>
                                {item.icon}
                            </span>
                            {item.label}
                        </Link>
                    )
                })}
            </nav>

            {/* ログアウト */}
            <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--admin-border)' }}>
                <form action={signOut}>
                    <button
                        type="submit"
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--admin-danger)] hover:bg-red-500/5 transition-all duration-200 w-full"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        ログアウト
                    </button>
                </form>
            </div>
        </aside>
    )
}
