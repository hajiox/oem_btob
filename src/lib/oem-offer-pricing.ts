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

export function calculateOemQuoteTotals(values: { subtotal: number; offerFee: number; shippingFee: number }) {
    return { ...values, total: values.subtotal + values.offerFee + values.shippingFee }
}
