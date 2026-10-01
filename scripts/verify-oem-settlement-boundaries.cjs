/* Offline verification: no database changes, email or bank operation. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function load(path, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const m = { exports: {} }
  vm.runInNewContext(code, { exports: m.exports, module: m, require: name => { if (!Object.hasOwn(deps, name)) throw new Error(`Unexpected ${name}`); return deps[name] }, Intl, Date, Number, Object, Error }, { filename: path })
  return m.exports
}
async function main() {
  const fulfillment = load('src/lib/oem-fulfillment-shared.ts')
  const shared = load('src/lib/oem-settlements-shared.ts', { './oem-fulfillment-shared': fulfillment })
  const parse = shared.parseSettlementInput
  const base = { kind: 'cancellation', materialStage: 'before', taxable8: 0, taxable10: 0, nonTaxable: 30000, dueDate: null, reason: ' cancellation ', agreementNote: ' customer email ' }
  assert.equal(parse(base, 'save').reason, 'cancellation')
  assert.equal(shared.settlementTotals(100, 100, 100).gross, 318)
  assert.equal(shared.settlementTotals(0, 0, 0).gross, 0)
  const invalid = [
    [null, 'save'], [[], 'save'], [{ ...base, kind: 'x' }, 'save'], [{ ...base, materialStage: 'not_applicable' }, 'save'],
    [{ ...base, taxable8: '100' }, 'save'], [{ ...base, taxable10: NaN }, 'save'], [{ ...base, taxable10: -1 }, 'save'],
    [{ ...base, taxable10: 100000000 }, 'save'], [{ ...base, taxable8: 1.1 }, 'save'], [{ ...base, dueDate: '2026-02-30' }, 'save'],
    [{ ...base, reason: '' }, 'save'], [{ ...base, agreementNote: '' }, 'save'], [{ ...base, orderId: 'injected' }, 'save'],
    [{ customerConfirmed: 'true' }, 'confirm'], [{ customerConfirmed: false }, 'confirm'], [{ customerConfirmed: true, target_gross: 1 }, 'confirm'],
    [{ reason: '\0' }, 'void'], [{ reason: 'x'.repeat(2001) }, 'void'],
  ]
  const cash = { direction: 'refund', amount: 20000, happenedOn: fulfillment.tokyoToday(), counterparty: ' test ', note: ' bank checked ', bankConfirmed: true }
  assert.equal(parse(cash, 'record_cash').counterparty, 'test')
  invalid.push([{ ...cash, bankConfirmed: false }, 'record_cash'], [{ ...cash, amount: 0 }, 'record_cash'], [{ ...cash, amount: '1' }, 'record_cash'], [{ ...cash, happenedOn: '2099-01-01' }, 'record_cash'], [{ ...cash, direction: 'withdraw' }, 'record_cash'], [{ ...cash, note: '' }, 'record_cash'])
  for (const [input, action] of invalid) assert.throws(() => parse(input, action))
  const id = '00000000-0000-4000-8000-000000000001'
  class MailError extends Error {}
  let mode = '', calls = 0, result = 'saved', payload
  const client = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id, lead_id: id } }) }) }) }), rpc: async (_name, value) => { calls++; payload = value; return { data: [{ result, settlement_id: id, current_version: 1 }] } } }
  const actions = load('src/actions/oemSettlements.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/supabase/admin': { adminClient: client }, '@/lib/oem-settlements-shared': shared,
    '@/lib/oem-mail-security': { MailError, requireMailAdmin: async () => { if (mode === 'noadmin') throw new MailError('denied'); return { id } }, requireOemMailLead: async () => { if (mode === 'nonOEM') throw new MailError('denied') }, uuid: value => { if (value !== id) throw new MailError('bad id'); return value } },
  })
  for (mode of ['noadmin', 'nonOEM']) { const previous = calls; assert.equal((await actions.updateOemSettlement(id, null, 'save', base, 0, id)).success, false); assert.equal(calls, previous) }
  mode = ''
  assert.equal((await actions.updateOemSettlement(id, null, 'save', base, 0, id)).success, true)
  assert.equal(payload.p_actor, id)
  assert.equal(payload.p_input.agreementNote, 'customer email')
  const previous = calls
  assert.equal((await actions.updateOemSettlement(id, id, 'confirm', { customerConfirmed: false }, 1, id)).success, false)
  assert.equal((await actions.updateOemSettlement(id, id, 'confirm', { customerConfirmed: true }, -1, id)).success, false)
  assert.equal(calls, previous)
  result = 'unexpected'
  const unknown = await actions.updateOemSettlement(id, id, 'confirm', { customerConfirmed: true }, 1, id)
  assert.equal(unknown.success, false)
  assert.equal(unknown.uncertain, true)
  console.log(`OEM settlement boundaries: PASS (${invalid.length} invalid cases, tax totals, permissions, overposting, request/version boundary)`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
