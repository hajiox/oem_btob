'use client'

import { useState, useEffect } from 'react'
import { Plus, Copy, Trash2, Edit, LayoutTemplate, Settings, Search, Wand2, X, Save, Mail } from 'lucide-react'
import Link from 'next/link'
import { getPages, createPage, deletePage, duplicateLpFromPage, duplicateFormFromPage, updatePageSeo, updatePageEmailSettings } from '@/actions/pages'
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

    // メール設定モーダル用
    const [emailModalPage, setEmailModalPage] = useState<Page | null>(null)
    const [emailForm, setEmailForm] = useState<{
        email_from_name: string;
        email_from_address: string;
        admin_notification_email: string;
        customer_email_subject: string;
        admin_email_subject: string;
        customer_email_intro: string;
        customer_email_closing: string;
        admin_email_intro: string;
    }>({ email_from_name: '', email_from_address: '', admin_notification_email: '', customer_email_subject: '', admin_email_subject: '', customer_email_intro: '', customer_email_closing: '', admin_email_intro: '' })
    const [isSavingEmail, setIsSavingEmail] = useState(false)

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

    const openEmailModal = (page: Page) => {
        setEmailModalPage(page)
        setEmailForm({
            email_from_name: page.email_from_name || 'OEM自動見積り',
            email_from_address: page.email_from_address || 'staff@aizu-tv.com',
            admin_notification_email: page.admin_notification_email || 'staff@aizu-tv.com',
            customer_email_subject: page.customer_email_subject || '【自動回答】お見積り依頼を承りました',
            admin_email_subject: page.admin_email_subject || '【新規リード獲得】新しいお見積り依頼が届きました',
            customer_email_intro: page.customer_email_intro || 'この度はお見積りシミュレーションをご利用いただき、誠にありがとうございます。\n以下の内容で承りました。内容を確認の上、担当者より3営業日以内にご連絡させていただきます。',
            customer_email_closing: page.customer_email_closing || '※本メールは自動送信されています。お心当たりのない場合は破棄してください。',
            admin_email_intro: page.admin_email_intro || '新しいリードを獲得しました。管理画面から詳細を確認してください。',
        })
    }

    const handleSaveEmail = async () => {
        if (!emailModalPage) return
        setIsSavingEmail(true)
        const res = await updatePageEmailSettings(emailModalPage.id, emailForm)
        if (res.success) {
            alert('メール設定を保存しました')
            setEmailModalPage(null)
            loadPages()
        } else {
            alert(res.error)
        }
        setIsSavingEmail(false)
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

                                {/* メール設定エリア */}
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--admin-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Mail size={14} /> メール設定
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => openEmailModal(page)} style={{ flex: 1, textAlign: 'center', background: '#ec4899', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Mail size={14} /> 送信設定を編集
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* メール設定モーダル */}
            {emailModalPage && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: 'var(--admin-sidebar)', padding: '24px', borderRadius: '12px', border: '1px solid var(--admin-border)', width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Mail size={20} style={{ color: '#ec4899' }} />
                                メール設定: {emailModalPage.title}
                            </h3>
                            <button onClick={() => setEmailModalPage(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ background: 'rgba(236,72,153,0.1)', padding: '14px 16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid rgba(236,72,153,0.2)' }}>
                            <p style={{ fontSize: '13px', color: '#f9a8d4' }}>
                                フォーム送信時に自動送信されるメールの送信元・件名・本文を設定できます。変更後は次回送信分から反映されます。
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* === 送信設定 === */}
                            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#f472b6', margin: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>📮 送信設定</h4>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>送信元名</label>
                                <input value={emailForm.email_from_name} onChange={e => setEmailForm({ ...emailForm, email_from_name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} placeholder="OEM自動見積り" />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'block' }}>例: OEM自動見積り、会津ブランド館</span>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>送信元メールアドレス</label>
                                <input value={emailForm.email_from_address} onChange={e => setEmailForm({ ...emailForm, email_from_address: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} placeholder="staff@aizu-tv.com" />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'block' }}>※ Resendでドメイン認証済みのアドレスを使用してください</span>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>管理者通知先メール</label>
                                <input value={emailForm.admin_notification_email} onChange={e => setEmailForm({ ...emailForm, admin_notification_email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} placeholder="staff@aizu-tv.com" />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'block' }}>新規リード獲得時の通知先</span>
                            </div>

                            <hr style={{ borderColor: 'var(--admin-border)', margin: '8px 0' }} />

                            {/* === お客様向けメール === */}
                            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa', margin: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>📨 お客様向けメール</h4>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>件名</label>
                                <input value={emailForm.customer_email_subject} onChange={e => setEmailForm({ ...emailForm, customer_email_subject: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} placeholder="【自動回答】お見積り依頼を承りました" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>本文（冒頭の挨拶文）</label>
                                <textarea value={emailForm.customer_email_intro} onChange={e => setEmailForm({ ...emailForm, customer_email_intro: e.target.value })} rows={4} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff', resize: 'vertical' }} placeholder="この度はお見積りシミュレーションをご利用いただき..." />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'block' }}>※この後に見積もり内容・選択肢一覧が自動挿入されます</span>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>本文（末尾の注記）</label>
                                <textarea value={emailForm.customer_email_closing} onChange={e => setEmailForm({ ...emailForm, customer_email_closing: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff', resize: 'vertical' }} placeholder="※本メールは自動送信されています..." />
                            </div>

                            <hr style={{ borderColor: 'var(--admin-border)', margin: '8px 0' }} />

                            {/* === 管理者向けメール === */}
                            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24', margin: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>🔔 管理者向けメール</h4>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>件名</label>
                                <input value={emailForm.admin_email_subject} onChange={e => setEmailForm({ ...emailForm, admin_email_subject: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff' }} placeholder="【新規リード獲得】新しいお見積り依頼が届きました" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>本文（冒頭文）</label>
                                <textarea value={emailForm.admin_email_intro} onChange={e => setEmailForm({ ...emailForm, admin_email_intro: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--admin-border)', color: '#fff', resize: 'vertical' }} placeholder="新しいリードを獲得しました。管理画面から..." />
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'block' }}>※この後にリード情報（会社名・担当者・見積額）が自動挿入されます</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button onClick={() => setEmailModalPage(null)} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--color-text-muted)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>キャンセル</button>
                            <button onClick={handleSaveEmail} disabled={isSavingEmail} style={{ background: '#ec4899', padding: '8px 16px', borderRadius: '8px', color: '#fff', border: 'none', cursor: isSavingEmail ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Save size={16} /> 保存する
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
