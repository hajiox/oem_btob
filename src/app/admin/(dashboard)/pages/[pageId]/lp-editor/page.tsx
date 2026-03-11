import type { Metadata } from 'next'
import { getLpSections, seedInitialLpSections } from '@/actions/lpEditor'
import { getActiveForm } from '@/actions/publicForm'
import LpEditorClient from '@/components/LpEditorClient'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: 'LPエディタ',
}

export default async function LpEditorPage({ params }: { params: { pageId: string } }) {
    const { pageId } = await params
    let sections = await getLpSections(pageId)
    let formSteps = await getActiveForm(pageId)

    const supabase = await createClient()
    const { data: pageData } = await supabase
        .from('pages')
        .select('slug')
        .eq('id', pageId)
        .single()
    const slug = pageData?.slug || ''

    // DBが空の場合、自動的に現在ハードコードされている初期画像をDBにシードする
    if (sections.length === 0) {
        const result = await seedInitialLpSections(pageId)
        if (result.success) {
            // シード成功後、再取得
            sections = await getLpSections(pageId)
        }
    }

    return <LpEditorClient initialSections={sections} formSteps={formSteps || []} pageId={pageId} slug={slug} />
}
