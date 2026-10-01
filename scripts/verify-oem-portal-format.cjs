/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const assert = require('node:assert/strict')
const ts = require('typescript')
const Module = require('node:module')
const path = require('node:path')
const filename = path.resolve('src/lib/oem-portal-format.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const unit = new Module(filename, module)
unit._compile(compiled, filename)
const previousTz = process.env.TZ
try {
  for (const zone of ['UTC','America/New_York','Asia/Tokyo']) {
    process.env.TZ = zone
    assert.equal(unit.exports.portalDate('2026-10-01'), '2026/10/1')
    assert.equal(unit.exports.portalDate('2026-01-01'), '2026/1/1')
    assert.equal(unit.exports.portalDate(null), '—')
    assert.equal(unit.exports.portalDate('not-a-date'), '—')
    assert.equal(unit.exports.portalTimestampDate('2026-09-30T15:01:00Z'), '2026/10/1')
  }
  console.log('OEM portal date verification: PASS (UTC/New York/Tokyo, day/year boundaries, expiry, null/invalid)')
} finally {
  if (previousTz === undefined) delete process.env.TZ
  else process.env.TZ = previousTz
}
