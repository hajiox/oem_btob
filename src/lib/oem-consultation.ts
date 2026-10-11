import { OEM_PRODUCT_IDS, validateContactInfo } from '@/lib/oem-quote-validation'

export const OEM_CONSULTATION_THEMES = {
    product_feasibility: '商品化の可否',
    ingredients: '使いたい食材',
    cost_lot: '費用・ロット',
    other: 'その他',
} as const

export type OemConsultationInput = {
    companyName: string
    contactName: string
    email: string
    phone?: string
    notes?: string
    theme: keyof typeof OEM_CONSULTATION_THEMES
    productId?: string
    idempotencyKey: string
}

/** A separate intake contract cannot accept prices, specifications or consent. */
export function validateOemConsultation(input: unknown): { data: OemConsultationInput; error?: never } | { error: string; data?: never } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '入力内容を確認してください。' }
    const row = input as Record<string, unknown>
    const keys = ['companyName', 'contactName', 'email', 'phone', 'notes', 'theme', 'productId', 'idempotencyKey']
    if (Object.keys(row).some(key => !keys.includes(key))) return { error: '相談フォームの入力内容を確認してください。' }
    const contactError = validateContactInfo(row as OemConsultationInput)
    if (contactError) return { error: contactError }
    if (typeof row.theme !== 'string' || !Object.hasOwn(OEM_CONSULTATION_THEMES, row.theme)) return { error: '相談したいことを選んでください。' }
    if (row.productId !== undefined && (typeof row.productId !== 'string' || !OEM_PRODUCT_IDS.has(row.productId))) return { error: '商品を確認できません。' }
    if (typeof row.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.idempotencyKey)) return { error: 'ページを再読み込みしてから、もう一度ご相談内容を送信してください。' }
    return { data: {
        companyName: (row.companyName as string).trim(),
        contactName: (row.contactName as string).trim(),
        email: (row.email as string).trim(),
        phone: typeof row.phone === 'string' ? row.phone.trim() : '',
        notes: typeof row.notes === 'string' ? row.notes.trim() : '',
        theme: row.theme as OemConsultationInput['theme'],
        ...(row.productId ? { productId: row.productId as string } : {}),
        idempotencyKey: row.idempotencyKey,
    } }
}
