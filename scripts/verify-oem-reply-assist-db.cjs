/* Transactional verifier for 019_oem_reply_assist.sql. Never commits and never sends mail. */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { connection } = require('./oem-db-migrate.cjs')

const migration = fs.readFileSync(path.resolve(__dirname, '../sql/019_oem_reply_assist.sql'), 'utf8')
const migrationBody = migration.replace(/^BEGIN;\s*$/gmi, '').replace(/^COMMIT;\s*$/gmi, '')
const OEM_PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const templates = ['acknowledge', 'materials', 'trial', 'payment', 'progress', 'shipping', 'settlement']
const hash = () => crypto.randomBytes(32).toString('hex')
const id = () => crypto.randomUUID()
const expectResult = (rows, value, message) => assert.equal(rows.rows[0]?.result, value, message)
const sql = (client, text, values = []) => client.query(text, values)

function staticContract() {
  for (const fragment of [
    'oem_reply_generations', 'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL ON public.oem_reply_generations',
    'guard_oem_reply_generation', 'begin_oem_reply_generation', 'finish_oem_reply_generation',
    'save_oem_conversation_draft', 'pg_advisory_xact_lock', "status NOT IN ('ready','failed')",
    "created_at>now()-interval '1 hour'", "status='pending'",
  ]) assert(migration.includes(fragment), `missing migration contract: ${fragment}`)
  assert(!/INSERT\s+INTO\s+public\.oem_mail/i.test(migration), 'migration must not send or enqueue mail')
}

async function savepoint(client, name, action) {
  await sql(client, `SAVEPOINT ${name}`)
  try { return await action() } finally { await sql(client, `ROLLBACK TO SAVEPOINT ${name}`) }
}

async function main() {
  staticContract()
  const client = connection()
  try {
    await client.connect(); await sql(client, 'BEGIN')
    if (process.argv.includes('--with-migration')) await sql(client, migrationBody)

    const tables = await sql(client, `SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='oem_reply_generations'`)
    assert.equal(tables.rowCount, 1); assert.equal(tables.rows[0].relrowsecurity, true, 'RLS must be enabled')
    const privileges = await sql(client, `SELECT has_table_privilege('anon','public.oem_reply_generations','SELECT') AS anon_select, has_table_privilege('authenticated','public.oem_reply_generations','SELECT') AS authenticated_select, has_table_privilege('service_role','public.oem_reply_generations','SELECT') AS service_select`)
    assert.equal(privileges.rows[0].anon_select, false); assert.equal(privileges.rows[0].authenticated_select, false); assert.equal(privileges.rows[0].service_select, true)
    const funcs = await sql(client, `SELECT p.proname, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute, has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute, has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('begin_oem_reply_generation','finish_oem_reply_generation','save_oem_conversation_draft')`)
    assert.equal(funcs.rowCount, 3); assert(funcs.rows.every(r => !r.anon_execute && !r.authenticated_execute && r.service_execute), 'function grants must be service_role only')

    const actorRow = await sql(client, 'SELECT user_id FROM public.oem_mail_admins LIMIT 1')
    const leadRow = await sql(client, 'SELECT id FROM public.leads WHERE page_id=$1 LIMIT 1', [OEM_PAGE])
    assert(actorRow.rowCount && leadRow.rowCount, 'an existing OEM admin and lead are required')
    const actor = actorRow.rows[0].user_id; const lead = leadRow.rows[0].id
    const request = id(); const requestHash = hash(); const snapshot = hash(); const model = 'gemini-2.5-flash'
    for (const values of [[null, lead, actor, requestHash, snapshot, 'acknowledge', model], [request, lead, actor, 'bad', snapshot, 'acknowledge', model], [request, lead, actor, requestHash, 'bad', 'acknowledge', model], [request, lead, actor, requestHash, snapshot, 'unknown', model], [request, lead, actor, requestHash, snapshot, 'acknowledge', 'other-1']]) expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', values), 'invalid', 'invalid begin parameters must be rejected')
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [request, id(), actor, requestHash, snapshot, 'acknowledge', model]), 'forbidden', 'non-OEM lead must be refused')

    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [request, lead, actor, requestHash, snapshot, 'acknowledge', model]), 'claimed')
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [request, lead, actor, requestHash, snapshot, 'acknowledge', model]), 'pending', 'pending duplicate must not claim again')
    assert.equal((await sql(client, 'SELECT count(*)::int AS n FROM public.oem_reply_generations WHERE request_id=$1', [request])).rows[0].n, 1)
    assert.equal((await sql(client, 'SELECT public.finish_oem_reply_generation($1,$2,$3,$4,$5,$6,$7) AS ok', [request, actor, 'ready', 'Re: OEM', '標準仕様をご案内します。', JSON.stringify(['manual']), null])).rows[0].ok, true)
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [request, lead, actor, requestHash, snapshot, 'acknowledge', model]), 'ready', 'duplicate ready must return ready')
    for (const values of [[request, lead, actor, hash(), snapshot, 'acknowledge', model], [request, lead, actor, requestHash, hash(), 'acknowledge', model], [request, lead, actor, requestHash, snapshot, 'materials', model], [request, lead, actor, requestHash, snapshot, 'acknowledge', 'gemini-other']]) expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', values), 'conflict')
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [request, lead, id(), requestHash, snapshot, 'acknowledge', model]), 'forbidden', 'different actor must be refused')

    const pending = id(); const pendingHash = hash(); const pendingSnapshot = hash(); expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [pending, lead, actor, pendingHash, pendingSnapshot, 'trial', model]), 'claimed')
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [pending, lead, actor, pendingHash, pendingSnapshot, 'trial', model]), 'pending', 'pending retry must return pending without a second claim')
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [pending, lead, actor, hash(), pendingSnapshot, 'trial', model]), 'conflict')
    const failed = id(); const fh = hash(); const fs = hash(); expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [failed, lead, actor, fh, fs, 'trial', model]), 'claimed')
    assert.equal((await sql(client, 'SELECT public.finish_oem_reply_generation($1,$2,$3,$4,$5,$6,$7) AS ok', [failed, actor, 'failed', null, null, '[]', 'provider_error'])).rows[0].ok, true)
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [failed, lead, actor, fh, fs, 'trial', model]), 'failed', 'failed rows must not auto-retry')

    for (let i = 0; i < 20; i++) await sql(client, `INSERT INTO public.oem_reply_generations(request_id,lead_id,created_by,request_hash,snapshot_hash,template_id,model) VALUES($1,$2,$3,$4,$5,'progress',$6)`, [id(), lead, actor, hash(), hash(), model])
    expectResult(await sql(client, 'SELECT * FROM public.begin_oem_reply_generation($1,$2,$3,$4,$5,$6,$7)', [id(), lead, actor, hash(), hash(), 'progress', model]), 'rate_limit')
    for (const [status, subject, text, warnings] of [['ready', '', 'x', '[]'], ['ready', 'x\r\ny', 'x', '[]'], ['ready', 'x', 'x'.repeat(10001), '[]'], ['ready', 'x', 'x', JSON.stringify(Array(7).fill('x'))], ['ready', 'x', 'x', JSON.stringify([1])]]) {
      assert.equal((await sql(client, 'SELECT public.finish_oem_reply_generation($1,$2,$3,$4,$5,$6,$7) AS ok', [pending, actor, status, subject, text, warnings, null])).rows[0].ok, false, `invalid finish must reject: ${subject}`)
    }
    assert.equal((await sql(client, 'SELECT public.finish_oem_reply_generation($1,$2,$3,$4,$5,$6,$7) AS ok', [pending, actor, 'ready', 'Re: OEM', '本文', JSON.stringify(['確認']), null])).rows[0].ok, true)
    await savepoint(client, 'immutable_update', async () => { await assert.rejects(() => sql(client, `UPDATE public.oem_reply_generations SET request_hash=$1 WHERE request_id=$2`, [hash(), pending]), /reply generation audit is immutable/) })
    await savepoint(client, 'immutable_delete', async () => { await assert.rejects(() => sql(client, `DELETE FROM public.oem_reply_generations WHERE request_id=$1`, [pending]), /reply generation audit is immutable/) })

    const draftSubject = `確認 [OEM-${lead}]`; const contextHash = hash(); const firstDraft = await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, draftSubject, '本文', null, 'acknowledge', contextHash]); expectResult(firstDraft, 'saved')
    const stamp = firstDraft.rows[0].updated_at; expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, draftSubject, '本文', stamp, 'acknowledge', contextHash]), 'saved')
    expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, draftSubject, '本文', stamp, 'acknowledge', hash()]), 'conflict', 'metadata-only changes require expected timestamp')
    expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, `変更 [OEM-${lead}]`, '本文2', new Date(0), 'materials', contextHash]), 'conflict')
    expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, id(), draftSubject, '本文', stamp, 'acknowledge', contextHash]), 'forbidden')
    expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [id(), actor, draftSubject, '本文', null, 'acknowledge', contextHash]), 'forbidden')
    for (const metadata of [['acknowledge', null], [null, contextHash], ['unknown', contextHash], ['acknowledge', 'not-a-hash']]) expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, draftSubject, '本文', stamp, metadata[0], metadata[1]]), 'invalid', 'malformed provenance must reject')
    for (const [subject, text, expected] of [['no tag', '本文', 'invalid'], [`x [OEM-${lead}]\r\n`, '本文', 'invalid'], [draftSubject, 'x'.repeat(30001), 'invalid']]) expectResult(await sql(client, 'SELECT * FROM public.save_oem_conversation_draft($1,$2,$3,$4,$5,$6,$7)', [lead, actor, subject, text, stamp, null, null]), expected)

    await sql(client, 'ROLLBACK'); console.log('OEM reply assist DB checks: PASS (RLS, grants, claims, conflicts, immutability, rate limit, draft concurrency, rollback)')
  } catch (error) { await sql(client, 'ROLLBACK').catch(() => {}); console.error('OEM reply assist DB checks: FAIL', { stage: error.stage || 'contract', code: error.code, message: error.message }); process.exitCode = 1 } finally { await client.end() }
}
if (require.main === module) main()
