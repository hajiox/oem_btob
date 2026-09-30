/* Synthetic phase-3 attention demo. Run only with explicit operator direction; never sends mail. */
const { randomUUID } = require('node:crypto')
const { connection } = require('./oem-db-migrate.cjs')

const COMPANY = '【動作テスト・返信不要】新着・返信待ち確認'
const EMAIL = 'attention-demo@example.invalid'
const PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'

async function main() {
  const db = connection()
  try {
    await db.connect(); await db.query('BEGIN')
    let lead = await db.query('SELECT id FROM public.leads WHERE company_name=$1 AND email=$2 ORDER BY created_at DESC LIMIT 1', [COMPANY, EMAIL])
    let leadId
    if (lead.rowCount) leadId = lead.rows[0].id
    else leadId = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status)
      VALUES($1,$2,'テスト担当',$3,'[]'::jsonb,0,'new') RETURNING id`, [PAGE_ID, COMPANY, EMAIL])).rows[0].id
    const caseTag = `[OEM-${leadId}]`
    const gmailId = `synthetic-attention-${leadId}`
    const existing = await db.query('SELECT id FROM public.oem_conversation_messages WHERE gmail_id=$1', [gmailId])
    let messageId
    if (existing.rowCount) messageId = existing.rows[0].id
    else messageId = (await db.query(`INSERT INTO public.oem_conversation_messages
      (lead_id,gmail_id,direction,subject,text_body,from_address,to_address,status,sent_at)
      VALUES($1,$2,'inbound',$3,$4,'attention-demo@example.invalid','staff@aizu-tv.com','received',now()) RETURNING id`, [leadId, gmailId, `【合成テスト】新着メール ${caseTag}`, 'これはOEMメール要確認機能の合成テストです。実顧客・実注文・実送信ではありません。'])).rows[0].id
    await db.query('COMMIT')
    console.log({ demo: 'DEMO-ATTENTION-20260930', leadId, messageId, company: COMPANY, email: EMAIL, emailSent: false, bankAction: false, customerData: false, reused: Boolean(existing.rowCount) })
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); console.error({ code: error.code, message: error.message }); process.exitCode = 1 }
  finally { await db.end() }
}
main()
