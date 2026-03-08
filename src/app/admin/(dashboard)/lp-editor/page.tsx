import type { Metadata } from 'next'
import { getLpSections, seedInitialLpSections } from '@/actions/lpEditor'
import LpEditorClient from '@/components/LpEditorClient'

export const metadata: Metadata = {
    title: 'LPエディタ',
}

export default async function LpEditorPage() {
    let sections = await getLpSections()

    // DBが空の場合、自動的に現在ハードコードされている初期画像をDBにシードする
    if (sections.length === 0) {
        const result = await seedInitialLpSections()
        if (result.success) {
            // シード成功後、再取得
            sections = await getLpSections()
        }
    }

    return <LpEditorClient initialSections={sections} />
}
