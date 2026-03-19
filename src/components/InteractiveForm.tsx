'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, ChevronDown, MessageSquareCode, MessageSquareX, Package } from 'lucide-react'
import Image from 'next/image'
import type { FormStepWithItems } from '@/actions/publicForm'
import { getFormStepsForProduct, submitLead } from '@/actions/publicForm'
import type { Product } from '@/types/database'

// 追加入力（詳細テキスト・数値）を非表示にするキーワード定義
const EXTRA_EXCLUSION_KEYWORDS = ['ない', 'なし', '無し', '不要', '該当なし', '特になし', '解除', '削除', 'いいえ', '否', 'none', 'null', 'n/a']

const shouldShowExtraInput = (label: string | null | undefined) => {
    if (!label) return false
    const normalized = label.trim().toLowerCase()
    return !EXTRA_EXCLUSION_KEYWORDS.some(k => normalized.includes(k))
}

export default function InteractiveForm({ steps: allSteps, products, pageId }: { steps: FormStepWithItems[]; products: Product[]; pageId: string }) {
    const [currentStep, setCurrentStep] = useState(0)
    const [direction, setDirection] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [errorData, setErrorData] = useState<string | null>(null)
    const [oemQuantity, setOemQuantity] = useState<number>(400)
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
    const [productSteps, setProductSteps] = useState<FormStepWithItems[]>([])
    const [loadingSteps, setLoadingSteps] = useState(false)
    const [isMobile, setIsMobile] = useState(false)

    // モバイル判定
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile() // 初期実行
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [contactInfo, setContactInfo] = useState({ companyName: '', contactName: '', email: '', phone: '', notes: '' })

    // 現在のステップ群（商品選択後は商品専用ステップ、かつ依存関係によるフィルタリングを適用）
    const filteredActiveSteps = useMemo(() => {
        if (!selectedProduct) return []
        
        // 1. まず全ての質問について表示可否を判定
        const isQuestionVisible = (q: any) => {
            if (!q.depends_on_option_id) return true
            // 全ての回答の中から、依存先のoption_idが選ばれているか探す
            return Object.values(answers).some(val => {
                if (Array.isArray(val)) return val.includes(q.depends_on_option_id)
                if (typeof val === 'object' && val !== null && val.selected) return val.selected === q.depends_on_option_id
                return val === q.depends_on_option_id
            })
        }

        // 2. 表示対象の質問を含むステップのみを抽出
        return productSteps.map(step => ({
            ...step,
            questions: step.questions.filter(isQuestionVisible)
        })).filter(step => step.questions.length > 0)
    }, [selectedProduct, productSteps, answers])

    const activeSteps = filteredActiveSteps

    // 0=数量, 1=商品選択, 2~N+1=フォーム, N+2=結果, N+3=お客様情報
    const PRODUCT_STEP = 1
    const FORM_START = 2
    // ステップ読み込み中は RESULT_STEP を一時的に後ろにずらし、一瞬結果画面が出るのを防ぐ
    const RESULT_STEP = loadingSteps ? 999 : FORM_START + activeSteps.length
    const CONTACT_STEP = RESULT_STEP + 1

    // activeSteps が (回答変更により) 縮小した場合、currentStep が範囲外になるのを防ぐ
    useEffect(() => {
        const resultStepVal = FORM_START + activeSteps.length
        // 結果画面やお客様情報画面にいる場合は補正不要
        if (currentStep >= resultStepVal) return

        if (currentStep >= FORM_START) {
            const maxFormStep = FORM_START + activeSteps.length - 1
            if (activeSteps.length > 0 && currentStep > maxFormStep) {
                // 現在のステップが消えたので、最後のフォームステップまで戻す
                setCurrentStep(maxFormStep)
            }
        }
    }, [activeSteps.length, currentStep, FORM_START])

    // 進捗インジケーターの計算（動的なステップ数に対応）
    const visualSteps = useMemo(() => {
        const labels = ['製造数', '商品']
        activeSteps.forEach(s => labels.push(s.step_title))
        labels.push('概算金額')
        labels.push('お客様情報')
        return labels
    }, [activeSteps])

    const currentVisualIdx = useMemo(() => {
        if (currentStep <= PRODUCT_STEP) return currentStep
        if (currentStep >= RESULT_STEP) {
            if (currentStep === RESULT_STEP) return visualSteps.length - 2
            return visualSteps.length - 1 // CONTACT_STEP
        }
        // フォーム領域内: currentStep - FORM_START がフォーム内のインデックス
        const formIdx = currentStep - FORM_START
        return FORM_START + Math.min(formIdx, activeSteps.length - 1)
    }, [currentStep, visualSteps, RESULT_STEP, PRODUCT_STEP, activeSteps.length])

    // 商品選択時にステップを取得
    useEffect(() => {
        if (!selectedProduct || !pageId) return
        setLoadingSteps(true)
        getFormStepsForProduct(pageId, selectedProduct).then(steps => {
            // 共通の「商品種別」ステップは除外（商品選択は既にUI側で行っている）
            const filtered = steps.filter(s => {
                const isProductSelector = s.questions.some(q => q.question_text === '作りたい商品はなんですか？')
                return !isProductSelector
            })
            setProductSteps(filtered)
            setLoadingSteps(false)
        })
    }, [selectedProduct, pageId])

    // 金額計算
    const unitPrice = useMemo(() => {
        let total = 0
        let percentageTotal = 0 // パーセント加算の合計
        // 商品ベース価格を追加（productsから取得した商品の基本価格）
        const productSelectStep = allSteps.find(s => s.questions.some(q => q.question_text === '作りたい商品はなんですか？'))
        if (productSelectStep && selectedProduct) {
            const productQ = productSelectStep.questions.find(q => q.question_text === '作りたい商品はなんですか？')
            if (productQ) {
                const selectedProd = products.find(p => p.id === selectedProduct)
                if (selectedProd) {
                    const opt = productQ.options.find(o => o.label === selectedProd.name)
                    if (opt) {
                        if (opt.price_modifier_type === 'percentage') {
                            percentageTotal += opt.price_modifier
                        } else {
                            total += opt.price_modifier
                        }
                    }
                }
            }
        }

        Object.entries(answers).forEach(([questionId, answer]) => {
            const q = activeSteps.flatMap(s => s.questions).find(q => q.id === questionId)
            if (!q) return
            let effectiveAnswer = answer
            if (answer && typeof answer === 'object' && !Array.isArray(answer) && answer.selected) {
                effectiveAnswer = answer.selected
            }
            const selectedOptionIds = Array.isArray(effectiveAnswer) ? effectiveAnswer : [effectiveAnswer]
            selectedOptionIds.forEach(val => {
                const opt = q.options.find(o => o.id === val)
                if (opt) {
                    if (opt.price_modifier_type === 'percentage') {
                        percentageTotal += opt.price_modifier
                    } else {
                        total += opt.price_modifier
                    }
                }
            })
        })
        return { fixed: total, percentage: percentageTotal }
    }, [answers, activeSteps, allSteps, selectedProduct, products])

    const basePrice = unitPrice.fixed * oemQuantity
    const estimatedPrice = Math.ceil(basePrice * (1 + unitPrice.percentage / 100))
    const estimatedTax = Math.round(estimatedPrice * 10 / 110)

    // バリデーション
    const isCurrentStepValid = () => {
        if (currentStep === 0) return oemQuantity >= 400 && oemQuantity <= 800
        if (currentStep === PRODUCT_STEP) return selectedProduct !== null
        if (currentStep >= FORM_START && currentStep < RESULT_STEP) {
            const stepData = activeSteps[currentStep - FORM_START]
            if (!stepData) return true
            for (const q of stepData.questions) {
                if (q.is_required) {
                    const val = answers[q.id]
                    if (!val || (Array.isArray(val) && val.length === 0)) return false
                    if (typeof val === 'object' && !Array.isArray(val) && !val.selected) return false
                }
            }
            return true
        }
        return false
    }

    const isContactInfoValid = () => contactInfo.companyName.trim() !== '' && contactInfo.contactName.trim() !== '' && contactInfo.email.includes('@')

    const handleNext = () => {
        if (!isCurrentStepValid()) return
        setDirection(1)
        setCurrentStep(currentStep + 1)
    }
    const handlePrev = () => {
        setDirection(-1)
        setCurrentStep(Math.max(0, currentStep - 1))
    }
    const handleApply = () => { setDirection(1); setCurrentStep(CONTACT_STEP) }

    const handleAnswerChange = (questionId: string, value: any, type: string) => {
        if (type === 'checkbox') {
            const currentVal = Array.isArray(answers[questionId]) ? answers[questionId] : []
            if (currentVal.includes(value)) setAnswers({ ...answers, [questionId]: currentVal.filter((v: string) => v !== value) })
            else setAnswers({ ...answers, [questionId]: [...currentVal, value] })
        } else if (type === 'select_text_selected' || type === 'select_number_selected') {
            const current = answers[questionId] || { selected: '', extra: '' }
            setAnswers({ ...answers, [questionId]: { ...current, selected: value } })
        } else if (type === 'select_text_extra' || type === 'select_number_extra') {
            const current = answers[questionId] || { selected: '', extra: '' }
            setAnswers({ ...answers, [questionId]: { ...current, extra: value } })
        } else {
            setAnswers({ ...answers, [questionId]: value })
        }
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!isContactInfoValid()) return
        setIsSubmitting(true)
        setErrorData(null)
        const unitCost = Math.ceil(estimatedPrice / (oemQuantity || 1))
        const selectedProd = products.find(p => p.id === selectedProduct)
        
        const selectedOptionsDetails = [
            { question: 'OEM製造数', answer: `${oemQuantity}個`, type: 'number' },
            { question: '商品', answer: selectedProd?.name || '', type: 'text' },
            { question: '概算お見積り金額(税抜)', answer: `¥${estimatedPrice.toLocaleString()}`, type: 'number' },
            { question: '1個あたり仕入原価(税抜)', answer: `¥${unitCost.toLocaleString()}`, type: 'number' },
            ...Object.entries(answers).map(([qId, val]) => {
                const q = activeSteps.flatMap(s => s.questions).find(q => q.id === qId)
                if (!q) return null
                let displayValue = String(val)
                if (typeof val === 'object' && !Array.isArray(val) && val.selected) {
                    const opt = q.options.find((o: any) => o.id === val.selected)
                    displayValue = opt ? opt.label : val.selected
                    const expectsExtra = opt && shouldShowExtraInput(opt.label)
                    if (expectsExtra && val.extra) displayValue += ` (${val.extra})`
                } else if (Array.isArray(val)) {
                    displayValue = val.map((id: string) => q.options.find((o: any) => o.id === id)?.label || id).join(', ')
                } else {
                    const opt = q.options.find((o: any) => o.id === val)
                    displayValue = opt ? opt.label : String(val)
                }
                return { question: q.question_text || qId, answer: displayValue, type: q.input_type }
            }).filter(Boolean)
        ]
        const res = await submitLead({ pageId, companyName: contactInfo.companyName, contactName: contactInfo.contactName, email: contactInfo.email, phone: contactInfo.phone, notes: contactInfo.notes, estimatedTotalPrice: estimatedPrice, selectedOptions: selectedOptionsDetails })
        if (res.success) setIsSuccess(true)
        else { setErrorData(res.error || 'エラー'); setIsSubmitting(false) }
    }

    // price_modifierの表示ヘルパー
    const priceLabel = (opt: any) => {
        if (!opt.price_modifier || opt.price_modifier === 0) return null
        if (opt.price_modifier_type === 'percentage') {
            return `+${opt.price_modifier}%`
        }
        return `+${opt.price_modifier.toLocaleString()}円`
    }

    // 質問入力レンダリング
    const renderQuestionInput = (q: any) => {
        const val = answers[q.id] || (q.input_type === 'checkbox' ? [] : (q.input_type === 'select_text' || q.input_type === 'select_number') ? { selected: '', extra: '' } : '')
        switch (q.input_type) {
            case 'radio': {
                const hasImages = q.options.some((o: any) => o.image_url)
                return (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: isMobile ? '1fr' : (hasImages ? 'repeat(auto-fill, minmax(160px, 1fr))' : 'repeat(auto-fill, minmax(240px, 1fr))'), 
                        gap: '12px', 
                        marginTop: '16px' 
                    }}>
                        {q.options.map((opt: any) => {
                            const isSelected = val === opt.id
                            return (
                                <label key={opt.id} style={{ display: 'flex', flexDirection: hasImages ? 'column' : 'row', alignItems: hasImages ? 'stretch' : 'center', justifyContent: hasImages ? 'flex-start' : 'space-between', padding: hasImages ? '0' : '16px', borderRadius: '16px', border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.1)', background: isSelected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s ease', overflow: 'hidden', boxShadow: isSelected ? '0 0 20px rgba(99,102,241,0.2)' : 'none' }}>
                                    {hasImages && opt.image_url && (
                                        <div style={{ width: '100%', aspectRatio: '1/1', overflow: 'hidden', position: 'relative', background: 'rgba(0,0,0,0.3)' }}>
                                            <Image src={opt.image_url} alt={opt.label} width={400} height={400} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            {isSelected && <div style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', background: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>✓</div>}
                                        </div>
                                    )}
                                    <div style={{ padding: hasImages ? '12px' : '0', display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: hasImages ? 'center' : 'flex-start' }}>
                                        <input type="radio" name={q.id} value={opt.id} checked={isSelected} onChange={() => handleAnswerChange(q.id, opt.id, 'radio')} style={{ display: hasImages ? 'none' : 'block', width: '16px', height: '16px', accentColor: '#818cf8' }} />
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: hasImages ? 'center' : 'flex-start' }}>
                                            <span style={{ fontWeight: 600, color: '#fff', fontSize: hasImages ? '15px' : '16px', textAlign: hasImages ? 'center' : 'left', lineHeight: 1.3 } as React.CSSProperties}>{opt.label}</span>
                                            {opt.description && <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.7)', textAlign: hasImages ? 'center' : 'left', marginTop: '6px', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-line' } as React.CSSProperties}>{opt.description}</span>}
                                        </div>
                                    </div>
                                    {priceLabel(opt) && <div style={{ padding: hasImages ? '0 12px 12px' : '0', textAlign: hasImages ? 'center' : 'right' } as React.CSSProperties}><span style={{ fontSize: '13px', fontWeight: 700, color: opt.price_modifier_type === 'percentage' ? '#fbbf24' : '#818cf8' }}>{priceLabel(opt)}</span></div>}
                                </label>
                            )
                        })}
                    </div>
                )
            }
            case 'checkbox':
                return (<div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', 
                    gap: '12px', 
                    marginTop: '16px' 
                }}>
                    {q.options.map((opt: any) => { const checked = Array.isArray(val) && val.includes(opt.id); return (<label key={opt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '16px', border: checked ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.1)', background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer' }}><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><input type="checkbox" value={opt.id} checked={checked} onChange={() => handleAnswerChange(q.id, opt.id, 'checkbox')} style={{ width: '16px', height: '16px', accentColor: '#818cf8' }} /><div><span style={{ fontWeight: 600, color: '#fff', fontSize: '15px' }}>{opt.label}</span>{opt.description && <span style={{ display: 'block', fontSize: '11.5px', color: 'rgba(255,255,255,0.7)', marginTop: '4px', whiteSpace: 'pre-line' }}>{opt.description}</span>}</div></div>{priceLabel(opt) && <span style={{ fontSize: '13px', fontWeight: 700, color: opt.price_modifier_type === 'percentage' ? '#fbbf24' : '#818cf8' }}>{priceLabel(opt)}</span>}</label>) })}
                </div>)
            case 'select': {
                const selectedOpt = q.options?.find((o: any) => o.id === val)
                return (<div style={{ marginTop: '16px' }}><div style={{ position: 'relative' }}><select value={val || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select')} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', appearance: 'none', cursor: 'pointer' }} required={q.is_required}><option value="" disabled style={{ color: '#000' }}>選択してください</option>{q.options?.map((opt: any) => (<option value={opt.id} key={opt.id} style={{ color: '#000' }}>{opt.label} {priceLabel(opt) ? `(${priceLabel(opt)})` : ''}</option>))}</select><ChevronDown style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} /></div>{selectedOpt?.description && <div style={{ marginTop: '12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '16px' }}><p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{selectedOpt.description}</p></div>}</div>)
            }
            case 'select_text': case 'select_number': {
                const isNum = q.input_type === 'select_number'
                const selOpt = q.options?.find((o: any) => o.id === val?.selected)
                const showExtra = selOpt && shouldShowExtraInput(selOpt.label)
                return (<div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', borderRadius: '16px' }}><div style={{ position: 'relative' }}><select value={val?.selected || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, isNum ? 'select_number_selected' : 'select_text_selected')} style={{ width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '14px 16px', color: '#fff', outline: 'none', appearance: 'none', cursor: 'pointer', fontWeight: 500 }}><option value="" disabled style={{ color: '#000' }}>項目を選択してください</option>{q.options?.map((opt: any) => (<option value={opt.id} key={opt.id} style={{ color: '#000' }}>{opt.label}{priceLabel(opt) ? ` (${priceLabel(opt)})` : ''}</option>))}</select><ChevronDown style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }} /></div>{selOpt?.description && <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '16px' }}><p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{selOpt.description}</p></div>}{showExtra && (isNum ? <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><input type="number" value={val?.extra || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_number_extra')} style={{ width: '160px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '14px 16px', color: '#fff', outline: 'none', textAlign: 'right', fontWeight: 500, fontSize: '18px' }} placeholder="0" min="0" /><span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>個</span></div> : <input type="text" value={val?.extra || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'select_text_extra')} style={{ width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '14px 16px', color: '#fff', outline: 'none' }} placeholder="詳細テキストをご入力ください" />)}</div>)
            }
            case 'textarea':
                return <textarea value={val || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'textarea')} rows={4} style={{ width: '100%', marginTop: '16px', background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '16px 20px', fontSize: '15px', color: '#fff', outline: 'none', resize: 'none' }} required={q.is_required} />
            case 'number':
                return <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', maxWidth: '240px' }}><input type="number" value={val || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'number')} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', textAlign: 'right' }} placeholder="0" min="0" /><span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>個</span></div>
            default:
                return <input type="text" value={val || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, 'text')} style={{ width: '100%', marginTop: '16px', background: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '16px 20px', fontSize: '15px', color: '#fff', outline: 'none' }} required={q.is_required} />
        }
    }

    if (!products || products.length === 0) {
        return <div style={{ width: '100%', maxWidth: '768px', margin: '0 auto', borderRadius: '24px', background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', padding: '48px 32px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}><p>現在、お見積りフォームの準備中です。</p></div>
    }

    if (isSuccess) {
        return (<div style={{ width: '100%', maxWidth: '768px', margin: '0 auto', position: 'relative', zIndex: 1 }}><div style={{ borderRadius: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)', padding: '64px 32px', textAlign: 'center' }}><div style={{ width: '80px', height: '80px', margin: '0 auto 24px', background: 'rgba(34,197,94,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle2 style={{ width: '48px', height: '48px', color: '#22c55e' }} /></div><h2 style={{ fontSize: '30px', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>お問い合わせが完了しました</h2><p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: '32px' }}>お見積もりのご依頼ありがとうございます。<br />担当者より【3営業日以内】にご連絡させていただきます。</p><div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px' }}><div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>概算お見積り金額 ({oemQuantity}個)</div><div style={{ fontSize: '30px', fontWeight: 700, color: '#818cf8' }}>¥{estimatedPrice.toLocaleString()}〜</div></div></div></div>)
    }

    return (
        <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
            <div style={{ borderRadius: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(20px)' }}>

                {/* ステップインジケーター */}
                {isMobile ? (
                    /* モバイル版: プログレスバー＋ステップ名 */
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', letterSpacing: '0.05em' }}>
                                STEP {currentVisualIdx + 1} / {visualSteps.length}
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                                {Math.round(((currentVisualIdx + 1) / visualSteps.length) * 100)}%
                            </span>
                        </div>
                        {/* プログレスバー */}
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                            <div style={{
                                height: '100%',
                                width: `${((currentVisualIdx + 1) / visualSteps.length) * 100}%`,
                                background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
                                borderRadius: '4px',
                                transition: 'width 0.4s ease'
                            }} />
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {visualSteps[currentVisualIdx] || ''}
                        </div>
                    </div>
                ) : (
                    /* PC版: ドット＋ライン＋ラベル */
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                            {/* 接続ライン (背景) */}
                            <div style={{ position: 'absolute', top: '14px', left: '14px', right: '14px', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0 }} />
                            {/* 接続ライン (進捗) */}
                            <div style={{ position: 'absolute', top: '14px', left: '14px', height: '2px', background: 'linear-gradient(90deg, #818cf8, #a78bfa)', zIndex: 1, transition: 'width 0.4s ease', width: visualSteps.length > 1 ? `${(currentVisualIdx / (visualSteps.length - 1)) * 100}%` : '0%', maxWidth: 'calc(100% - 28px)' }} />

                            {visualSteps.map((label, idx) => {
                                const isActive = idx === currentVisualIdx
                                const isPast = idx < currentVisualIdx
                                return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1, position: 'relative', zIndex: 2, minWidth: 0 }}>
                                        <div style={{
                                            width: isActive ? '28px' : '22px',
                                            height: isActive ? '28px' : '22px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: isActive ? '13px' : '11px',
                                            fontWeight: 700,
                                            background: isActive ? '#818cf8' : isPast ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.06)',
                                            color: isActive ? '#fff' : isPast ? '#818cf8' : 'rgba(255,255,255,0.35)',
                                            border: isActive ? '2px solid rgba(129,140,248,0.4)' : isPast ? '2px solid rgba(129,140,248,0.3)' : '2px solid rgba(255,255,255,0.08)',
                                            transition: 'all 0.3s ease',
                                            boxShadow: isActive ? '0 0 12px rgba(129,140,248,0.4)' : 'none',
                                            flexShrink: 0,
                                        }}>
                                            {isPast ? '✓' : idx + 1}
                                        </div>
                                        <span style={{
                                            fontSize: '10px',
                                            fontWeight: isActive ? 700 : 500,
                                            color: isActive ? '#fff' : isPast ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)',
                                            textAlign: 'center',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            width: '100%',
                                            maxWidth: '80px',
                                            transition: 'color 0.3s ease',
                                        } as React.CSSProperties}>
                                            {label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* 見積もりバー */}
                {currentStep < RESULT_STEP && currentStep >= FORM_START && (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}><span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>💰 現在のお見積り ({oemQuantity}個)</span><span style={{ fontSize: '22px', fontWeight: 800, background: 'linear-gradient(90deg, #818cf8, #e879f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>¥{estimatedPrice.toLocaleString()}〜</span></div>)}

                {/* メインフォーム */}
                <div style={{ padding: '32px 24px', position: 'relative', overflow: 'hidden', minHeight: '320px' }}>
                    <AnimatePresence mode="wait" initial={false}>
                        {/* 数量入力 */}
                        {currentStep === 0 && (<motion.div key="step-qty" initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }} transition={{ duration: 0.3 }}><div style={{ marginBottom: '32px' }}><h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>OEM製造数の入力</h2><p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>ご希望の製造数をご入力ください（400個〜800個）</p></div><div><h4 style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>製造予定数量<span style={{ color: '#f87171', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(248,113,113,0.1)' }}>必須</span></h4><div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '240px' }}><input type="number" value={oemQuantity} onChange={(e) => setOemQuantity(Number(e.target.value))} min={400} max={800} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', textAlign: 'right', fontSize: '18px', fontWeight: 'bold' }} /><span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>個</span></div>{(oemQuantity < 400 || oemQuantity > 800) && <p style={{ color: '#f87171', fontSize: '13px', marginTop: '8px' }}>※ 400個から800個の間で入力してください。</p>}</div></motion.div>)}

                        {/* 商品選択 */}
                        {currentStep === PRODUCT_STEP && (<motion.div key="step-product" initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }} transition={{ duration: 0.3 }}><div style={{ marginBottom: '32px' }}><h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>作りたい商品を選んでください</h2><p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>商品に応じた見積もりフォームが表示されます</p></div><div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', 
                            gap: '16px' 
                        }}>
                        {products.map(p => { const isSelected = selectedProduct === p.id; return (
                            <button key={p.id} onClick={() => setSelectedProduct(p.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0', padding: '0', borderRadius: '20px', border: isSelected ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.1)', background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s', boxShadow: isSelected ? '0 0 30px rgba(99,102,241,0.2)' : 'none', width: '100%', overflow: 'hidden' }}>
                                {/* 商品画像 or フォールバックアイコン */}
                                {p.image_url ? (
                                    <div style={{ width: '100%', aspectRatio: isMobile ? '16/9' : '1/1', position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                                        <Image src={p.image_url} alt={p.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 200px" />
                                        {isSelected && <div style={{ position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px', borderRadius: '50%', background: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>✓</div>}
                                    </div>
                                ) : (
                                    <div style={{ width: '100%', padding: isMobile ? '24px 0' : '32px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', borderRadius: '50%', background: isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Package style={{ width: isMobile ? '24px' : '32px', height: isMobile ? '24px' : '32px', color: isSelected ? '#818cf8' : 'rgba(255,255,255,0.5)' }} />
                                        </div>
                                    </div>
                                )}
                                {/* テキスト部 */}
                                <div style={{ padding: '16px 20px 20px', textAlign: 'center', width: '100%' }}>
                                    <span style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 700, color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)', display: 'block' }}>{p.name}</span>
                                    {p.description && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', display: 'block' }}>{p.description}</span>}
                                </div>
                            </button>
                        ) })}</div></motion.div>)}

                        {/* フォームステップ（1ステップ1質問） */}
                        {currentStep >= FORM_START && currentStep < RESULT_STEP && (<motion.div key={`step-${currentStep}`} initial={{ opacity: 0, x: direction > 0 ? 50 : -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction > 0 ? -50 : 50 }} transition={{ duration: 0.3 }}>{loadingSteps ? <div style={{ textAlign: 'center', padding: '48px', color: 'rgba(255,255,255,0.5)' }}>読み込み中...</div> : (() => { const stepData = activeSteps[currentStep - FORM_START]; if (!stepData) return null; const q = stepData.questions[0]; if (!q) return null; return (<><div style={{ marginBottom: '24px' }}><h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>{stepData.step_title}{q.is_required && <span style={{ color: '#f87171', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(248,113,113,0.1)' }}>必須</span>}</h2>{stepData.step_description && <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{stepData.step_description}</p>}{q.help_text && <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>{q.help_text}</p>}</div><div>{renderQuestionInput(q)}</div></>)})()}</motion.div>)}

                        {/* 見積もり結果 */}
                        {currentStep === RESULT_STEP && (
                            <motion.div key="step-result" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.3 }}>
                                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>お見積り結果</h2>
                                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>ご回答内容に基づく概算金額です</p>
                                </div>
                                <div style={{ textAlign: 'center', padding: '32px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(236,72,153,0.1))', border: '1px solid rgba(99,102,241,0.2)', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>概算お見積り金額 ({oemQuantity}個)</div>
                                    <div style={{ fontSize: '42px', fontWeight: 800, background: 'linear-gradient(90deg, #818cf8, #e879f9, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>¥{estimatedPrice.toLocaleString()}〜</div>
                                    <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '8px' }}>(うち消費税 ¥{estimatedTax.toLocaleString()})</div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>※ 最終金額は個別にお見積りいたします</div>
                                    
                                    <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px dashed rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                                                <span>📦</span> 1個あたり仕入原価
                                            </div>
                                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>
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
                                                        <div key={margin} style={{ display: 'grid', gridTemplateColumns: isMobile ? '70px 1fr 1fr' : '80px 1fr 1fr', alignItems: 'center', gap: isMobile ? '8px' : '16px', padding: isMobile ? '12px' : '16px', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '4px 0', borderRadius: '6px', textAlign: 'center' }}>
                                                                利益 {margin}%
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>想定売価</div>
                                                                <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 700, color: '#fff' }}>¥{sellingPrice.toLocaleString()}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>1個あたり利益</div>
                                                                <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 700, color: '#4ade80' }}>+¥{profit.toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <button onClick={handleApply} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '16px 48px', borderRadius: '9999px', fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 8px 32px rgba(34,197,94,0.3)' }}>🚀 この内容で仮申込する</button>
                                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '12px' }}>仮申込後にお客様情報をご入力いただきます</p>
                                </div>
                            </motion.div>
                        )}

                        {/* お客様情報 */}
                        {currentStep === CONTACT_STEP && (
                            <motion.div key="step-contact" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.3 }}>
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
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>
                                            貴社名 / 屋号 <span style={{ color: '#f87171' }}>*</span>
                                        </label>
                                        <input required type="text" value={contactInfo.companyName} onChange={e => setContactInfo({ ...contactInfo, companyName: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="株式会社〇〇" />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>
                                            ご担当者名 <span style={{ color: '#f87171' }}>*</span>
                                        </label>
                                        <input required type="text" value={contactInfo.contactName} onChange={e => setContactInfo({ ...contactInfo, contactName: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="山田 太郎" />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>
                                                メールアドレス <span style={{ color: '#f87171' }}>*</span>
                                            </label>
                                            <input required type="email" value={contactInfo.email} onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="info@example.com" />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>
                                                電話番号
                                            </label>
                                            <input type="tel" value={contactInfo.phone} onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', fontSize: '15px' }} placeholder="03-0000-0000" />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>その他ご要望</label>
                                        <textarea rows={3} value={contactInfo.notes} onChange={e => setContactInfo({ ...contactInfo, notes: e.target.value })} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', resize: 'none', fontSize: '15px' }} placeholder="ご不明点や特記事項があればご記入ください" />
                                    </div>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ナビゲーションボタン */}
                    <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button onClick={handlePrev} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', visibility: currentStep === 0 ? 'hidden' : 'visible' }}><ChevronLeft style={{ width: '16px', height: '16px' }} /> 戻る</button>
                        {currentStep < RESULT_STEP ? (
                            <button onClick={handleNext} disabled={!isCurrentStepValid()} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 32px', borderRadius: '9999px', fontSize: '14px', fontWeight: 700, background: isCurrentStepValid() ? 'linear-gradient(135deg, #818cf8, #6366f1)' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: isCurrentStepValid() ? 'pointer' : 'not-allowed', opacity: isCurrentStepValid() ? 1 : 0.4, boxShadow: isCurrentStepValid() ? '0 8px 24px rgba(99,102,241,0.3)' : 'none', transition: 'all 0.2s' }}>{currentStep === RESULT_STEP - 1 ? '結果を見る' : '次のステップへ'} <ChevronRight style={{ width: '16px', height: '16px' }} /></button>
                        ) : currentStep === CONTACT_STEP ? (
                            <button onClick={handleSubmit} disabled={!isContactInfoValid() || isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 32px', borderRadius: '9999px', fontSize: '14px', fontWeight: 700, background: isContactInfoValid() ? 'linear-gradient(135deg, #22c55e, #10b981)' : 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: isContactInfoValid() ? 'pointer' : 'not-allowed', opacity: isContactInfoValid() && !isSubmitting ? 1 : 0.5, boxShadow: isContactInfoValid() ? '0 8px 24px rgba(34,197,94,0.3)' : 'none' }}>{isSubmitting ? <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 style={{ width: '20px', height: '20px' }} />}{isSubmitting ? '送信中...' : 'この内容で送信する'}</button>
                        ) : <div />}
                    </div>
                </div>
            </div>

            {/* フローティング見積もりボタン（フォーム開始前のみ表示） */}
            <AnimatePresence>
                {currentStep === 0 && (
                    <motion.a
                        key="floating-cta"
                        href="#bto-form"
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 20 }}
                        style={{ position: 'fixed', bottom: '24px', right: '20px', zIndex: 50, padding: '14px 22px', backgroundColor: '#ea580c', color: '#fff', fontWeight: 'bold', fontSize: '16px', borderRadius: '9999px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)', textDecoration: 'none', transition: 'all 0.3s', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        🚀 今すぐ自動見積もり
                    </motion.a>
                )}
            </AnimatePresence>
        </div>
    )
}
