'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MailError, requireMailAdmin, requireOemMailLead, uuid } from '@/lib/oem-mail-security'
import { documentUrl } from '@/lib/oem-documents'
import type { OemDocument, OemDocumentType } from '@/lib/oem-documents-shared'
import { accountantCsv, accountantDateRange, OEM_ACCOUNTING_PAGE } from '@/lib/oem-accounting-csv'

type Result = { success: boolean; error?: string; message?: string; document?: OemDocument; url?: string; uncertain?: boolean }
const fail = (error: unknown, fallback: string): Result => ({ success: false, error: error instanceof MailError ? error.message : fallback })

export async function getOemDocuments(orderId: string): Promise<{ success: boolean; error?: string; documents: OemDocument[] }> {
  try {
    await requireMailAdmin(); const id = uuid(orderId)
    const order = await adminClient.from('oem_orders').select('id,lead_id').eq('id', id).single()
    if (order.error || !order.data) throw new MailError('正式発注が見つかりません。', 404)
    await requireOemMailLead(order.data.lead_id)
    const result = await adminClient.from('oem_documents').select('*').eq('order_id', id).order('created_at', { ascending: true })
    if (result.error) throw result.error
    return { success: true, documents: (result.data || []) as OemDocument[] }
  } catch (error) { return { ...fail(error, '書面を取得できませんでした。'), documents: [] } }
}

export async function issueOemDocument(orderId: string, type: OemDocumentType, requestId: string): Promise<Result> {
  let attempted = false
  try {
    const user = await requireMailAdmin(); const id = uuid(orderId); const request = uuid(requestId)
    if (type !== 'receipt' && type !== 'delivery_note') return { success: false, error: '書面種類が不正です。' }
    attempted = true
    const result = await adminClient.rpc('issue_oem_document', { p_order_id: id, p_document_type: type, p_request_id: request, p_actor: user.id, p_input: { type } })
    if (result.error) throw result.error
    const row = Array.isArray(result.data) ? result.data[0] : result.data
    const messages: Record<string, string> = { evidence_required: '完成・出荷記録が揃ってから発行してください。', payment_required: '確定請求額または精算額と確認済みの入出金が一致してから領収書を発行してください。', settlement_required: '精算未完了のため書面発行を保留しています。', issuer_required: '有効な請求書の発行者情報がないため発行できません。', conflict: '同じ発行IDが別の書面に使われています。', state: '現在の注文状態では発行できません。', forbidden: '書面発行権限がありません。' }
    if (!['issued', 'duplicate'].includes(row?.result)) return { success: false, error: messages[row?.result] || '書面を発行できませんでした。' }
    const saved = await adminClient.from('oem_documents').select('*').eq('id', row.document_id).single()
    if (saved.error || !saved.data) return { success: false, error: '発行結果を確認できませんでした。', uncertain: true }
    revalidatePath('/admin/dashboard'); const document = saved.data as OemDocument
    return { success: true, message: row.result === 'duplicate' ? '同じ書面は発行済みです。' : '書面を発行しました。', document, url: documentUrl(document.id) }
  } catch (error) { return { ...fail(error, '書面を発行できませんでした。'), uncertain: attempted } }
}

type CsvOrder = { order_number: string; leads: { company_name: string; page_id: string } }
type TrialInvoiceRow = { invoice_number?: unknown; snapshot?: unknown; issued_at?: unknown; lifecycle_status?: unknown; oem_trial_prepayments?: { status?: unknown } | Array<{ status?: unknown }>; leads?: { company_name?: unknown } | Array<{ company_name?: unknown }> }
type TrialReceiptRow = { id: string; amount: number; paid_on: string; oem_trial_prepayments?: { gross_amount?: number; lead_id?: string; oem_trial_prepayment_invoices?: { invoice_number?: string } | Array<{ invoice_number?: string }>; leads?: { company_name?: string } | Array<{ company_name?: string }> } | Array<{ gross_amount?: number; lead_id?: string; oem_trial_prepayment_invoices?: { invoice_number?: string } | Array<{ invoice_number?: string }>; leads?: { company_name?: string } | Array<{ company_name?: string }> }> }
function one<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value || undefined }
export async function exportOemAccountantCsv(from?: string, to?: string): Promise<{ success: boolean; error?: string; csv?: string; status?: number }> {
  try {
    await requireMailAdmin()
    let range: ReturnType<typeof accountantDateRange>
    try { range = accountantDateRange(from, to) } catch (error) { throw new MailError(error instanceof Error ? error.message : '日付を確認してください。', 400) }
    const { start, end, since, until } = range
    const rows: string[][] = [['種別', '番号', '注文番号', '会社名', '日付', '金額', 'ステージ', '状態']], page = 500
    let offset = 0
    while (true) {
      let query = adminClient.from('oem_invoices').select('id,invoice_number,stage,snapshot,issued_at,lifecycle_status,leads!inner(page_id)').eq('leads.page_id', OEM_ACCOUNTING_PAGE).order('issued_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + page - 1)
      if (since) query = query.gte('issued_at', since); if (until) query = query.lt('issued_at', until)
      const result = await query; if (result.error) throw result.error
      for (const invoice of result.data || []) { const snapshot = invoice.snapshot as Record<string, unknown>; rows.push(['請求書', String(invoice.invoice_number), String(snapshot.orderNumber || ''), String(snapshot.companyName || ''), String(snapshot.issuedDate || invoice.issued_at || ''), String(snapshot.amountDue || ''), String(invoice.stage), String(invoice.lifecycle_status || 'active')]) }
      if (!result.data || result.data.length < page) break; offset += page
    }
    let receiptOffset = 0
    while (true) {
      let query = adminClient.from('oem_payment_receipts').select('id,amount,paid_on,oem_payment_plans!inner(order_id,stage,oem_orders!inner(order_number,leads!inner(company_name,page_id)))').eq('oem_payment_plans.oem_orders.leads.page_id', OEM_ACCOUNTING_PAGE).order('paid_on', { ascending: true }).order('id', { ascending: true }).range(receiptOffset, receiptOffset + page - 1)
      if (start) query = query.gte('paid_on', start); if (end) query = query.lte('paid_on', end)
      const result = await query; if (result.error) throw result.error
      for (const receipt of result.data || []) { const plan = (Array.isArray(receipt.oem_payment_plans) ? receipt.oem_payment_plans[0] : receipt.oem_payment_plans) as unknown as { order_id: string; stage: string; oem_orders: CsvOrder }; rows.push(['銀行入金', `receipt:${receipt.id}`, plan.oem_orders.order_number, plan.oem_orders.leads.company_name, String(receipt.paid_on), String(receipt.amount), plan.stage, '確認済み']) }
      if (!result.data || result.data.length < page) break; receiptOffset += page
    }
    let cashOffset = 0
    while (true) {
      let query = adminClient.from('oem_settlement_cash').select('id,order_id,direction,amount,happened_on,oem_orders!inner(order_number,leads!inner(company_name,page_id))').eq('oem_orders.leads.page_id', OEM_ACCOUNTING_PAGE).order('happened_on', { ascending: true }).order('id', { ascending: true }).range(cashOffset, cashOffset + page - 1)
      if (start) query = query.gte('happened_on', start); if (end) query = query.lte('happened_on', end)
      const result = await query; if (result.error) throw result.error
      for (const cash of result.data || []) { const order = cash.oem_orders as unknown as CsvOrder; rows.push([cash.direction === 'refund' ? '精算返金' : '精算入金', `cash:${cash.id}`, order.order_number, order.leads.company_name, String(cash.happened_on), String(cash.amount), '精算台帳', cash.direction === 'refund' ? '返金' : '確認済み']) }
      if (!result.data || result.data.length < page) break; cashOffset += page
    }
    let trialInvoiceOffset = 0
    while (true) {
      let query = adminClient.from('oem_trial_prepayment_invoices').select('id,invoice_number,snapshot,issued_at,lifecycle_status,oem_trial_prepayments!inner(status),leads!inner(company_name,page_id)').eq('leads.page_id', OEM_ACCOUNTING_PAGE).order('issued_at', { ascending: true }).order('id', { ascending: true }).range(trialInvoiceOffset, trialInvoiceOffset + page - 1)
      if (since) query = query.gte('issued_at', since); if (until) query = query.lt('issued_at', until)
      const result = await query; if (result.error) throw result.error
      for (const invoice of (result.data || []) as TrialInvoiceRow[]) {
        const snapshot = (invoice.snapshot && typeof invoice.snapshot === 'object' ? invoice.snapshot : {}) as Record<string, unknown>
        const lead = one(invoice.leads)
        const prepayment = one(invoice.oem_trial_prepayments)
        rows.push(['試作費請求', String(invoice.invoice_number || snapshot.invoiceNumber || ''), '', String(snapshot.companyName || lead?.company_name || ''), String(snapshot.issuedDate || invoice.issued_at || ''), String(snapshot.grossAmount || ''), 'trial', prepayment?.status === 'void' ? 'void' : String(invoice.lifecycle_status || 'active')])
      }
      if (!result.data || result.data.length < page) break; trialInvoiceOffset += page
    }
    let trialReceiptOffset = 0
    while (true) {
      let query = adminClient.from('oem_trial_prepayment_receipts').select('id,amount,paid_on,oem_trial_prepayments!inner(gross_amount,lead_id,oem_trial_prepayment_invoices(invoice_number),leads!inner(company_name,page_id))').eq('oem_trial_prepayments.leads.page_id', OEM_ACCOUNTING_PAGE).order('paid_on', { ascending: true }).order('id', { ascending: true }).range(trialReceiptOffset, trialReceiptOffset + page - 1)
      if (start) query = query.gte('paid_on', start); if (end) query = query.lte('paid_on', end)
      const result = await query; if (result.error) throw result.error
      for (const receipt of (result.data || []) as TrialReceiptRow[]) {
        const prepayment = one(receipt.oem_trial_prepayments); const lead = one(prepayment?.leads)
        rows.push(['試作費銀行入金', `trial-receipt:${receipt.id}`, '', String(lead?.company_name || ''), String(receipt.paid_on), String(receipt.amount), 'trial', '確認済み'])
      }
      if (!result.data || result.data.length < page) break; trialReceiptOffset += page
    }
    let extraInvoiceOffset = 0
    while (true) {
      let query = adminClient.from('oem_additional_trial_payments').select('id,invoice_number,snapshot,status,created_at,leads!inner(company_name,page_id)').eq('leads.page_id', OEM_ACCOUNTING_PAGE).order('created_at', { ascending: true }).order('id', { ascending: true }).range(extraInvoiceOffset, extraInvoiceOffset + page - 1)
      if (since) query = query.gte('created_at', since); if (until) query = query.lt('created_at', until)
      const result = await query; if (result.error) throw result.error
      for (const invoice of result.data || []) {
        const snapshot = (invoice.snapshot && typeof invoice.snapshot === 'object' ? invoice.snapshot : {}) as Record<string, unknown>
        const lead = one(invoice.leads)
        rows.push(['追加試作費請求', String(invoice.invoice_number), '', String(snapshot.companyName || lead?.company_name || ''), String(snapshot.issuedDate || invoice.created_at), String(snapshot.grossAmount || ''), 'trial-extra', String(invoice.status)])
      }
      if (!result.data || result.data.length < page) break; extraInvoiceOffset += page
    }
    let extraReceiptOffset = 0
    while (true) {
      let query = adminClient.from('oem_additional_trial_payment_receipts').select('id,amount,paid_on,oem_additional_trial_payments!inner(invoice_number,leads!inner(company_name,page_id))').eq('oem_additional_trial_payments.leads.page_id', OEM_ACCOUNTING_PAGE).order('paid_on', { ascending: true }).order('id', { ascending: true }).range(extraReceiptOffset, extraReceiptOffset + page - 1)
      if (start) query = query.gte('paid_on', start); if (end) query = query.lte('paid_on', end)
      const result = await query; if (result.error) throw result.error
      for (const receipt of result.data || []) {
        const payment = one(receipt.oem_additional_trial_payments); const lead = one(payment?.leads)
        rows.push(['追加試作費銀行入金', `additional-trial-receipt:${receipt.id}`, '', String(lead?.company_name || ''), String(receipt.paid_on), String(receipt.amount), 'trial-extra', '確認済み'])
      }
      if (!result.data || result.data.length < page) break; extraReceiptOffset += page
    }
    return { success: true, csv: accountantCsv(rows) }
  } catch (error) { return { success: false, error: error instanceof MailError ? error.message : '会計CSVを出力できませんでした。', status: error instanceof MailError ? error.status : 500 } }
}
