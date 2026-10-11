'use client'

import React, { useState } from 'react'
import type { EnrichedLead } from '@/actions/leads'
import { LeadStatusSelect } from './LeadStatusSelect'
import { ChevronDown, ChevronUp, Trash2, Mail, User, Phone, ClipboardList } from 'lucide-react'
import { deleteLead } from '@/actions/dashboard'
import { OEM_PAGE_ID } from '@/lib/oem-quote-validation'
import { OemLeadCasePanel } from './OemLeadCasePanel'
import { OemMailPanel } from './OemMailPanel'
import { OemConversationPanel } from './OemConversationPanel'
import { OemOrderPanel } from './OemOrderPanel'
import { OemTrialPanel } from './OemTrialPanel'

export function LeadRow({ lead, onChanged }: { lead: EnrichedLead; onChanged?: () => void | Promise<void> }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [consultationWorkflowsOpen, setConsultationWorkflowsOpen] = useState(false)
    const isConsultation = lead.intake_kind === 'consultation'
    const hasEstimate = !isConsultation && lead.estimated_total_price !== null
    const options = Array.isArray(lead.selected_options)
        ? lead.selected_options as Array<{ question?: string; answer?: string }>
        : null
    const hasSeparatedManufacturingEstimate = options?.some(option => option.question === '製造概算お見積り金額(税抜・試作費別)') === true

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!window.confirm('本当にこのリードを削除しますか？')) return

        setIsDeleting(true)
        const res = await deleteLead(lead.id)
        if (!res.success) {
            alert(res.error || '削除に失敗しました')
            setIsDeleting(false)
        } else await onChanged?.()
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
                            {lead.company_name} {isConsultation && <span style={{ display: 'inline-block', color: '#67e8f9', fontSize: 12, marginLeft: 8 }}>相談のみ・見積未算定</span>} {lead.followupOverdue && <span style={{ color: '#f87171', fontSize: 12, marginLeft: 8 }}>フォロー期限超過</span>} {lead.followupAt && !lead.followupOverdue && <span style={{ color: 'var(--admin-accent)', fontSize: 12, marginLeft: 8 }}>次回 {new Date(lead.followupAt).toLocaleDateString('ja-JP')}</span>} {lead.mailAttention && <span style={{ color: '#fbbf24', fontSize: 12, marginLeft: 8 }}>メール要確認</span>}
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
                    <div>{hasEstimate ? `¥${lead.estimated_total_price!.toLocaleString()}` : '見積未算定'}</div>
                    {lead.page_id === OEM_PAGE_ID && hasEstimate && <small style={{ display: 'block', marginTop: 4, fontSize: 11, fontWeight: 500, color: 'var(--admin-text-muted)' }}>
                        {hasSeparatedManufacturingEstimate ? '製造概算（税別・試作費別）' : '保存時点のOEM見積（内訳を確認）'}
                    </small>}
                </td>
                <td style={{ padding: '16px 24px' }} onClick={(e) => e.stopPropagation()}>
                    <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} onChanged={onChanged} />
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
                                        {isConsultation ? 'ご相談の受付内容' : 'BTO構成・詳細'}
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
                        {lead.page_id === OEM_PAGE_ID && <>
                            {isConsultation && <section aria-label="相談受付の状態" style={{ marginTop: 24, padding: 20, border: '1px solid var(--admin-border)', borderRadius: 8 }}>
                                <strong>相談のみ・見積未算定</strong>
                                <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>相談の受付では、試作への承諾・費用の請求・製造発注は開始されません。担当者が製造可否や仕様・条件を確認し、費用と手続きを別途案内してください。</p>
                                <button type="button" aria-expanded={consultationWorkflowsOpen} onClick={() => setConsultationWorkflowsOpen(value => !value)} style={{ marginTop: 12, padding: '8px 12px', cursor: 'pointer' }}>{consultationWorkflowsOpen ? '試作・正式見積の管理を閉じる' : '条件確認後に試作・正式見積の管理を開く'}</button>
                            </section>}
                            <OemLeadCasePanel leadId={lead.id} onChanged={onChanged} />
                            {(!isConsultation || consultationWorkflowsOpen) && <>
                                <details style={{ marginTop: 24 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>試作・初回特典を管理する</summary><OemTrialPanel leadId={lead.id} /></details>
                                <OemOrderPanel leadId={lead.id} estimatedTotalPrice={isConsultation ? null : lead.estimated_total_price} />
                            </>}
                            <OemMailPanel leadId={lead.id} /><OemConversationPanel leadId={lead.id} leadEmail={lead.email} />
                        </>}
                    </td>
                </tr>
            )}
        </React.Fragment>
    )
}
