export const OEM_ORDER_STATUS_LABELS = {
  issued: '規約同意待ち',
  accepted: '正式発注受付済み',
  deposit_paid: '前金入金済み',
  in_production: '製造中',
  balance_due: '残額請求中',
  paid: '全額入金済み',
  shipped: '出荷済み',
  cancelled: 'キャンセル',
} as const

export type OemOrderStatus = keyof typeof OEM_ORDER_STATUS_LABELS

const NEXT_STATUS: Partial<Record<OemOrderStatus, OemOrderStatus>> = {
  accepted: 'deposit_paid',
  deposit_paid: 'in_production',
  in_production: 'balance_due',
  balance_due: 'paid',
  paid: 'shipped',
}

export function canAdvanceOemOrder(current: OemOrderStatus, next: OemOrderStatus): boolean {
  return NEXT_STATUS[current] === next
}

export function nextOemOrderStatus(current: OemOrderStatus): OemOrderStatus | null {
  return NEXT_STATUS[current] || null
}
