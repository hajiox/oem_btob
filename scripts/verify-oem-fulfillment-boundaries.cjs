/* Offline boundary tests: no database, browser, email or external writes. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(sourcePath, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(code, { exports: loadedModule.exports, module: loadedModule, require: name => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`unexpected import ${name}`)
    return dependencies[name]
  }, Intl, Date, Object, Number, Error }, { filename: sourcePath })
  return loadedModule.exports
}

async function main() {
  const shared = load('src/lib/oem-fulfillment-shared.ts')
  const { parseFulfillmentInput: parse, tokyoToday } = shared
  assert.equal(tokyoToday(new Date('2026-09-30T15:00:00Z')), '2026-10-01')
  assert.equal(tokyoToday(new Date('2026-09-30T14:59:59Z')), '2026-09-30')
  assert.equal(parse({ plannedQuantity: 100, quantityUnit: ' 個 ', notes: ' test ' }, 'save').notes, 'test')
  assert.equal(parse({ plannedQuantity: null, quantityUnit: '包' }, 'save').plannedQuantity, null)
  const badInputs = [
    [null, 'save'], [[], 'save'], [{}, 'unknown'], [{ finalAmount: 1 }, 'start'],
    [{ plannedQuantity: '100', quantityUnit: '個' }, 'save'], [{ plannedQuantity: 1.1, quantityUnit: '個' }, 'save'],
    [{ plannedQuantity: 0, quantityUnit: '個' }, 'save'], [{ plannedQuantity: 10000001, quantityUnit: '個' }, 'save'],
    [{ quantityUnit: ' ' }, 'save'], [{ quantityUnit: 'x'.repeat(21) }, 'save'],
    [{ quantityUnit: '個', notes: 'x'.repeat(2001) }, 'save'], [{ quantityUnit: '個', notes: '\0' }, 'save'],
    [{ quantityUnit: '個', productionDueDate: '1899-12-31' }, 'save'], [{ quantityUnit: '個', productionDueDate: '2026-02-30' }, 'save'],
    [{ quantityUnit: '個', productionDueDate: '2026-10-02', shipmentDueDate: '2026-10-01' }, 'save'],
    [{ completedQuantity: 100, completedOn: '2099-01-01', finalAmount: 1000 }, 'complete'],
    [{ completedQuantity: 100, completedOn: tokyoToday(), finalAmount: 1000 }, 'record_completion'],
    [{ shippedOn: tokyoToday(), carrier: ' ' }, 'ship'], [{ shippedOn: tokyoToday(), carrier: 'test\n' }, 'ship'],
    [{ shippedOn: tokyoToday(), carrier: 'test', trackingNumber: 'x'.repeat(101) }, 'ship'],
  ]
  for (const [input, action] of badInputs) assert.throws(() => parse(input, action), undefined, `reject ${action} boundary`)
  assert.equal(parse({ completedQuantity: 105, completedOn: tokyoToday(), finalAmount: 100000 }, 'complete').finalAmount, 100000)

  const orderId = '00000000-0000-4000-8000-000000000001'
  class MailError extends Error {}
  let mode = '', writes = 0, rpcResult = 'saved', rpcPayload
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: orderId, lead_id: orderId } }) }) }) }),
    rpc: async (_name, payload) => { writes++; rpcPayload = payload; return { data: [{ result: rpcResult }] } },
  }
  const actions = load('src/actions/oemFulfillment.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/supabase/admin': { adminClient: client },
    '@/lib/oem-mail-security': { MailError, requireMailAdmin: async () => { if (mode === 'nonadmin') throw new MailError('denied'); return { id: orderId } }, requireOemMailLead: async () => { if (mode === 'nonOEM') throw new MailError('wrong lead') }, uuid: value => { if (value !== orderId) throw new MailError('bad id'); return value } },
    '@/lib/oem-fulfillment-shared': shared,
  })
  for (const securityMode of ['nonadmin', 'nonOEM']) {
    mode = securityMode
    const before = writes
    assert.equal((await actions.updateOemFulfillment(orderId, 'start', {}, 0)).success, false)
    assert.equal(writes, before, `${securityMode} must not call mutation RPC`)
  }
  mode = ''
  const before = writes
  assert.equal((await actions.updateOemFulfillment(orderId, 'start', { finalAmount: 1 }, 0)).success, false)
  assert.equal((await actions.updateOemFulfillment(orderId, 'start', {}, -1)).success, false)
  assert.equal(writes, before, 'invalid input/version must not call RPC')
  assert.equal((await actions.updateOemFulfillment(orderId, 'save', { plannedQuantity: 100, quantityUnit: ' 個 ' }, 0)).success, true)
  assert.equal(rpcPayload.p_actor, orderId)
  assert.equal(rpcPayload.p_input.quantityUnit, '個')
  for (const result of ['', 'unexpected']) {
    rpcResult = result
    const response = await actions.updateOemFulfillment(orderId, 'start', {}, 0)
    assert.equal(response.success, false)
    assert.equal(response.uncertain, true, 'unknown result must require reconciliation')
  }
  rpcResult = 'conflict'
  const conflict = await actions.updateOemFulfillment(orderId, 'start', {}, 0)
  assert.equal(conflict.success, false)
  assert.match(conflict.error, /最新/)
  console.log(`OEM fulfillment boundaries: passed (${badInputs.length} invalid inputs, JST, security, overposting, version, price independence, unknown result)`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
