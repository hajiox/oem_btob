import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--admin-bg)' }}>
            <AdminSidebar />
            <main style={{ marginLeft: '260px', minHeight: '100vh' }}>
                <div style={{ padding: '48px 56px' }}>
                    {children}
                </div>
            </main>
        </div>
    )
}
