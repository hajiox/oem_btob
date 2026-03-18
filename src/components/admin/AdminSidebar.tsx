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
            <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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
                width: '260px',
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
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--admin-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '14px', color: '#fff' }}>🍽️</span>
                    </div>
                    <div>
                        <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--admin-accent)', display: 'block', lineHeight: '1.2', letterSpacing: '0.02em' }}>OEM PLATFORM</span>
                        <span style={{ fontSize: '10px', fontWeight: '500', color: 'var(--admin-text-muted)', letterSpacing: '0.02em' }}>会津ブランド館</span>
                    </div>
                </Link>
            </div>

            {/* ナビゲーション */}
            <nav style={{ flex: 1, padding: '24px 16px', overflowY: 'auto' }}>
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
                                    padding: '12px 20px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 700 : 500,
                                    textDecoration: 'none',
                                    transition: 'all 0.1s ease',
                                    color: isActive ? '#fff' : 'var(--admin-text-muted)',
                                    background: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                                    borderLeft: isActive ? '3px solid var(--admin-accent)' : '3px solid transparent',
                                    marginLeft: '-1px', // Borderを少し外に出す
                                }}
                            >
                                <span style={{ color: isActive ? 'var(--admin-accent)' : 'var(--admin-text-muted)', display: 'flex', alignItems: 'center' }}>
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
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                            color: 'var(--admin-text-muted)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            transition: 'all 0.2s ease',
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
