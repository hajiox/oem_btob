'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/actions/auth'

const navItems = [
    {
        href: '/admin/dashboard',
        label: 'ダッシュボード',
        icon: (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
    },
    {
        href: '/admin/lp-editor',
        label: 'LPエディタ',
        icon: (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
        ),
    },
    {
        href: '/admin/form-editor',
        label: 'フォームエディタ',
        icon: (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
        ),
    },
]

export function AdminSidebar() {
    const pathname = usePathname()

    return (
        <aside
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                width: '256px',
                display: 'flex',
                flexDirection: 'column',
                borderRight: '1px solid var(--admin-border)',
                zIndex: 40,
                background: 'var(--admin-sidebar)',
            }}
        >
            {/* ロゴ */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--admin-border)' }}>
                <Link href="/admin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--admin-accent), var(--color-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                        <span style={{ fontSize: '14px' }}>🍽️</span>
                    </div>
                    <div>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', display: 'block', lineHeight: '1.2' }}>OEM管理</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Admin Panel</span>
                    </div>
                </Link>
            </div>

            {/* ナビゲーション */}
            <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 16px',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    textDecoration: 'none',
                                    transition: 'all 0.2s',
                                    color: isActive ? '#fff' : 'var(--color-text-muted)',
                                    background: isActive ? 'var(--admin-accent)' : 'transparent',
                                    boxShadow: isActive ? '0 4px 6px rgba(0,0,0,0.2)' : 'none',
                                }}
                            >
                                <span style={{ color: isActive ? '#fff' : 'var(--color-text-muted)' }}>
                                    {item.icon}
                                </span>
                                {item.label}
                            </Link>
                        )
                    })}
                </div>
            </nav>

            {/* ログアウト */}
            <div style={{ padding: '16px 12px', borderTop: '1px solid var(--admin-border)' }}>
                <form action={signOut}>
                    <button
                        type="submit"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 16px',
                            borderRadius: '12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--color-text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.2s',
                        }}
                    >
                        <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        ログアウト
                    </button>
                </form>
            </div>
        </aside>
    )
}
