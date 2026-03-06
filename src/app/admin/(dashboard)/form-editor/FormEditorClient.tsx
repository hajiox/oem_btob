'use client'

import { useState } from 'react'
import { Plus, GripVertical, Trash2, Save, ChevronDown, ChevronRight, HelpCircle, ArrowUp, ArrowDown } from 'lucide-react'
import type { FormStep, FormQuestion, FormOption } from '@/types/database'
import { saveFormEditorData } from '@/actions/formEditor'

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
}: {
    initialSteps: FormStep[]
    initialQuestions: FormQuestion[]
    initialOptions: FormOption[]
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

    // 削除されたもののIDを保持して最後の一括保存時に消す
    const [deletedStepIds, setDeletedStepIds] = useState<string[]>([])
    const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([])
    const [deletedOptionIds, setDeletedOptionIds] = useState<string[]>([])

    const [isSaving, setIsSaving] = useState(false)
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

    // 保存処理
    const handleSave = async () => {
        setIsSaving(true)

        const dataToSave = {
            steps: steps.map((s, sIdx) => ({
                ...s,
                order_index: sIdx, // 0始まり
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
            deletedOptionIds
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

    /* --- 追加ロジック --- */
    const addStep = () => {
        const newStep: StepWithItems = {
            id: generateId(),
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
                        input_type: 'radio',
                        is_required: true,
                        help_text: '',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        options: [] // 初期の空の選択肢配列
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

    /* --- 削除ロジック --- */
    const removeStep = (stepId: string) => {
        if (!confirm('このステップと中の質問・選択肢を全て削除しますか？')) return
        if (!stepId.includes('-')) setDeletedStepIds([...deletedStepIds, stepId]) // UUID形式以外(通常UUIDは-を含む)
        setSteps(steps.filter(s => s.id !== stepId))
    }

    const removeQuestion = (stepId: string, questionId: string) => {
        if (!confirm('この質問と中の選択肢を削除しますか？')) return
        if (!questionId.includes('-')) setDeletedQuestionIds([...deletedQuestionIds, questionId])
        setSteps(steps.map(s => s.id === stepId ? {
            ...s,
            questions: s.questions.filter(q => q.id !== questionId)
        } : s))
    }

    const removeOption = (stepId: string, questionId: string, optionId: string) => {
        if (!optionId.includes('-')) setDeletedOptionIds([...deletedOptionIds, optionId])
        setSteps(steps.map(s => s.id === stepId ? {
            ...s,
            questions: s.questions.map(q => q.id === questionId ? {
                ...q,
                options: q.options.filter(o => o.id !== optionId)
            } : q)
        } : s))
    }

    /* --- 並び替え（シンプル上下移動） --- */
    const moveStep = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return
        const newSteps = [...steps]
        const temp = newSteps[index]
        const dest = direction === 'up' ? index - 1 : index + 1
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

    // 以下レンダリング
    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-24 px-2">
            {/* ページヘッダー */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
                <div className="w-full">
                    <h1 className="text-2xl font-bold text-white tracking-tight">フォームエディタ</h1>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">
                        BTO見積もりフォームのステップ・質問・金額ロジックを設定します
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-lg group disabled:opacity-50 min-w-[160px]"
                    style={{ background: 'var(--admin-accent)', color: 'white' }}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    )}
                    {isSaving ? '保存中...' : '変更を保存'}
                </button>
            </div>

            {steps.length === 0 ? (
                <div className="border border-dashed rounded-2xl p-12 text-center" style={{ borderColor: 'var(--admin-border)', background: 'var(--admin-card)' }}>
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--admin-accent)]/10 flex items-center justify-center text-[var(--admin-accent)]">
                        <HelpCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">ステップがありません</h3>
                    <p className="text-sm text-[var(--color-text-muted)] mb-6 max-w-sm mx-auto">
                        最初の入力ステップを追加して、見積もりフォームの作成を始めましょう。
                    </p>
                    <button onClick={addStep} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10">
                        <Plus className="w-5 h-5" />
                        最初のステップを追加
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {steps.map((step, stepIndex) => (
                        <div
                            key={step.id}
                            className="rounded-2xl border transition-all duration-300 shadow-xl overflow-visible"
                            style={{ background: 'var(--admin-card)', borderColor: 'var(--admin-border)' }}
                        >
                            {/* ステップのヘッダー部分 */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-5 gap-4">
                                <div className="flex items-start md:items-center gap-4 flex-1">

                                    {/* 上下移動ボタン */}
                                    <div className="flex flex-col gap-1 items-center bg-black/30 p-1.5 rounded-lg border border-white/5">
                                        <button disabled={stepIndex === 0} onClick={() => moveStep(stepIndex, 'up')} className="p-1 text-white/40 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"><ArrowUp className="w-4 h-4" /></button>
                                        <button disabled={stepIndex === steps.length - 1} onClick={() => moveStep(stepIndex, 'down')} className="p-1 text-white/40 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"><ArrowDown className="w-4 h-4" /></button>
                                    </div>

                                    {/* ステップのタイトル入力 */}
                                    <div className="flex-1 space-y-3 pt-1">
                                        <input
                                            value={step.step_title}
                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, step_title: e.target.value } : s))}
                                            className="text-lg md:text-xl font-bold text-white bg-black/20 border border-transparent hover:border-white/20 focus:bg-black/40 focus:border-[var(--admin-accent)] focus:outline-none w-full px-3 py-2 rounded-lg transition-all"
                                            placeholder="ステップのタイトル (例: パッケージの選択)"
                                        />
                                        <input
                                            value={step.step_description || ''}
                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, step_description: e.target.value } : s))}
                                            placeholder="ステップの説明..."
                                            className="text-sm text-[var(--color-text-muted)] bg-transparent border border-transparent hover:border-white/20 hover:bg-black/20 focus:bg-black/40 focus:border-[var(--admin-accent)] focus:outline-none w-full px-3 py-1.5 rounded-lg transition-all"
                                        />
                                    </div>
                                </div>

                                {/* ステップヘッダーの右側コントロール */}
                                <div className="flex items-center gap-3 self-end md:self-auto pl-12 md:pl-0">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-muted)] hover:text-white transition-colors bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                                        <span className="font-medium">公開</span>
                                        <input
                                            type="checkbox"
                                            checked={step.is_visible}
                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, is_visible: e.target.checked } : s))}
                                            className="w-4 h-4 accent-[var(--admin-accent)]"
                                        />
                                    </label>

                                    <button
                                        title="非表示・展開"
                                        onClick={() => setExpandedSteps(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
                                        className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-white/70 hover:text-white transition-colors border border-white/5"
                                    >
                                        {expandedSteps[step.id] ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                    </button>

                                    <button
                                        onClick={() => removeStep(step.id)}
                                        className="text-red-400 bg-red-400/5 hover:bg-red-400/20 p-2 rounded-lg border border-red-500/10 transition-colors"
                                        title="ステップを削除"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* 質問リスト (アコーディオン展開時) */}
                            {expandedSteps[step.id] && (
                                <div className="p-4 md:p-6 border-t bg-black/40" style={{ borderColor: 'var(--admin-border)' }}>

                                    <div className="space-y-6 mb-6">
                                        {step.questions.map((question, qIndex) => (
                                            <div key={question.id} className="border rounded-2xl p-4 md:p-5 bg-white/[0.02]" style={{ borderColor: 'var(--admin-border)' }}>

                                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">

                                                    {/* 質問部分左側 */}
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <div className="flex flex-col gap-1 items-center bg-black/40 p-1 rounded border border-white/5 mt-1">
                                                            <button disabled={qIndex === 0} onClick={() => moveQuestion(step.id, qIndex, 'up')} className="text-white/30 hover:text-white disabled:opacity-20"><ArrowUp className="w-3 h-3" /></button>
                                                            <button disabled={qIndex === step.questions.length - 1} onClick={() => moveQuestion(step.id, qIndex, 'down')} className="text-white/30 hover:text-white disabled:opacity-20"><ArrowDown className="w-3 h-3" /></button>
                                                        </div>

                                                        {/* 質問のテキストとタイプ */}
                                                        <div className="flex-1 space-y-3">
                                                            <input
                                                                value={question.question_text}
                                                                onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, question_text: e.target.value } : q) } : s))}
                                                                className="text-[15px] font-bold text-white bg-black/20 border border-transparent hover:border-white/20 focus:bg-black/40 focus:border-[var(--admin-accent)] focus:outline-none w-full px-3 py-2 rounded-lg"
                                                                placeholder="質問内容 (例: 納品形態をお選びください)"
                                                            />
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <select
                                                                    value={question.input_type}
                                                                    onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, input_type: e.target.value } : q) } : s))}
                                                                    className="bg-[#1a1b26] text-sm text-[var(--color-text-muted)] border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-[var(--admin-accent)] hover:border-white/30 transition-colors"
                                                                >
                                                                    <option value="radio">単一選択 (Radio)</option>
                                                                    <option value="checkbox">複数選択 (Checkbox)</option>
                                                                    <option value="select">ドロップダウン (Select)</option>
                                                                    <option value="text">短いテキスト入力</option>
                                                                    <option value="textarea">長いテキスト入力 (備考など)</option>
                                                                    <option value="number">数値入力 (数量など)</option>
                                                                </select>

                                                                <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={question.is_required}
                                                                        onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, is_required: e.target.checked } : q) } : s))}
                                                                        className="accent-pink-500 w-4 h-4"
                                                                    />
                                                                    必須回答
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 質問削除 */}
                                                    <button onClick={() => removeQuestion(step.id, question.id)} className="p-2 ml-10 md:ml-0 self-start rounded-lg text-red-400 bg-red-400/5 hover:bg-red-400/20 border border-red-500/10 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                {/* 選択肢リスト (radio, checkbox, selectの場合のみ) */}
                                                {['radio', 'checkbox', 'select'].includes(question.input_type) && (
                                                    <div className="ml-8 pl-4 space-y-3 mt-4 border-l-2 border-[var(--admin-accent)]/30">
                                                        {question.options.map((option, oIndex) => (
                                                            <div key={option.id} className="flex flex-col xl:flex-row xl:items-center gap-3 p-3 rounded-xl border border-white/5 hover:border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                                                                <div className="flex-1 flex gap-3">
                                                                    <input
                                                                        value={option.label}
                                                                        onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, label: e.target.value } : o) } : q) } : s))}
                                                                        placeholder="選択肢の表示名 (例: 1,000個)"
                                                                        className="flex-1 bg-black/30 text-sm text-white border border-white/10 hover:border-white/30 focus:border-[var(--admin-accent)] focus:bg-black/50 focus:outline-none px-3 py-2 rounded-lg transition-colors"
                                                                    />
                                                                </div>

                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                                                        <span className="text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">金額 (追加分)</span>
                                                                        <span className="text-sm font-bold text-[var(--color-text-muted)]">¥</span>
                                                                        <input
                                                                            type="number"
                                                                            value={option.price_modifier}
                                                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, price_modifier: parseInt(e.target.value) || 0 } : o) } : q) } : s))}
                                                                            className="w-24 bg-transparent font-mono text-[var(--admin-success)] focus:outline-none text-right font-bold"
                                                                            placeholder="0"
                                                                        />
                                                                    </div>

                                                                    <label className="flex items-center gap-2 text-xs font-bold text-blue-400 cursor-pointer bg-blue-500/10 px-3 py-2 rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors whitespace-nowrap">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={option.is_base_price}
                                                                            onChange={(e) => setSteps(steps.map(s => s.id === step.id ? { ...s, questions: s.questions.map(q => q.id === question.id ? { ...q, options: q.options.map(o => o.id === option.id ? { ...o, is_base_price: e.target.checked } : o) } : q) } : s))}
                                                                            className="accent-blue-500 w-4 h-4"
                                                                        />
                                                                        基本料金を上書
                                                                    </label>

                                                                    <button onClick={() => removeOption(step.id, question.id, option.id)} className="text-[var(--color-text-muted)] hover:text-red-400 p-2 ml-1 transition-colors">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        <button onClick={() => addOption(step.id, question.id)} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--admin-accent)] hover:text-white hover:bg-[var(--admin-accent)] bg-[var(--admin-accent)]/10 px-4 py-2 rounded-lg transition-all mt-2">
                                                            <Plus className="w-4 h-4" /> 選択肢を追加
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* 新しい質問を追加ボタン */}
                                    <div className="flex justify-center border-t pt-6" style={{ borderColor: 'var(--admin-border)' }}>
                                        <button onClick={() => addQuestion(step.id)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/10 text-white text-sm font-medium transition-all shadow-sm">
                                            <Plus className="w-5 h-5" />
                                            新しい質問を追加
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="pt-8 flex justify-center pb-12">
                        <button onClick={addStep} className="flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 hover:bg-white/5 text-white text-base font-bold transition-all hover:scale-[1.02] shadow-lg">
                            <Plus className="w-6 h-6" />
                            新しいステップを追加
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
