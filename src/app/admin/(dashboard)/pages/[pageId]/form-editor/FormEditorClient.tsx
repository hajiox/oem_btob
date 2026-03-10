'use client'

import { useState, useRef } from 'react'
import { Plus, Trash2, Save, ChevronDown, ChevronRight, HelpCircle, ArrowUp, ArrowDown, ImagePlus, Link2, X } from 'lucide-react'
import type { FormStep, FormQuestion, FormOption } from '@/types/database'
import { saveFormEditorData } from '@/actions/formEditor'
import Image from 'next/image'
import { compressImage } from '@/lib/imageCompressor'

type StepWithItems = FormStep & {
    questions: (FormQuestion & {
        options: FormOption[]
    })[]
}

const generateId = () => crypto.randomUUID()

export default function FormEditorClient({
    initialSteps,
    initialQuestions,
    initialOptions,
    pageId,
}: {
    initialSteps: FormStep[]
    initialQuestions: FormQuestion[]
    initialOptions: FormOption[]
    pageId: string
}) {
    const [steps, setSteps] = useState<StepWithItems[]>(() => {
        return initialSteps.map(step => ({
            ...step,
            questions: initialQuestions
                .filter(q => q.step_id === step.id)
                .map(q => ({
                    ...q,
                    options: initialOptions.filter(o => o.question_id === q.id).sort((a, b) => a.order_index - b.order_index)
                }))
                .sort((a, b) => a.order_index - b.order_index)
        })).sort((a, b) => a.order_index - b.order_index)
    })

    const [deletedStepIds, setDeletedStepIds] = useState<string[]>([])
    const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([])
    const [deletedOptionIds, setDeletedOptionIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
    const [uploadingOptionId, setUploadingOptionId] = useState<string | null>(null)

    // 全ステップ横断で全選択肢を取得（条件分岐選択用）
    const getAllOptions = (): { label: string; id: string; stepTitle: string; questionText: string }[] => {
        const result: { label: string; id: string; stepTitle: string; questionText: string }[] = []
        steps.forEach(s => {
            s.questions.forEach(q => {
                q.options.forEach(o => {
                    if (o.label) {
                        result.push({
                            id: o.id,
                            label: o.label,
                            stepTitle: s.step_title,
                            questionText: q.question_text,
                        })
                    }
                })
            })
        })
        return result
    }

    // 保存処理
    const handleSave = async () => {
        setIsSaving(true)
        const dataToSave = {
            steps: steps.map((s, sIdx) => ({
                ...s,
                order_index: sIdx,
                questions: s.questions.map((q, qIdx) => ({
                    ...q,
                    order_index: qIdx,
                    options: q.options.map((o, oIdx) => ({
                        ...o,
                        order_index: oIdx
                    }))
                }))
            })),
            deletedStepIds,
            deletedQuestionIds,
            deletedOptionIds,
            pageId
        }
        const result = await saveFormEditorData(dataToSave)
        if (!result.success) {
            alert(result.error || '保存に失敗しました')
        } else {
            alert('保存が完了しました！')
            setDeletedStepIds([])
            setDeletedQuestionIds([])
            setDeletedOptionIds([])
        }
        setIsSaving(false)
    }

    // 追加ロジック
    const addStep = () => {
        const newStep: StepWithItems = {
            id: generateId(),
            page_id: pageId,
            order_index: steps.length,
            step_title: '新しいステップ',
            step_description: '',
            is_visible: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            questions: []
        }
        setSteps([...steps, newStep])
        setExpandedSteps({ ...expandedSteps, [newStep.id]: true })
    }

    const addQuestion = (stepId: string) => {
        setSteps(steps.map(s => {
            if (s.id === stepId) {
                return {
                    ...s,
                    questions: [...s.questions, {
                        id: generateId(),
                        step_id: stepId,
                        order_index: s.questions.length,
                        question_text: '新しい質問',
                        input_type: 'radio' as const,
                        is_required: true,
                        help_text: '',
                        depends_on_option_id: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        options: []
                    }]
                }
            }
            return s
        }))
    }

    const addOption = (stepId: string, questionId: string) => {
        setSteps(steps.map(s => {
            if (s.id === stepId) {
                return {
                    ...s,
                    questions: s.questions.map(q => {
                        if (q.id === questionId) {
                            return {
                                ...q,
                                options: [...q.options, {
                                    id: generateId(),
                                    question_id: questionId,
                                    order_index: q.options.length,
                                    label: '',
                                    price_modifier: 0,
                                    is_base_price: false,
                                    description: '',
                                    image_url: '',
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                }]
                            }
                        }
                        return q
                    })
                }
            }
            return s
        }))
    }

    // 削除ロジック
    const removeStep = (stepId: string) => {
        if (!confirm('このステップと中の質問・選択肢を全て削除しますか？')) return
        setDeletedStepIds([...deletedStepIds, stepId])
        setSteps(steps.filter(s => s.id !== stepId))
    }

    const removeQuestion = (stepId: string, questionId: string) => {
        if (!confirm('この質問と中の選択肢を削除しますか？')) return
        setDeletedQuestionIds([...deletedQuestionIds, questionId])
        setSteps(steps.map(s => s.id === stepId ? {
            ...s,
            questions: s.questions.filter(q => q.id !== questionId)
        } : s))
    }

    const removeOption = (stepId: string, questionId: string, optionId: string) => {
        setDeletedOptionIds([...deletedOptionIds, optionId])
        setSteps(steps.map(s => s.id === stepId ? {
            ...s,
            questions: s.questions.map(q => q.id === questionId ? {
                ...q,
                options: q.options.filter(o => o.id !== optionId)
            } : q)
        } : s))
    }

    // 並び替え
    const moveStep = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return
        const newSteps = [...steps]
        const dest = direction === 'up' ? index - 1 : index + 1
        const temp = newSteps[index]
        newSteps[index] = newSteps[dest]
        newSteps[dest] = temp
        setSteps(newSteps)
    }

    const moveQuestion = (stepId: string, index: number, direction: 'up' | 'down') => {
        setSteps(steps.map(s => {
            if (s.id !== stepId) return s
            if ((direction === 'up' && index === 0) || (direction === 'down' && index === s.questions.length - 1)) return s
            const newQs = [...s.questions]
            const dest = direction === 'up' ? index - 1 : index + 1
            const temp = newQs[index]
            newQs[index] = newQs[dest]
            newQs[dest] = temp
            return { ...s, questions: newQs }
        }))
    }

    const handleImageUpload = async (stepId: string, questionId: string, optionId: string, file: File) => {
        setUploadingOptionId(optionId)
        try {
            // 画像を200-300KB (今回は250KB目標) に自動圧縮
            const compressedFile = await compressImage(file, 250)

            const formData = new FormData()
            formData.append('file', compressedFile)
            const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
            const result = await res.json()
            if (!res.ok) {
                alert(result.error || 'アップロードに失敗しました')
                return
            }
            // アップロード成功 → image_urlを更新
            setSteps(steps.map(s => s.id === stepId ? {
                ...s,
                questions: s.questions.map(q => q.id === questionId ? {
                    ...q,
                    options: q.options.map(o => o.id === optionId ? { ...o, image_url: result.url } : o)
                } : q)
            } : s))
        } catch (err) {
            alert('アップロード中にエラーが発生しました')
        } finally {
            setUploadingOptionId(null)
        }
    }

    // 条件分岐設定変更
    const setDependsOn = (stepId: string, questionId: string, optionId: string | null) => {
        setSteps(steps.map(s => s.id === stepId ? {
            ...s,
            questions: s.questions.map(q => q.id === questionId ? {
                ...q,
                depends_on_option_id: optionId
            } : q)
        } : s))
    }

    // スタイル定数
    const S = {
        input: { background: 'rgba(0,0,0,0.2)', border: '1px solid transparent', color: '#fff', padding: '8px 12px', borderRadius: '8px', width: '100%', fontSize: '15px', fontWeight: 'bold' as const, outline: 'none' },
        inputSm: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: '8px', fontSize: '13px', outline: 'none' },
        descInput: { background: 'transparent', border: '1px solid transparent', color: 'var(--color-text-muted)', padding: '6px 12px', borderRadius: '8px', width: '100%', fontSize: '14px', outline: 'none' },
        btn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
        card: { background: 'var(--admin-card)', border: '1px solid var(--admin-border)', borderRadius: '16px', overflow: 'visible' as const, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' },
    }

    return (
        <div style={{ maxWidth: '1100px', marginLeft: 'auto', marginRight: 'auto', paddingBottom: '96px', padding: '0 8px 96px' }}>
            {/* ページヘッダー */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>フォームエディタ</h1>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        BTO見積もりフォームのステップ・質問・金額ロジックを設定します
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    style={{ ...S.btn, background: 'var(--admin-accent)', color: '#fff', padding: '12px 24px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', minWidth: '160px', justifyContent: 'center' }}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    ) : (
                        <Save style={{ width: '20px', height: '20px' }} />
                    )}
                    {isSaving ? '保存中...' : '変更を保存'}
                </button>
            </div>

            {steps.length === 0 ? (
                <div style={{ ...S.card, padding: '48px', textAlign: 'center' as const, borderStyle: 'dashed' }}>
                    <div style={{ width: '64px', height: '64px', margin: '0 auto 16px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-accent)' }}>
                        <HelpCircle style={{ width: '32px', height: '32px' }} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>ステップがありません</h3>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '24px', maxWidth: '360px', margin: '0 auto 24px' }}>
                        最初の入力ステップを追加して、見積もりフォームの作成を始めましょう。
                    </p>
                    <button onClick={addStep} style={{ ...S.btn, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Plus style={{ width: '20px', height: '20px' }} /> 最初のステップを追加
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {steps.map((step, stepIndex) => (
                        <div key={step.id} style={S.card}>
                            {/* ステップヘッダー */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
                                    {/* 上下ボタン */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <button disabled={stepIndex === 0} onClick={() => moveStep(stepIndex, 'up')} style={{ padding: '4px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', opacity: stepIndex === 0 ? 0.2 : 1 }}><ArrowUp style={{ width: '16px', height: '16px' }} /></button>
                                        <button disabled={stepIndex === steps.length - 1} onClick={() => moveStep(stepIndex, 'down')} style={{ padding: '4px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', opacity: stepIndex === steps.length - 1 ? 0.2 : 1 }}><ArrowDown style={{ width: '16px', height: '16px' }} /></button>
                                    </div>
                                    {/* タイトル・説明 */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input
                                            value={step.step_title}
                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, step_title: e.target.value } : s))}
                                            style={{ ...S.input, fontSize: '18px' }}
                                            placeholder="ステップのタイトル"
                                        />
                                        <input
                                            value={step.step_description || ''}
                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, step_description: e.target.value } : s))}
                                            style={S.descInput}
                                            placeholder="ステップの説明..."
                                        />
                                    </div>
                                </div>

                                {/* コントロール */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--color-text-muted)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        公開
                                        <input type="checkbox" checked={step.is_visible} onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, is_visible: e.target.checked } : s))} style={{ accentColor: 'var(--admin-accent)', width: '16px', height: '16px' }} />
                                    </label>
                                    <button onClick={() => setExpandedSteps(prev => ({ ...prev, [step.id]: !prev[step.id] }))} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                                        {expandedSteps[step.id] ? <ChevronDown style={{ width: '20px', height: '20px' }} /> : <ChevronRight style={{ width: '20px', height: '20px' }} />}
                                    </button>
                                    <button onClick={() => removeStep(step.id)} style={{ color: '#f87171', background: 'rgba(248,113,113,0.05)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)', cursor: 'pointer' }}>
                                        <Trash2 style={{ width: '20px', height: '20px' }} />
                                    </button>
                                </div>
                            </div>

                            {/* 質問リスト */}
                            {expandedSteps[step.id] && (
                                <div style={{ padding: '16px 24px 24px', borderTop: '1px solid var(--admin-border)', background: 'rgba(0,0,0,0.4)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
                                        {step.questions.map((question, qIndex) => (
                                            <div key={question.id} style={{ border: '1px solid var(--admin-border)', borderRadius: '16px', padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }}>
                                                {/* 質問ヘッダー */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                                                        {/* 質問上下移動 */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '4px' }}>
                                                            <button disabled={qIndex === 0} onClick={() => moveQuestion(step.id, qIndex, 'up')} style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', opacity: qIndex === 0 ? 0.2 : 1 }}><ArrowUp style={{ width: '12px', height: '12px' }} /></button>
                                                            <button disabled={qIndex === step.questions.length - 1} onClick={() => moveQuestion(step.id, qIndex, 'down')} style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', opacity: qIndex === step.questions.length - 1 ? 0.2 : 1 }}><ArrowDown style={{ width: '12px', height: '12px' }} /></button>
                                                        </div>
                                                        {/* 質問テキスト・タイプ */}
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            <input
                                                                value={question.question_text}
                                                                onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, question_text: e.target.value } : q) } : s))}
                                                                style={S.input}
                                                                placeholder="質問内容"
                                                            />
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                                                <select
                                                                    value={question.input_type}
                                                                    onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, input_type: e.target.value as FormQuestion['input_type'] } : q) } : s))}
                                                                    style={{ ...S.inputSm, width: 'auto' }}
                                                                >
                                                                    <option value="radio">単一選択 (Radio)</option>
                                                                    <option value="checkbox">複数選択 (Checkbox)</option>
                                                                    <option value="select">ドロップダウン</option>
                                                                    <option value="select_text">ドロップダウン＋テキスト入力</option>
                                                                    <option value="select_number">ドロップダウン＋数値入力</option>
                                                                    <option value="text">テキスト入力</option>
                                                                    <option value="textarea">テキストエリア</option>
                                                                    <option value="number">数値入力</option>
                                                                </select>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-muted)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                                    <input type="checkbox" checked={question.is_required} onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, is_required: e.target.checked } : q) } : s))} style={{ accentColor: '#ec4899', width: '16px', height: '16px' }} />
                                                                    必須回答
                                                                </label>
                                                            </div>

                                                            {/* 条件分岐設定 */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                <Link2 style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
                                                                <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 'bold' }}>条件分岐:</span>
                                                                <select
                                                                    value={question.depends_on_option_id || ''}
                                                                    onChange={(e) => setDependsOn(step.id, question.id, e.target.value || null)}
                                                                    style={{ ...S.inputSm, width: 'auto', minWidth: '200px', fontSize: '12px', color: question.depends_on_option_id ? '#f59e0b' : 'var(--color-text-muted)' }}
                                                                >
                                                                    <option value="">常に表示（条件なし）</option>
                                                                    {getAllOptions().map(opt => (
                                                                        <option key={opt.id} value={opt.id}>
                                                                            [{opt.stepTitle}] {opt.questionText} → {opt.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => removeQuestion(step.id, question.id)} style={{ padding: '8px', borderRadius: '8px', color: '#f87171', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(239,68,68,0.1)', cursor: 'pointer', alignSelf: 'flex-start' }}>
                                                        <Trash2 style={{ width: '16px', height: '16px' }} />
                                                    </button>
                                                </div>

                                                {/* 選択肢リスト */}
                                                {['radio', 'checkbox', 'select', 'select_text', 'select_number'].includes(question.input_type) && (
                                                    <div style={{ marginLeft: '32px', paddingLeft: '16px', borderLeft: '2px solid rgba(99,102,241,0.3)', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                        {question.options.map((option) => (
                                                            <OptionRow
                                                                key={option.id}
                                                                option={option}
                                                                stepId={step.id}
                                                                questionId={question.id}
                                                                isUploading={uploadingOptionId === option.id}
                                                                onLabelChange={(val) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, label: val } : o) } : q) } : s))}
                                                                onPriceChange={(val) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, price_modifier: val } : o) } : q) } : s))}
                                                                onBasePriceChange={(val) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, is_base_price: val } : o) } : q) } : s))}
                                                                onImageUpload={(file) => handleImageUpload(step.id, question.id, option.id, file)}
                                                                onImageRemove={() => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, image_url: '' } : o) } : q) } : s))}
                                                                onRemove={() => removeOption(step.id, question.id, option.id)}
                                                            />
                                                        ))}
                                                        <button onClick={() => addOption(step.id, question.id)} style={{ ...S.btn, color: 'var(--admin-accent)', background: 'rgba(99,102,241,0.1)', marginTop: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                                                            <Plus style={{ width: '16px', height: '16px' }} /> 選択肢を追加
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--admin-border)', paddingTop: '24px' }}>
                                        <button onClick={() => addQuestion(step.id)} style={{ ...S.btn, color: '#fff', background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)' }}>
                                            <Plus style={{ width: '20px', height: '20px' }} /> 新しい質問を追加
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    <div style={{ paddingTop: '32px', display: 'flex', justifyContent: 'center', paddingBottom: '48px' }}>
                        <button onClick={addStep} style={{ ...S.btn, color: '#fff', background: 'transparent', border: '2px dashed rgba(255,255,255,0.2)', padding: '16px 32px', fontSize: '16px', fontWeight: 'bold' }}>
                            <Plus style={{ width: '24px', height: '24px' }} /> 新しいステップを追加
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// 選択肢の行コンポーネント（画像アップロード付き）
function OptionRow({
    option,
    stepId,
    questionId,
    isUploading,
    onLabelChange,
    onPriceChange,
    onBasePriceChange,
    onImageUpload,
    onImageRemove,
    onRemove,
}: {
    option: FormOption
    stepId: string
    questionId: string
    isUploading: boolean
    onLabelChange: (val: string) => void
    onPriceChange: (val: number) => void
    onBasePriceChange: (val: boolean) => void
    onImageUpload: (file: File) => void
    onImageRemove: () => void
    onRemove: () => void
}) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    return (
        <div style={{ padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                {/* ラベル */}
                <input
                    value={option.label}
                    onChange={(e) => onLabelChange(e.target.value)}
                    placeholder="選択肢の表示名"
                    style={{ flex: 1, minWidth: '150px', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '13px', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '8px', outline: 'none' }}
                />

                {/* 金額 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>金額</span>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>¥</span>
                    <input
                        type="number"
                        value={option.price_modifier}
                        onChange={(e) => onPriceChange(parseInt(e.target.value) || 0)}
                        style={{ width: '80px', background: 'transparent', color: 'var(--admin-success)', fontFamily: 'monospace', textAlign: 'right' as const, fontWeight: 'bold', fontSize: '13px', border: 'none', outline: 'none' }}
                    />
                </div>

                {/* 基本料金 */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', color: '#60a5fa', cursor: 'pointer', background: 'rgba(59,130,246,0.1)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={option.is_base_price} onChange={(e) => onBasePriceChange(e.target.checked)} style={{ accentColor: '#3b82f6', width: '14px', height: '14px' }} />
                    基本料金
                </label>

                {/* 画像アップロード */}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) { onImageUpload(e.target.files[0]); e.target.value = ''; } }} />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold', color: '#a78bfa', cursor: 'pointer', background: 'rgba(167,139,250,0.1)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.2)', whiteSpace: 'nowrap' }}
                    title="画像をアップロード"
                >
                    {isUploading ? (
                        <div style={{ width: '14px', height: '14px', border: '2px solid rgba(167,139,250,0.3)', borderTop: '2px solid #a78bfa', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    ) : (
                        <ImagePlus style={{ width: '14px', height: '14px' }} />
                    )}
                    画像
                </button>

                {/* 削除 */}
                <button onClick={onRemove} style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px' }}>
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                </button>
            </div>

            {/* 画像プレビュー */}
            {option.image_url && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
                        <Image src={option.image_url} alt={option.label || ''} fill style={{ objectFit: 'cover' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.image_url}</span>
                    <button onClick={onImageRemove} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="画像を削除">
                        <X style={{ width: '14px', height: '14px' }} />
                    </button>
                </div>
            )}
        </div>
    )
}
