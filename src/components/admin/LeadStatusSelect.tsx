'use client'

import { useState, useTransition } from 'react'
import { updateLeadStatus } from '@/actions/dashboard'
import type { Lead } from '@/types/database'

export function LeadStatusSelect({ leadId, currentStatus }: { leadId: string, currentStatus: Lead['status'] }) {
    const [status, setStatus] = useState<Lead['status']>(currentStatus)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value as Lead['status']
        setStatus(newStatus)
        setError(null)

        startTransition(async () => {
            const result = await updateLeadStatus(leadId, newStatus)
            if (result.success === false && result.error) {
                setError(result.error)
                setStatus(currentStatus) // エラー時は元に戻す
            }
        })
    }

    const statuses: { value: Lead['status']; label: string; color: string }[] = [
        { value: 'new', label: '新規', color: '#818cf8' },
        { value: 'contacted', label: '連絡済', color: '#60a5fa' },
        { value: 'quoted', label: '見積済', color: '#fbbf24' },
        { value: 'negotiating', label: '交渉中', color: '#c084fc' },
        { value: 'won', label: '受注', color: '#4ade80' },
        { value: 'lost', label: '失注', color: '#f87171' }
    ]

    const currentColor = statuses.find(s => s.value === status)?.color || '#fff'

    return (
        <div className="relative">
            <select
                value={status}
                onChange={handleStatusChange}
                disabled={isPending}
                className="appearance-none bg-transparent border rounded-md px-3 py-1 pr-8 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                style={{
                    color: currentColor,
                    borderColor: `${currentColor}40`,
                    background: `${currentColor}10`
                }}
            >
                {statuses.map(s => (
                    <option key={s.value} value={s.value} className="bg-slate-800 text-white">
                        {s.label}
                    </option>
                ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2" style={{ color: currentColor }}>
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
            </div>
            {error && (
                <div className="absolute top-full mt-1 left-0 text-[10px] text-red-400 whitespace-nowrap z-10 bg-black/80 p-1 rounded">
                    {error}
                </div>
            )}
        </div>
    )
}
