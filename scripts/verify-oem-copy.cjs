const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const code = ts.transpileModule(fs.readFileSync('src/lib/oem-lp-copy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const mod = { exports: {} }
new Function('require', 'exports', 'module', code)(name => {
  assert.equal(name, './package-samples')
  return { SAMPLE_PAGE_ID: PAGE }
}, mod.exports, mod)
const { oemLpImage, oemLpNotes, oemMetadataCopy } = mod.exports
for (const src of ['/images/lp-hero.jpg', '/images/lp-problems.jpg', '/images/lp-cases.jpg', '/images/lp-cta.jpg', 'https://p1nd6l4edkl5ahso.public.blob.vercel-storage.com/form/1773135634427_hf_20260310_093425_fb3f6534-e425-4883-bc17-e1722ed.jpg']) {
  const image = oemLpImage(PAGE, src, 'old')
  assert.notEqual(image.src, src)
  assert.ok(fs.existsSync('public' + image.src))
  assert.deepEqual(oemLpImage('another-page', src, 'unchanged'), { src, alt: 'unchanged', width: 1200, height: 1600 })
}
assert.equal(oemLpImage(PAGE, '/custom-image.jpg', 'custom').src, '/custom-image.jpg')
assert.equal(oemMetadataCopy(PAGE, '【小ロット400個〜】食品OEM'), '【1ロット約400個】食品OEM')
assert.equal(oemMetadataCopy('another-page', '400個から'), '400個から')
assert.match(oemLpImage(PAGE, '/images/lp-cta.jpg', '').alt, /栄養成分表示作成/)
assert.match(fs.readFileSync('src/components/OemQuoteResult.tsx', 'utf8'), /初回無料適用時の概算/)
assert.match(oemLpNotes(PAGE, '/images/lp-problems.jpg').join(''), /予備100枚/)
assert.deepEqual(oemLpNotes('another-page', '/images/lp-problems.jpg'), [])
console.log('OEM copy checks: PASS (asset existence, page isolation, metadata and initial-free scope)')
