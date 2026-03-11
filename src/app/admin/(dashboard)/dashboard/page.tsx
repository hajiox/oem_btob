import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/types/database'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'ダッシュボード',
}

// 統計カード
function StatCard({
    title,
    value,
    icon,
    color,
    subtext,
}: {
    title: string
    value: string | number
    icon: React.ReactNode
    color: string
    subtext?: string
}) {
    return (
        <div
            className="rounded-2xl p-6 border transition-all duration-300 hover:scale-[1.02]"
            style={{ background: 'var(--admin-card)', borderColor: 'var(--admin-border)' }}
        >
            <div className="flex items-start justify-between mb-4">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}15` }}
                >
                    <span style={{ color }}>{icon}</span>
                </div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{value}</div>
            <div className="text-sm text-[var(--color-text-muted)]">{title}</div>
            {subtext && (
                <div className="text-xs mt-2" style={{ color }}>
                    {subtext}
                </div>
            )}
        </div>
    )
}

// ここでは LeadRow をインポートします。（LeadStatusSelectはLeadRow内で呼ばれます）
import { LeadRow } from '@/components/admin/LeadRow'

export default async function DashboardPage() {
    let leads: Lead[] = []
    let totalLeads = 0
    let newLeads = 0
    let wonLeads = 0

    try {
        const supabase = await createClient()
        const { data, count } = await supabase
            .from('leads')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(50)

        leads = (data ?? []) as Lead[]
        totalLeads = count ?? 0
        newLeads = leads.filter((l) => l.status === 'new').length
        wonLeads = leads.filter((l) => l.status === 'won').length
    } catch {
        // Supabase 未設定時
    }

    return (
        <div>
            {/* ページヘッダー */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>
                    ダッシュボード
                </h1>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    OEMリード管理の概要
                </p>
            </div>

            {/* 統計カード */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                    title="総リード数"
                    value={totalLeads}
                    color="var(--admin-accent)"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    }
                />
                <StatCard
                    title="新規リード"
                    value={newLeads}
                    color="var(--admin-warning)"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    }
                    subtext="対応が必要です"
                />
                <StatCard
                    title="受注リード"
                    value={wonLeads}
                    color="var(--admin-success)"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />
                <StatCard
                    title="見積り合計"
                    value={`¥${leads.reduce((sum, l) => sum + (l.estimated_total_price || 0), 0).toLocaleString()}`}
                    color="var(--color-gold)"
                    icon={
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />
            </div>

            {/* リード一覧テーブル */}
            <div
                className="rounded-2xl border overflow-hidden"
                style={{ background: 'var(--admin-card)', borderColor: 'var(--admin-border)' }}
            >
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--admin-border)' }}>
                    <h2 className="text-lg font-bold text-white">最新リード</h2>
                    <span className="text-xs text-[var(--color-text-muted)]">直近50件</span>
                </div>

                {leads.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                            <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <p className="text-[var(--color-text-muted)] text-sm">
                            まだリードがありません
                        </p>
                        <p className="text-[var(--color-text-muted)] text-xs mt-1">
                            フォームからお問い合わせが来ると、ここに表示されます
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium">会社名</th>
                                    <th className="px-6 py-4 font-medium">担当者</th>
                                    <th className="px-6 py-4 font-medium">メール</th>
                                    <th className="px-6 py-4 font-medium">見積額</th>
                                    <th className="px-6 py-4 font-medium">ステータス</th>
                                    <th className="px-6 py-4 font-medium">日時</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: 'var(--admin-border)' }}>
                                {leads.map((lead) => (
                                    <LeadRow key={lead.id} lead={lead} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
