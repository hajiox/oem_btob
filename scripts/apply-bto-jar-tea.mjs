import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

// Jar/tea additions for the BTO page.  --apply is intentionally separate from
// --publish: new products are inserted hidden until the application is deployed.
export const PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
export const PRODUCT_IDS = Object.freeze({
  jar: 'c0000001-0000-0000-0000-000000000005',
  tea: 'c0000001-0000-0000-0000-000000000006',
})
const id = n => `b2026091-6001-4000-8000-${String(n).padStart(12, '0')}`

// Exported so the application can enforce the “raw material: none” terminal
// route without duplicating a fragile label lookup.
export const KNOWN_IDS = Object.freeze({
  products: PRODUCT_IDS,
  jar: {
    packagingQuestion: id(101),
    rawSupplyQuestion: id(111),
    rawYes: id(112), rawNo: id(113), ingredientQuestion: id(121),
    packagingOptions: [id(102), id(103), id(104), id(105)],
  },
  tea: {
    rawSupplyQuestion: id(201), rawYes: id(202), rawNo: id(203), ingredientQuestion: id(211),
    planQuestion: id(221), planOptions: [id(222), id(223)],
  },
})

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ok = result => { if (result.error) throw new Error(result.error.message); return result.data }
const rows = { products: [], form_steps: [], form_questions: [], form_options: [] }
const step = (n, product, order, title, description = '') => {
  const row = { id: id(n), page_id: PAGE_ID, product_id: product, order_index: order, step_title: title, step_description: description, is_visible: true }
  rows.form_steps.push(row); return row.id
}
const question = (n, stepId, text, type = 'radio', required = true, help = '') => {
  const row = { id: id(n), step_id: stepId, order_index: 0, question_text: text, input_type: type, is_required: required, help_text: help, depends_on_option_id: null }
  rows.form_questions.push(row); return row.id
}
const option = (n, questionId, order, label, price, description = '', imageUrl = '', extra = {}) => {
  const row = { id: id(n), question_id: questionId, order_index: order, label, price_modifier: price, price_modifier_type: 'fixed', is_base_price: false, description, image_url: imageUrl, next_step_id: null, go_to_estimate: false, ...extra }
  rows.form_options.push(row); return row.id
}

rows.products.push({ id: PRODUCT_IDS.jar, page_id: PAGE_ID, name: '瓶詰め（ジャム・ご飯のお供）', description: '丸瓶大120g・丸瓶小90g。標準／リッチ。賞味期限：製造から1年。1ロット約400個。完成全数お買い取り・実数精算。', base_price: 180, base_price_type: 'fixed', order_index: 5, is_visible: false, image_url: '/images/package-samples/jar-large-photo.webp' })
rows.products.push({ id: PRODUCT_IDS.tea, page_id: PAGE_ID, name: 'お茶（ティーバッグ）', description: '原料支給必須。50包×100袋／4包×400個の2プラン。乾燥・必要に応じた焙煎・製造・包装を含む概算。食材により価格・乾燥可否が異なります。', base_price: 0, base_price_type: 'fixed', order_index: 6, is_visible: false, image_url: '/images/package-samples/tea-retail-photo.webp' })

const jarPack = question(101, step(100, PRODUCT_IDS.jar, 0, '容器・材料グレード', '表示価格は材料・包装代の合計（税別）。製造手数料180円を別途加算します。'), '容器・材料グレードをお選びください')
option(102, jarPack, 0, '丸瓶大120g・標準', 190, '材料100円＋包装90円（丸瓶・商品ラベル等込み）', '/images/package-samples/jar-large-photo.webp')
option(103, jarPack, 1, '丸瓶大120g・リッチ', 220, '材料130円＋包装90円（丸瓶・商品ラベル等込み）', '/images/package-samples/jar-large-photo.webp')
option(104, jarPack, 2, '丸瓶小90g・標準', 145, '材料75円＋包装70円（丸瓶・商品ラベル等込み）', '/images/package-samples/jar-small-photo.webp')
option(105, jarPack, 3, '丸瓶小90g・リッチ', 170, '材料100円＋包装70円（丸瓶・商品ラベル等込み）', '/images/package-samples/jar-small-photo.webp')
const jarSupply = question(111, step(110, PRODUCT_IDS.jar, 1, '原料供給について'), '使用して欲しい原料はありますか？')
const jarNameStep = step(120, PRODUCT_IDS.jar, 2, '原料名')
const jarName = question(121, jarNameStep, '原料名をご入力ください', 'text', true, '原料は1種類まで。持ち込みによる価格調整は正式見積もりで確認します。')
option(112, jarSupply, 0, 'ある', 0, '原料名を次の画面でお知らせください。')
option(113, jarSupply, 1, 'ない', 0, '原料なしの場合は概算見積もりへ進みます。', '', { go_to_estimate: true })
rows.form_options.find(x => x.id === id(112)).next_step_id = jarNameStep
rows.form_questions.find(x => x.id === jarName).depends_on_option_id = id(112)

const teaSupply = question(201, step(200, PRODUCT_IDS.tea, 0, '原料供給について', 'お茶はお客様からの原料支給が必須です。'), 'お茶の原料をご支給いただけますか？')
const teaNameStep = step(210, PRODUCT_IDS.tea, 1, '原料名')
const teaName = question(211, teaNameStep, '原料名をご入力ください', 'text', true, '原料名は必須です。食品内容により価格・乾燥可否を確認します。')
option(202, teaSupply, 0, 'ある', 0, '原料名を次の画面でお知らせください。')
option(203, teaSupply, 1, 'ない', 0, '原料のご支給がない場合はお引き受けできません。')
rows.form_options.find(x => x.id === id(202)).next_step_id = teaNameStep
rows.form_questions.find(x => x.id === teaName).depends_on_option_id = id(202)
const plan = question(221, step(220, PRODUCT_IDS.tea, 2, '製造・包装プラン', '表示価格は概算です。食材の種類・状態、乾燥や焙煎などの加工内容により金額が変わります。食材によっては乾燥加工をお引き受けできません。原料確認後に正式見積もりをご案内します。'), 'プランをお選びください')
option(222, plan, 0, '50包×100袋（5000包）', 2500, '概算総額250,000円（税別）／1袋2,500円。乾燥・必要に応じた焙煎・製造・包装込み。透明PP袋・外装ラベルなし。', '/images/package-samples/tea-bulk-photo.webp', { go_to_estimate: true })
option(223, plan, 1, '4包×400個', 250, '概算総額100,000円（税別）／1個250円。乾燥・必要に応じた焙煎・製造・包装込み。コート紙＋縦帯。', '/images/package-samples/tea-retail-photo.webp', { go_to_estimate: true })

const allIds = Object.values(rows).flat().map(row => row.id)
const existing = async () => {
  const found = {}
  for (const table of Object.keys(rows)) found[table] = ok(await db.from(table).select('*').in('id', rows[table].map(row => row.id)))
  return found
}
const applyRows = async () => {
  await mkdir('.bto-backups', { recursive: true })
  const before = await existing(); const backup = `.bto-backups/before-jar-tea-${Date.now()}.json`
  for (const p of before.products) assert.equal(p.page_id, PAGE_ID, 'Product belongs to another page')
  for (const s of before.form_steps) assert.equal(s.page_id, PAGE_ID, 'Step belongs to another page')
  await writeFile(backup, JSON.stringify(before, null, 2), { flag: 'wx' }); console.log('Backup:', backup)
  for (const table of Object.keys(rows)) for (const row of rows[table]) {
    const values = { ...row }
    if (table === 'form_questions') values.depends_on_option_id = null
    const present = before[table].some(x => x.id === row.id)
    if (present) ok(await db.from(table).update(values).eq('id', row.id))
    else ok(await db.from(table).insert(values))
  }
  for (const row of rows.form_questions) if (row.depends_on_option_id) ok(await db.from('form_questions').update({depends_on_option_id:row.depends_on_option_id}).eq('id',row.id))
}
const verify = async () => {
  const found = await existing()
  for (const table of Object.keys(rows)) for (const expected of rows[table]) {
    const actual = found[table].find(x => x.id === expected.id); assert(actual, `Missing ${table}/${expected.id}`)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, `${table}/${expected.id}/${key}`)
  }
  console.log('Verified jar/tea scoped BTO settings.')
}

const apply = process.argv.includes('--apply')
const publish = process.argv.includes('--publish')
if (apply) await applyRows()
if (publish) {
  await verify()
  for (const productId of Object.values(PRODUCT_IDS)) {
    const changed = ok(await db.from('products').update({ is_visible: true }).eq('page_id',PAGE_ID).eq('id', productId).select('id'))
    assert.equal(changed.length, 1, `Publish failed: products/${productId}`)
  }
  console.log('Published jar and tea products.')
  rows.products.forEach(p=>p.is_visible=true)
}
if (apply || publish || process.argv.includes('--verify')) await verify()
else console.log(`Dry run: ${allIds.length} scoped rows; products remain hidden. Use --apply, then --publish after code deployment.`)
