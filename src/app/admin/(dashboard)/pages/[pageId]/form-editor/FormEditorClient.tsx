'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    CircleDollarSign,
    ExternalLink,
    Eye,
    EyeOff,
    GitBranch,
    ImagePlus,
    Loader2,
    Package,
    Plus,
    Save,
    Settings2,
    Trash2,
    X,
} from 'lucide-react'
import type { FormOption, FormQuestion, FormStep, Product } from '@/types/database'
import { deleteProduct, saveFormEditorData, saveProduct } from '@/actions/formEditor'
import { compressImage } from '@/lib/imageCompressor'
import styles from './FormEditor.module.css'

type EditorQuestion = FormQuestion & { options: FormOption[] }
type EditorStep = FormStep & { questions: EditorQuestion[] }
type SaveStatus = 'idle' | 'saved' | 'error'

const inputTypes: { value: FormQuestion['input_type']; label: string }[] = [
    { value: 'radio', label: '1つ選ぶ' },
    { value: 'checkbox', label: '複数選ぶ' },
    { value: 'select', label: 'リストから選ぶ' },
    { value: 'select_text', label: '選択＋自由入力' },
    { value: 'select_number', label: '選択＋数値入力' },
    { value: 'text', label: '短い文章' },
    { value: 'textarea', label: '長い文章' },
    { value: 'number', label: '数値' },
]

const choiceInputTypes: FormQuestion['input_type'][] = [
    'radio',
    'checkbox',
    'select',
    'select_text',
    'select_number',
]

const routableInputTypes: FormQuestion['input_type'][] = [
    'radio',
    'select',
    'select_text',
    'select_number',
]

const extraInputExclusionKeywords = ['ない', 'なし', '無し', '不要', '該当なし', '特になし', '解除', '削除', 'いいえ', '否', 'none', 'null', 'n/a']

const generateId = () => crypto.randomUUID()

function createQuestion(stepId: string, text = '新しい質問'): EditorQuestion {
    const now = new Date().toISOString()
    return {
        id: generateId(),
        step_id: stepId,
        order_index: 0,
        question_text: text,
        input_type: 'radio',
        is_required: true,
        help_text: '',
        depends_on_option_id: null,
        created_at: now,
        updated_at: now,
        options: [],
    }
}

function createOption(questionId: string, orderIndex: number): FormOption {
    const now = new Date().toISOString()
    return {
        id: generateId(),
        question_id: questionId,
        order_index: orderIndex,
        label: '',
        price_modifier: 0,
        price_modifier_type: 'fixed',
        is_base_price: false,
        description: '',
        image_url: '',
        next_step_id: null,
        go_to_estimate: false,
        created_at: now,
        updated_at: now,
    }
}

function buildInitialSteps(
    initialSteps: FormStep[],
    initialQuestions: FormQuestion[],
    initialOptions: FormOption[],
): EditorStep[] {
    const dependencyTargetByOptionId = new Map(
        initialQuestions
            .filter(question => question.depends_on_option_id)
            .map(question => [question.depends_on_option_id as string, question.step_id]),
    )
    const productSteps = initialSteps
        .filter(step => step.product_id !== null)
        .sort((a, b) => a.order_index - b.order_index)

    return productSteps.flatMap(step => {
        const questions = initialQuestions
            .filter(question => question.step_id === step.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map(question => ({
                ...question,
                options: initialOptions
                    .filter(option => option.question_id === question.id)
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(option => ({
                        ...option,
                        next_step_id: option.next_step_id ?? dependencyTargetByOptionId.get(option.id) ?? null,
                        go_to_estimate: option.go_to_estimate ?? false,
                    })),
            }))

        if (questions.length === 0) {
            return [{ ...step, questions: [createQuestion(step.id, step.step_title)] }]
        }

        // 旧データに複数質問を持つステップがあっても、編集画面では1ステップ1質問に正規化する。
        return questions.map((question, questionIndex) => {
            if (questionIndex === 0) return { ...step, questions: [question] }
            const splitStepId = generateId()
            return {
                ...step,
                id: splitStepId,
                order_index: step.order_index + questionIndex,
                step_title: question.question_text,
                questions: [{ ...question, step_id: splitStepId, order_index: 0 }],
            }
        })
    })
}

function shouldShowExtraInput(label: string | null | undefined) {
    if (!label) return false
    const normalized = label.trim().toLowerCase()
    return !extraInputExclusionKeywords.some(keyword => normalized.includes(keyword))
}

function getInputTypeLabel(inputType: FormQuestion['input_type']) {
    return inputTypes.find(type => type.value === inputType)?.label ?? inputType
}

export default function FormEditorClient({
    initialSteps,
    initialQuestions,
    initialOptions,
    initialProducts,
    pageId,
    slug,
}: {
    initialSteps: FormStep[]
    initialQuestions: FormQuestion[]
    initialOptions: FormOption[]
    initialProducts: Product[]
    pageId: string
    slug: string
}) {
    const normalizedProducts = initialProducts.map(product => ({
        ...product,
        base_price: product.base_price ?? 0,
        base_price_type: product.base_price_type ?? 'fixed',
    }))
    const firstProductId = normalizedProducts[0]?.id ?? null
    const firstStepId = initialSteps.find(step => step.product_id === firstProductId)?.id ?? null

    const [products, setProducts] = useState<Product[]>(normalizedProducts)
    const [activeProductId, setActiveProductId] = useState<string | null>(firstProductId)
    const [steps, setSteps] = useState<EditorStep[]>(() => buildInitialSteps(initialSteps, initialQuestions, initialOptions))
    const [openStepId, setOpenStepId] = useState<string | null>(firstStepId)
    const [isProductSettingsOpen, setIsProductSettingsOpen] = useState(true)
    const [deletedStepIds, setDeletedStepIds] = useState<string[]>([])
    const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([])
    const [deletedOptionIds, setDeletedOptionIds] = useState<string[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [saveMessage, setSaveMessage] = useState('')
    const [uploadingId, setUploadingId] = useState<string | null>(null)
    const productImageInputRef = useRef<HTMLInputElement>(null)

    const activeProduct = products.find(product => product.id === activeProductId) ?? null
    const productSteps = steps.filter(step => step.product_id === activeProductId)
    const legacyCommonStepCount = initialSteps.filter(step => step.product_id === null).length

    const markDirty = () => {
        setIsDirty(true)
        setSaveStatus('idle')
        setSaveMessage('')
    }

    const updateProduct = (productId: string, patch: Partial<Product>) => {
        markDirty()
        setProducts(current => current.map(product => product.id === productId ? { ...product, ...patch } : product))
    }

    const updateStep = (stepId: string, updater: (step: EditorStep) => EditorStep) => {
        markDirty()
        setSteps(current => current.map(step => step.id === stepId ? updater(step) : step))
    }

    const changeStepVisibility = (stepId: string, isVisible: boolean) => {
        markDirty()
        setSteps(current => current.map(step => ({
            ...step,
            is_visible: step.id === stepId ? isVisible : step.is_visible,
            questions: step.questions.map(question => ({
                ...question,
                options: !isVisible
                    ? question.options.map(option => (
                        option.next_step_id === stepId
                            ? { ...option, next_step_id: null, go_to_estimate: false }
                            : option
                    ))
                    : question.options,
            })),
        })))
    }

    const updateQuestion = (stepId: string, updater: (question: EditorQuestion) => EditorQuestion) => {
        updateStep(stepId, step => ({ ...step, questions: [updater(step.questions[0])] }))
    }

    const updateQuestionText = (stepId: string, value: string) => {
        updateStep(stepId, step => ({
            ...step,
            step_title: value,
            questions: [{ ...step.questions[0], question_text: value }],
        }))
    }

    const updateOption = (stepId: string, optionId: string, patch: Partial<FormOption>) => {
        updateQuestion(stepId, question => ({
            ...question,
            options: question.options.map(option => option.id === optionId ? { ...option, ...patch } : option),
        }))
    }

    const changeQuestionType = (stepId: string, inputType: FormQuestion['input_type']) => {
        markDirty()
        setSteps(current => {
            const sourceQuestion = current.find(step => step.id === stepId)?.questions[0]
            const sourceOptionIds = new Set(sourceQuestion?.options.map(option => option.id) ?? [])
            const removesChoiceAnswers = !choiceInputTypes.includes(inputType)
            const removesOptionRouting = !routableInputTypes.includes(inputType)

            return current.map(step => ({
                ...step,
                questions: step.questions.map(question => {
                    if (step.id === stepId) {
                        return {
                            ...question,
                            input_type: inputType,
                            options: removesOptionRouting
                                ? question.options.map(option => ({ ...option, next_step_id: null, go_to_estimate: false }))
                                : question.options,
                        }
                    }
                    if (removesChoiceAnswers && question.depends_on_option_id && sourceOptionIds.has(question.depends_on_option_id)) {
                        return { ...question, depends_on_option_id: null }
                    }
                    return question
                }),
            }))
        })
    }

    const handleSave = async () => {
        const unnamedProduct = products.find(product => !product.name.trim())
        const unnamedStep = steps.find(step => !step.step_title.trim() || !step.questions[0]?.question_text.trim())
        const emptyChoice = steps.find(step => {
            const question = step.questions[0]
            return choiceInputTypes.includes(question.input_type)
                && (question.options.length === 0 || question.options.some(option => !option.label.trim()))
        })
        let invalidConditionalStep: EditorStep | undefined
        let invalidRoute: { step: EditorStep; option: FormOption } | undefined

        for (const product of products) {
            const previousOptionIds = new Set<string>()
            const currentProductSteps = steps.filter(item => item.product_id === product.id)
            const stepIndexById = new Map(currentProductSteps.map((step, index) => [step.id, index]))
            for (const [stepIndex, step] of currentProductSteps.entries()) {
                const question = step.questions[0]
                if (question.depends_on_option_id && !previousOptionIds.has(question.depends_on_option_id)) {
                    invalidConditionalStep = step
                    break
                }
                if (choiceInputTypes.includes(question.input_type)) {
                    question.options.forEach(option => previousOptionIds.add(option.id))
                }
                const invalidOption = question.options.find(option => {
                    if (option.go_to_estimate && option.next_step_id) return true
                    if (!option.next_step_id) return false
                    const targetIndex = stepIndexById.get(option.next_step_id)
                    const targetStep = currentProductSteps[targetIndex ?? -1]
                    return targetIndex === undefined || targetIndex <= stepIndex || !targetStep?.is_visible
                })
                if (invalidOption) {
                    invalidRoute = { step, option: invalidOption }
                    break
                }
            }
            if (invalidConditionalStep || invalidRoute) break
        }

        if (unnamedProduct || unnamedStep || emptyChoice || invalidConditionalStep || invalidRoute) {
            setSaveStatus('error')
            setSaveMessage(
                unnamedProduct
                    ? '商品名を入力してください。'
                    : unnamedStep
                        ? '質問文を入力してください。'
                        : emptyChoice
                            ? '選択式の質問には、表示名を入力した選択肢が1つ以上必要です。'
                            : invalidRoute
                                ? `STEP「${invalidRoute.step.step_title}」の「${invalidRoute.option.label}」に、有効な後続STEPを指定してください。`
                                : `「${invalidConditionalStep?.step_title}」の旧表示条件が無効です。`,
            )
            return
        }

        setIsSaving(true)
        setSaveStatus('idle')
        setSaveMessage('')

        const orderedSteps = products.flatMap(product =>
            steps
                .filter(step => step.product_id === product.id)
                .map((step, stepIndex) => ({
                    ...step,
                    product_id: product.id,
                    order_index: stepIndex,
                    questions: step.questions.map(question => ({
                        ...question,
                        step_id: step.id,
                        order_index: 0,
                        options: question.options.map((option, optionIndex) => ({
                            ...option,
                            question_id: question.id,
                            order_index: optionIndex,
                        })),
                    })),
                })),
        )

        const result = await saveFormEditorData({
            pageId,
            products,
            steps: orderedSteps,
            deletedStepIds,
            deletedQuestionIds,
            deletedOptionIds,
        })

        if (result.success) {
            setDeletedStepIds([])
            setDeletedQuestionIds([])
            setDeletedOptionIds([])
            setIsDirty(false)
            setSaveStatus('saved')
            setSaveMessage('すべての変更を保存しました。')
        } else {
            setSaveStatus('error')
            setSaveMessage(result.error || '保存に失敗しました。')
        }
        setIsSaving(false)
    }

    const handleAddProduct = async () => {
        const now = new Date().toISOString()
        const newProduct: Product = {
            id: generateId(),
            page_id: pageId,
            name: '新しい商品',
            description: '',
            image_url: null,
            base_price: 0,
            base_price_type: 'fixed',
            order_index: products.length,
            is_visible: true,
            created_at: now,
            updated_at: now,
        }
        const result = await saveProduct(newProduct)
        if (!result.success) {
            setSaveStatus('error')
            setSaveMessage(result.error || '商品の追加に失敗しました。')
            return
        }
        setProducts(current => [...current, newProduct])
        setActiveProductId(newProduct.id)
        setOpenStepId(null)
        setIsProductSettingsOpen(true)
        markDirty()
    }

    const handleDeleteProduct = async (product: Product) => {
        if (!confirm(`「${product.name}」と、その質問フローをすべて削除します。よろしいですか？`)) return
        const result = await deleteProduct(product.id)
        if (!result.success) {
            setSaveStatus('error')
            setSaveMessage(result.error || '商品の削除に失敗しました。')
            return
        }

        const remainingProducts = products.filter(item => item.id !== product.id)
        setProducts(remainingProducts)
        setSteps(current => current.filter(step => step.product_id !== product.id))
        setActiveProductId(remainingProducts[0]?.id ?? null)
        setOpenStepId(null)
    }

    const addStep = () => {
        if (!activeProductId) return
        const stepId = generateId()
        const now = new Date().toISOString()
        const newStep: EditorStep = {
            id: stepId,
            page_id: pageId,
            product_id: activeProductId,
            order_index: productSteps.length,
            step_title: '新しい質問',
            step_description: '',
            is_visible: true,
            created_at: now,
            updated_at: now,
            questions: [createQuestion(stepId)],
        }
        markDirty()
        setSteps(current => [...current, newStep])
        setOpenStepId(stepId)
    }

    const removeStep = (step: EditorStep) => {
        if (!confirm(`「${step.step_title}」を削除します。よろしいですか？`)) return
        const question = step.questions[0]
        const removedOptionIds = new Set(question?.options.map(option => option.id) ?? [])
        setDeletedStepIds(current => [...current, step.id])
        if (question) {
            setDeletedQuestionIds(current => [...current, question.id])
            setDeletedOptionIds(current => [...current, ...question.options.map(option => option.id)])
        }
        setSteps(current => current
            .filter(item => item.id !== step.id)
            .map(item => ({
                ...item,
                questions: item.questions.map(itemQuestion => (
                    {
                        ...itemQuestion,
                        depends_on_option_id: itemQuestion.depends_on_option_id && removedOptionIds.has(itemQuestion.depends_on_option_id)
                            ? null
                            : itemQuestion.depends_on_option_id,
                        options: itemQuestion.options.map(option => (
                            option.next_step_id === step.id
                                ? { ...option, next_step_id: null, go_to_estimate: false }
                                : option
                        )),
                    }
                )),
            })))
        setOpenStepId(null)
        markDirty()
    }

    const moveStep = (stepIndex: number, direction: 'up' | 'down') => {
        const destinationIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1
        if (destinationIndex < 0 || destinationIndex >= productSteps.length) return
        const sourceStep = productSteps[stepIndex]
        const destinationStep = productSteps[destinationIndex]
        markDirty()
        setSteps(current => {
            const sourceIndex = current.findIndex(step => step.id === sourceStep.id)
            const targetIndex = current.findIndex(step => step.id === destinationStep.id)
            const next = [...current]
            ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]]
            const reorderedProductSteps = next.filter(step => step.product_id === activeProductId)
            const orderByStepId = new Map(reorderedProductSteps.map((step, index) => [step.id, index]))
            return next.map(step => ({
                ...step,
                questions: step.questions.map(question => ({
                    ...question,
                    options: question.options.map(option => {
                        if (!option.next_step_id || step.product_id !== activeProductId) return option
                        const sourceOrder = orderByStepId.get(step.id)
                        const targetOrder = orderByStepId.get(option.next_step_id)
                        return sourceOrder === undefined || targetOrder === undefined || targetOrder <= sourceOrder
                            ? { ...option, next_step_id: null, go_to_estimate: false }
                            : option
                    }),
                })),
            }))
        })
    }

    const addOption = (stepId: string) => {
        updateQuestion(stepId, question => ({
            ...question,
            options: [...question.options, createOption(question.id, question.options.length)],
        }))
    }

    const removeOption = (stepId: string, optionId: string) => {
        setDeletedOptionIds(current => [...current, optionId])
        markDirty()
        setSteps(current => current.map(step => ({
            ...step,
            questions: step.questions.map(question => ({
                ...question,
                depends_on_option_id: question.depends_on_option_id === optionId ? null : question.depends_on_option_id,
                options: step.id === stepId
                    ? question.options.filter(option => option.id !== optionId)
                    : question.options,
            })),
        })))
    }

    const uploadImage = async (file: File, targetId: string) => {
        setUploadingId(targetId)
        try {
            const compressedFile = await compressImage(file, targetId === activeProductId ? 400 : 250)
            const formData = new FormData()
            formData.append('file', compressedFile)
            const response = await fetch('/api/upload-image', { method: 'POST', body: formData })
            const result = await response.json() as { url?: string; error?: string }
            if (!response.ok || !result.url) throw new Error(result.error || 'アップロードに失敗しました。')
            return result.url
        } catch (error) {
            setSaveStatus('error')
            setSaveMessage(error instanceof Error ? error.message : '画像のアップロードに失敗しました。')
            return null
        } finally {
            setUploadingId(null)
        }
    }

    const handleProductImageUpload = async (file: File) => {
        if (!activeProductId) return
        const url = await uploadImage(file, activeProductId)
        if (url) updateProduct(activeProductId, { image_url: url })
    }

    const handleOptionImageUpload = async (stepId: string, optionId: string, file: File) => {
        const url = await uploadImage(file, optionId)
        if (url) updateOption(stepId, optionId, { image_url: url })
    }

    const selectProduct = (productId: string) => {
        setActiveProductId(productId)
        setIsProductSettingsOpen(true)
        setOpenStepId(steps.find(step => step.product_id === productId)?.id ?? null)
    }

    return (
        <div className={styles.page}>
            <header className={styles.pageHeader}>
                <div>
                    <p className={styles.eyebrow}>FORM BUILDER</p>
                    <h1>フォームエディタ</h1>
                    <p className={styles.pageDescription}>商品ごとに、上から順に質問フローを組み立てます。</p>
                </div>
                <div className={styles.headerActions}>
                    <Link href={`/${slug}`} target="_blank" className={styles.secondaryButton}>
                        <ExternalLink size={17} />
                        公開ページ
                    </Link>
                    <button className={styles.saveButton} onClick={handleSave} disabled={isSaving || !isDirty}>
                        {isSaving ? <Loader2 className={styles.spinner} size={18} /> : isDirty ? <Save size={18} /> : <Check size={18} />}
                        {isSaving ? '保存中' : isDirty ? '変更を保存' : '保存済み'}
                    </button>
                </div>
            </header>

            {(saveMessage || legacyCommonStepCount > 0) && (
                <div className={`${styles.notice} ${saveStatus === 'error' ? styles.noticeError : saveStatus === 'saved' ? styles.noticeSuccess : ''}`} role="status">
                    {saveMessage || `既存の共通ステップが${legacyCommonStepCount}件あります。商品別フロー移行後は表示されません。`}
                </div>
            )}

            <div className={styles.workspace}>
                <aside className={styles.productRail}>
                    <div className={styles.railHeader}>
                        <div>
                            <span className={styles.railLabel}>商品</span>
                            <strong>{products.length}</strong>
                        </div>
                        <button className={styles.iconButton} onClick={handleAddProduct} aria-label="商品を追加" title="商品を追加">
                            <Plus size={18} />
                        </button>
                    </div>

                    <div className={styles.productList}>
                        {products.map((product, index) => {
                            const stepCount = steps.filter(step => step.product_id === product.id).length
                            const isActive = activeProductId === product.id
                            return (
                                <button
                                    key={product.id}
                                    className={`${styles.productButton} ${isActive ? styles.productButtonActive : ''}`}
                                    onClick={() => selectProduct(product.id)}
                                >
                                    <span className={styles.productIndex}>{index + 1}</span>
                                    <span className={styles.productButtonText}>
                                        <strong>{product.name || '名称未設定'}</strong>
                                        <small>{stepCount}問</small>
                                    </span>
                                    {!product.is_visible && <EyeOff size={15} aria-label="非公開" />}
                                </button>
                            )
                        })}
                    </div>

                    <button className={styles.addProductButton} onClick={handleAddProduct}>
                        <Plus size={16} />
                        商品を追加
                    </button>
                </aside>

                <main className={styles.editorArea}>
                    {!activeProduct ? (
                        <div className={styles.emptyState}>
                            <Package size={34} />
                            <h2>商品がありません</h2>
                            <p>最初の商品を追加して、質問フローを作成します。</p>
                            <button className={styles.primaryButton} onClick={handleAddProduct}>
                                <Plus size={18} /> 商品を追加
                            </button>
                        </div>
                    ) : (
                        <>
                            <section className={styles.productPanel}>
                                <button
                                    className={styles.productPanelHeader}
                                    onClick={() => setIsProductSettingsOpen(current => !current)}
                                    aria-expanded={isProductSettingsOpen}
                                >
                                    <span className={styles.productThumb}>
                                        {activeProduct.image_url ? (
                                            <Image src={activeProduct.image_url} alt="" fill sizes="48px" />
                                        ) : (
                                            <Package size={20} />
                                        )}
                                    </span>
                                    <span className={styles.productPanelTitle}>
                                        <small>編集中の商品</small>
                                        <strong>{activeProduct.name || '名称未設定'}</strong>
                                    </span>
                                    <span className={styles.productSummary}>
                                        {activeProduct.base_price.toLocaleString()}円 / 個
                                    </span>
                                    <ChevronDown className={isProductSettingsOpen ? styles.chevronOpen : ''} size={20} />
                                </button>

                                {isProductSettingsOpen && (
                                    <div className={styles.productSettings}>
                                        <div className={styles.imageField}>
                                            <button className={styles.imagePicker} onClick={() => productImageInputRef.current?.click()}>
                                                {activeProduct.image_url ? (
                                                    <Image src={activeProduct.image_url} alt={activeProduct.name} fill sizes="120px" />
                                                ) : (
                                                    <span><ImagePlus size={24} />画像を追加</span>
                                                )}
                                                {uploadingId === activeProduct.id && <span className={styles.imageLoading}><Loader2 className={styles.spinner} size={20} /></span>}
                                            </button>
                                            <input
                                                ref={productImageInputRef}
                                                type="file"
                                                accept="image/*"
                                                hidden
                                                onChange={event => {
                                                    const file = event.target.files?.[0]
                                                    if (file) void handleProductImageUpload(file)
                                                    event.target.value = ''
                                                }}
                                            />
                                            {activeProduct.image_url && (
                                                <button className={styles.textDangerButton} onClick={() => updateProduct(activeProduct.id, { image_url: null })}>
                                                    <X size={13} /> 画像を外す
                                                </button>
                                            )}
                                        </div>

                                        <div className={styles.productFields}>
                                            <label className={styles.field}>
                                                <span>商品名</span>
                                                <input value={activeProduct.name} onChange={event => updateProduct(activeProduct.id, { name: event.target.value })} />
                                            </label>
                                            <label className={styles.field}>
                                                <span>公開ページの説明</span>
                                                <textarea rows={2} value={activeProduct.description || ''} onChange={event => updateProduct(activeProduct.id, { description: event.target.value })} />
                                            </label>
                                            <div className={styles.inlineFields}>
                                                <label className={styles.field}>
                                                    <span>基本単価</span>
                                                    <div className={styles.priceInput}>
                                                        <CircleDollarSign size={17} />
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={activeProduct.base_price}
                                                            onChange={event => updateProduct(activeProduct.id, { base_price: Number(event.target.value) || 0 })}
                                                        />
                                                        <select
                                                            value={activeProduct.base_price_type}
                                                            onChange={event => updateProduct(activeProduct.id, { base_price_type: event.target.value as Product['base_price_type'] })}
                                                            aria-label="基本単価の単位"
                                                        >
                                                            <option value="fixed">円 / 個</option>
                                                            <option value="percentage">%</option>
                                                        </select>
                                                    </div>
                                                </label>
                                                <label className={styles.toggleField}>
                                                    <span>商品を公開</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={activeProduct.is_visible}
                                                        onChange={event => updateProduct(activeProduct.id, { is_visible: event.target.checked })}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <button className={styles.deleteProductButton} onClick={() => void handleDeleteProduct(activeProduct)}>
                                            <Trash2 size={16} /> 商品を削除
                                        </button>
                                    </div>
                                )}
                            </section>

                            <section className={styles.flowSection}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <p className={styles.eyebrow}>QUESTION FLOW</p>
                                        <h2>質問フロー</h2>
                                        <p>STEP番号は並び順から自動更新。各回答から次のSTEPまたは概算見積もりへ接続します。</p>
                                    </div>
                                    <button className={styles.primaryButton} onClick={addStep}>
                                        <Plus size={17} /> 質問を追加
                                    </button>
                                </div>

                                {productSteps.length === 0 ? (
                                    <div className={styles.flowEmpty}>
                                        <span className={styles.stepNumber}>1</span>
                                        <div>
                                            <h3>最初の質問を追加</h3>
                                            <p>質問は公開ページで、この順番のまま表示されます。</p>
                                        </div>
                                        <button className={styles.primaryButton} onClick={addStep}><Plus size={17} /> 質問を追加</button>
                                    </div>
                                ) : (
                                    <div className={styles.timeline}>
                                        {productSteps.map((step, stepIndex) => {
                                            const question = step.questions[0]
                                            const isOpen = openStepId === step.id
                                            const hasChoices = choiceInputTypes.includes(question.input_type)
                                            const supportsRouting = routableInputTypes.includes(question.input_type)
                                            const hasConfiguredRoutes = question.options.some(option => option.next_step_id || option.go_to_estimate)
                                            const routeTargets = productSteps
                                                .map((targetStep, targetIndex) => ({
                                                    id: targetStep.id,
                                                    stepNumber: targetIndex + 1,
                                                    title: targetStep.step_title,
                                                    isVisible: targetStep.is_visible,
                                                }))
                                                .filter(target => target.stepNumber > stepIndex + 1 && target.isVisible)
                                            const nextVisibleStep = routeTargets[0]
                                            const estimateStepNumber = productSteps.length + 1
                                            const automaticRouteLabel = nextVisibleStep
                                                ? `STEP ${nextVisibleStep.stepNumber} — ${nextVisibleStep.title}`
                                                : `STEP ${estimateStepNumber} — 概算見積もり`
                                            const getRouteLabel = (option: FormOption) => {
                                                if (option.go_to_estimate) return `STEP ${estimateStepNumber} — 概算見積もり`
                                                if (option.next_step_id) {
                                                    const target = routeTargets.find(route => route.id === option.next_step_id)
                                                    if (target) return `STEP ${target.stepNumber} — ${target.title}`
                                                }
                                                return `${automaticRouteLabel}（自動）`
                                            }

                                            return (
                                                <article key={step.id} className={`${styles.stepCard} ${isOpen ? styles.stepCardOpen : ''}`}>
                                                    <span className={styles.timelineMarker}><small>STEP</small><strong>{stepIndex + 1}</strong></span>
                                                    <div className={styles.stepHeader}>
                                                        <button
                                                            className={styles.stepSummary}
                                                            onClick={() => setOpenStepId(isOpen ? null : step.id)}
                                                            aria-expanded={isOpen}
                                                        >
                                                            <span>
                                                                <strong>{step.step_title || '質問文を入力'}</strong>
                                                                <small>{getInputTypeLabel(question.input_type)}{hasChoices ? `・${question.options.length}項目` : ''}</small>
                                                            </span>
                                                            <span className={styles.stepBadges}>
                                                                {!step.is_visible && <span className={styles.hiddenBadge}>非公開</span>}
                                                                {hasConfiguredRoutes && <span className={styles.routeBadge}>分岐設定</span>}
                                                                {question.is_required && <span className={styles.requiredBadge}>必須</span>}
                                                            </span>
                                                        </button>

                                                        <div className={styles.stepActions}>
                                                            <button onClick={() => moveStep(stepIndex, 'up')} disabled={stepIndex === 0} aria-label="質問を上へ" title="上へ移動"><ArrowUp size={15} /></button>
                                                            <button onClick={() => moveStep(stepIndex, 'down')} disabled={stepIndex === productSteps.length - 1} aria-label="質問を下へ" title="下へ移動"><ArrowDown size={15} /></button>
                                                            <button onClick={() => removeStep(step)} className={styles.dangerIconButton} aria-label="質問を削除" title="削除"><Trash2 size={15} /></button>
                                                            <button onClick={() => setOpenStepId(isOpen ? null : step.id)} aria-label={isOpen ? '質問を閉じる' : '質問を編集'} title={isOpen ? '閉じる' : '編集'}>
                                                                <ChevronDown className={isOpen ? styles.chevronOpen : ''} size={18} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {supportsRouting && question.options.length > 0 && (
                                                        <div className={styles.routePreview}>
                                                            {question.options.map(option => (
                                                                <div key={option.id}>
                                                                    <span>{option.label || '名称未設定'}</span>
                                                                    <GitBranch size={13} />
                                                                    <strong>{getRouteLabel(option)}</strong>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {isOpen && (
                                                        <div className={styles.stepBody}>
                                                            <label className={styles.field}>
                                                                <span>質問文</span>
                                                                <input
                                                                    className={styles.questionInput}
                                                                    value={step.step_title}
                                                                    onChange={event => updateQuestionText(step.id, event.target.value)}
                                                                    placeholder="例：ご希望の味を選んでください"
                                                                />
                                                            </label>

                                                            <label className={styles.field}>
                                                                <span>補足説明 <em>任意</em></span>
                                                                <textarea
                                                                    rows={2}
                                                                    value={step.step_description || ''}
                                                                    onChange={event => updateStep(step.id, current => ({ ...current, step_description: event.target.value }))}
                                                                    placeholder="回答のヒントや注意事項"
                                                                />
                                                            </label>

                                                            <div className={styles.questionSettings}>
                                                                <label className={styles.field}>
                                                                    <span>回答方法</span>
                                                                    <select
                                                                        value={question.input_type}
                                                                        onChange={event => changeQuestionType(step.id, event.target.value as FormQuestion['input_type'])}
                                                                    >
                                                                        {inputTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                                                                    </select>
                                                                </label>
                                                                <label className={styles.toggleField}>
                                                                    <span>回答を必須にする</span>
                                                                    <input type="checkbox" checked={question.is_required} onChange={event => updateQuestion(step.id, current => ({ ...current, is_required: event.target.checked }))} />
                                                                </label>
                                                                <label className={styles.toggleField}>
                                                                    <span>{step.is_visible ? <Eye size={15} /> : <EyeOff size={15} />} 公開する</span>
                                                                    <input type="checkbox" checked={step.is_visible} onChange={event => changeStepVisibility(step.id, event.target.checked)} />
                                                                </label>
                                                            </div>

                                                            {hasChoices && (
                                                                <div className={styles.optionsSection}>
                                                                    <div className={styles.optionsHeader}>
                                                                        <div>
                                                                            <h3>選択肢</h3>
                                                                            <p>{supportsRouting ? '回答ごとに、次の行き先STEPを指定できます。' : '複数選択は回答後に次のSTEPへ進みます。'}</p>
                                                                        </div>
                                                                        <button className={styles.smallButton} onClick={() => addOption(step.id)}>
                                                                            <Plus size={15} /> 選択肢を追加
                                                                        </button>
                                                                    </div>

                                                                    <div className={styles.optionList}>
                                                                        {question.options.map((option, optionIndex) => (
                                                                            <OptionEditor
                                                                                key={option.id}
                                                                                option={option}
                                                                                optionIndex={optionIndex}
                                                                                questionType={question.input_type}
                                                                                routingEnabled={supportsRouting}
                                                                                routeTargets={routeTargets}
                                                                                automaticRouteLabel={automaticRouteLabel}
                                                                                estimateStepNumber={estimateStepNumber}
                                                                                isUploading={uploadingId === option.id}
                                                                                onChange={patch => updateOption(step.id, option.id, patch)}
                                                                                onRemove={() => removeOption(step.id, option.id)}
                                                                                onImageUpload={file => void handleOptionImageUpload(step.id, option.id, file)}
                                                                            />
                                                                        ))}
                                                                    </div>

                                                                    {question.options.length === 0 && (
                                                                        <button className={styles.emptyOptionButton} onClick={() => addOption(step.id)}>
                                                                            <Plus size={16} /> 最初の選択肢を追加
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </article>
                                            )
                                        })}

                                        <div className={styles.estimateFlowNode}>
                                            <span className={styles.estimateMarker}><small>STEP</small><strong>{productSteps.length + 1}</strong></span>
                                            <div>
                                                <CircleDollarSign size={19} />
                                                <span><strong>概算見積もり</strong><small>質問への回答と追加料金から自動計算</small></span>
                                            </div>
                                        </div>

                                        <button className={styles.addStepButton} onClick={addStep}>
                                            <Plus size={18} /> 次の質問を追加
                                        </button>
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}

function OptionEditor({
    option,
    optionIndex,
    questionType,
    routingEnabled,
    routeTargets,
    automaticRouteLabel,
    estimateStepNumber,
    isUploading,
    onChange,
    onRemove,
    onImageUpload,
}: {
    option: FormOption
    optionIndex: number
    questionType: FormQuestion['input_type']
    routingEnabled: boolean
    routeTargets: { id: string; stepNumber: number; title: string }[]
    automaticRouteLabel: string
    estimateStepNumber: number
    isUploading: boolean
    onChange: (patch: Partial<FormOption>) => void
    onRemove: () => void
    onImageUpload: (file: File) => void
}) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const hasExtraInput = questionType === 'select_text' || questionType === 'select_number'

    return (
        <div className={styles.optionCard}>
            <div className={styles.optionMainRow}>
                <span className={styles.optionIndex}>{optionIndex + 1}</span>
                <label className={styles.optionLabel}>
                    <span>表示名</span>
                    <input value={option.label} onChange={event => onChange({ label: event.target.value })} placeholder="選択肢を入力" />
                </label>
                <label className={styles.optionPrice}>
                    <span>追加料金</span>
                    <div>
                        <input type="number" value={option.price_modifier} onChange={event => onChange({ price_modifier: Number(event.target.value) || 0 })} />
                        <select
                            value={option.price_modifier_type}
                            onChange={event => onChange({ price_modifier_type: event.target.value as FormOption['price_modifier_type'] })}
                            aria-label="追加料金の単位"
                        >
                            <option value="fixed">円 / 個</option>
                            <option value="percentage">%</option>
                        </select>
                    </div>
                </label>
                <button className={styles.dangerIconButton} onClick={onRemove} aria-label="選択肢を削除" title="選択肢を削除"><Trash2 size={15} /></button>
            </div>

            {routingEnabled && (
                <div className={styles.optionRouteRow}>
                    <span className={styles.routeIcon}><GitBranch size={15} /></span>
                    <label className={styles.field}>
                        <span>この回答を選んだ後の行き先</span>
                        <select
                            aria-label={`${option.label || `選択肢${optionIndex + 1}`}の行き先`}
                            value={option.go_to_estimate ? '__estimate__' : option.next_step_id || '__auto__'}
                            onChange={event => {
                                const value = event.target.value
                                onChange({
                                    next_step_id: value !== '__auto__' && value !== '__estimate__' ? value : null,
                                    go_to_estimate: value === '__estimate__',
                                })
                            }}
                        >
                            <option value="__auto__">自動：{automaticRouteLabel}</option>
                            {routeTargets.map(target => (
                                <option key={target.id} value={target.id}>STEP {target.stepNumber} — {target.title}</option>
                            ))}
                            <option value="__estimate__">STEP {estimateStepNumber} — 概算見積もり</option>
                        </select>
                    </label>
                </div>
            )}

            {hasExtraInput && (
                <p className={styles.extraInputStatus}>
                    {shouldShowExtraInput(option.label) ? <><Check size={13} /> 選択後に追加入力を表示</> : '「なし」系のため追加入力なし'}
                </p>
            )}

            <details className={styles.optionDetails}>
                <summary><Settings2 size={14} /> 説明・画像</summary>
                <div className={styles.optionDetailsBody}>
                    <label className={styles.field}>
                        <span>説明 <em>任意</em></span>
                        <textarea rows={3} value={option.description || ''} onChange={event => onChange({ description: event.target.value })} placeholder="この選択肢の補足説明" />
                    </label>

                    <div className={styles.optionImageField}>
                        {option.image_url && (
                            <span className={styles.optionImage}>
                                <Image src={option.image_url} alt="" fill sizes="64px" />
                            </span>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={event => {
                                const file = event.target.files?.[0]
                                if (file) onImageUpload(file)
                                event.target.value = ''
                            }}
                        />
                        <button className={styles.smallButton} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            {isUploading ? <Loader2 className={styles.spinner} size={15} /> : <ImagePlus size={15} />}
                            {option.image_url ? '画像を変更' : '画像を追加'}
                        </button>
                        {option.image_url && <button className={styles.textDangerButton} onClick={() => onChange({ image_url: '' })}><X size={13} />画像を外す</button>}
                    </div>
                </div>
            </details>
        </div>
    )
}
