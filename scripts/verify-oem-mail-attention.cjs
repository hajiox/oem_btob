/* Transactional OEM mail-attention verification. No email is sent and all rows roll back. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')

const migration = fs.readFileSync('sql/016_oem_mail_attention.sql', 'utf8')
const migrationSql = migration.replace(/^BEGIN;\s*$/gm, '').replace(/^COMMIT;\s*$/gm, '')
const OEM_PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'
const quote = value => `'${String(value).replaceAll("'", "''")}'`

function staticContract() {
  for (const fragment of [
    'reviewed_at', 'reviewed_by', 'handled_at', 'handled_by', 'reply_to_id',
    'reply_closed_at', 'reply_closed_by', 'oem_mail_sync_state',
    'claim_oem_mail_sync', 'finish_oem_mail_sync',
    "status = 'sent' AND NEW.direction = 'outbound' AND NEW.reply_to_id IS NOT NULL",
    "GRANT EXECUTE ON FUNCTION public.claim_oem_mail_sync(uuid, boolean) TO service_role",
  ]) assert(migration.includes(fragment), `missing attention contract: ${fragment}`)
  assert(!/INSERT\s+INTO\s+public\.oem_mail_admins/i.test(migration), 'attention migration must not seed administrators')
}

async function main() {
  staticContract()
  const db = connection()
  let stage = 'connect'
  try {
    await db.connect()
    await db.query('BEGIN')
    if (process.argv.includes('--with-migration')) { stage = 'migration'; await db.query(migrationSql) }

    stage = 'columns'; const columns = await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='oem_conversation_messages'`)
    const names = new Set(columns.rows.map(row => row.column_name))
    for (const name of ['reviewed_at', 'reviewed_by', 'handled_at', 'handled_by', 'reply_to_id', 'reply_closed_at', 'reply_closed_by']) assert(names.has(name), `missing column: ${name}`)

    stage = 'grants'; const grants = await db.query(`SELECT has_table_privilege('anon','public.oem_mail_sync_state','SELECT') AS anon_select,
      has_table_privilege('authenticated','public.oem_mail_sync_state','SELECT') AS auth_select,
      has_table_privilege('service_role','public.oem_mail_sync_state','SELECT') AS service_select`)
    assert.equal(grants.rows[0].anon_select, false)
    assert.equal(grants.rows[0].auth_select, false)
    assert.equal(grants.rows[0].service_select, true)
    stage = 'rpc-privileges'; const rpc = await db.query(`SELECT has_function_privilege('anon','public.claim_oem_mail_sync(uuid,boolean)','EXECUTE') AS anon_claim,
      has_function_privilege('authenticated','public.claim_oem_mail_sync(uuid,boolean)','EXECUTE') AS auth_claim,
      has_function_privilege('service_role','public.claim_oem_mail_sync(uuid,boolean)','EXECUTE') AS service_claim,
      has_function_privilege('anon','public.finish_oem_mail_sync(uuid,text,text,boolean,text)','EXECUTE') AS anon_finish,
      has_function_privilege('authenticated','public.finish_oem_mail_sync(uuid,text,text,boolean,text)','EXECUTE') AS auth_finish,
      has_function_privilege('service_role','public.finish_oem_mail_sync(uuid,text,text,boolean,text)','EXECUTE') AS service_finish`)
    assert.deepEqual(rpc.rows[0], { anon_claim: false, auth_claim: false, service_claim: true, anon_finish: false, auth_finish: false, service_finish: true })
    const adminRow = await db.query('SELECT user_id FROM public.oem_mail_admins LIMIT 1')
    assert(adminRow.rowCount, 'an explicitly provisioned OEM mail admin is required for attention RPC tests')
    const adminUser = adminRow.rows[0].user_id
    const attentionRpcPrivileges = await db.query(`SELECT
      has_function_privilege('anon','public.review_oem_conversation_messages(uuid,uuid,uuid[])','EXECUTE') AS anon_review,
      has_function_privilege('authenticated','public.review_oem_conversation_messages(uuid,uuid,uuid[])','EXECUTE') AS auth_review,
      has_function_privilege('service_role','public.review_oem_conversation_messages(uuid,uuid,uuid[])','EXECUTE') AS service_review,
      has_function_privilege('anon','public.handle_oem_conversation_message(uuid,uuid,uuid,boolean)','EXECUTE') AS anon_handle,
      has_function_privilege('authenticated','public.handle_oem_conversation_message(uuid,uuid,uuid,boolean)','EXECUTE') AS auth_handle,
      has_function_privilege('service_role','public.handle_oem_conversation_message(uuid,uuid,uuid,boolean)','EXECUTE') AS service_handle`)
    assert.deepEqual(attentionRpcPrivileges.rows[0], { anon_review: false, auth_review: false, service_review: true, anon_handle: false, auth_handle: false, service_handle: true })

    const baselineSummary = (await db.query('SELECT * FROM public.oem_mail_attention_summary()')).rows[0]
    stage = 'lead'; const lead = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,status)
      VALUES($1,'attention rollback test','test','attention-test@example.invalid','[]'::jsonb,'new') RETURNING id`, [OEM_PAGE])).rows[0].id
    stage = 'older'; const older = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,sent_at,gmail_id)
      VALUES($1::uuid,'inbound',$3::text,'older','received',now()-interval '2 minutes',$2::text) RETURNING id`, [lead, `attention-${randomUUID()}`, `[OEM-${lead}] older`])).rows[0].id
    // Reuse the first inbound row as the reply anchor; this also verifies legacy/imported rows.
    stage = 'anchor'; const anchor = older
    // A failed/unknown conversational reply and an invoice/order-style send must not close an inbound anchor.
    for (const status of ['failed', 'unknown']) {
      stage = `failed-reply-${status}`
      await db.query('SAVEPOINT nonreply_status')
      await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,reply_to_id)
        VALUES($1::uuid,'outbound','failed reply','system', $2::text, $3::uuid)`, [lead, status, anchor])
      const state = (await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1', [anchor])).rows[0]
      assert.equal(state.reply_closed_at, null, `${status} non-reply must not close anchor`)
      await db.query('ROLLBACK TO SAVEPOINT nonreply_status')
    }
    stage = 'invoice-send'; await db.query('SAVEPOINT invoice_send')
    await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,reply_to_id)
      VALUES($1::uuid,'outbound','invoice/order send','system','sent',NULL)`, [lead])
    stage = 'invoice-check'
    assert.equal((await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1::uuid', [anchor])).rows[0].reply_closed_at, null, 'invoice/order send must not close anchor')
    await db.query('ROLLBACK TO SAVEPOINT invoice_send')
    stage = 'pending-reply-insert'; const pendingReply = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,reply_to_id)
      VALUES(${quote(lead)}::uuid,'outbound','reply','pending reply','pending',${quote(anchor)}::uuid) RETURNING id`)).rows[0].id
    stage = 'pending-reply-select'
    assert.equal((await db.query(`SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=${quote(anchor)}::uuid`)).rows[0].reply_closed_at, null)
    stage = 'newer-inbound'; const newer = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,sent_at,gmail_id)
      VALUES($1,'inbound','new inbound','concurrent','received',now()+interval '1 minute',$2) RETURNING id`, [lead, `attention-${randomUUID()}`])).rows[0].id
    assert.equal((await db.query('SELECT public.review_oem_conversation_messages($1,$2,ARRAY[$3]::uuid[])', [lead, randomUUID(), newer])).rows[0].review_oem_conversation_messages, false, 'unprovisioned admin must be denied')
    await db.query(`UPDATE public.oem_conversation_messages SET status='sent' WHERE id=$1`, [pendingReply])
    const closed = (await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1', [anchor])).rows[0]
    assert(closed.reply_closed_at, 'successful conversational reply must close anchor')
    assert((await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1', [older])).rows[0].reply_closed_at, 'reply closes older inbound snapshot')
    assert.equal((await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1', [newer])).rows[0].reply_closed_at, null, 'new inbound remains pending')
    assert.equal((await db.query('SELECT public.review_oem_conversation_messages($1,$2,ARRAY[$3]::uuid[])', [lead, adminUser, newer])).rows[0].review_oem_conversation_messages, true)
    const reviewedOnly = (await db.query('SELECT reviewed_at,handled_at FROM public.oem_conversation_messages WHERE id=$1', [newer])).rows[0]
    assert(reviewedOnly.reviewed_at && !reviewedOnly.handled_at, 'manual review must not mark a message handled')

    stage = 'message-pagination';
    // Pagination/count contract over more than one page; exact message IDs remain the unit of state.
    for (let i = 0; i < 51; i++) await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id,sent_at)
      VALUES($1,'inbound','page test','page test','received',$2,now()-($3::int * interval '1 second'))`, [lead, `attention-page-${i}-${randomUUID()}`, i + 10])
    const summary = (await db.query('SELECT * FROM public.oem_mail_attention_summary()')).rows[0]
    assert.equal(Number(summary.total), Number(baselineSummary.total) + 1); assert.equal(Number(summary.unread_cases), Number(baselineSummary.unread_cases) + 1); assert.equal(Number(summary.awaiting_reply_cases), Number(baselineSummary.awaiting_reply_cases) + 1)
    const attentionPage = await db.query('SELECT * FROM public.oem_mail_attention($1,$2)', [50, 0])
    const attentionRow = attentionPage.rows.find(row => row.lead_id === lead)
    assert(attentionRow, 'attention list returns the test case')
    assert(Number(attentionRow.unread_count) >= 51, 'attention list counts all inbound messages')
    const renderedIds = (await db.query("SELECT id FROM public.oem_conversation_messages WHERE lead_id=$1 AND direction='inbound' ORDER BY sent_at DESC LIMIT 51", [lead])).rows.map(row => row.id)
    assert.equal((await db.query('SELECT public.review_oem_conversation_messages($1,$2,$3::uuid[])', [lead, adminUser, renderedIds])).rows[0].review_oem_conversation_messages, false, 'review RPC must cap one rendered batch at 50 IDs')
    const count = (await db.query("SELECT count(*)::int AS n FROM public.oem_conversation_messages WHERE lead_id=$1 AND direction='inbound' AND reply_closed_at IS NULL", [lead])).rows[0].n
    assert(count >= 52, 'attention summary must count all pending inbound messages')
    const page = await db.query("SELECT id FROM public.oem_conversation_messages WHERE lead_id=$1 AND direction='inbound' ORDER BY sent_at DESC,id LIMIT 50", [lead])
    assert.equal(page.rowCount, 50, 'attention list first page must return 50 rows')
    assert.equal((await db.query("SELECT id FROM public.oem_conversation_messages WHERE lead_id=$1 AND direction='inbound' ORDER BY sent_at DESC,id OFFSET 50 LIMIT 50", [lead])).rowCount, 3, 'attention list second page must retain remaining rows')

    // Case-level pagination: 51 additional OEM cases must be counted and split across pages.
    stage = 'case-pagination'; const beforeCases = (await db.query('SELECT * FROM public.oem_mail_attention_summary()')).rows[0]
    for (let i = 0; i < 51; i++) {
      const caseId = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,status)
        VALUES($1,$2,'test',$3,'[]'::jsonb,'new') RETURNING id`, [OEM_PAGE, `attention case ${i}`, `attention-case-${i}@example.invalid`])).rows[0].id
      await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id)
        VALUES($1,'inbound','case attention','case attention','received',$2)`, [caseId, `attention-case-message-${i}-${randomUUID()}`])
    }
    const afterCases = (await db.query('SELECT * FROM public.oem_mail_attention_summary()')).rows[0]
    assert.equal(Number(afterCases.total), Number(beforeCases.total) + 51, 'summary must count >50 OEM cases')
    assert.equal((await db.query('SELECT * FROM public.oem_mail_attention($1,$2)', [50, 0])).rowCount, 50, 'case attention first page must contain 50 cases')
    assert.equal((await db.query('SELECT * FROM public.oem_mail_attention($1,$2)', [50, 50])).rowCount, Math.max(0, Number(afterCases.total) - 50), 'case attention second page must contain remaining cases')

    // Reply anchors cannot cross a case; invalid message IDs are rejected by the FK.
    const otherLead = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,status)
      VALUES($1,'other case rollback','test','other-attention@example.invalid','[]'::jsonb,'new') RETURNING id`, [OEM_PAGE])).rows[0].id
    const nonOemLead = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,status)
      VALUES(NULL,'non OEM rollback','test','non-oem-attention@example.invalid','[]'::jsonb,'new') RETURNING id`)).rows[0].id
    const nonOemInbound = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id)
      VALUES($1,'inbound','non OEM','non OEM','received',$2) RETURNING id`, [nonOemLead, `non-oem-${randomUUID()}`])).rows[0].id
    assert.equal((await db.query('SELECT public.review_oem_conversation_messages($1,$2,ARRAY[$3]::uuid[])', [nonOemLead, adminUser, nonOemInbound])).rows[0].review_oem_conversation_messages, false, 'non-OEM review must be denied')
    assert.equal((await db.query('SELECT reviewed_at FROM public.oem_conversation_messages WHERE id=$1', [nonOemInbound])).rows[0].reviewed_at, null)
    stage = '1001-handle'; const handledLead = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,status)
      VALUES($1,'handle pagination rollback','test','handle-attention@example.invalid','[]'::jsonb,'new') RETURNING id`, [OEM_PAGE])).rows[0].id
    await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id,sent_at)
      SELECT $1::uuid,'inbound','same timestamp handle','handle','received','handle-'||g::text||'-'||$1::text,now()
      FROM generate_series(1,1001) AS s(g)`, [handledLead])
    const handleAnchor = (await db.query("SELECT id FROM public.oem_conversation_messages WHERE lead_id=$1 ORDER BY id DESC LIMIT 1", [handledLead])).rows[0].id
    assert.equal((await db.query('SELECT public.handle_oem_conversation_message($1,$2,$3,true)', [handledLead, adminUser, handleAnchor])).rows[0].handle_oem_conversation_message, true)
    assert.equal(Number((await db.query('SELECT count(*)::int AS n FROM public.oem_conversation_messages WHERE lead_id=$1 AND handled_at IS NOT NULL', [handledLead])).rows[0].n), 1001, 'manual handle must not truncate at 1000 messages')
    const currentCaseInbound = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id)
      VALUES($1,'inbound','current case','current','received',$2) RETURNING id`, [lead, `current-${randomUUID()}`])).rows[0].id
    const otherInbound = (await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,gmail_id)
      VALUES($1,'inbound','other case','other','received',$2) RETURNING id`, [otherLead, `other-${randomUUID()}`])).rows[0].id
    stage = 'cross-case-rejection'; await db.query('SAVEPOINT cross_case')
    try {
      await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,reply_to_id)
        VALUES($1,'outbound','wrong owner','wrong','sent',$2)`, [lead, otherInbound])
      assert.fail('cross-case reply must be rejected')
    } catch (error) { assert.equal(error.code, 'P0001'); await db.query('ROLLBACK TO SAVEPOINT cross_case') }
    assert.equal((await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1::uuid', [otherInbound])).rows[0].reply_closed_at, null, 'cross-case reply must not close inbound')
    assert.equal((await db.query('SELECT reply_closed_at FROM public.oem_conversation_messages WHERE id=$1::uuid', [currentCaseInbound])).rows[0].reply_closed_at, null, 'cross-case reply must not close current-case inbound')
    stage = 'invalid-target-rejection'; await db.query('SAVEPOINT invalid_reply_id')
    try {
      await db.query(`INSERT INTO public.oem_conversation_messages(lead_id,direction,subject,text_body,status,reply_to_id)
        VALUES($1,'outbound','invalid reply','invalid','sent',$2)`, [lead, randomUUID()])
      assert.fail('invalid reply_to_id must be rejected')
    } catch (error) { assert.equal(error.code, 'P0001') }
    await db.query('ROLLBACK TO SAVEPOINT invalid_reply_id')

    // A re-import/update of the same Gmail message must preserve review state.
    stage = 'reimport-preservation'; assert.equal((await db.query('SELECT public.handle_oem_conversation_message($1,$2,$3,true)', [lead, adminUser, newer])).rows[0].handle_oem_conversation_message, true)
    await db.query(`UPDATE public.oem_conversation_messages SET text_body='reimported body' WHERE gmail_id=(SELECT gmail_id FROM public.oem_conversation_messages WHERE id=$1::uuid)`, [newer])
    const preserved = (await db.query('SELECT reviewed_at,handled_at FROM public.oem_conversation_messages WHERE id=$1::uuid', [newer])).rows[0]
    assert(preserved.reviewed_at && preserved.handled_at, 'reimport must preserve review/handle marks')

    stage = 'sync-lease'; const syncLease = randomUUID()
    assert((await db.query('SELECT * FROM public.claim_oem_mail_sync($1,false)', [syncLease])).rowCount === 1, 'first sync lease must be claimable')
    assert((await db.query('SELECT * FROM public.claim_oem_mail_sync($1,false)', [randomUUID()])).rowCount === 0, 'active sync lease must throttle concurrent run')
    assert.equal((await db.query('SELECT public.finish_oem_mail_sync($1,$2,$3,$4,$5)', [randomUUID(), 'wrong', 'wrong', false, null])).rows[0].finish_oem_mail_sync, false, 'wrong lease owner cannot checkpoint')
    assert.equal((await db.query('SELECT public.finish_oem_mail_sync($1,$2,$3,$4,$5)', [syncLease, 'tag query', 'next-page', false, null])).rows[0].finish_oem_mail_sync, true)
    const retryLease = randomUUID()
    assert((await db.query('SELECT * FROM public.claim_oem_mail_sync($1,true)', [retryLease])).rowCount === 1, 'forced retry may reclaim after checkpoint')
    assert.equal((await db.query('SELECT public.finish_oem_mail_sync($1,$2,$3,$4,$5)', [retryLease, 'tag query', 'retry-page', false, 'temporary Gmail failure'])).rows[0].finish_oem_mail_sync, true)
    const checkpoint = (await db.query("SELECT query_text,page_token,last_error FROM public.oem_mail_sync_state WHERE mailbox='staff@aizu-tv.com'")).rows[0]
    assert.equal(checkpoint.query_text, 'tag query'); assert.equal(checkpoint.page_token, 'retry-page'); assert.equal(checkpoint.last_error, 'temporary Gmail failure')

    await db.query('ROLLBACK')
    console.log('OEM mail-attention verification: PASS (review/reply transitions, exact anchor snapshot, reimport preservation, sync lease/RLS; all rows rolled back; no email sent)')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    console.error('OEM mail-attention verification: FAIL', { stage, code: error.code, message: error.message, detail: error.detail, where: error.where })
    process.exitCode = 1
  } finally { await db.end() }
}

if (require.main === module) main()
