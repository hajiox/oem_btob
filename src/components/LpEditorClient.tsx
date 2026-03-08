'use client'

import { useState, useRef } from 'react'
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Loader2, ImageIcon } from 'lucide-react'
import Image from 'next/image'
import type { LpSection } from '@/types/database'
import { addLpSection, deleteLpSection, reorderLpSections, updateLpSectionTitle } from '@/actions/lpEditor'
import { forceSeedInitialLpSections } from '@/actions/lpEditorForceSeed'
import { generateImageMetadata } from '@/actions/imageMetadata'

export default function LpEditorClient({ initialSections }: { initialSections: LpSection[] }) {
    const [sections, setSections] = useState<LpSection[]>(initialSections)
    const [isUploading, setIsUploading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // 画像アップロード
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        setIsUploading(true)
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const formData = new FormData()
                formData.append('file', file)

                const res = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData,
                })

                if (!res.ok) {
                    const err = await res.json()
                    alert(`アップロード失敗: ${err.error}`)
                    continue
                }

                const { url } = await res.json()

                // AIで画像からメタデータ（テキスト）を自動生成
                let aiGeneratedTitle = ''
                try {
                    const aiResult = await generateImageMetadata(url)
                    if (aiResult.success) {
                        aiGeneratedTitle = aiResult.text
                    } else {
                        console.error('AI Metadata generation failed:', aiResult.error)
                        alert(`【警告】AI文字読み取り失敗: ${aiResult.error}`)
                    }
                } catch (aiErr: any) {
                    console.error('AI Metadata API failed:', aiErr)
                    alert(`【警告】AI呼び出しエラー: ${aiErr.message}`)
                }

                const finalTitle = aiGeneratedTitle || file.name.replace(/\.[^.]+$/, '')

                const result = await addLpSection(url, finalTitle)
                if (!result.success) {
                    alert(`保存失敗: ${result.error}`)
                    continue
                }
            }
            // リロードして最新データ取得
            window.location.reload()
        } catch (err: any) {
            alert(`エラー: ${err.message}`)
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // 画像削除
    const handleDelete = async (id: string) => {
        if (!confirm('この画像を削除しますか？')) return
        setIsSaving(true)
        const result = await deleteLpSection(id)
        if (result.success) {
            setSections(prev => prev.filter(s => s.id !== id))
        } else {
            alert(`削除失敗: ${result.error}`)
        }
        setIsSaving(false)
    }

    // 並び替え（上下ボタン）
    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newSections = [...sections]
        const targetIdx = direction === 'up' ? index - 1 : index + 1
        if (targetIdx < 0 || targetIdx >= newSections.length) return

            ;[newSections[index], newSections[targetIdx]] = [newSections[targetIdx], newSections[index]]
        setSections(newSections)

        setIsSaving(true)
        const result = await reorderLpSections(newSections.map(s => s.id))
        if (!result.success) {
            alert(`並び替え失敗: ${result.error}`)
            setSections(sections) // 元に戻す
        }
        setIsSaving(false)
    }

    // ドラッグ&ドロップ
    const handleDragStart = (index: number) => {
        setDragIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        setDragOverIndex(index)
    }

    const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault()
        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null)
            setDragOverIndex(null)
            return
        }

        const newSections = [...sections]
        const draggedItem = newSections.splice(dragIndex, 1)[0]
        newSections.splice(dropIndex, 0, draggedItem)
        setSections(newSections)
        setDragIndex(null)
        setDragOverIndex(null)

        setIsSaving(true)
        const result = await reorderLpSections(newSections.map(s => s.id))
        if (!result.success) {
            alert(`並び替え失敗: ${result.error}`)
            setSections(sections)
        }
        setIsSaving(false)
    }

    // タイトル更新
    const handleTitleChange = async (id: string, title: string) => {
        setSections(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    }

    const handleTitleBlur = async (id: string, title: string) => {
        await updateLpSectionTitle(id, title)
    }

    // 初期画像（デフォルト状態）の強制立ち上げ
    const handleForceSeed = async () => {
        if (!confirm('現在の画像をすべて削除し、初期状態の5枚の画像を復元しますか？\n（※一度消えた画像は元に戻せません）')) return
        setIsSaving(true)
        const result = await forceSeedInitialLpSections()
        if (result.success) {
            window.location.reload()
        } else {
            alert(`復元失敗: ${result.error}`)
            setIsSaving(false)
        }
    }

    return (
        <div>
            {/* ヘッダー */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading)' }}>
                        LPエディタ
                    </h1>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        ランディングページの画像を管理（{sections.length}枚）
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {isSaving && (
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            保存中...
                        </span>
                    )}
                    <button
                        onClick={handleForceSeed}
                        disabled={isSaving || isUploading}
                        style={{
                            padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--admin-border)',
                            background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                            opacity: (isSaving || isUploading) ? 0.5 : 1,
                        }}
                    >
                        初期画像を復元
                    </button>
                    <label
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
                            background: 'var(--admin-accent)', color: '#fff',
                            fontSize: '14px', fontWeight: 600,
                            opacity: isUploading ? 0.5 : 1,
                        }}
                    >
                        {isUploading ? (
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <Plus size={16} />
                        )}
                        {isUploading ? 'アップロード＆AI解析中...' : '画像を追加'}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleUpload}
                            disabled={isUploading}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>
            </div>

            {/* 画像一覧 */}
            {sections.length === 0 ? (
                <div
                    style={{
                        borderRadius: '16px', padding: '64px 24px', textAlign: 'center',
                        background: 'var(--admin-card)', border: '2px dashed var(--admin-border)',
                    }}
                >
                    <ImageIcon size={48} style={{ margin: '0 auto 16px', color: 'var(--color-text-muted)', opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>画像がまだありません</p>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>「画像を追加」ボタンからLP画像をアップロードしてください</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sections.map((section, idx) => (
                        <div
                            key={section.id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={(e) => handleDrop(e, idx)}
                            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '12px 16px', borderRadius: '12px',
                                background: dragOverIndex === idx ? 'rgba(99,102,241,0.15)' : 'var(--admin-card)',
                                border: dragOverIndex === idx
                                    ? '2px solid rgba(99,102,241,0.5)'
                                    : '1px solid var(--admin-border)',
                                opacity: dragIndex === idx ? 0.5 : 1,
                                transition: 'all 0.15s',
                                cursor: 'grab',
                            }}
                        >
                            {/* ドラッグハンドル */}
                            <div style={{ color: 'var(--color-text-muted)', cursor: 'grab', flexShrink: 0 }}>
                                <GripVertical size={18} />
                            </div>

                            {/* 連番 */}
                            <span style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: 'rgba(255,255,255,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '13px', fontWeight: 700, color: 'var(--color-text-muted)',
                                flexShrink: 0,
                            }}>
                                {idx + 1}
                            </span>

                            {/* サムネイル */}
                            <div style={{
                                width: '120px', height: '72px', borderRadius: '8px',
                                overflow: 'hidden', flexShrink: 0, position: 'relative',
                                background: 'rgba(255,255,255,0.05)',
                            }}>
                                {section.image_url ? (
                                    <Image
                                        src={section.image_url}
                                        alt={section.title || ''}
                                        fill
                                        style={{ objectFit: 'cover' }}
                                        sizes="120px"
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ImageIcon size={24} style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                )}
                            </div>

                            {/* タイトル/alt */}
                            <input
                                type="text"
                                value={section.title || ''}
                                onChange={(e) => handleTitleChange(section.id, e.target.value)}
                                onBlur={(e) => handleTitleBlur(section.id, e.target.value)}
                                placeholder="alt テキスト / タイトルを入力"
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--admin-border)',
                                    color: '#fff', fontSize: '13px', outline: 'none',
                                }}
                            />

                            {/* 上下ボタン */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                                <button
                                    onClick={() => handleMove(idx, 'up')}
                                    disabled={idx === 0 || isSaving}
                                    style={{
                                        padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                        background: idx === 0 ? 'transparent' : 'rgba(255,255,255,0.08)',
                                        color: idx === 0 ? 'rgba(255,255,255,0.15)' : 'var(--color-text-muted)',
                                    }}
                                >
                                    <ArrowUp size={14} />
                                </button>
                                <button
                                    onClick={() => handleMove(idx, 'down')}
                                    disabled={idx === sections.length - 1 || isSaving}
                                    style={{
                                        padding: '4px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                                        background: idx === sections.length - 1 ? 'transparent' : 'rgba(255,255,255,0.08)',
                                        color: idx === sections.length - 1 ? 'rgba(255,255,255,0.15)' : 'var(--color-text-muted)',
                                    }}
                                >
                                    <ArrowDown size={14} />
                                </button>
                            </div>

                            {/* 削除ボタン */}
                            <button
                                onClick={() => handleDelete(section.id)}
                                disabled={isSaving}
                                style={{
                                    padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', flexShrink: 0,
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* 注意事項 */}
            <div style={{
                marginTop: '24px', padding: '16px 20px', borderRadius: '12px',
                background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)',
            }}>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    💡 <strong style={{ color: '#fff' }}>使い方：</strong>
                    「画像を追加」でLP画像をアップロードし、ドラッグ&ドロップまたは↑↓ボタンで順番を変更できます。
                    公開ページには上から順番に表示されます。
                </p>
            </div>
        </div>
    )
}
