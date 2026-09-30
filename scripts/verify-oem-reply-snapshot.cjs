/* In-memory contract test for sendConversation. No network or persistent DB. */
const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module'); const ts = require('typescript')

const lead = { id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com' }
const otherLead = { id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com' }
const inbound = { id: '33333333-3333-4333-8333-333333333333', lead_id: lead.id, direction: 'inbound', gmail_thread_id: 'thread-1', rfc_message_id: '<inbound@example.com>', references_header: '<root@example.com>', subject: '[OEM-11111111-1111-4111-8111-111111111111] inquiry', sent_at: new Date().toISOString(), status: 'received' }

const messages = [inbound]; let sends = 0; let failUnknown = false; let connected = 0; let builtMessage
function rowsFor(table) { return table === 'oem_conversation_messages' ? messages : [] }
class Query {
  constructor(table) { this.table = table; this.filters = []; this.action = 'select'; this.payload = null; this.singleMode = false; this.countHead = false }
  select() { if (this.action === 'select') this.action = 'select'; return this }
  eq(k,v) { this.filters.push([k,'eq',v]); return this }
  in(k,v) { this.filters.push([k,'in',v]); return this }
  not(k,op,v) { this.filters.push([k,'not',op,v]); return this }
  is(k,v) { this.filters.push([k,'is',v]); return this }
  order() { return this }
  limit() { return this }
  range() { return this }
  maybeSingle() { this.singleMode = true; return this }
  single() { this.singleMode = true; return this }
  insert(v) { this.action='insert'; this.payload=v; return this }
  update(v) { this.action='update'; this.payload=v; return this }
  delete() { this.action='delete'; return this }
  upsert(v) { this.action='insert'; this.payload=v; return this }
  then(resolve,reject) { try { resolve(this.run()) } catch (e) { reject(e) } }
  run() {
    const rows = rowsFor(this.table); let matches = rows.filter(r => this.filters.every(([k,op,v]) => op === 'eq' ? r[k] === v : op === 'in' ? v.includes(r[k]) : op === 'is' ? (v === null ? r[k] == null : r[k] === v) : op === 'not' ? (v === 'is' ? r[k] != null : true) : true))
    if (this.action === 'insert') { const value = { ...this.payload, id: this.payload.id || crypto.randomUUID() }; messages.push(value); matches=[value] }
    if (this.action === 'update') matches.forEach(r => Object.assign(r,this.payload))
    if (this.action === 'delete') matches.splice(0).forEach(r => { const i=messages.indexOf(r); if(i>=0) messages.splice(i,1) })
    const data = this.singleMode ? (matches[0] || null) : matches
    return { data, error: null, count: matches.length }
  }
}
const db = { from: table => new Query(table), rpc: async (name, args) => name === 'claim_oem_conversation' ? { data: [{ id: args.p_id }], error: null } : { data: true, error: null } }
class GmailApiError extends Error { constructor(status, message, uncertain) { super(message); this.status=status; this.uncertain=uncertain } }
const gmail = { GmailApiError, validateMailAttachments: a => a || [], buildMimeMessage: input => { builtMessage = input; return JSON.stringify(input) }, normalizeGmailMessage: () => null }
const security = { MailError: class MailError extends Error { constructor(message,status=400){super(message);this.status=status} }, OEM_MAILBOX:'staff@aizu-tv.com', caseTag:id=>`[OEM-${id}]`, hashMail:v=>require('node:crypto').createHash('sha256').update(v).digest('hex'), uuid:v=>v, mailConfigured:()=>false }
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request === '@/lib/supabase/admin') return { adminClient: db }
  if (request === '@/lib/oem-gmail-auth') return { connectedGmail: async()=>{ connected++; return { send: async()=>{ sends++; if (failUnknown) throw new GmailApiError(undefined,'uncertain',true); return { id:'gmail-sent', threadId:'thread-1' } } } } }
  if (request === '@/lib/oem-gmail-client') return gmail
  if (request === '@/lib/oem-mail-security') return security
  return originalLoad.call(this, request, parent, isMain)
}
const file = path.resolve(__dirname, '../src/lib/oem-conversations.ts'); const out = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText
const mod = new Module(file); mod.filename=file; mod.paths=Module._nodeModulePaths(process.cwd()); mod._compile(out,file); const { sendConversation } = mod.exports

;(async()=>{
  const explicit = await sendConversation(lead, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { requestId:'44444444-4444-4444-8444-444444444444', subject:'Re: inquiry', text:'reply', replyToMessageId: inbound.id })
  assert.equal(explicit.status,'sent'); const sent = messages.find(m=>m.request_id === '44444444-4444-4444-8444-444444444444'); assert.equal(sent.reply_to_id, inbound.id); assert.equal(sends,1); assert.equal(connected,1)
  assert.equal(builtMessage.inReplyTo, inbound.rfc_message_id); assert.deepEqual(builtMessage.references, ['<root@example.com>', inbound.rfc_message_id])
  const oldInput = { requestId:'55555555-5555-4555-8555-555555555555', subject:'invoice', text:'invoice' }; await sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',oldInput); const before=sends; const idem=await sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',oldInput); assert.equal(idem.status,'sent'); assert.equal(sends,before)
  const oldRow = messages.find(m => m.request_id === oldInput.requestId)
  assert.equal(oldRow.payload_hash, security.hashMail(JSON.stringify({ leadId: lead.id, to: lead.email, subject: 'invoice '+security.caseTag(lead.id), text: 'invoice', attachments: [] })))
  assert.equal(oldRow.reply_to_id, null)
  failUnknown=true; const uncertainInput={requestId:'66666666-6666-4666-8666-666666666666',subject:'uncertain',text:'try',replyToMessageId: inbound.id}; const failed=await sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',uncertainInput); assert.equal(failed.status,'unknown'); const retry=await sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',uncertainInput); assert.equal(retry.status,'unknown'); assert.equal(sends,before+1)
  let rejected=false; try { await sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',{requestId:'77777777-7777-4777-8777-777777777777',subject:'bad',text:'bad',replyToMessageId:'88888888-8888-4888-8888-888888888888'}) } catch { rejected=true }; assert.equal(rejected,true); assert.equal(sends,before+1)
  messages.push({ ...inbound, id: '99999999-9999-4999-8999-999999999999', lead_id: otherLead.id })
  await assert.rejects(() => sendConversation(lead,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',{requestId:'77777777-7777-4777-8777-777777777777',subject:'wrong case',text:'wrong case',replyToMessageId:'99999999-9999-4999-8999-999999999999'}))
  assert.equal(sends, before+1)
  console.log('OEM reply snapshot checks: PASS (explicit reply linkage and headers, legacy hash/idempotency, uncertain no-retry, cross-target validation before send)')
})().catch(e=>{ console.error('OEM reply snapshot checks: FAIL'); console.error(e.stack||e); process.exitCode=1 }).finally(()=>{ Module._load=originalLoad })
