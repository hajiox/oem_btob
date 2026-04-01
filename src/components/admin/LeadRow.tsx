'use client'

import React, { useState } from 'react'
import type { Lead } from '@/types/database'
import { LeadStatusSelect } from './LeadStatusSelect'
import { ChevronDown, ChevronUp, Trash2, Mail, User, Phone, ClipboardList } from 'lucide-react'
import { deleteLead } from '@/actions/dashboard'

export function LeadRow({ lead }: { lead: Lead }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const options = lead.selected_options as any[] | null

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!window.confirm('本当にこのリードを削除しますか？')) return

        setIsDeleting(true)
        const res = await deleteLead(lead.id)
        if (!res.success) {
            alert(res.error || '削除に失敗しました')
            setIsDeleting(false)
        }
    }

    return (
        <React.Fragment>
            <tr 
                style={{ 
                    borderBottom: '1px solid var(--admin-border)', 
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                    transition: 'all 0.1s ease',
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <td style={{ padding: '16px 32px', fontSize: '14px', fontWeight: '700', color: 'var(--admin-text)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ color: isExpanded ? 'var(--admin-accent)' : 'var(--admin-text-muted)', display: 'flex' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                        <span style={{ opacity: isDeleting ? 0.5 : 1 }}>
                            {lead.company_name}
                        </span>
                    </div>
                </td>
                <td style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--admin-text)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={14} style={{ color: 'var(--admin-text-muted)' }} />
                        {lead.contact_name}
                    </div>
                </td>
                <td style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--admin-text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Mail size={14} style={{ color: 'var(--admin-text-muted)' }} />
                        {lead.email}
                    </div>
                </td>
                <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '800', color: 'var(--admin-text)' }}>
                    ¥{(lead.estimated_total_price || 0).toLocaleString()}
                </td>
                <td style={{ padding: '16px 24px' }} onClick={(e) => e.stopPropagation()}>
                    <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                </td>
                <td style={{ padding: '16px 32px', fontSize: '13px', color: 'var(--admin-text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {new Date(lead.created_at).toLocaleDateString('ja-JP')}
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--admin-text-muted)',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'all 0.2s'
                            }}
                            title="削除"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr style={{ background: 'var(--admin-bg)', borderBottom: '1px solid var(--admin-border)' }}>
                    <td colSpan={6} style={{ padding: '32px 40px' }}>
                        <div style={{ display: 'flex', gap: '40px' }}>
                            {/* BTO選択内容 */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--admin-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ClipboardList size={16} />
                                    </div>
                                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--admin-text)', letterSpacing: '0.04em' }}>
                                        BTO構成・詳細
                                    </h4>
                                </div>
                                {options && options.length > 0 ? (
                                    <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: 'repeat(2, 1fr)', 
                                        gap: '24px',
                                        background: 'var(--admin-card)',
                                        border: '1px solid var(--admin-border)',
                                        borderRadius: '4px',
                                        padding: '24px'
                                    }}>
                                        {options.map((opt, idx) => (
                                            <div key={idx} style={{ 
                                                display: 'flex', 
                                                flexDirection: 'column', 
                                                gap: '6px',
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                                                paddingBottom: '12px'
                                            }}>
                                                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--admin-text-muted)', textTransform: 'uppercase' }}>{opt.question}</span>
                                                <span style={{ fontSize: '14px', color: 'var(--admin-text)', fontWeight: '700' }}>{opt.answer}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--admin-text-muted)', fontSize: '13px', background: 'var(--admin-card)', padding: '24px', borderRadius: '4px' }}>
                                        詳細データはありません。
                                    </div>
                                )}
                            </div>

                            {/* お客様情報 */}
                            <div style={{ width: '300px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--admin-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <User size={16} />
                                    </div>
                                    <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--admin-text)', letterSpacing: '0.04em' }}>
                                        連絡先・備考
                                    </h4>
                                </div>
                                <div style={{ 
                                    background: 'var(--admin-card)', 
                                    border: '1px solid var(--admin-border)', 
                                    borderRadius: '4px', 
                                    padding: '24px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '20px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--admin-text-muted)', marginBottom: '4px' }}>電話番号</div>
                                        <div style={{ fontSize: '14px', color: 'var(--admin-text)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Phone size={14} style={{ color: 'var(--admin-accent)' }} />
                                            {lead.phone || '未登録'}
                                        </div>
                                    </div>
                                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.03)', paddingTop: '16px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--admin-text-muted)', marginBottom: '8px' }}>ご要望・備考</div>
                                        <div style={{ fontSize: '13px', color: 'var(--admin-text)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                            {lead.notes || 'なし'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    )
}
