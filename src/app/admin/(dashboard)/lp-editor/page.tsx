import type { Metadata } from 'next'
import { getLpSections } from '@/actions/lpEditor'
import LpEditorClient from '@/components/LpEditorClient'

export const metadata: Metadata = {
    title: 'LPエディタ',
}

export default async function LpEditorPage() {
    const sections = await getLpSections()

    return <LpEditorClient initialSections={sections} />
}
