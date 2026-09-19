import type { FormOption, FormQuestion, FormStep, Product } from '@/types/database'

export const OEM_PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
export const OEM_PRODUCT_IDS = new Set([
    'c0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000004',
    'c0000001-0000-0000-0000-000000000005', 'c0000001-0000-0000-0000-000000000006',
])
export const SHIPPING_PACKING_FEE = 6000

export type ContactInfo = { companyName: string; contactName: string; email: string; phone?: string; notes?: string }
const MAX_CONTACT_LENGTH = 200
export function isValidContactInfo(contact: ContactInfo): boolean {
    return validateContactInfo(contact) === null
}
export function validateContactInfo(contact: ContactInfo): string | null {
    if (!contact || typeof contact !== 'object') return '入力内容を確認してください。'
    const fields: [string, unknown][] = [['会社名', contact.companyName], ['担当者名', contact.contactName]]
    if (fields.some(([, value]) => typeof value !== 'string' || !value.trim() || value.length > MAX_CONTACT_LENGTH)) return '会社名・担当者名・メールアドレスを正しく入力してください。'
    if (typeof contact.email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact.email.trim()) || contact.email.length > 254) return 'メールアドレスの形式が正しくありません。'
    if (contact.phone !== undefined && (typeof contact.phone !== 'string' || contact.phone.length > 50)) return '電話番号が長すぎます。'
    if (contact.notes !== undefined && (typeof contact.notes !== 'string' || contact.notes.length > 5000)) return '備考が長すぎます。'
    return null
}

export type QuoteSnapshot = { product: Product; steps: (FormStep & { questions: (FormQuestion & { options: FormOption[] })[] })[] }
export type QuoteValidation = { selectedOptions: Array<{ question: string; answer: string; type: string }>; subtotal: number; total: number; quantity: number; quantityLabel: string; quantityUnit: string; conditionNote: string } | { error: string }
const teaId = 'c0000001-0000-0000-0000-000000000006'
const answerIds = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter(v => typeof v === 'string')
    if (value && typeof value === 'object' && 'selected' in value) return typeof (value as { selected?: unknown }).selected === 'string' ? [(value as { selected: string }).selected] : []
    return typeof value === 'string' ? [value] : []
}

export function validateOemQuote(snapshot: QuoteSnapshot, rawAnswers: Record<string, unknown>): QuoteValidation {
    const { product, steps } = snapshot
    if (!product || product.page_id !== OEM_PAGE_ID || !product.is_visible || !OEM_PRODUCT_IDS.has(product.id)) return { error: '商品を確認できません。' }
    if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) return { error: '回答内容を確認してください。' }
    if (!steps.length || steps.some(s => s.product_id !== product.id || s.page_id !== OEM_PAGE_ID || !s.is_visible || !s.questions.length)) return { error: '商品設定を確認できません。時間をおいてお試しください。' }
    const questions = steps.flatMap(step => step.questions)
    const questionById = new Map(questions.map(q => [q.id, q]))
    const optionById = new Map(questions.flatMap(q => q.options).map(o => [o.id, { option: o, question: questions.find(q => q.id === o.question_id)! }]))
    const selected = new Set<string>()
    const reachable = new Set<string>()
    const values = new Map<string, string[]>()
    const usesRouting = questions.some(q => q.options.some(o => o.next_step_id || o.go_to_estimate))
    // Visibility is calculated from preceding answers, matching the public UI dependency rule.
    const orderedSteps = [...steps].sort((a, b) => a.order_index - b.order_index)
    for (let stepIndex = 0; stepIndex < orderedSteps.length; stepIndex++) {
        const step = orderedSteps[stepIndex]
        for (const q of [...step.questions].sort((a, b) => a.order_index - b.order_index)) {
            if (!usesRouting && q.depends_on_option_id && !selected.has(q.depends_on_option_id)) continue
            reachable.add(q.id)
            const raw = rawAnswers[q.id]
            // The OEM catalogue uses one radio or free-text question per screen.
            // Fail closed if an unsupported editor configuration is introduced.
            if (!['radio', 'text', 'textarea'].includes(q.input_type)) return { error: '商品設定を確認できません。' }
            if (raw !== undefined && typeof raw !== 'string') return { error: '回答の形式が正しくありません。' }
            if (typeof raw === 'string' && raw.length > 2000) return { error: '回答は2,000文字以内で入力してください。' }
            const ids = answerIds(rawAnswers[q.id])
            if (q.is_required && ids.length === 0 && ['radio', 'checkbox', 'select', 'select_text', 'select_number'].includes(q.input_type)) return { error: '必須項目を入力してください。' }
            if (q.is_required && ['text', 'textarea', 'number'].includes(q.input_type) && (typeof rawAnswers[q.id] !== 'string' || !String(rawAnswers[q.id]).trim())) return { error: '必須項目を入力してください。' }
            // Free-text answers are values, not option IDs.
            if (['text', 'textarea', 'number'].includes(q.input_type)) { values.set(q.id, []); continue }
            for (const id of ids) {
                const found = optionById.get(id)
                if (!found || found.question.id !== q.id) return { error: '無効な選択肢が含まれています。' }
                selected.add(id)
            }
            values.set(q.id, ids)
            const jump = ids.map(id => optionById.get(id)?.option).find(o => o?.next_step_id)?.next_step_id
            if (jump && !ids.some(id => optionById.get(id)?.option.go_to_estimate)) {
                const target = orderedSteps.findIndex(s => s.id === jump)
                if (target <= stepIndex) return { error: '質問の経路設定を確認できません。' }
                stepIndex = target - 1
            }
            if (ids.some(id => optionById.get(id)?.option.go_to_estimate)) break
        }
        if (step.questions.some(q => values.get(q.id)?.some(id => optionById.get(id)?.option.go_to_estimate))) break
    }
    for (const key of Object.keys(rawAnswers)) if (!questionById.has(key) || !reachable.has(key)) return { error: '現在の経路にない回答が含まれています。' }
    const selectedRows = [...values.entries()].flatMap(([qid, ids]) => ids.map(id => ({ q: questionById.get(qid)!, o: optionById.get(id)!.option })))
    if (product.id === teaId) {
        const supplied = selectedRows.some(x => x.q.question_text.includes('原料をご支給') && x.o.label === 'ある')
        if (!supplied) return { error: 'お茶は原料支給が必要です。' }
        const nameQ = questions.find(q => q.question_text.includes('原料名'))
        const ingredientName = nameQ ? rawAnswers[nameQ.id] : undefined
        if (!nameQ || typeof ingredientName !== 'string' || !ingredientName.trim()) return { error: 'お茶は原料名の入力が必要です。' }
    }
    const plan = selectedRows.find(x => x.o.label.includes('100袋') || x.o.label.includes('400個'))
    const quantity = product.id === teaId ? (plan?.o.label.includes('100袋') ? 100 : plan?.o.label.includes('400個') ? 400 : 0) : 400
    if (!quantity) return { error: 'お茶のプランを選択してください。' }
    let fixed = product.base_price_type === 'fixed' ? product.base_price : 0
    let percentage = product.base_price_type === 'percentage' ? product.base_price : 0
    for (const { o } of selectedRows) { if (o.price_modifier_type === 'percentage') percentage += o.price_modifier; else fixed += o.price_modifier }
    const subtotal = Math.ceil(fixed * quantity * (1 + percentage / 100))
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) return { error: '価格設定を確認できません。' }
    const canonical = selectedRows.map(({ q, o }) => ({ question: q.question_text, answer: o.label, type: q.input_type }))
    for (const q of questions) {
        const textAnswer = rawAnswers[q.id]
        if (['text', 'textarea', 'number'].includes(q.input_type) && typeof textAnswer === 'string' && textAnswer.trim()) canonical.push({ question: q.question_text, answer: textAnswer.trim(), type: q.input_type })
    }
    const isRamen = product.id.endsWith('000002')
    const quantityUnit = product.id === teaId && quantity === 100 ? '袋' : isRamen ? 'セット' : '個'
    const quantityLabel = product.id === teaId ? (quantity === 100 ? '50包×100袋（5,000包）' : '4包×400個（1,600包）') : `400${quantityUnit}（固定ロット）`
    const capacity = selectedRows.map(x => x.o.label).join(' ').match(/\d+(?:[〜～-]\d+)?\s?(?:kg|g|ml|cc)/i)?.[0]
    const conditionNote = product.id === teaId
        ? '表示価格は概算です。乾燥・必要に応じた焙煎・製造・包装込み。食材の種類・状態や加工内容により金額が変わります。乾燥加工をお引き受けできない食材もあります。原料確認後に対応可否と正式見積もりをご案内します。'
        : `概算（製造数量が多少前後し完成全数買い取り、実際の出来上がり数量で精算）／賞味期限：製造から${isRamen ? '60日／1セット2食入り' : '1年'}${product.id.endsWith('000001') ? '／内容量200g' : !isRamen && capacity ? `／容量：${capacity}` : ''}`
    return { selectedOptions: canonical, subtotal, total: subtotal + SHIPPING_PACKING_FEE, quantity, quantityLabel, quantityUnit, conditionNote }
}
