'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react'
import type { FormStepWithItems } from '@/actions/publicForm'
import { submitLead } from '@/actions/publicForm'

export default function InteractiveForm({ steps }: { steps: FormStepWithItems[] }) {
    const [currentStep, setCurrentStep] = useState(0)
    const [direction, setDirection] = useState(1) // 1 = 次へ, -1 = 戻る
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [errorData, setErrorData] = useState<string | null>(null)
    const [oemQuantity, setOemQuantity] = useState<number>(400)

    // 0 = OEM数量, 1 ~ steps.length = フォーム, steps.length + 1 = 結果画面, steps.length + 2 = お客様情報
    const RESULT_STEP = steps.length + 1
    const CONTACT_STEP = steps.length + 2

    // ユーザーの入力状態
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [contactInfo, setContactInfo] = useState({
        companyName: '',
        contactName: '',
        email: '',
        phone: '',
        notes: '',
    })

    // === 金額計算ロジック ===
    const unitPrice = useMemo(() => {
        let total = 0
        let hasBasePrice = false

        Object.entries(answers).forEach(([questionId, answer]) => {
            // 質問を特定
            const q = steps.flatMap(s => s.questions).find(q => q.id === questionId)
            if (!q) return

            // 複合入力タイプの場合はselectedを取得
            let effectiveAnswer = answer
            if (answer && typeof answer === 'object' && !Array.isArray(answer) && answer.selected) {
                effectiveAnswer = answer.selected
            }

            // 単一または複数の選択肢
            const selectedOptionIds = Array.isArray(effectiveAnswer) ? effectiveAnswer : [effectiveAnswer]

            selectedOptionIds.forEach(val => {
                // IDで選択肢を検索して金額を加算
                const opt = q.options.find(o => o.id === val)
                if (opt) {
                    if (opt.is_base_price) {
                        total += opt.price_modifier
                        hasBasePrice = true
                    } else {
                        total += opt.price_modifier
                    }
                }
            })
        })

        return total
    }, [answers, steps])

    const estimatedPrice = unitPrice * oemQuantity
    const estimatedTax = Math.round(estimatedPrice * 10 / 110)

    // === 条件分岐：質問が表示されるかどうか ===
    const isQuestionVisible = (q: any) => {
        if (!q.depends_on_option_id) return true // 条件なし → 常に表示
        // 全回答の中に、依存先optionが選択されているか確認
        for (const [qId, answer] of Object.entries(answers)) {
            // 複合入力タイプ（select_text/select_number）の場合はselectedを参照
            if (answer && typeof answer === 'object' && !Array.isArray(answer) && answer.selected) {
                 if (answer.selected === q.depends_on_option_id) return true
            } else {
                const selectedIds = Array.isArray(answer) ? answer : [answer]
                if (selectedIds.includes(q.depends_on_option_id)) return true
            }
        }
        return false
    }

    // === バリデーション ===
    const isCurrentStepValid = () => {
        if (currentStep === 0) {
            return oemQuantity >= 400 && oemQuantity <= 800
        }
        if (currentStep > steps.length) return false
        const currentQuestions = steps[currentStep - 1]?.questions || []

        for (const q of currentQuestions) {
            // 非表示の質問はスキップ
            if (!isQuestionVisible(q)) continue
            if (q.is_required) {
                const val = answers[q.id]
                if (!val || (Array.isArray(val) && val.length === 0)) {
                    return false
                }
                // 複合入力タイプの場合はselectedが選択されているかチェック
                if (typeof val === 'object' && !Array.isArray(val) && !val.selected) {
                    return false
                }
            }
        }
        return true
    }

    // お客様情報のバリデーション
    const isContactInfoValid = () => {
        return contactInfo.companyName.trim() !== '' &&
            contactInfo.contactName.trim() !== '' &&
            contactInfo.email.includes('@')
    }

    // === 操作ハンドラ ===
    const getVisibleQuestionsOfStep = (stepIndex: number) => {
        if (stepIndex === 0) return [] // step 0 is OEM quantity
        if (stepIndex > steps.length) return []
        return steps[stepIndex - 1].questions.filter(q => isQuestionVisible(q))
    }

    const handleNext = () => {
        if (currentStep <= steps.length && isCurrentStepValid()) {
            setDirection(1)
            let nextStep = currentStep + 1
            while (nextStep <= steps.length) {
                if (getVisibleQuestionsOfStep(nextStep).length > 0) {
                    break
                }
                nextStep++
            }
            setCurrentStep(nextStep)
        }
    }

    const handlePrev = () => {
        setDirection(-1)
        if (currentStep === CONTACT_STEP) {
            setCurrentStep(RESULT_STEP)
            return
        }
        if (currentStep === RESULT_STEP) {
            let prevStep = steps.length
            while (prevStep > 0) {
                if (getVisibleQuestionsOfStep(prevStep).length > 0) {
                    break
                }
                prevStep--
            }
            setCurrentStep(Math.max(prevStep, 0))
            return
        }
        
        let prevStep = currentStep - 1
        while (prevStep > 0) {
            if (getVisibleQuestionsOfStep(prevStep).length > 0) {
                break
            }
            prevStep--
        }
        setCurrentStep(Math.max(prevStep, 0))
    }

    // 仮申込ボタン → お客様情報へ
    const handleApply = () => {
        setDirection(1)
        setCurrentStep(CONTACT_STEP)
    }

    const handleAnswerChange = (questionId: string, value: any, type: string) => {
        if (type === 'checkbox') {
            const currentVal = Array.isArray(answers[questionId]) ? answers[questionId] : []
            if (currentVal.includes(value)) {
                setAnswers({ ...answers, [questionId]: currentVal.filter(v => v !== value) })
            } else {
                setAnswers({ ...answers, [questionId]: [...currentVal, value] })
            }
        } else if (type === 'select_text_selected' || type === 'select_number_selected') {
            // 複合入力: ドロップダウン部分の変更
            const current = answers[questionId] || { selected: '', extra: '' }
            setAnswers({ ...answers, [questionId]: { ...current, selected: value } })
        } else if (type === 'select_text_extra' || type === 'select_number_extra') {
            // 複合入力: テキスト/数値部分の変更
            const current = answers[questionId] || { selected: '', extra: '' }
            setAnswers({ ...answers, [questionId]: { ...current, extra: value } })
        } else {
            setAnswers({ ...answers, [questionId]: value })
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isContactInfoValid()) return
        setIsSubmitting(true)
        setErrorData(null)

        // 送信用のデータ構造を作成
        const unitCost = Math.ceil(estimatedPrice / (oemQuantity || 1))
        const simulatedSalesPrice = Math.ceil(unitCost / 0.7)

        const selectedOptionsDetails = [
            { question: 'OEM製造数', answer: `${oemQuantity}個`, type: 'number' },
            { question: '概算お見積り金額(税抜)', answer: `¥${estimatedPrice.toLocaleString()}`, type: 'number' },
            { question: '1個あたり仕入原価(税抜)', answer: `¥${unitCost.toLocaleString()}`, type: 'number' },
            { question: '想定売価 (利益率30%)', answer: `¥${simulatedSalesPrice.toLocaleString()}`, type: 'number' },
            ...Object.entries(answers)
                .map(([qId, val]) => {
                    const q = steps.flatMap(s => s.questions).find(q => q.id === qId)
                    if (!q || !isQuestionVisible(q)) return null

                    let displayValue = String(val)
                    if (q.input_type === 'text' || q.input_type === 'textarea' || q.input_type === 'number') {
                        displayValue = String(val)
                    } else if (typeof val === 'object' && !Array.isArray(val) && val.selected) {
                        const opt = q.options.find((o: any) => o.id === val.selected)
                        displayValue = opt ? opt.label : val.selected
                        if (val.extra) displayValue += ` (${val.extra})`
                    } else if (Array.isArray(val)) {
                        displayValue = val.map((id: string) => q.options.find((o: any) => o.id === id)?.label || id).join(', ')
                    } else {
                        const opt = q.options.find((o: any) => o.id === val)
                        displayValue = opt ? opt.label : String(val)
                    }

                    return {
                        question: q.question_text || qId,
                        answer: displayValue,
                        raw_answer: val,
                        type: q.input_type
                    }
                })
                .filter(Boolean)
        ]

        const res = await submitLead({
            companyName: contactInfo.companyName,
            contactName: contactInfo.contactName,
            email: contactInfo.email,
            phone: contactInfo.phone,
            notes: contactInfo.notes,
            estimatedTotalPrice: estimatedPrice,
            selectedOptions: selectedOptionsDetails
        })

        if (res.success) {
            setIsSuccess(true)
        } else {
            setErrorData(res.error || 'エラーが発生しました')
            setIsSubmitting(false)
        }
    }

    // プログレスバー
    const progressPercent = Math.round((currentStep / (steps.length + 1 || 1)) * 100)

    // === レンダリング部品 ===
    const renderQuestionInput = (q: any) => {
        const val = answers[q.id] || (q.input_type === 'checkbox' ? [] : (q.input_type === 'select_text' || q.input_type === 'select_number') ? { selected: '', extra: '' } : '')

        switch (q.input_type) {
            case 'radio': {
                const hasImages = q.options.some((o: any) => o.image_url)
                return (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: hasImages ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(auto-fill, minmax(240px, 1fr))',
                        gap: '12px',
                        marginTop: '16px',
                    }}>
                        {q.options.map((opt: any) => {
                            const isSelected = val === opt.id
                            return (
                                <label
                                    key={opt.id}
                                    style={{
                                        display: 'flex',
                                        flexDirection: hasImages ? 'column' : 'row',
                                        alignItems: hasImages ? 'stretch' : 'center',
                                        justifyContent: hasImages ? 'flex-start' : 'space-between',
                                        padding: hasImages ? '0' : '16px',
                                        borderRadius: '16px',
                                        border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.1)',
                                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        overflow: 'hidden',
                                        boxShadow: isSelected ? '0 0 20px rgba(99,102,241,0.2)' : 'none',
                                    }}
                                >
                                    {hasImages && opt.image_url && (
                                        <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', position: 'relative', background: 'rgba(0,0,0,0.3)' }}>
                                            <img
                                                src={opt.image_url}
                                                alt={opt.label}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            {isSelected && (
                                                <div style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', background: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>✓</div>
                                            )}
                                        </div>
                                    )}
                                    <div style={{ padding: hasImages ? '12px' : '0', display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: hasImages ? 'center' : 'flex-start' }}>
                                        <input
                                            type="radio"
                                            name={q.id}
                                            value={opt.id}
                                            checked={isSelected}
                                            onChange={() => handleAnswerChange(q.id, opt.id, 'radio')}
                                            style={{ display: hasImages ? 'none' : 'block', width: '16px', height: '16px', accentColor: '#818cf8' }}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: hasImages ? 'center' : 'flex-start', padding: hasImages ? '0 4px' : '0' }}>
                                            <span style={{ fontWeight: 600, color: '#fff', fontSize: hasImages ? '15px' : '16px', textAlign: hasImages ? 'center' : 'left', lineHeight: 1.3 } as React.CSSProperties}>{opt.label}</span>
                                            {opt.description && (
                                                <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.7)', textAlign: hasImages ? 'center' : 'left', marginTop: '6px', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-line' } as React.CSSProperties}>
                                                    {opt.description}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {opt.price_modifier > 0 && (
                                        <div style={{ padding: hasImages ? '0 12px 12px' : '0', textAlign: hasImages ? 'center' : 'right' } as React.CSSProperties}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8' }}>
                                                +{opt.price_modifier.toLocaleString()}円
                                            </span>
                                        </div>
                                    )}
                                </label>
                            )
                        })}
                    </div>
                )
            }

            case 'checkbox':
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {q.options.map((opt: any) => {
                            const checked = Array.isArray(val) && val.includes(opt.id)
                            return (
                                <label
                                    key={opt.id}
                                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${checked
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                        : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            value={opt.id}
                                            checked={checked}
                                            onChange={() => handleAnswerChange(q.id, opt.id, 'checkbox')}
                                            className="w-4 h-4 accent-[var(--color-primary)] rounded"
                                        />
                                        <div className="flex flex-col py-1">
                                            <span className="font-semibold text-white text-[15px]">{opt.label}</span>
                                            {opt.description && <span className="text-[11.5px] text-white/70 mt-1.5 leading-relaxed whitespace-pre-line break-words">{opt.description}</span>}
                                        </div>
                                    </div>
                                    {opt.price_modifier > 0 && (
                                        <span className="text-sm font-bold text-[var(--color-primary)]">
                                            +{opt.price_modifier.toLocaleString()}円
                                        </span>
                                    )}
                                </label>
                            )
                        })}
                    </div>
                )

            case 'select': {
                const selectedOpt = q.options?.find((o: any) => o.id === val)
                return (
                    <div className="mt-4 space-y-3">
                        <div className="relative">
                            <select
                                value={val || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select')}
                                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none cursor-pointer"
                                required={q.is_required}
                            >
                                <option value="" disabled className="text-black">選択してください</option>
                                {q.options?.map((opt: any) => (
                                    <option value={opt.id} key={opt.id} className="text-black">
                                        {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier.toLocaleString()}円)` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
                        </div>
                        {selectedOpt?.description && (
                            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-xl p-4 relative overflow-hidden">
                                <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-line break-words relative z-10">
                                    {selectedOpt.description}
                                </p>
                            </div>
                        )}
                    </div>
                )
            }

            case 'textarea':
                return (
                    <textarea
                        value={val || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value, 'textarea')}
                        rows={4}
                        className="w-full mt-4 bg-[rgba(15,23,42,0.4)] border border-white/20 rounded-xl px-5 py-4 text-[15px] text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none shadow-inner"
                        required={q.is_required}
                    />
                )

            case 'number':
                return (
                    <div className="flex items-center gap-2 mt-4 max-w-xs">
                        <input
                            type="number"
                            value={val || ''}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value, 'number')}
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors text-right"
                            placeholder="0"
                            required={q.is_required}
                            min="0"
                        />
                        <span className="text-[var(--color-text-muted)] font-medium">個</span>
                    </div>
                )

            case 'select_text': {
                const selectedOptText = q.options?.find((o: any) => o.id === val?.selected)
                return (
                    <div className="mt-4 space-y-4 bg-white/5 border border-white/10 p-5 rounded-2xl">
                        <div className="relative">
                            <select
                                value={val?.selected || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_text_selected')}
                                className="w-full bg-[rgba(15,23,42,0.6)] border border-white/20 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none cursor-pointer font-medium"
                                required={q.is_required}
                            >
                                <option value="" disabled className="text-black">項目を選択してください</option>
                                {q.options?.map((opt: any) => (
                                    <option value={opt.id} key={opt.id} className="text-black">
                                        {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier.toLocaleString()}円)` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
                        </div>

                        {selectedOptText?.description && (
                            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-xl p-4">
                                <p className="text-[13.5px] text-white/90 leading-relaxed whitespace-pre-line break-words">
                                    {selectedOptText.description}
                                </p>
                            </div>
                        )}

                        <div className="pt-1">
                            <input
                                type="text"
                                value={val?.extra || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_text_extra')}
                                className="w-full bg-[rgba(15,23,42,0.6)] border border-white/20 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                                placeholder="上記に関する詳細テキストをご入力ください"
                            />
                        </div>
                    </div>
                )
            }

            case 'select_number': {
                const selectedOptNum = q.options?.find((o: any) => o.id === val?.selected)
                return (
                    <div className="mt-4 space-y-4 bg-white/5 border border-white/10 p-5 rounded-2xl">
                        <div className="relative">
                            <select
                                value={val?.selected || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_number_selected')}
                                className="w-full bg-[rgba(15,23,42,0.6)] border border-white/20 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none cursor-pointer font-medium"
                                required={q.is_required}
                            >
                                <option value="" disabled className="text-black">項目を選択してください</option>
                                {q.options?.map((opt: any) => (
                                    <option value={opt.id} key={opt.id} className="text-black">
                                        {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier.toLocaleString()}円)` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
                        </div>

                        {selectedOptNum?.description && (
                            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-xl p-4">
                                <p className="text-[13.5px] text-white/90 leading-relaxed whitespace-pre-line break-words">
                                    {selectedOptNum.description}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                            <input
                                type="number"
                                value={val?.extra || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_number_extra')}
                                className="w-2/3 max-w-[160px] bg-[rgba(15,23,42,0.6)] border border-white/20 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors text-right font-medium text-lg"
                                placeholder="0"
                                min="0"
                            />
                            <span className="text-[15px] text-white/70 font-medium">個</span>
                        </div>
                    </div>
                )
            }

            case 'text':
            default:
                return (
                    <input
                        type="text"
                        value={val || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value, 'text')}
                        className="w-full mt-4 bg-[rgba(15,23,42,0.4)] border border-white/20 rounded-xl px-5 py-4 text-[15px] text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors shadow-inner"
                        required={q.is_required}
                    />
                )
        }
    }

    // データ未登録時のフォールバック
    if (!steps || steps.length === 0) {
        return (
            <div className="w-full max-w-4xl mx-auto rounded-3xl glass p-12 text-center text-white/70">
                <p>現在、お見積りフォームの準備中です。</p>
            </div>
        )
    }

    // 完了画面
    if (isSuccess) {
        return (
            <div className="w-full max-w-3xl mx-auto">
                <div className="glass rounded-3xl p-10 md:p-16 text-center shadow-lg border border-[var(--color-border)]">
                    <div className="w-20 h-20 mx-auto bg-green-500/10 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                        お問い合わせが完了しました
                    </h2>
                    <p className="text-[var(--color-text-muted)] leading-relaxed mb-8">
                        お見積もりのご依頼、誠にありがとうございます。<br />
                        ご入力いただいた内容は正常に送信されました。<br />
                        担当者より【3営業日以内】に折り返しご連絡させていただきます。
                    </p>
                    <div className="inline-block bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
                        <div className="text-sm text-white/50 mb-1">概算お見積り金額 ({oemQuantity}個)</div>
                        <div className="text-2xl font-bold text-[var(--color-primary)]">¥{estimatedPrice.toLocaleString()}〜</div>
                        <div className="text-xs text-white/40 mt-1">(うち消費税 ¥{estimatedTax.toLocaleString()})</div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ width: '100%', maxWidth: '960px', marginLeft: 'auto', marginRight: 'auto', position: 'relative', zIndex: 1 }}>

            {/* フォームコンテナ */}
            <div style={{
                borderRadius: '24px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(15,23,42,0.8)',
                backdropFilter: 'blur(20px)',
            }}>

                {/* 上部：ステップインジケーター（モバイル対応のシンプルバー） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{
                        flex: 1, padding: '16px 8px', textAlign: 'center',
                        borderBottom: currentStep === 0 ? '3px solid #818cf8' : currentStep > 0 ? '3px solid rgba(129,140,248,0.3)' : '3px solid transparent',
                        transition: 'all 0.3s',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 700,
                            background: currentStep === 0 ? '#818cf8' : currentStep > 0 ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.08)',
                            color: currentStep === 0 ? '#fff' : currentStep > 0 ? '#818cf8' : 'rgba(255,255,255,0.4)',
                            border: currentStep === 0 ? 'none' : currentStep > 0 ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(255,255,255,0.1)',
                        }}>
                            {currentStep > 0 ? '✓' : '1'}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: currentStep === 0 ? '#fff' : currentStep > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)' }}>製造数</span>
                    </div>

                    {steps.map((s, idx) => {
                        const stepIndex = idx + 1
                        const isActive = stepIndex === currentStep
                        const isPast = stepIndex < currentStep
                        return (
                            <div key={s.id} style={{
                                flex: 1, padding: '16px 8px', textAlign: 'center',
                                borderBottom: isActive ? '3px solid #818cf8' : isPast ? '3px solid rgba(129,140,248,0.3)' : '3px solid transparent',
                                transition: 'all 0.3s',
                            }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 6px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 700,
                                    background: isActive ? '#818cf8' : isPast ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.08)',
                                    color: isActive ? '#fff' : isPast ? '#818cf8' : 'rgba(255,255,255,0.4)',
                                    border: isActive ? 'none' : isPast ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                }}>
                                    {isPast ? '✓' : stepIndex + 1}
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#fff' : isPast ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)' }}>{s.step_title}</span>
                            </div>
                        )
                    })}
                    {/* 結果ステップ */}
                    <div style={{
                        flex: 1, padding: '16px 8px', textAlign: 'center',
                        borderBottom: currentStep >= RESULT_STEP ? '3px solid #818cf8' : '3px solid transparent',
                    }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 700,
                            background: currentStep >= RESULT_STEP ? '#818cf8' : 'rgba(255,255,255,0.08)',
                            color: currentStep >= RESULT_STEP ? '#fff' : 'rgba(255,255,255,0.4)',
                            border: currentStep >= RESULT_STEP ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        }}>
                            💰
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: currentStep >= RESULT_STEP ? '#fff' : 'rgba(255,255,255,0.4)' }}>お見積り</span>
                    </div>
                </div>


                {/* 見積もりバー（質問ステップのみ表示） */}
                {currentStep < RESULT_STEP && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 24px',
                        background: 'rgba(99,102,241,0.08)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>💰 現在のお見積り ({oemQuantity}個)</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '22px', fontWeight: 800, background: 'linear-gradient(90deg, #818cf8, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                ¥{estimatedPrice.toLocaleString()}〜
                            </span>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                                (うち消費税 ¥{estimatedTax.toLocaleString()})
                            </span>
                        </div>
                    </div>
                )}

                {/* メインフォーム領域 */}
                <div style={{ padding: '32px 24px', position: 'relative', overflow: 'hidden', minHeight: '320px' }}>

                    <AnimatePresence mode="wait" initial={false}>
                        {/* ====== OEM数量ステップ ====== */}
                        {currentStep === 0 && (
                            <motion.div
                                key="step-oem-quantity"
                                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                style={{ flex: 1 }}
                            >
                                <div style={{ marginBottom: '32px' }}>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>OEM製造数の入力</h2>
                                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>まずはご希望の製造数をご入力ください（400個〜800個）</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    <div style={{ position: 'relative', zIndex: 10 }}>
                                        <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            製造予定数量
                                            <span style={{ color: '#f87171', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(248,113,113,0.1)' }}>必須</span>
                                        </h4>
                                        <div className="flex items-center gap-2 max-w-xs">
                                            <input
                                                type="number"
                                                value={oemQuantity}
                                                onChange={(e) => setOemQuantity(Number(e.target.value))}
                                                min={400}
                                                max={800}
                                                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors text-right text-lg font-bold"
                                            />
                                            <span className="text-[var(--color-text-muted)] font-medium">個</span>
                                        </div>
                                        {(oemQuantity < 400 || oemQuantity > 800) && (
                                            <p style={{ color: '#f87171', fontSize: '13px', marginTop: '8px' }}>※ 400個から800個の間で入力してください。</p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ====== 通常の質問ステップ ====== */}
                        {currentStep > 0 && currentStep <= steps.length && (
                            <motion.div
                                key={`step-${currentStep}`}
                                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                style={{ flex: 1 }}
                            >
                                <div style={{ marginBottom: '32px' }}>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>{steps[currentStep - 1]?.step_title}</h2>
                                    {steps[currentStep - 1]?.step_description && (
                                        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{steps[currentStep - 1].step_description}</p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    {steps[currentStep - 1]?.questions
                                        ?.filter(q => isQuestionVisible(q))
                                        .map((q, idx) => (
                                            <div key={q.id} style={{ position: 'relative', zIndex: 10 }}>
                                                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        {idx + 1}
                                                    </span>
                                                    {q.question_text}
                                                    {q.is_required && <span style={{ color: '#f87171', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(248,113,113,0.1)' }}>必須</span>}
                                                </h4>
                                                {q.help_text && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '6px', marginLeft: '30px' }}>{q.help_text}</p>}
                                                <div style={{ marginLeft: '30px' }}>
                                                    {renderQuestionInput(q)}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </motion.div>
                        )}

                        {/* ====== 見積もり結果画面 ====== */}
                        {currentStep === RESULT_STEP && (
                            <motion.div
                                key="step-result"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.3 }}
                                style={{ flex: 1 }}
                            >
                                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>お見積り結果</h2>
                                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>ご回答いただいた内容に基づく概算金額です</p>
                                </div>

                                {/* 金額表示 */}
                                <div style={{
                                    textAlign: 'center', padding: '32px', borderRadius: '16px',
                                     background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(236,72,153,0.1))',
                                    border: '1px solid rgba(99,102,241,0.2)', marginBottom: '32px',
                                }}>
                                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: 500 }}>概算お見積り金額 ({oemQuantity}個)</div>
                                    <div style={{ fontSize: '42px', fontWeight: 800, background: 'linear-gradient(90deg, #818cf8, #e879f9, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '8px' }}>
                                        ¥{estimatedPrice.toLocaleString()}<span style={{ fontSize: '20px' }}>〜</span>
                                    </div>
                                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '8px', fontWeight: 600 }}>(うち消費税 ¥{estimatedTax.toLocaleString()})</div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>※ 最終金額は個別にお見積りいたします。すべて税込表記です。</div>

                                    {/* 単価・販売プランシミュレーション */}
                                    <div style={{
                                        marginTop: '32px', paddingTop: '32px', borderTop: '1px dashed rgba(255,255,255,0.15)',
                                        display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left'
                                    }}>
                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                                                <span>📦</span> 1個あたり仕入原価
                                            </div>
                                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                                                ¥{Math.ceil(estimatedPrice / (oemQuantity || 1)).toLocaleString()}
                                            </div>
                                        </div>

                                        <div style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(217,119,6,0.1))', padding: '24px', borderRadius: '16px', border: '1px solid rgba(234,179,8,0.3)' }}>
                                            <div style={{ fontSize: '15px', color: '#fcd34d', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                                                <span>💡</span> 販売プランシミュレーション
                                            </div>
                                            
                                            <div style={{ display: 'grid', gap: '12px' }}>
                                                {[30, 40, 50].map(margin => {
                                                    const unitCost = Math.ceil(estimatedPrice / (oemQuantity || 1))
                                                    const sellingPrice = Math.ceil(unitCost / (1 - margin / 100))
                                                    const profit = sellingPrice - unitCost
                                                    
                                                    return (
                                                        <div key={margin} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '6px 0', borderRadius: '6px', textAlign: 'center' }}>
                                                                利益 {margin}%
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>想定売価</div>
                                                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>¥{sellingPrice.toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>1個あたり利益</div>
                                                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80' }}>+¥{profit.toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 選択内容サマリー */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>📋 ご回答内容</h3>
                                    {steps.flatMap(s => s.questions).filter(q => isQuestionVisible(q) && answers[q.id]).map(q => {
                                        const answer = answers[q.id]
                                        let displayValue = ''

                                        if (q.input_type === 'text' || q.input_type === 'textarea' || q.input_type === 'number') {
                                            displayValue = String(answer)
                                        } else if (typeof answer === 'object' && !Array.isArray(answer) && answer.selected) {
                                            const opt = q.options.find((o: any) => o.id === answer.selected)
                                            displayValue = opt ? opt.label : answer.selected
                                            if (answer.extra) displayValue += ` (${answer.extra})`
                                        } else if (Array.isArray(answer)) {
                                            displayValue = answer.map((id: string) => q.options.find((o: any) => o.id === id)?.label || id).join(', ')
                                        } else {
                                            const opt = q.options.find((o: any) => o.id === answer)
                                            displayValue = opt ? opt.label : String(answer)
                                        }

                                        return (
                                            <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{q.question_text}</span>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', textAlign: 'right', maxWidth: '50%' }}>{displayValue}</span>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* 仮申込ボタン */}
                                <div style={{ textAlign: 'center' }}>
                                    <button
                                        onClick={handleApply}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '12px',
                                            padding: '16px 48px', borderRadius: '9999px',
                                            fontSize: '16px', fontWeight: 700,
                                            background: 'linear-gradient(135deg, #22c55e, #10b981)',
                                            color: '#fff', border: 'none', cursor: 'pointer',
                                            boxShadow: '0 8px 32px rgba(34,197,94,0.3)',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        🚀 この内容で仮申込する
                                    </button>
                                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px' }}>
                                        仮申込後にお客様情報をご入力いただきます
                                    </p>
                                </div>
                            </motion.div>
                        )}

                        {/* ====== お客様情報入力（仮申込後のみ） ====== */}
                        {currentStep === CONTACT_STEP && (
                            <motion.div
                                key="step-contact"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.3 }}
                                style={{ flex: 1 }}
                            >
                                <div style={{ marginBottom: '32px' }}>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>お客様情報の入力</h2>
                                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>お見積り内容をお送りするため、ご連絡先をご入力ください。</p>
                                    <div style={{ display: 'inline-block', marginTop: '12px', padding: '8px 16px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>お見積り金額: </span>
                                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#818cf8' }}>¥{estimatedPrice.toLocaleString()}〜</span>
                                    </div>
                                </div>

                                <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} onSubmit={handleSubmit}>
                                    {errorData && (
                                        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                                            <p style={{ fontSize: '14px', color: '#f87171' }}>{errorData}</p>
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>貴社名 / 屋号 <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span></label>
                                        <input required type="text" value={contactInfo.companyName} onChange={e => setContactInfo({ ...contactInfo, companyName: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="株式会社〇〇" />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>ご担当者名 <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span></label>
                                        <input required type="text" value={contactInfo.contactName} onChange={e => setContactInfo({ ...contactInfo, contactName: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="山田 太郎" />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>メールアドレス <span style={{ color: '#f87171', marginLeft: '4px' }}>*</span></label>
                                            <input required type="email" value={contactInfo.email} onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="info@example.com" />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>電話番号</label>
                                            <input type="tel" value={contactInfo.phone} onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="03-0000-0000" />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>その他ご要望・備考事項</label>
                                        <textarea rows={3} value={contactInfo.notes} onChange={e => setContactInfo({ ...contactInfo, notes: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', resize: 'none', fontSize: '15px' }} placeholder="ご不明点や特記事項があればご記入ください" />
                                    </div>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* フッターのアクションボタン群 */}
                    <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button
                            onClick={handlePrev}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                                fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.5)',
                                background: 'none', border: 'none', cursor: 'pointer',
                                visibility: currentStep === 0 ? 'hidden' : 'visible',
                            }}
                        >
                            <ChevronLeft style={{ width: '16px', height: '16px' }} /> 戻る
                        </button>

                        {currentStep <= steps.length ? (
                            <button
                                onClick={handleNext}
                                disabled={!isCurrentStepValid()}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 32px',
                                    borderRadius: '9999px', fontSize: '14px', fontWeight: 700,
                                    background: isCurrentStepValid() ? 'linear-gradient(135deg, #818cf8, #6366f1)' : 'rgba(255,255,255,0.1)',
                                    color: '#fff', border: 'none', cursor: isCurrentStepValid() ? 'pointer' : 'not-allowed',
                                    opacity: isCurrentStepValid() ? 1 : 0.4,
                                    boxShadow: isCurrentStepValid() ? '0 8px 24px rgba(99,102,241,0.3)' : 'none',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {currentStep === steps.length ? '結果を見る' : '次のステップへ'} <ChevronRight style={{ width: '16px', height: '16px' }} />
                            </button>
                        ) : currentStep === CONTACT_STEP ? (
                            <button
                                onClick={handleSubmit}
                                disabled={!isContactInfoValid() || isSubmitting}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 32px',
                                    borderRadius: '9999px', fontSize: '14px', fontWeight: 700,
                                    background: isContactInfoValid() ? 'linear-gradient(135deg, #22c55e, #10b981)' : 'rgba(255,255,255,0.1)',
                                    color: '#fff', border: 'none', cursor: isContactInfoValid() ? 'pointer' : 'not-allowed',
                                    opacity: isContactInfoValid() && !isSubmitting ? 1 : 0.5,
                                    boxShadow: isContactInfoValid() ? '0 8px 24px rgba(34,197,94,0.3)' : 'none',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {isSubmitting ? (
                                    <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                ) : (
                                    <CheckCircle2 style={{ width: '20px', height: '20px' }} />
                                )}
                                {isSubmitting ? '送信中...' : 'この内容で送信する'}
                            </button>
                        ) : (
                            <div />
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
