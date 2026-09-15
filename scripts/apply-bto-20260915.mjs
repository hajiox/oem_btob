import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const page = '35e7d402-0443-4703-94a4-fc2873b8f933'
const curry = 'c0000001-0000-0000-0000-000000000001'
const ramen = 'c0000001-0000-0000-0000-000000000002'
const apply = process.argv.includes('--apply')
// Administrative inspection includes the preserved, non-public legacy step.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data }
const snapshot = async () => {
  const products = ok(await db.from('products').select('*').eq('page_id', page).in('id', [curry, ramen]))
  assert.equal(products.length, 2)
  const steps = ok(await db.from('form_steps').select('*').eq('page_id', page).in('product_id', [curry, ramen]))
  const questions = ok(await db.from('form_questions').select('*').in('step_id', steps.map(x => x.id)))
  const options = ok(await db.from('form_options').select('*').in('question_id', questions.map(x => x.id)))
  return { products, steps, questions, options }
}
const before = await snapshot()
const edits = []
function edit(table, id, values) {
  const key = { products: 'products', form_steps: 'steps', form_questions: 'questions', form_options: 'options' }[table]
  assert(before[key].some(x => x.id === id), `Missing scoped row ${table}/${id}`)
  edits.push({ table, id, values })
}
const option = (id, label, price, description, extra = {}) => edit('form_options', id, { label, price_modifier: price, price_modifier_type: 'fixed', description, ...extra })
edit('products', curry, { base_price: 180, base_price_type: 'fixed', description: '200gを基準に、1ロット約400個で商品づくり。\n賞味期限：製造から1年\n完成した全数をお買い取り・実数精算' })
edit('products', ramen, { base_price: 190, base_price_type: 'fixed', description: 'すべて2食入り。1ロット約400セット（800食）。\n賞味期限：製造から60日／100セットずつ分納可能\n完成した全数をお買い取り・実数精算' })
option('63ece0cb-670a-4cd9-a89a-0f7379f5817a', 'リーズナブル', 140, '価格を抑えた材料構成\n玉ねぎ・人参・豚肉など')
option('209e9c12-81d0-4fef-9f10-279cf70d293e', 'リッチ', 300, '素材にこだわる材料構成\n牛肉・豚肉多め・地鶏など')
option('08a2075a-2866-4af8-a824-fafb9ccf8c0c', 'バルク（パウチのみ）', 30, 'レトルトパウチのみで納品', { order_index: 0, image_url: '/images/bto/curry-bulk.webp' })
option('42925883-7e17-45a6-b688-aeb69567852c', '白箱＋印刷巻紙', 90, '巻紙を巻いた状態で納品\nパウチ・包装作業込み', { order_index: 1, image_url: '/images/bto/curry-box.webp' })
const pp = { id: '08a2075a-2866-4af8-a824-fafb9ccfc070', question_id: '8b5b24c4-68ac-438b-8467-95ed34975409', order_index: 2, label: 'PP袋＋厚紙', price_modifier: 70, price_modifier_type: 'fixed', is_base_price: false, description: '透明PP袋と印刷した厚紙で包装\nパウチ・包装作業込み', image_url: '/images/bto/curry-pp.webp', next_step_id: null, go_to_estimate: false }
option('deacca37-1848-4c94-908b-8212e845fa0d', 'あっさり系', 180, '醤油・塩\n1食90円 × 2食分')
option('d0da2eb2-68eb-4d0e-b466-dc71ed06ff46', 'こってり系', 320, '豚骨・鶏白湯・濃厚味噌・つけ麺\n1食160円 × 2食分')
option('ccee65f7-dc9a-4e44-8128-8e29bc7df26d', '二郎インスパイア系', 220, 'にんにく醤油・背脂\n1食110円 × 2食分')
for (const [id, price] of [['e141b7da-17d7-4fdd-83bd-6e72ae98672e',70], ['8c24ea37-a55c-4ebe-904c-d48e0c80f361',70], ['398b8eee-50c0-4dec-8ecb-1a504fe14988',80], ['7455775a-ecbf-4815-9377-ea2f68fb78e1',90]]) {
  const row = before.options.find(x => x.id === id)
  option(id, row.label, price * 2, `${row.description.split('\n1食')[0]}\n1食${price}円 × 2食分`)
}
option('f3b2d8d9-a8b4-49de-9d7c-9a54618aa15d', '透明袋＋シール', 100, '2食入り1セットの包装代', { image_url: '/images/bto/ramen-bag.webp' })
option('b12c7c2f-344c-451b-b427-4b6d27cca002', '箱＋巻紙', 150, '2食入り1セットの包装代', { order_index: 1, image_url: '/images/bto/ramen-box.webp' })
// Retain retired options in the existing hidden legacy step instead of deleting history.
edit('form_options', 'f8a2e38c-74b4-4dd3-9982-9e5f6e4526b4', { question_id: '62ae3a3f-3407-4a92-b5fd-8c5618919eab', order_index: 3 })
edit('form_steps', '90b7e650-a364-442e-ad02-829dbf4f7981', { is_visible: false, step_title: '旧仕様（食数・台紙包装／非公開）' })
edit('form_steps', 'aae9731e-6122-4ddb-bb1d-f57ec1d97af0', { step_title: 'パッケージについて', step_description: '2食入り1セットの包装をお選びください。表示金額は税別です。' })
for (const id of ['ee7e99fd-9cfb-4015-b08a-543ec819920c','f30eeb00-e1ea-4c0a-8201-95a1c33141c7']) edit('form_steps', id, { step_description: 'すべて2食入り。表示金額は2食分の税別価格です。' })
edit('form_steps', '036b957d-5788-4194-be61-2c40f747c533', { step_description: '200gを基準にした1個あたりの材料費（税別）です。' })
edit('form_steps', '7e0b3489-f304-4255-b534-12e72aa4483f', { step_description: '1個あたりの包装代（税別）。パウチ代の別途加算はありません。' })
for (const [yes, no, nameStep, nameQ] of [
  ['ceef2177-8f33-4c87-988b-fdc37da6200e','8125e0eb-da27-4099-9c50-75696264e009','340ae504-ce4b-4c23-a6d6-656b4cf41c4f','f9006974-4006-41cb-b65c-414a61287665'],
  ['81897aa3-7e2a-4cb7-8f43-8a9cbf12824a','16c2dbeb-789d-445e-a7f9-509b4b1b3374','320c040d-9cac-43c0-a734-76bd20198cea','ce5bb207-c115-4bf5-bd81-02dbdb66d568'],
]) {
  option(yes, 'ある', 0, '原料名を次の画面でお知らせください。\n原料は1種類まで・弊社へ元払いでお送りいただきます。', { next_step_id: nameStep, go_to_estimate: false })
  option(no, 'ない', 0, '材料は可能な限り弊社で準備します（特殊食材を除く）。', { next_step_id: null, go_to_estimate: true })
  edit('form_questions', nameQ, { depends_on_option_id: yes, is_required: true, help_text: '持ち込みによる価格調整は概算に含めず、正式見積もりで確認します。' })
  const questionId = before.options.find(x => x.id === yes).question_id
  edit('form_questions', questionId, { help_text: '持ち込みの有無で概算金額は変わりません。価格調整は正式見積もりで確認します。' })
}

if (apply) {
  await mkdir('.bto-backups', { recursive: true })
  const backup = `.bto-backups/before-${Date.now()}.json`
  await writeFile(backup, JSON.stringify(before, null, 2), { flag: 'wx' })
  console.log(`Backup: ${backup}`)
  // Idempotent fixed values: never multiply the stored amount on a rerun.
  for (const { table, id, values } of edits) {
    const rows = ok(await db.from(table).update(values).eq('id', id).select('id'))
    assert.equal(rows.length, 1, `Update failed: ${table}/${id}`)
  }
  ok(await db.from('form_options').upsert(pp))
}
if (apply || process.argv.includes('--verify')) {
  const after = await snapshot()
  for (const {table,id,values} of edits) {
    const rows = after[{products:'products',form_steps:'steps',form_questions:'questions',form_options:'options'}[table]]
    const row = rows.find(x => x.id === id)
    for (const [k,v] of Object.entries(values)) assert.deepEqual(row?.[k],v,`${table}/${id}/${k}`)
  }
  assert(after.options.some(x => x.id === pp.id && x.price_modifier === 70))
  console.log('Verified curry/ramen pricing, packages, retired step and ingredient routes.')
} else console.log(`Dry run: ${edits.length} scoped updates + 1 curry packaging option. Use --apply to publish.`)
