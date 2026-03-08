'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import type { FormStepWithItems } from '@/actions/publicForm'
import { submitLead } from '@/actions/publicForm'

export default function InteractiveForm({ steps }: { steps: FormStepWithItems[] }) {
    const [currentStep, setCurrentStep] = useState(0)
    const [direction, setDirection] = useState(1) // 1 = 次へ, -1 = 戻る
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [errorData, setErrorData] = useState<string | null>(null)

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
    const estimatedPrice = useMemo(() => {
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

    // === 条件分岐：質問が表示されるかどうか ===
    const isQuestionVisible = (q: any) => {
        if (!q.depends_on_option_id) return true // 条件なし → 常に表示
        // 全回答の中に、依存先optionが選択されているか確認
        for (const [, answer] of Object.entries(answers)) {
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
        if (currentStep >= steps.length) return false
        const currentQuestions = steps[currentStep].questions

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
    const handleNext = () => {
        if (isCurrentStepValid()) {
            setDirection(1)
            setCurrentStep(prev => Math.min(prev + 1, steps.length))
        }
    }

    const handlePrev = () => {
        setDirection(-1)
        setCurrentStep(prev => Math.max(prev - 1, 0))
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
        const selectedOptionsDetails = Object.entries(answers).map(([qId, val]) => {
            const q = steps.flatMap(s => s.questions).find(q => q.id === qId)
            return {
                question: q?.question_text || qId,
                answer: val,
                type: q?.input_type
            }
        })

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
    const progressPercent = Math.round((currentStep / (steps.length || 1)) * 100)

    // === レンダリング部品 ===
    const renderQuestionInput = (q: any) => {
        const val = answers[q.id] || (q.input_type === 'checkbox' ? [] : (q.input_type === 'select_text' || q.input_type === 'select_number') ? { selected: '', extra: '' } : '')

        switch (q.input_type) {
            case 'radio':
                return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {q.options.map((opt: any) => (
                            <label
                                key={opt.id}
                                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${val === opt.id
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                    : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        name={q.id}
                                        value={opt.id}
                                        checked={val === opt.id}
                                        onChange={() => handleAnswerChange(q.id, opt.id, 'radio')}
                                        className="w-4 h-4 accent-[var(--color-primary)]"
                                    />
                                    <span className="font-medium text-white">{opt.label}</span>
                                </div>
                                {opt.price_modifier > 0 && (
                                    <span className="text-sm font-bold text-[var(--color-primary)]">
                                        +{opt.price_modifier.toLocaleString()}円
                                    </span>
                                )}
                            </label>
                        ))}
                    </div>
                )

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
                                        <span className="font-medium text-white">{opt.label}</span>
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

            case 'select':
                return (
                    <select
                        value={val}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select')}
                        className="w-full mt-4 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none"
                        required={q.is_required}
                    >
                        <option value="" disabled className="text-black">選択してください</option>
                        {q.options.map((opt: any) => (
                            <option value={opt.id} key={opt.id} className="text-black">
                                {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier}円)` : ''}
                            </option>
                        ))}
                    </select>
                )

            case 'textarea':
                return (
                    <textarea
                        value={val}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value, 'textarea')}
                        rows={4}
                        className="w-full mt-4 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none"
                        placeholder={q.question_text + "を入力"}
                        required={q.is_required}
                    />
                )

            case 'number':
                return (
                    <div className="flex items-center gap-2 mt-4 max-w-xs">
                        <input
                            type="number"
                            value={val}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value, 'number')}
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors text-right"
                            placeholder="0"
                            required={q.is_required}
                            min="0"
                        />
                        <span className="text-[var(--color-text-muted)] font-medium">個</span>
                    </div>
                )

            case 'select_text':
                return (
                    <div className="mt-4 space-y-3">
                        <select
                            value={val?.selected || ''}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_text_selected')}
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none"
                            required={q.is_required}
                        >
                            <option value="" disabled className="text-black">選択してください</option>
                            {q.options.map((opt: any) => (
                                <option value={opt.id} key={opt.id} className="text-black">
                                    {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier.toLocaleString()}円)` : ''}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={val?.extra || ''}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_text_extra')}
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                            placeholder="詳細をご入力ください"
                        />
                    </div>
                )

            case 'select_number':
                return (
                    <div className="mt-4 space-y-3">
                        <select
                            value={val?.selected || ''}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_number_selected')}
                            className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors appearance-none"
                            required={q.is_required}
                        >
                            <option value="" disabled className="text-black">選択してください</option>
                            {q.options.map((opt: any) => (
                                <option value={opt.id} key={opt.id} className="text-black">
                                    {opt.label} {opt.price_modifier > 0 ? `(+${opt.price_modifier.toLocaleString()}円)` : ''}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2 max-w-xs">
                            <input
                                type="number"
                                value={val?.extra || ''}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_number_extra')}
                                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors text-right"
                                placeholder="0"
                                min="0"
                            />
                            <span className="text-[var(--color-text-muted)] font-medium">個</span>
                        </div>
                    </div>
                )

            case 'text':
            default:
                return (
                    <input
                        type="text"
                        value={val}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value, 'text')}
                        className="w-full mt-4 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                        placeholder={q.question_text + "を入力"}
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
                        <div className="text-sm text-white/50 mb-1">概算お見積り金額</div>
                        <div className="text-2xl font-bold text-[var(--color-primary)]">¥{estimatedPrice.toLocaleString()}〜</div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full max-w-4xl mx-auto">

            {/* フォームコンテナ */}
            <div className="glass rounded-3xl shadow-lg border border-[var(--color-border)] overflow-hidden flex flex-col md:flex-row">

                {/* 左側：ナビゲーション・ステップ概要 */}
                <div className="w-full md:w-1/3 bg-black/40 border-b md:border-b-0 md:border-r border-white/10 p-6 md:p-8 flex flex-col relative z-20">
                    <div className="mb-8">
                        <h3 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>BTO お見積り</h3>
                        <p className="text-sm text-[var(--color-text-muted)] mt-2">ステップに沿ってご要望をお聞かせください。</p>
                    </div>

                    <div className="hidden md:block space-y-5 flex-1 relative">
                        {/* プログレス縦線 */}
                        <div className="absolute left-[15px] top-6 bottom-6 w-[2px] bg-white/10 -z-10 rounded-full"></div>
                        <div
                            className="absolute left-[15px] top-6 w-[2px] bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-accent)] -z-10 rounded-full transition-all duration-500"
                            style={{ height: `calc(${progressPercent}% - 32px)` }}
                        ></div>

                        {steps.map((s, idx) => {
                            const isActive = idx === currentStep
                            const isPast = idx < currentStep
                            return (
                                <div key={s.id} className={`flex items-start gap-4 transition-all duration-300 ${isActive ? 'opacity-100 scale-105' : 'opacity-40'}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' :
                                        isPast ? 'border-[var(--color-primary)] bg-transparent text-[var(--color-primary)]' :
                                            'border-white/20 bg-black text-white/50'
                                        }`}>
                                        <span className="text-xs font-bold">{idx + 1}</span>
                                    </div>
                                    <div className="pt-1.5">
                                        <p className={`text-sm font-bold ${isActive ? 'text-white' : 'text-white/70'}`}>{s.step_title}</p>
                                    </div>
                                </div>
                            )
                        })}

                        {/* お客様情報ステップ (最後) */}
                        <div className={`flex items-start gap-4 transition-all duration-300 mt-5 ${currentStep === steps.length ? 'opacity-100 scale-105' : 'opacity-40'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${currentStep === steps.length ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-white/20 bg-black text-white/50'
                                }`}>
                                <span className="text-xs font-bold text-white">✓</span>
                            </div>
                            <div className="pt-1.5">
                                <p className={`text-sm font-bold ${currentStep === steps.length ? 'text-white' : 'text-white/70'}`}>お客様情報</p>
                            </div>
                        </div>
                    </div>

                    {/* 右下: 現在の金額表示 */}
                    <div className="mt-6 md:mt-0 pt-6 border-t border-white/10 md:bg-black/20 md:-mx-8 md:-mb-8 md:p-8 md:border-t-0 bg-transparent flex justify-between items-center md:flex-col md:items-start md:gap-2">
                        <span className="text-sm font-medium text-white/60">現在のお見積り</span>
                        <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] tracking-tight">
                            ¥{estimatedPrice.toLocaleString()}〜
                        </span>
                    </div>
                </div>

                {/* 右側：メインフォーム領域 */}
                <div className="w-full md:w-2/3 p-6 md:p-10 relative overflow-hidden flex flex-col">

                    <AnimatePresence mode="wait" initial={false}>
                        {/* ====== 通常のステップ ====== */}
                        {currentStep < steps.length && (
                            <motion.div
                                key={`step-${currentStep}`}
                                initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="flex-1"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-white mb-2">{steps[currentStep]?.step_title}</h2>
                                    {steps[currentStep]?.step_description && (
                                        <p className="text-sm text-[var(--color-text-muted)]">{steps[currentStep].step_description}</p>
                                    )}
                                </div>

                                <div className="space-y-8">
                                    {steps[currentStep]?.questions
                                        .filter(q => isQuestionVisible(q))
                                        .map((q, idx) => (
                                            <div key={q.id} className="relative z-10">
                                                <h4 className="text-[15px] font-bold text-white/90 mb-1 flex items-center gap-2">
                                                    <span className="w-5 h-5 rounded-full bg-white/10 text-white/50 text-[10px] flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    {q.question_text}
                                                    {q.is_required && <span className="text-red-400 text-xs px-1.5 py-0.5 rounded bg-red-400/10">必須</span>}
                                                </h4>
                                                {q.help_text && <p className="text-xs text-white/50 mt-1.5 ml-7">{q.help_text}</p>}

                                                <div className="ml-7">
                                                    {renderQuestionInput(q)}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </motion.div>
                        )}

                        {/* ====== 最終ステップ：お客様情報 ====== */}
                        {currentStep === steps.length && (
                            <motion.div
                                key="step-final"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                transition={{ duration: 0.3 }}
                                className="flex-1"
                            >
                                <div className="mb-8">
                                    <h2 className="text-2xl font-bold text-white mb-2">お客様情報の入力</h2>
                                    <p className="text-sm text-[var(--color-text-muted)]">最後にお客様のご連絡先を入力してください。</p>
                                </div>

                                <form className="space-y-5" onSubmit={handleSubmit}>
                                    {errorData && (
                                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                            <p className="text-sm text-red-400">{errorData}</p>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">貴社名 / 屋号 <span className="text-red-400 ml-1">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            value={contactInfo.companyName}
                                            onChange={e => setContactInfo({ ...contactInfo, companyName: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                            placeholder="株式会社〇〇"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">ご担当者名 <span className="text-red-400 ml-1">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            value={contactInfo.contactName}
                                            onChange={e => setContactInfo({ ...contactInfo, contactName: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                            placeholder="山田 太郎"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-white/80 mb-2">メールアドレス <span className="text-red-400 ml-1">*</span></label>
                                            <input
                                                required
                                                type="email"
                                                value={contactInfo.email}
                                                onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                                placeholder="info@example.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-white/80 mb-2">電話番号</label>
                                            <input
                                                type="tel"
                                                value={contactInfo.phone}
                                                onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                                                placeholder="03-0000-0000"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-2">その他ご要望・備考事項</label>
                                        <textarea
                                            rows={3}
                                            value={contactInfo.notes}
                                            onChange={e => setContactInfo({ ...contactInfo, notes: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--color-primary)] transition-all resize-none"
                                            placeholder="ご不明点や特記事項があればご記入ください"
                                        />
                                    </div>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* フッターのアクションボタン群 */}
                    <div className="mt-10 pt-6 border-t border-white/10 flex items-center justify-between">
                        <button
                            onClick={handlePrev}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors ${currentStep === 0 ? 'invisible' : ''}`}
                        >
                            <ChevronLeft className="w-4 h-4" /> 戻る
                        </button>

                        {currentStep < steps.length ? (
                            <button
                                onClick={handleNext}
                                disabled={!isCurrentStepValid()}
                                className="flex items-center gap-3 px-8 py-3 rounded-full text-sm font-bold bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] text-white hover:scale-105 transition-transform disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg shadow-[var(--color-primary)]/20"
                            >
                                次のステップへ <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={!isContactInfoValid() || isSubmitting}
                                className="flex items-center gap-3 px-8 py-3 rounded-full text-sm font-bold bg-gradient-to-r from-green-500 to-emerald-400 text-white hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
                            >
                                {isSubmitting ? (
                                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-5 h-5" />
                                )}
                                {isSubmitting ? '送信中...' : 'この内容で送信する'}
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
