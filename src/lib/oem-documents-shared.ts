export type OemDocumentType = 'delivery_note' | 'receipt'
export type OemDocument = { id: string; order_id: string; lead_id: string; document_type: OemDocumentType; document_number: string; snapshot: OemDocumentSnapshot; request_id: string; created_at: string }
export type OemDocumentSnapshot = { version: 1; orderNumber: string; companyName: string; contactName: string; email: string; completedQuantity: number; quantityUnit: string; completedOn: string; shippedOn?: string | null; carrier?: string | null; trackingNumber?: string | null; issuer?: { name?: string; address?: string; email?: string; registrationNumber?: string }; issuedDate: string; source: string; demo?: boolean; receivedTotal?: number; settlementId?: string | null; paidEntries?: Array<{ amount: number; paidOn: string; payerName: string; direction?: 'receipt' | 'refund' }> }
export const csvSafe = (value: unknown) => { const s = String(value ?? ''); return /^[=+\-@]/.test(s) ? `'${s}` : s }
export const csvCell = (value: unknown) => `"${csvSafe(value).replace(/"/g, '""')}"`
export function documentTitle(type: OemDocumentType) { return type === 'receipt' ? '領収書' : '納品書' }
