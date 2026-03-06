import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'LPエディタ',
}

export default function LpEditorPage() {
    return (
        <div>
            {/* ページヘッダー */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                    LPエディタ
                </h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    ランディングページのセクションを管理
                </p>
            </div>

            {/* プレースホルダー */}
            <div
                className="rounded-2xl border p-12 text-center"
                style={{ background: 'var(--admin-card)', borderColor: 'var(--admin-border)' }}
            >
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">LP セクション管理</h2>
                <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto">
                    LPのセクション（ヒーロー、コンテンツ、CTA等）の追加・編集・並び替え・画像アップロードが行えます。
                    <br />
                    <span className="text-[var(--admin-accent)]">次のフェーズで実装予定</span>
                </p>
            </div>
        </div>
    )
}
