import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'フォームエディタ',
}

export default function FormEditorPage() {
    return (
        <div>
            {/* ページヘッダー */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                    フォームエディタ
                </h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    BTO見積もりフォームの質問・選択肢・金額ロジックを管理
                </p>
            </div>

            {/* プレースホルダー */}
            <div
                className="rounded-2xl border p-12 text-center"
                style={{ background: 'var(--admin-card)', borderColor: 'var(--admin-border)' }}
            >
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">フォームビルダー</h2>
                <p className="text-[var(--color-text-muted)] text-sm max-w-md mx-auto">
                    見積もりステップ、質問、選択肢、金額設定を追加・編集できるGUIです。
                    ドラッグ＆ドロップで並び替えも可能です。
                    <br />
                    <span className="text-[var(--admin-accent)]">フェーズ3で実装予定</span>
                </p>
            </div>
        </div>
    )
}
