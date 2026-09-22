/* Transactional OEM conversation schema verification. Never commits or prints credentials. */
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const { connection } = require('./oem-db-migrate.cjs')

const migration = fs.readFileSync('sql/012_oem_conversations.sql', 'utf8')
const sql = migration
  .replace(/^BEGIN;\s*$/gm, '')
  .replace(/^COMMIT;\s*$/gm, '')

function checkStaticContract() {
  const required = [
    'oem_mail_admins', 'oem_mailbox_connections', 'oem_oauth_states',
    'oem_conversation_threads', 'oem_conversation_messages', 'oem_conversation_drafts',
    'claim_oem_conversation', "status = 'pending'", "status = 'sending'",
    'REVOKE ALL ON public.oem_mail_admins', 'GRANT ALL ON public.oem_mail_admins',
  ]
  for (const fragment of required) assert(migration.includes(fragment), `missing contract fragment: ${fragment}`)
  assert(!/INSERT\s+INTO\s+public\.oem_mail_admins/i.test(migration), 'migration must not seed admins')
  assert(!/status\s+IN\s*\([^)]*unknown[^)]*\).*UPDATE/i.test(migration), 'must not auto-replay unknown')
}

async function main() {
  checkStaticContract()
  const client = connection()
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)

    const tables = await client.query(`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, [[
      'oem_mail_admins', 'oem_mailbox_connections', 'oem_oauth_states',
      'oem_conversation_threads', 'oem_conversation_messages', 'oem_conversation_drafts',
    ]])
    assert.equal(tables.rowCount, 6, 'all six conversation tables must exist')
    assert(tables.rows.every(row => row.relrowsecurity), 'RLS must be enabled on every conversation table')

    const columns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [[
      'oem_mail_admins', 'oem_mailbox_connections', 'oem_oauth_states',
      'oem_conversation_threads', 'oem_conversation_messages', 'oem_conversation_drafts',
    ]])
    const present = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`))
    for (const key of [
      'oem_mail_admins.user_id', 'oem_mailbox_connections.encrypted_refresh_token',
      'oem_oauth_states.verifier_encrypted', 'oem_conversation_threads.gmail_thread_id',
      'oem_conversation_threads.lead_id', 'oem_conversation_messages.gmail_id',
      'oem_conversation_messages.request_id', 'oem_conversation_messages.attachments',
      'oem_conversation_drafts.lead_id', 'oem_conversation_drafts.text_body',
    ]) assert(present.has(key), `missing required column: ${key}`)

    const privileges = await client.query(`
      SELECT table_name,
        has_table_privilege('anon', format('public.%I', table_name), 'SELECT') AS anon_select,
        has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') AS authenticated_select,
        has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') AS service_select
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [[
      'oem_mail_admins', 'oem_mailbox_connections', 'oem_oauth_states',
      'oem_conversation_threads', 'oem_conversation_messages', 'oem_conversation_drafts',
    ]])
    assert(privileges.rows.every(row => !row.anon_select && !row.authenticated_select && row.service_select), 'table access must be service_role only')

    const functionPrivileges = await client.query(`
      SELECT has_function_privilege('anon', 'public.claim_oem_conversation(uuid)', 'EXECUTE') AS anon_execute,
             has_function_privilege('authenticated', 'public.claim_oem_conversation(uuid)', 'EXECUTE') AS authenticated_execute,
             has_function_privilege('service_role', 'public.claim_oem_conversation(uuid)', 'EXECUTE') AS service_execute
    `)
    assert.equal(functionPrivileges.rows[0].anon_execute, false)
    assert.equal(functionPrivileges.rows[0].authenticated_execute, false)
    assert.equal(functionPrivileges.rows[0].service_execute, true)

    const definition = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'claim_oem_conversation'
    `)
    assert.equal(definition.rowCount, 1)
    assert(definition.rows[0].definition.includes("status = 'pending'"), 'claim must only select pending rows')
    assert(!definition.rows[0].definition.includes("status = 'unknown'"), 'claim must not replay unknown rows')
    assert(!definition.rows[0].definition.includes("AND status = 'sending'"), 'claim must not replay sending rows')

    // Trigger tests use only transaction-local rows and are rolled back below.
    assert.equal((await client.query("SELECT to_regclass('public.oem_mail_deliveries') AS name")).rows[0].name, 'oem_mail_deliveries')
    assert.equal((await client.query("SELECT 1 FROM public.pages WHERE id = '35e7d402-0443-4703-94a4-fc2873b8f933'::uuid")).rowCount, 1, 'OEM page must exist for delivery tagging test')
    const leadIds = [randomUUID(), randomUUID(), randomUUID()]
    for (const [id, pageId] of [[leadIds[0], '35e7d402-0443-4703-94a4-fc2873b8f933'], [leadIds[1], '35e7d402-0443-4703-94a4-fc2873b8f933'], [leadIds[2], null]]) {
      await client.query(`INSERT INTO public.leads(id, page_id, company_name, contact_name, email) VALUES ($1, $2, 'rollback test', 'test', 'test@example.invalid')`, [id, pageId])
    }
    const payload = subject => ({ from: 'test@example.invalid', to: 'test@example.invalid', subject, html: 'rollback test' })
    const tagged = (await client.query(`INSERT INTO public.oem_mail_deliveries(lead_id, kind, payload) VALUES ($1, 'customer', $2) RETURNING payload`, [leadIds[0], payload('受付')])).rows[0].payload
    const tag = `[OEM-${leadIds[0]}]`
    assert.equal(tagged.subject, `受付 ${tag}`)
    assert.equal((tagged.subject.match(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1)
    const alreadyTagged = (await client.query(`INSERT INTO public.oem_mail_deliveries(lead_id, kind, payload) VALUES ($1, 'admin', $2) RETURNING payload`, [leadIds[1], payload(`通知 ${`[OEM-${leadIds[1]}]`}`)])).rows[0].payload
    assert.equal(alreadyTagged.subject, `通知 [OEM-${leadIds[1]}]`)
    const otherPage = (await client.query(`INSERT INTO public.oem_mail_deliveries(lead_id, kind, payload) VALUES ($1, 'customer', $2) RETURNING payload`, [leadIds[2], payload('通常')])).rows[0].payload
    assert.equal(otherPage.subject, '通常')
    const attempted = (await client.query(`INSERT INTO public.oem_mail_deliveries(lead_id, kind, status, payload) VALUES ($1, 'admin', 'sent', $2) RETURNING payload`, [leadIds[0], payload('送信済み')])).rows[0].payload
    assert.equal(attempted.subject, '送信済み')

    const firstMessage = (await client.query(`
      INSERT INTO public.oem_conversation_messages(lead_id, direction, subject, text_body, status, request_id)
      VALUES ($1, 'outbound', 'first', 'rollback test', 'pending', $2)
      RETURNING id
    `, [leadIds[0], randomUUID()])).rows[0].id
    await client.query('SAVEPOINT unresolved_message_conflict')
    try {
      await client.query(`
        INSERT INTO public.oem_conversation_messages(lead_id, direction, subject, text_body, status, request_id)
        VALUES ($1, 'outbound', 'blocked', 'rollback test', 'pending', $2)
      `, [leadIds[0], randomUUID()])
      assert.fail('a second unresolved message for one lead must be rejected')
    } catch (error) {
      assert.equal(error.code, '23505')
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT unresolved_message_conflict')
    }
    await client.query("UPDATE public.oem_conversation_messages SET status = 'sent' WHERE id = $1", [firstMessage])
    await client.query(`
      INSERT INTO public.oem_conversation_messages(lead_id, direction, subject, text_body, status, request_id)
      VALUES ($1, 'outbound', 'allowed after sent', 'rollback test', 'pending', $2)
    `, [leadIds[0], randomUUID()])

    await client.query('ROLLBACK')
    console.log('OEM conversation DB checks: PASS (schema, RLS, service-role grants, claim boundary, rollback)')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('OEM conversation DB checks: FAIL', { code: error.code, message: error.message })
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

if (require.main === module) main()
