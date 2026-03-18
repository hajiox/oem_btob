import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/types/database'
import type { Metadata } from 'next'
import { LeadRow } from '@/components/admin/LeadRow'

export const metadata: Metadata = {
    title: 'ダッシュボード | OEM開発',
}

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
        <div style={{
            background: 'var(--admin-card)',
            border: '1px solid var(--admin-border)',
            borderRadius: '8px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '135px',
            transition: 'all 0.2s ease',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--admin-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {title}
                </div>
                <div style={{ 
                    width: '32px', height: '32px', borderRadius: '6px',
                    background: `${color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <span style={{ color, display: 'flex' }}>{icon}</span>
                </div>
            </div>
            
            <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--admin-text)', lineHeight: '1' }}>
                    {value}
                </div>
                {/* サブテキスト用の高さを固定確保して、数字のラインを揃える */}
                <div style={{ height: '16px', marginTop: '8px', display: 'flex', alignItems: 'center' }}>
                    {subtext ? (
                        <div style={{ color, fontSize: '11px', fontWeight: '700', opacity: 0.9 }}>
                            {subtext}
                        </div>
                    ) : (
                        <div style={{ visibility: 'hidden', height: '11px' }}>placeholder</div>
                    )}
                </div>
            </div>
        </div>
    )
}

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
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* ページヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--admin-text)', marginBottom: '8px' }}>
                        ダッシュボード
                    </h1>
                    <p style={{ color: 'var(--admin-text-muted)', fontSize: '14px' }}>
                        OEM開発コンサルティング・製品管理システム
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {/* docScanner風のボタンがあればここ */}
                </div>
            </div>

            {/* ステータスバー風 (docScannerにあるやつ) */}
            <div style={{ 
                background: 'rgba(6, 182, 212, 0.05)', 
                border: '1px solid rgba(6, 182, 212, 0.2)', 
                borderRadius: '4px', 
                padding: '12px 20px', 
                marginBottom: '32px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }}></div>
                <span style={{ color: 'var(--admin-text)', fontSize: '13px', fontWeight: '500' }}>
                    システム稼働中
                </span>
                <span style={{ color: 'var(--admin-text-muted)', fontSize: '13px', marginLeft: 'auto' }}>
                    最終更新: {new Date().toLocaleTimeString('ja-JP')}
                </span>
            </div>

            {/* 統計カードグリッド */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(4, 1fr)', 
                gap: '24px', 
                marginBottom: '40px' 
            }}>
                <StatCard
                    title="総リード数"
                    value={totalLeads}
                    color="var(--admin-accent)"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                           <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                        </svg>
                    }
                />
                <StatCard
                    title="新規リード"
                    value={newLeads}
                    color="#10B981"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                    }
                    subtext="未対応リード"
                />
                <StatCard
                    title="受注待ち"
                    value={leads.filter(l => l.status === 'negotiating').length}
                    color="#F59E0B"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                    }
                />
                <StatCard
                    title="総見積額"
                    value={`¥${leads.reduce((sum, l) => sum + (l.estimated_total_price || 0), 0).toLocaleString()}`}
                    color="#EC4899"
                    icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                    }
                />
            </div>

            {/* メインリスト */}
            <div style={{
                background: 'var(--admin-card)',
                border: '1px solid var(--admin-border)',
                borderRadius: '4px',
            }}>
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--admin-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--admin-text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--admin-accent)' }}>
                            <path d="M4 14h4v-10h-4v10zm6 0h4v-10h-4v10zm6 0h4v-10h-4v10zM4 19h16v-2h-16v2z"/>
                        </svg>
                        最新の獲得リード
                    </h2>
                    <div style={{ fontSize: '12px', color: 'var(--admin-text-muted)' }}>
                        全 {totalLeads} 件中 50 件を表示
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--admin-border)', background: 'rgba(255, 255, 255, 0.02)' }}>
                                <th style={{ padding: '16px 32px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>会社名</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>担当者</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>メールアドレス</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>概算見積額</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ステータス</th>
                                <th style={{ padding: '16px 32px', textAlign: 'left', fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>日時</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.length > 0 ? (
                                leads.map((lead) => (
                                    <LeadRow key={lead.id} lead={lead} />
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} style={{ padding: '60px', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                                        リードがまだありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
