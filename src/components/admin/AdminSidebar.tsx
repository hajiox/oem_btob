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
        href: '/admin/pages',
        label: 'ページ管理',
        icon: (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
        ),
    }
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
            <div style={{ padding: '24px 24px', borderBottom: '1px solid var(--admin-border)' }}>
                <Link href="/admin/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--admin-accent), var(--color-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                        <span style={{ fontSize: '14px' }}>🍽️</span>
                    </div>
                    <div>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', display: 'block', lineHeight: '1.2', letterSpacing: '0.06em' }}>フォームLPシステム</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>Admin Panel</span>
                    </div>
                </Link>
            </div>

            {/* ナビゲーション */}
            <nav style={{ flex: 1, padding: '20px 12px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    textDecoration: 'none',
                                    transition: 'all 0.2s',
                                    letterSpacing: '0.05em',
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
            <div style={{ padding: '20px 12px', borderTop: '1px solid var(--admin-border)' }}>
                <form action={signOut}>
                    <button
                        type="submit"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            letterSpacing: '0.05em',
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
