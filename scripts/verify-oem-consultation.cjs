// Real server action with in-memory dependencies. No network, emails or invoices.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')
const ROOT = path.resolve(__dirname, '..')
const PRODUCT = 'c0000001-0000-0000-0000-000000000001'
const KEY = '11111111-1111-4111-8111-111111111111'
function load(file, aliases = {}) {
  const full = path.join(ROOT, file)
  const mod = new Module(full); mod.filename = full; mod.paths = Module._nodeModulePaths(ROOT)
  mod.require = name => {
    if (Object.hasOwn(aliases, name)) return aliases[name]
    if (name.startsWith('@/lib/') && ['oem-quote-validation', 'oem-offer-pricing', 'oem-consultation'].includes(name.slice(6))) return load('src/'+name.slice(2)+'.ts', aliases)
    throw new Error('Unmocked consultation dependency: '+name)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(full,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, full)
  return mod.exports
}
const good = { companyName: '  個人の屋号  ', contactName: ' 名前 ', email: ' person@example.invalid ', phone: '', notes: '', theme: 'ingredients', idempotencyKey: KEY }
const helper = load('src/lib/oem-consultation.ts')
assert.equal(helper.validateOemConsultation(good).data.companyName,'個人の屋号')
for (const invalid of [null, [], {...good,theme:'toString'}, {...good,theme:'bad'}, {...good,productId:'foreign'}, {...good,email:'bad'}, {...good,phone:123}, {...good,notes:'x'.repeat(5001)}, {...good,idempotencyKey:'bad'}, {...good,estimatedTotalPrice:0}, {...good,rawAnswers:{}}, {...good,approved:true}]) assert(helper.validateOemConsultation(invalid).error)

function fixture() {
  const saved = new Map(); const mail = []; const dispatch = []; let failure = null; let visible = true
  const aliases = {
    '@/lib/supabase/server': { createClient: async () => ({from(table){assert.equal(table,'products'); const q={select(){return q},eq(){return q},async single(){return {data:visible?{id:PRODUCT,name:'カレー（サーバーの現行商品名）'}:null,error:null}}};return q}}) },
    '@/lib/oem-intake': {reserveOemLead:async input=>{if(failure==='throw')throw new Error('offline');if(failure==='rate')return {status:'rejected',reason:'rate_limited',retryAfterSeconds:300};const prior=saved.get(input.idempotencyKey);if(prior)return JSON.stringify(prior.lead)===JSON.stringify(input.lead)?{status:'duplicate',duplicate:true,leadId:'lead'}:{status:'rejected',reason:'idempotency_payload_mismatch'};saved.set(input.idempotencyKey,input);return {status:'reserved',leadId:'lead'}}},
    '@/lib/oem-mail': {buildOemMailPayloads:async input=>{mail.push(input);return {customer:{html:'mock'},admin:{html:'mock'}}},dispatchOemLeadMail:async()=>{dispatch.push('mail');throw new Error('offline')}},
    '@/lib/oem-tsg-notifications': {dispatchOemTsgNotifications:async()=>{dispatch.push('tsg');throw new Error('offline')}},
    resend:{Resend:class{constructor(){assert.fail('direct consultation must not send unqueued email')}}},
  }
  return {...load('src/actions/publicForm.ts',aliases),saved,mail,dispatch,setFailure:v=>failure=v,setVisible:v=>visible=v}
}
;(async()=>{
  const f=fixture(); const originalError=console.error; console.error=()=>{}
  try {
    assert.equal((await f.submitOemConsultation(good)).success,true)
    assert.equal(f.saved.size,1);const lead=f.saved.get(KEY).lead
    assert.equal(lead.intake_kind,'consultation');assert.equal(lead.estimated_total_price,null);assert.equal(lead.consultation_theme,'ingredients');assert.equal(lead.status,'new')
    assert.equal(lead.selected_options[0].answer,'商品未定');assert.equal(lead.selected_options[2].answer,'使いたい食材');assert.equal(f.mail[0].intakeKind,'consultation');assert.equal(f.mail[0].estimatedTotalPrice,null);assert.deepEqual(f.dispatch,['mail','tsg'])
    assert.equal((await f.submitOemConsultation(good)).duplicate,true);assert.equal(f.saved.size,1)
    assert.equal((await f.submitOemConsultation({...good,notes:'changed'})).success,false);assert.equal(f.saved.size,1)
    assert.equal((await f.submitOemConsultation({...good,idempotencyKey:'22222222-2222-4222-8222-222222222222',productId:PRODUCT})).success,true)
    assert.equal([...f.saved.values()][1].lead.selected_options[0].answer,'カレー（サーバーの現行商品名）')
    f.setVisible(false);assert.equal((await f.submitOemConsultation({...good,productId:PRODUCT})).success,false)
    f.setFailure('rate');assert.match((await f.submitOemConsultation(good)).error,/5分/)
    f.setFailure('throw');assert.equal((await f.submitOemConsultation(good)).success,false)
    for(const invalid of [{...good,estimatedTotalPrice:0},{...good,theme:'unknown'},{...good,productId:'foreign'}])assert.equal((await f.submitOemConsultation(invalid)).success,false)
  }finally{console.error=originalError}
  console.log('Consultation server checks PASS: strict input, unknown product, null estimate, canonical theme/product, durable acceptance, retry/duplicate/conflict, rate limit, provider outage; no external effects.')
})().catch(error=>{console.error(error);process.exitCode=1})
