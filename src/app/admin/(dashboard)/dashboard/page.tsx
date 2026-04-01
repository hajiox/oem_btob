import type { Metadata } from 'next'
import DashboardClient from './DashboardClient'

export const metadata: Metadata = {
    title: 'ダッシュボード | OEM開発',
}

export default function DashboardPage() {
    return <DashboardClient />
}
