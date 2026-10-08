// Client-safe OEM offer values. Keep this file free of node-only imports.
export const OEM_INITIAL_TRIAL_FEE = 5000
export const OEM_NORMAL_TRIAL_FEE = 10000
export const OEM_ADDITIONAL_TRIAL_FEE = 3000
export const OEM_NORMAL_LABEL_FEE = 5000
export const OEM_NORMAL_NUTRITION_FEE = 5000
export const OEM_NORMAL_PACKAGE_DESIGN_FEE = 30000
export const OEM_INITIAL_LABEL_FEE = 0
export const OEM_INITIAL_NUTRITION_FEE = 0
export const OEM_INITIAL_PACKAGE_DESIGN_FEE = 0
export const OEM_NORMAL_OFFER_VALUE = OEM_NORMAL_TRIAL_FEE + OEM_NORMAL_LABEL_FEE + OEM_NORMAL_NUTRITION_FEE + OEM_NORMAL_PACKAGE_DESIGN_FEE
export const OEM_INITIAL_OFFER_FEE = OEM_INITIAL_TRIAL_FEE + OEM_INITIAL_LABEL_FEE + OEM_INITIAL_NUTRITION_FEE + OEM_INITIAL_PACKAGE_DESIGN_FEE
export const OEM_SPECIAL_INGREDIENT_NOTE = '試作で特殊食材の使用の場合は別途お見積りとなります'
export const OEM_TRIAL_TAX_RATE = 10
export const OEM_INITIAL_TRIAL_TAX = Math.floor(OEM_INITIAL_TRIAL_FEE * OEM_TRIAL_TAX_RATE / 100)
export const OEM_INITIAL_TRIAL_GROSS = OEM_INITIAL_TRIAL_FEE + OEM_INITIAL_TRIAL_TAX

export function calculateOemQuoteTotals(values: { subtotal: number; offerFee: number; shippingFee: number }) {
    // The trial is a separate prepaid service, never part of the manufacturing deposit.
    const total = values.subtotal + values.shippingFee
    const trialTax = Math.floor(values.offerFee * OEM_TRIAL_TAX_RATE / 100)
    return { ...values, total, trialTax, trialGross: values.offerFee + trialTax, projectNetTotal: total + values.offerFee }
}

// Old consultation estimates included the trial service. Preserve the stored estimate,
// but exclude its known line item when suggesting a NEW manufacturing quotation.
export function getOemManufacturingEstimate(lead: { estimated_total_price: number; selected_options: unknown }): number {
    const rows = Array.isArray(lead.selected_options) ? lead.selected_options as Array<{ question?: unknown; answer?: unknown }> : []
    const amount = (row: { answer?: unknown } | undefined) => {
        if (!row || typeof row.answer !== 'string') return null
        const match = row.answer.match(/^[¥￥]?\s*([\d,]+)(?:円)?\s*$/)
        const value = match ? Number(match[1].replaceAll(',', '')) : NaN
        return Number.isSafeInteger(value) && value >= 0 ? value : null
    }
    const product = amount(rows.find(row => row.question === '商品小計(税抜)'))
    const shipping = amount(rows.find(row => row.question === '送料・発送梱包手数料(税抜・1注文につき)'))
    if (product !== null && shipping !== null) return product + shipping
    const legacyTrial = amount(rows.find(row => row.question === '試作・表示・簡易デザイン費(税抜・初回特典適用)' || row.question === 'OEM開発基本費（初回特典対象・概算）'))
    return Math.max(0, lead.estimated_total_price - (legacyTrial ?? 0))
}
