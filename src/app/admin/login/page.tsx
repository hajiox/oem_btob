'use client'

import { useActionState } from 'react'
import { signIn, type AuthState } from '@/actions/auth'

const initialState: AuthState = {}

export default function LoginPage() {
    const [state, formAction, isPending] = useActionState(signIn, initialState)

    return (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--admin-bg)' }}>
            {/* 背景装飾 */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(233,69,96,0.05),transparent_60%)]" />

            <div className="relative w-full max-w-md">
                {/* ロゴ */}
                <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '80px',
                            height: '80px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, var(--admin-accent), var(--color-accent))',
                            marginBottom: '24px',
                            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.3)',
                        }}
                    >
                        <span style={{ fontSize: '32px' }}>🍽️</span>
                    </div>
                    <h1
                        style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: '28px',
                            fontWeight: 700,
                            color: 'white',
                            letterSpacing: '0.08em',
                            marginBottom: '12px',
                        }}
                    >
                        管理者ログイン
                    </h1>
                    <p
                        style={{
                            fontSize: '14px',
                            color: 'var(--color-text-muted)',
                            letterSpacing: '0.06em',
                        }}
                    >
                        食品OEM管理システムにサインイン
                    </p>
                </div>

                {/* ログインフォーム */}
                <div
                    className="rounded-2xl border"
                    style={{
                        background: 'var(--admin-card)',
                        borderColor: 'var(--admin-border)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 60px rgba(99, 102, 241, 0.06)',
                        padding: '44px 40px',
                    }}
                >
                    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {/* エラー表示 */}
                        {state.error && (
                            <div className="p-4 rounded-xl text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--admin-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                ⚠️ {state.error}
                            </div>
                        )}

                        {/* メールアドレス */}
                        <div>
                            <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '10px', letterSpacing: '0.05em' }}>
                                メールアドレス
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="w-full rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)] transition-all"
                                style={{
                                    background: 'var(--admin-bg)',
                                    border: '1px solid var(--admin-border)',
                                    padding: '15px 20px',
                                    fontSize: '15px',
                                    color: 'white',
                                    letterSpacing: '0.03em',
                                }}
                                placeholder="admin@example.com"
                            />
                        </div>

                        {/* パスワード */}
                        <div>
                            <label htmlFor="password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '10px', letterSpacing: '0.05em' }}>
                                パスワード
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                className="w-full rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)] transition-all"
                                style={{
                                    background: 'var(--admin-bg)',
                                    border: '1px solid var(--admin-border)',
                                    padding: '15px 20px',
                                    fontSize: '15px',
                                    color: 'white',
                                    letterSpacing: '0.03em',
                                }}
                                placeholder="••••••••"
                            />
                        </div>

                        {/* ログインボタン */}
                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full rounded-xl font-bold text-white transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                            style={{
                                background: `linear-gradient(135deg, var(--admin-accent), var(--color-accent))`,
                                padding: '16px',
                                fontSize: '16px',
                                letterSpacing: '0.1em',
                                marginTop: '12px',
                                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.25)',
                            }}
                        >
                            {isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    ログイン中...
                                </span>
                            ) : (
                                'ログイン'
                            )}
                        </button>
                    </form>
                </div>

                <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '32px', letterSpacing: '0.05em' }}>
                    &copy; {new Date().getFullYear()} 食品OEM パートナー
                </p>
            </div>
        </div>
    )
}
