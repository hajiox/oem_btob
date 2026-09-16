import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const page='35e7d402-0443-4703-94a4-fc2873b8f933'
const fur='c0000001-0000-0000-0000-000000000003', sauce='c0000001-0000-0000-0000-000000000004'
const ok=r=>{if(r.error)throw Error(r.error.message);return r.data}
const id=n=>`b2026091-6000-4000-8000-${String(n).padStart(12,'0')}`
const products=ok(await db.from('products').select('*').eq('page_id',page))
assert(products.some(p=>p.id===fur))
const steps=ok(await db.from('form_steps').select('*').eq('page_id',page))
const questions=ok(await db.from('form_questions').select('*').in('step_id',steps.map(s=>s.id)))
const options=ok(await db.from('form_options').select('*').in('question_id',questions.map(q=>q.id)))
const rows={products:[],form_steps:[],form_questions:[],form_options:[]}
for(const p of products) rows.products.push({id:p.id,base_price:180,base_price_type:'fixed'})
Object.assign(rows.products.find(p=>p.id===fur),{description:'瓶大50g・瓶小35g・袋50g。1ロット約400個。\n賞味期限：製造から1年／袋はネコポス対応\n完成した全数をお買い取り・実数精算'})
rows.products=rows.products.filter(p=>p.id!==sauce)
rows.products.push({id:sauce,page_id:page,name:'たれ・ソース・ドレッシング',base_price:180,base_price_type:'fixed',order_index:3,is_visible:true,image_url:'/images/bto/sauce-square.webp',description:'瓶180〜200cc・パウチ150g。1ロット約400個。\n賞味期限：製造から1年／完成全数買い取り・実数精算\nパウチはネコポス対応。高粘度の配合は充填不可'})
function step(n,product,order,title,description=''){rows.form_steps.push({id:id(n),page_id:page,product_id:product,order_index:order,step_title:title,step_description:description,is_visible:true});return id(n)}
function q(n,step_id,text,type='radio',required=true){rows.form_questions.push({id:id(n),step_id,order_index:0,question_text:text,input_type:type,is_required:required,help_text:''});return id(n)}
function opt(n,question_id,order,label,price,description='',image_url='',extra={}){rows.form_options.push({id:id(n),question_id,order_index:order,label,price_modifier:price,price_modifier_type:'fixed',is_base_price:false,description,image_url,next_step_id:null,go_to_estimate:false,...extra});return id(n)}
const fq=q(101,step(100,fur,0,'包装・内容量をお選びください','表示価格は材料代と包装代の合計（税別）です。製造手数料180円を別途加算します。'),'包装・内容量')
opt(102,fq,0,'瓶大・50g',190,'材料100円＋包装90円\n容器・商品ラベル・原材料ラベル・シリカゲル込み','/images/bto/furikake-jar.webp')
opt(103,fq,1,'瓶小・35g',150,'材料80円＋包装70円\n容器・商品ラベル・原材料ラベル・シリカゲル込み')
opt(104,fq,2,'袋・50g',170,'材料100円＋包装70円\n袋・商品ラベル・原材料ラベル・シリカゲル込み／ネコポス対応','/images/bto/furikake-bag.webp')
rows.form_steps.push({id:'048d7c11-eadd-4a55-836a-3cd5ba9e7ff5',order_index:1},{id:'01a81206-f6e3-431a-818c-4338f159ac1f',order_index:2})
const kind=q(201,step(200,sauce,0,'作りたい商品について'),'作りたいもの')
for(const [i,label] of ['たれ','ソース','ドレッシング'].entries())opt(202+i,kind,i,label,0)
q(211,step(210,sauce,1,'希望の味・用途','配合はご相談のうえ決定します。種類や原料のご希望による概算価格の分岐はありません。'),'希望の味・用途をご記入ください','textarea',false)
const sq=q(221,step(220,sauce,2,'パッケージについて','表示価格は材料代と包装代の合計（税別）です。製造手数料180円を別途加算します。'),'容器・内容量')
opt(222,sq,0,'角瓶・180〜200cc',190,'材料100円＋包装90円\n角瓶・商品ラベル・原材料ラベル込み','/images/bto/sauce-square.webp')
opt(223,sq,1,'丸瓶・180〜200cc',190,'材料100円＋包装90円\n丸瓶・商品ラベル・原材料ラベル込み','/images/bto/sauce-round.webp')
opt(224,sq,2,'キャップ付きパウチ・150g',210,'材料100円＋包装110円\nパウチ・キャップ・裏面原材料ラベル・掛け紙込み\nネコポス対応／高粘度の配合は充填不可・要確認','/images/bto/sauce-pouch.webp')
const supply=q(231,step(230,sauce,3,'原料供給について'),'使用して欲しい原料はありますか？')
const nameStep=step(240,sauce,4,'原料名')
q(241,nameStep,'原料名をご入力ください','text')
opt(232,supply,0,'ある',0,'原料名を次の画面でお知らせください。\n原料は1種類まで・弊社へ元払いでお送りいただきます。','',{next_step_id:nameStep})
opt(233,supply,1,'ない',0,'材料は可能な限り弊社で準備します（特殊食材を除く）。','',{go_to_estimate:true})
for(const [yes,no,ingredientStep,nameQ,supplyQ] of [
 ['e0c97a3d-e464-4931-a45d-357dfa006799','cdca029b-d0dd-47f2-8743-73d79c44e584','01a81206-f6e3-431a-818c-4338f159ac1f','7c24920a-1a2c-4e52-97ee-5aa5ca7a2414','e7cad2a9-f699-416c-9dea-dc65301be13a'],
 [id(232),id(233),nameStep,id(241),supply]
]){
 const set=(table,key,v)=>{let r=rows[table].find(x=>x.id===key);if(r)Object.assign(r,v);else rows[table].push({id:key,...v})}
 set('form_options',yes,{next_step_id:ingredientStep,go_to_estimate:false})
 set('form_options',no,{next_step_id:null,go_to_estimate:true,description:'材料は可能な限り弊社で準備します（特殊食材を除く）。'})
 set('form_questions',nameQ,{depends_on_option_id:yes,is_required:true,help_text:'持ち込みによる価格調整は概算に含めず、正式見積もりで確認します。'})
 set('form_questions',supplyQ,{help_text:'持ち込みの有無で概算金額は変わりません。価格調整は正式見積もりで確認します。'})
}
if(process.argv.includes('--apply')){
 await mkdir('.bto-backups',{recursive:true});const backup=`.bto-backups/before-20260916-${Date.now()}.json`
 await writeFile(backup,JSON.stringify({products,steps,questions,options},null,2),{flag:'wx'});console.log('Backup:',backup)
 // Create graph nodes before references. Existing rows are updated, never replaced/deleted.
 for(const table of ['products','form_steps','form_questions','form_options'])for(const row of rows[table]){
   const values={...row};delete values.depends_on_option_id
   const exists=ok(await db.from(table).select('id').eq('id',row.id))
   if(exists.length)ok(await db.from(table).update(values).eq('id',row.id));else ok(await db.from(table).insert(values))
 }
 for(const row of rows.form_questions)if(row.depends_on_option_id)ok(await db.from('form_questions').update({depends_on_option_id:row.depends_on_option_id}).eq('id',row.id))
}
if(process.argv.includes('--apply')||process.argv.includes('--verify')){
 for(const [table,list] of Object.entries(rows))for(const expected of list){const [actual]=ok(await db.from(table).select('*').eq('id',expected.id));for(const [k,v]of Object.entries(expected))assert.deepEqual(actual[k],v,`${table}/${expected.id}/${k}`)}
 console.log('Verified all scoped BTO settings.')
}else console.log('Dry run:',Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length])))
