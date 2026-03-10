'use client'

import { useState, useEffect } from 'react'
import { Plus, Copy, Trash2, Edit, LayoutTemplate, Settings, Search, Wand2, X, Save } from 'lucide-react'
import Link from 'next/link'
import { getPages, createPage, deletePage, duplicateLpFromPage, duplicateFormFromPage, updatePageSeo } from '@/actions/pages'
import { generateSeoFromPageContent } from '@/actions/seoGenerator'
import type { Page } from '@/types/database'

export default function PagesDashboardClient() {
    const [pages, setPages] = useState<Page[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [newSlug, setNewSlug] = useState('')
    const [newTitle, setNewTitle] = useState('')

    // 複製モーダル用
    const [duplicating, setDuplicating] = useState<{ type: 'lp' | 'form' | null, targetPageId: string }>({ type: null, targetPageId: '' })
    const [sourcePageId, setSourcePageId] = useState('')

    // SEOモーダル用
    const [seoModalPage, setSeoModalPage] = useState<Page | null>(null)
    const [seoForm, setSeoForm] = useState<{
        seo_title: string;
        seo_description: string;
        og_title: string;
        og_description: string;
        og_image_url: string;
        favicon_url: string;
    }>({ seo_title: '', seo_description: '', og_title: '', og_description: '', og_image_url: '', favicon_url: '' })
    const [isGeneratingSeo, setIsGeneratingSeo] = useState(false)
    const [isSavingSeo, setIsSavingSeo] = useState(false)

    useEffect(() => {
        loadPages()
    }, [])

    const loadPages = async () => {
        setIsLoading(true)
        const data = await getPages()
        setPages(data)
        setIsLoading(false)
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSlug || !newTitle) return
        if (!/^[a-zA-Z0-9-]+$/.test(newSlug)) {
            alert('スラッグは半角英数字とハイフンのみ使用可能です')
            return
        }
        const res = await createPage(newSlug, newTitle)
        if (res.success) {
            setNewSlug('')
            setNewTitle('')
            setIsCreating(false)
            loadPages()
        } else {
            alert(res.error)
        }
    }

    const handleDelete = async (id: string, title: string) => {
        if (!confirm(`ページ「${title}」と、関連するLP・フォームを全て削除します。\nよろしいですか？`)) return
        const res = await deletePage(id)
        if (res.success) {
            loadPages()
        } else {
            alert(res.error)
        }
    }

    const handleDuplicate = async () => {
        if (!sourcePageId || !duplicating.targetPageId) return
        if (!confirm('既存のデータは上書きされます。よろしいですか？')) return

        let res
        if (duplicating.type === 'lp') {
            res = await duplicateLpFromPage(sourcePageId, duplicating.targetPageId)
        } else {
            res = await duplicateFormFromPage(sourcePageId, duplicating.targetPageId)
        }

        if (res?.success) {
            alert('コピーが完了しました')
            setDuplicating({ type: null, targetPageId: '' })
        } else {
            alert(res?.error)
        }
    }

    const openSeoModal = (page: Page) => {
        setSeoModalPage(page)
        setSeoForm({
            seo_title: page.seo_title || '',
            seo_description: page.seo_description || '',
            og_title: page.og_title || '',
            og_description: page.og_description || '',
            og_image_url: page.og_image_url || '',
            favicon_url: page.favicon_url || '',
        })
    }

    const handleGenerateSeo = async () => {
        if (!seoModalPage) return
        setIsGeneratingSeo(true)
        const res = await generateSeoFromPageContent(seoModalPage.id)
        if (res.success && res.data) {
            setSeoForm(prev => ({
                ...prev,
                seo_title: res.data.seo_title || prev.seo_title,
                seo_description: res.data.seo_description || prev.seo_description,
                og_title: res.data.og_title || prev.og_title,
                og_description: res.data.og_description || prev.og_description,
                og_image_url: res.data.og_image_url || prev.og_image_url,
            }))
            alert('SEO情報を自動生成しました！必要に応じて手動で調整して保存してください。')
        } else {
            alert(res.error)
        }
        setIsGeneratingSeo(false)
    }

    const handleSaveSeo = async () => {
        if (!seoModalPage) return
        setIsSavingSeo(true)
        const res = await updatePageSeo(seoModalPage.id, seoForm)
        if (res.success) {
            alert('SEO設定を保存しました')
            setSeoModalPage(null)
            loadPages() // 反映のためリロード
        } else {
            alert(res.error)
        }
        setIsSavingSeo(false)
    }

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>ページ管理</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>
                        複数のLP＋フォームページを作成・管理できます。
                    </p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    style={{ background: 'var(--admin-accent)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Plus size={18} /> 新規ページ作成
                </button>
            </div>

            {/* 作成フォーム */}
            {isCreating && (
                <form onSubmit={handleCreate} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>新規ページを作成</h3>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>スラッグ (URL)</label>
                            <input required value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="例: summer-campaign" style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                        </div>
                        <div style={{ flex: 2 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>ページタイトル</label>
                            <input required value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例: 夏の特大キャンペーンLP" style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setIsCreating(false)} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--admin-border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>キャンセル</button>
                        <button type="submit" style={{ background: 'var(--admin-accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>追加する</button>
                    </div>
                </form>
            )}

            {/* コピーダイアログ */}
            {duplicating.type && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: 'var(--admin-sidebar)', padding: '24px', borderRadius: '12px', border: '1px solid var(--admin-border)', width: '400px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
                            {duplicating.type === 'lp' ? 'LP構成のコピー' : 'フォーム構成のコピー'}
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                            コピー元のページを選択してください。<br />
                            <span style={{ color: '#ef4444' }}>※対象ページの既存のデータは完全に上書きされます。</span>
                        </p>
                        <select
                            value={sourcePageId}
                            onChange={e => setSourcePageId(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff', marginBottom: '24px' }}
                        >
                            <option value="">コピー元を選択...</option>
                            {pages.filter(p => p.id !== duplicating.targetPageId).map(p => (
                                <option key={p.id} value={p.id}>{p.title} (/{p.slug})</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setDuplicating({ type: null, targetPageId: '' })} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--color-text-muted)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>キャンセル</button>
                            <button onClick={handleDuplicate} disabled={!sourcePageId} style={{ background: 'var(--admin-accent)', padding: '8px 16px', borderRadius: '8px', color: '#fff', border: 'none', cursor: sourcePageId ? 'pointer' : 'not-allowed', opacity: sourcePageId ? 1 : 0.5 }}>コピー実行</button>
                        </div>
                    </div>
                </div>
            )}

            {/* SEO設定モーダル */}
            {seoModalPage && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: 'var(--admin-sidebar)', padding: '24px', borderRadius: '12px', border: '1px solid var(--admin-border)', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>SEO・OGP設定: {seoModalPage.title}</h3>
                            <button onClick={() => setSeoModalPage(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ background: 'rgba(129, 140, 248, 0.1)', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid rgba(129, 140, 248, 0.2)' }}>
                            <p style={{ fontSize: '13px', color: '#a5b4fc', marginBottom: '12px' }}>
                                プロンプトAIがLPの画像テキストやフォームの内容から、検索エンジンやSNSシェアに最適なメタタグを自動生成します。
                            </p>
                            <button
                                onClick={handleGenerateSeo}
                                disabled={isGeneratingSeo}
                                style={{ background: 'var(--admin-accent)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: isGeneratingSeo ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                            >
                                {isGeneratingSeo ? <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span> : <Wand2 size={16} />}
                                {isGeneratingSeo ? 'AIが考え中...' : 'LPから自動生成する'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* SEO Title */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>SEO タイトル (検索エンジン用)</label>
                                <input value={seoForm.seo_title} onChange={e => setSeoForm({ ...seoForm, seo_title: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                            {/* SEO Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>SEO スニペット (検索一覧の表示説明)</label>
                                <textarea value={seoForm.seo_description} onChange={e => setSeoForm({ ...seoForm, seo_description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                            <hr style={{ borderColor: 'var(--admin-border)', margin: '8px 0' }} />
                            {/* OGP Title */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>OGP タイトル (Twitter/SNSシェア用)</label>
                                <input value={seoForm.og_title} onChange={e => setSeoForm({ ...seoForm, og_title: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                            {/* OGP Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>OGP 説明文</label>
                                <textarea value={seoForm.og_description} onChange={e => setSeoForm({ ...seoForm, og_description: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                            {/* OGP Image URL */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>OGP 画像URL (推奨サイズ 1200x630)</label>
                                <input value={seoForm.og_image_url} onChange={e => setSeoForm({ ...seoForm, og_image_url: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                            <hr style={{ borderColor: 'var(--admin-border)', margin: '8px 0' }} />
                            {/* Favicon */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>ファビコンURL (ブラウザタブ用アイコン)</label>
                                <input value={seoForm.favicon_url} onChange={e => setSeoForm({ ...seoForm, favicon_url: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button onClick={() => setSeoModalPage(null)} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--color-text-muted)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>キャンセル</button>
                            <button onClick={handleSaveSeo} disabled={isSavingSeo} style={{ background: '#10b981', padding: '8px 16px', borderRadius: '8px', color: '#fff', border: 'none', cursor: isSavingSeo ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Save size={16} /> 保存する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ページ一覧 */}
            {isLoading ? (
                <div>読み込み中...</div>
            ) : (
                <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                    {pages.map(page => (
                        <div key={page.id} style={{ background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '20px', borderBottom: '1px solid var(--admin-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>{page.title}</h3>
                                        <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            /{page.slug} <span style={{ fontSize: '10px' }}>↗</span>
                                        </a>
                                    </div>
                                    <button onClick={() => handleDelete(page.id, page.title)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px', cursor: 'pointer' }} title="削除">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* LP管理エリア */}
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--admin-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <LayoutTemplate size={14} /> LP (画像)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Link href={`/admin/pages/${page.id}/lp-editor`} style={{ flex: 1, textAlign: 'center', background: 'var(--admin-accent)', color: '#fff', textDecoration: 'none', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Edit size={14} /> 編集
                                        </Link>
                                        <button onClick={() => setDuplicating({ type: 'lp', targetPageId: page.id })} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--admin-border)', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }} title="他からコピー">
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* フォーム管理エリア */}
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--admin-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#86efac', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Settings size={14} /> BTOフォーム
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <Link href={`/admin/pages/${page.id}/form-editor`} style={{ flex: 1, textAlign: 'center', background: '#22c55e', color: '#fff', textDecoration: 'none', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: 'none' }}>
                                            <Edit size={14} /> 編集
                                        </Link>
                                        <button onClick={() => setDuplicating({ type: 'form', targetPageId: page.id })} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--admin-border)', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }} title="他からコピー">
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* SEO管理エリア */}
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--admin-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fcd34d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Search size={14} /> SEO・OGP
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => openSeoModal(page)} style={{ flex: 1, textAlign: 'center', background: '#f59e0b', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Wand2 size={14} /> AI自動生成 / 編集
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
