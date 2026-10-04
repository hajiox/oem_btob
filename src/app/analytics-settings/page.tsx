import type { Metadata } from 'next'
import AnalyticsTrafficControl from './AnalyticsTrafficControl'

export const metadata: Metadata = {
    title: '社内確認用のアクセス設定',
    description: 'このブラウザーで行うOEMサイトの確認操作をアクセス集計から除外する設定です。',
    robots: { index: false, follow: false },
}

export default function AnalyticsSettingsPage() {
    return (
        <main className="min-h-screen bg-slate-50 px-5 py-16 text-slate-900">
            <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
                <p className="mb-3 text-sm font-semibold text-emerald-700">会津ブランド館・OEMサイト</p>
                <h1 className="mb-4 text-2xl font-bold">社内確認用のアクセス設定</h1>
                <p className="mb-6 text-sm leading-7 text-slate-600">
                    社内の確認操作を、お客様のアクセス数に含めないための設定です。
                    設定はこのブラウザーだけに保存され、他の端末やお客様には影響しません。
                </p>
                <AnalyticsTrafficControl />
                <p className="mt-6 text-xs leading-6 text-slate-500">
                    別のブラウザー・プロファイル・端末ではそれぞれ登録してください。
                    ブラウザーの保存データを消すと設定も解除されます。
                    過去の集計データは変更しません。
                </p>
            </section>
        </main>
    )
}
