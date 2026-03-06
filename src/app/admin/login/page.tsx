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
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--admin-accent)] to-[var(--color-accent)] mb-4 shadow-lg">
                        <span className="text-2xl">🍽️</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                        管理者ログイン
                    </h1>
                    <p className="text-sm text-[var(--color-text-muted)] mt-2">
                        食品OEM管理システムにサインイン
                    </p>
                </div>

                {/* ログインフォーム */}
                <div
                    className="rounded-2xl p-8 border"
                    style={{
                        background: 'var(--admin-card)',
                        borderColor: 'var(--admin-border)',
                    }}
                >
                    <form action={formAction} className="space-y-6">
                        {/* エラー表示 */}
                        {state.error && (
                            <div className="p-4 rounded-xl text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--admin-danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                ⚠️ {state.error}
                            </div>
                        )}

                        {/* メールアドレス */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                メールアドレス
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="w-full px-4 py-3 rounded-xl text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)] transition-all"
                                style={{
                                    background: 'var(--admin-bg)',
                                    border: '1px solid var(--admin-border)',
                                }}
                                placeholder="admin@example.com"
                            />
                        </div>

                        {/* パスワード */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                パスワード
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                className="w-full px-4 py-3 rounded-xl text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)] transition-all"
                                style={{
                                    background: 'var(--admin-bg)',
                                    border: '1px solid var(--admin-border)',
                                }}
                                placeholder="••••••••"
                            />
                        </div>

                        {/* ログインボタン */}
                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full py-3.5 rounded-xl font-bold text-white transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
                            style={{
                                background: `linear-gradient(135deg, var(--admin-accent), var(--color-accent))`,
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

                <p className="text-center text-xs text-[var(--color-text-muted)] mt-6">
                    &copy; {new Date().getFullYear()} 食品OEM パートナー
                </p>
            </div>
        </div>
    )
}
