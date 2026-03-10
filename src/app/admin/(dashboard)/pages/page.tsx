import { Metadata } from 'next'
import PagesDashboardClient from './PagesDashboardClient'

export const metadata: Metadata = {
    title: 'ページ管理 | フォームLP作成ツール',
}

export default function PagesPage() {
    return <PagesDashboardClient />
}
