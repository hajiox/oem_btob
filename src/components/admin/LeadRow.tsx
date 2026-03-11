'use client'

import React, { useState } from 'react'
import type { Lead } from '@/types/database'
import { LeadStatusSelect } from './LeadStatusSelect'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { deleteLead } from '@/actions/dashboard'

export function LeadRow({ lead }: { lead: Lead }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const options = lead.selected_options as any[] | null

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation() // 行の展開を防ぐ
        if (!window.confirm('本当にこのリードを削除しますか？\n（この操作は取り消せません）')) return

        setIsDeleting(true)
        const res = await deleteLead(lead.id)
        if (!res.success) {
            alert(res.error || '削除に失敗しました')
            setIsDeleting(false)
        }
        // 成功した場合は revalidatePath により自動で画面が更新されます
    }

    return (
        <React.Fragment>
            <tr 
                className={`transition-colors cursor-pointer ${isExpanded ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <td className="px-6 py-6 text-sm font-medium text-white">
                    <div className="flex items-center gap-3">
                        <button className="text-[var(--color-primary)] opacity-70 hover:opacity-100 transition-opacity">
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                        <span className={isDeleting ? 'opacity-50 line-through' : ''}>
                            {lead.company_name}
                        </span>
                    </div>
                </td>
                <td className="px-6 py-6 text-sm text-[var(--color-text-muted)]">{lead.contact_name}</td>
                <td className="px-6 py-6 text-sm text-[var(--color-text-muted)]">{lead.email}</td>
                <td className="px-6 py-6 text-sm font-medium text-white">
                    ¥{(lead.estimated_total_price || 0).toLocaleString()}
                </td>
                <td className="px-6 py-6" onClick={(e) => e.stopPropagation()}>
                    <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                </td>
                <td className="px-6 py-6 text-sm text-[var(--color-text-muted)]">
                    <div className="flex items-center justify-between">
                        {new Date(lead.created_at).toLocaleDateString('ja-JP')}
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors ml-4"
                            title="このリードを削除"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-[#0f172a] shadow-inner">
                    <td colSpan={6} className="px-8 py-8 border-t border-[var(--admin-border)]">
                        <div className="flex gap-12">
                            {/* BTO選択内容 */}
                            <div className="flex-1">
                                <h4 className="text-[13px] font-bold text-white mb-5 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-6 h-6 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] flex items-center justify-center text-xs">📋</span>
                                    BTO 回答・見積り詳細
                                </h4>
                                {options && options.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-x-12 gap-y-4 bg-white/[0.02] p-6 rounded-2xl border border-white/[0.05]">
                                        {options.map((opt, idx) => (
                                            <div key={idx} className="flex flex-col gap-1 border-b border-white/5 pb-3">
                                                <span className="text-[12px] text-[var(--color-text-muted)]">{opt.question}</span>
                                                <span className="text-[14px] text-white font-medium">{opt.answer}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-[var(--color-text-muted)] bg-white/5 p-6 rounded-2xl">BTOデータの記録がありません。</div>
                                )}
                            </div>

                            {/* お客様情報と備考 */}
                            <div className="w-[340px]">
                                <h4 className="text-[13px] font-bold text-white mb-5 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-6 h-6 rounded bg-[var(--admin-accent)]/20 text-[var(--admin-accent)] flex items-center justify-center text-xs">👤</span>
                                    お客様情報・ご連絡先
                                </h4>
                                <div className="space-y-5 bg-black/20 rounded-2xl p-6 border border-white/5 shadow-inner">
                                    <div>
                                        <div className="text-[var(--color-text-muted)] text-[12px] mb-1">電話番号</div>
                                        <div className="text-[14px] text-white font-medium">{lead.phone || '未設定'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[var(--color-text-muted)] text-[12px] mb-1">その他ご要望・備考事項</div>
                                        <div className="text-[14px] text-white whitespace-pre-wrap leading-relaxed">{lead.notes || '記載なし'}</div>
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
