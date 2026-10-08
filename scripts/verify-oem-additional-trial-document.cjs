/* Offline regression fixture for additional-trial invoice links and documents. */
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const src = path.join(root, 'src')
const oldExt = Module._extensions['.ts']
const oldResolve = Module._resolveFilename
const oldLoad = Module._load
const secret = 'additional-trial-fixture-secret'
const id = '11111111-1111-4111-8111-111111111111'
const note = '試作で特殊食材の使用の場合は別途お見積りとなります'
let dbCalls = 0
let row = null

process.env.OEM_INTAKE_HASH_SECRET = secret
process.env.NEXT_PUBLIC_BASE_URL = 'https://fixture.invalid'

const invoice = {
  id,
  trial_id: '22222222-2222-4222-8222-222222222222',
  lead_id: '33333333-3333-4333-8333-333333333333',
  prepayment_id: '44444444-4444-4444-8444-444444444444',
  taxable_amount: 3000,
  tax_amount: 300,
  gross_amount: 3300,
  status: 'awaiting_payment',
  invoice_number: 'ADDITIONAL-FIXTURE-1',
  created_at: '2026-10-08T00:00:00Z',
  paid_at: null,
  void_reason: null,
  snapshot: {
    version: 1,
    invoiceNumber: 'ADDITIONAL-FIXTURE-1',
    leadId: '33333333-3333-4333-8333-333333333333',
    companyName: '<Company>',
    contactName: 'A&B',
    description: '追加試作費（1回分）',
    taxableAmount: 3000,
    taxAmount: 300,
    grossAmount: 3300,
    companyKey: 'fixture',
    issuedDate: '2026-10-08',
    dueDate: '2026-10-22',
    issuer: { name: 'Fixture <Issuer>', address: 'A&B', email: 'fixture@example.invalid', registrationNumber: 'T1234567890123', bankName: 'Bank', branchName: 'Main', accountType: '普通', accountNumber: '123456', accountHolder: 'Fixture' },
    taxRate: 10,
    specialIngredientNote: note,
    trialOnly: true,
  },
}

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file }).outputText
}

Module._extensions['.ts'] = (mod, file) => mod._compile(compile(file), file)
Module._resolveFilename = function resolve(request, parent, isMain, options) {
  return oldResolve.call(this, request.startsWith('@/') ? path.join(src, request.slice(2)) : request, parent, isMain, options)
}
Module._load = function load(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (request === '@/lib/supabase/admin') {
    return { adminClient: { from() { dbCalls++; let result = row; return { select() { return this }, eq() { return this }, neq(column, value) { if (row?.[column] === value) result = null; return this }, maybeSingle: async () => ({ data: result, error: null }) } } } }
  }
  if (request === '@/lib/oem-mail-security') {
    return { mailOrigin: () => 'https://fixture.invalid', uuid(value) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw Error('bad uuid'); return value.toLowerCase() } }
  }
  return oldLoad.call(this, request, parent, isMain)
}

async function main() {
  try {
    const additional = require(path.join(src, 'lib/oem-additional-trial-invoices.ts'))
    const renderer = require(path.join(src, 'lib/oem-trial-prepayment-invoices.ts'))
    const route = fs.readFileSync(path.join(src, 'app/btob/additional-trial-invoice/[token]/route.ts'), 'utf8')

    const url = additional.additionalTrialInvoiceUrl(id)
    const match = url.match(/^https:\/\/fixture\.invalid\/btob\/additional-trial-invoice\/([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/)
    assert(match, 'additional invoice URL shape')
    const expected = crypto.createHmac('sha256', secret).update(`oem-additional-trial:v1:${id}`).digest('base64url')
    assert.equal(match[2], expected, 'additional signature domain')
    const oldSignature = crypto.createHmac('sha256', secret).update(`oem-trial-prepayment:v1:${id}`).digest('base64url')
    dbCalls = 0
    assert.equal(await additional.getAdditionalTrialInvoiceForToken(`${id}.${oldSignature}`), null, 'initial signature cannot open additional invoice')
    assert.equal(dbCalls, 0, 'invalid signature is rejected before DB')

    row = invoice
    dbCalls = 0
    assert.deepEqual(await additional.getAdditionalTrialInvoiceForToken(`${id}.${expected}`), invoice, 'valid active additional invoice loads')
    assert.equal(dbCalls, 1, 'valid signature performs one scoped DB lookup')
    row = { ...invoice, status: 'void' }
    assert.equal(await additional.getAdditionalTrialInvoiceForToken(`${id}.${expected}`), null, 'void/non-visible row rejected')

    const response = renderer.trialPrepaymentInvoiceResponse(invoice, 'additional')
    const body = await response.text()
    assert.match(body, /追加試作費（1回分）/)
    assert.match(body, /¥3,000/)
    assert.match(body, /消費税（10%）/)
    assert.match(body, /¥300/)
    assert.match(body, /¥3,300/)
    assert.match(body, new RegExp(note))
    assert.match(body, /&lt;Company&gt;/)
    assert.match(body, /A&amp;B/)
    assert.match(body, /Fixture &lt;Issuer&gt;/)
    assert.doesNotMatch(body, /初回特典/)
    assert.doesNotMatch(body, /試作2回までを含みます/)
    assert.doesNotMatch(body, /全額の入金確認後に試作を開始します/)
    assert.doesNotMatch(body, /先入金/)
    assert.match(body, /nonce=/)
    assert.doesNotMatch(body, /<script/i)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0')
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
    assert.match(response.headers.get('Content-Security-Policy') || '', /default-src 'none'/)
    assert.match(response.headers.get('Content-Security-Policy') || '', /style-src 'nonce-/)
    assert.match(route, /getAdditionalTrialInvoiceForToken/)
    assert.match(route, /trialPrepaymentInvoiceResponse\(invoice, 'additional'\)/)

    console.log(JSON.stringify({ result: 'PASS', amounts: { taxable: 3000, tax: 300, gross: 3300 }, domainSeparated: true, invalidSignatureNoDb: true, voidRejected: true, htmlEscaping: true, securityHeaders: true, initialBenefitCopyAbsent: true, noExternalCalls: true }))
  } catch (error) {
    console.error(`verify-oem-additional-trial-document: FAIL ${error.stack || error.message}`)
    process.exitCode = 1
  } finally {
    Module._extensions['.ts'] = oldExt
    Module._resolveFilename = oldResolve
    Module._load = oldLoad
  }
}

main()
