import type { OemInvoice } from './oem-invoices-shared'
import { yen } from './oem-invoices-shared'

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Standalone document: no trackers, external assets, or customer values in scripts. */
export function invoiceDocument(invoice: OemInvoice, nonce: string, cancelled = false, superseded = false): string {
  const s = invoice.snapshot, issuer = s.issuer
  const title = s.stage === 'deposit' ? '製造着手金請求書' : '出荷前精算金請求書'
  const row = (name: string, value: number) => `<tr><th>${escape(name)}</th><td>${escape(yen(value))}</td></tr>`
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${s.demo ? '【見本】' : ''}${title} ${escape(invoice.invoice_number)}</title>
  <style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#172b3a;font:15px/1.65 "Noto Sans JP","Yu Gothic",Meiryo,sans-serif}main{max-width:850px;margin:28px auto;padding:42px 48px;background:white;border:1px solid #d4dce3}h1{font-size:30px;letter-spacing:.18em;margin:0 0 16px}h2{font-size:17px;margin:24px 0 8px}.top,.parties{display:flex;justify-content:space-between;gap:28px}.meta{text-align:right;font-size:13px}.parties>div{flex:1}.customer{font-size:20px;font-weight:bold}.issuer{font-size:13px}.amount{margin:26px 0 18px;padding:16px 20px;border-top:3px solid #157585;border-bottom:1px solid #157585;display:flex;justify-content:space-between;align-items:center}.amount strong{font-size:29px}.muted{color:#55646f;font-size:13px}.notice{padding:12px 16px;border:2px solid #b45309;color:#92400e;font-weight:bold;margin:0 0 22px}.description{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border-bottom:1px solid #d8e0e6;padding:9px 12px}th{font-weight:normal;text-align:left}td{text-align:right;white-space:nowrap}.bank{background:#f4f7f8;padding:16px 20px;white-space:pre-line;overflow-wrap:anywhere}.controls{max-width:850px;margin:20px auto;text-align:right}button{background:#116c7c;color:white;border:0;border-radius:6px;padding:12px 20px;cursor:pointer;font-size:15px}.total{font-weight:bold;background:#edf6f7}footer{border-top:1px solid #d8e0e6;margin-top:28px;padding-top:12px;font-size:12px;color:#596974}.issuer,.customer{overflow-wrap:anywhere}@media(max-width:600px){main{margin:0;padding:24px 20px}.top,.parties{display:block}.meta{text-align:left;margin-bottom:18px}.issuer{margin-top:18px}.amount strong{font-size:24px}.controls{padding:0 20px}}@page{size:A4;margin:14mm}@media print{body{background:white;font-size:11pt}main{border:0;margin:0;padding:0;max-width:none}.controls{display:none}h2,.bank,.amount,table{break-inside:avoid}a{color:inherit;text-decoration:none}}
  </style></head><body><div class="controls"><button id="print">印刷・PDF保存</button></div><main>
  ${s.demo ? '<p class="notice">動作テスト用の見本です。実際の請求・支払いは発生しません。</p>' : ''}
  ${cancelled ? '<p class="notice">この注文はキャンセル済みです。お振込みはせず、担当者へご確認ください。</p>' : ''}
  ${superseded ? '<p class="notice">変更・キャンセル精算が別途管理されています。この書面は元の請求履歴です。現在の振込額として使用せず、最新の精算内容を確認してください。</p>' : ''}
  <div class="top"><h1>${title}</h1><div class="meta">請求書番号：${escape(invoice.invoice_number)}<br>発行日：${escape(s.issuedDate)}<br>注文番号：${escape(s.orderNumber)}</div></div>
  <div class="parties"><div><p class="customer">${escape(s.companyName)} 御中</p><p>${escape(s.contactName)} 様</p></div><div class="issuer"><strong>${escape(issuer.name)}</strong><br>${escape(issuer.address)}<br>${escape(issuer.email)}${issuer.registrationNumber ? `<br>登録番号：${escape(issuer.registrationNumber)}` : ''}</div></div>
  <p>下記のとおり${s.stage === 'deposit' ? '製造着手金（正式見積額の50％）' : '出荷前精算金'}をご請求申し上げます。</p>
  <div class="amount"><span>今回のご請求額（税込）</span><strong>${escape(yen(s.amountDue))}</strong></div>
  <p><strong>お支払期限：${escape(s.dueDate)}</strong></p>
  <h2>ご注文内容</h2><div class="description">${escape(s.description)}</div>
  <h2>${s.stage === 'deposit' ? '正式見積' : '確定した最終金額'}の内訳</h2><table><tbody>
  ${s.taxable8 ? row('8％対象額（税別）', s.taxable8) + row('消費税（8％）', s.tax8) : ''}
  ${s.taxable10 ? row('10％対象額（税別）', s.taxable10) + row('消費税（10％）', s.tax10) : ''}
  ${s.nonTaxable ? row('課税対象外', s.nonTaxable) : ''}
  ${row('合計（税込）', s.grossTotal)}
  ${s.stage === 'balance' ? row('前金入金済額（税込・控除）', -s.depositReceived) : ''}
  <tr class="total"><th>${s.stage === 'deposit' ? '今回の製造着手金（合計の50％）' : '今回の出荷前精算金'}</th><td>${escape(yen(s.amountDue))}</td></tr>
  </tbody></table><p class="muted">税額は税率ごとの合計額に対して円未満切捨て。${s.stage === 'deposit' ? '前金の円未満は切捨て。残金は製造数量確定後に、入金済みの前金を差し引いてご案内します。' : '前金の入金記録に基づき控除しています。'}</p>
  <h2>お振込先</h2><div class="bank">${escape(issuer.bankName)}　${escape(issuer.branchName)}
  ${escape(issuer.accountType)}　${escape(issuer.accountNumber)}
  口座名義：${escape(issuer.accountHolder)}</div>
  <footer>お問い合わせ：${escape(issuer.email)}<br>この書面は${title}です。領収書ではありません。お支払い済みの場合は、行き違いの可能性がありますので担当者へご確認ください。</footer>
  </main><script nonce="${nonce}">document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`
}
