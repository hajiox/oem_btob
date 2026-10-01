/* Synthetic reply-assist demo preparation. Explicitly run by an operator; never sends mail. */
const { connection } = require('./oem-db-migrate.cjs')

const PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
const COMPANY = '返信案動作テスト・支払不要'
const EMAIL = 'reply-assist-demo@example.invalid'
const GMAIL_ID = 'synthetic-reply-assist-inbound-v1'

async function main() {
  const db = connection()
  try {
    await db.connect(); await db.query('BEGIN')
    const admin = await db.query('SELECT a.user_id FROM public.oem_mail_admins a JOIN auth.users u ON u.id=a.user_id WHERE COALESCE(u.deleted_at, NULL) IS NULL ORDER BY a.user_id LIMIT 1')
    if (!admin.rowCount) throw new Error('No valid OEM mail administrator is provisioned')
    const found = await db.query('SELECT id FROM public.leads WHERE page_id=$1 AND company_name=$2 AND email=$3 ORDER BY created_at DESC LIMIT 1', [PAGE_ID, COMPANY, EMAIL])
    let leadId; let reused = false
    if (found.rowCount) { leadId = found.rows[0].id; reused = true }
    else leadId = (await db.query(`INSERT INTO public.leads(page_id,company_name,contact_name,email,selected_options,estimated_total_price,status,notes)
      VALUES($1,$2,'返信案テスト担当',$3,$4::jsonb,0,'new','合成返信案テスト。支払・発注・実送信は不要。') RETURNING id`, [PAGE_ID, COMPANY, EMAIL, JSON.stringify([{ question: '商品カテゴリー', answer: 'カレー' }, { question: '包装', answer: '化粧箱' }, { question: '原料支給', answer: 'あり（受入可否は確認前）' }])])).rows[0].id
    const tag = `[OEM-${leadId}]`
    const prior = await db.query('SELECT id FROM public.oem_conversation_messages WHERE gmail_id=$1', [GMAIL_ID])
    let messageId
    if (prior.rowCount) messageId = prior.rows[0].id
    else messageId = (await db.query(`INSERT INTO public.oem_conversation_messages
      (lead_id,gmail_id,direction,subject,text_body,from_address,to_address,status,rfc_message_id,sent_at)
      VALUES($1,$2,'inbound',$3,$4,$5,'staff@aizu-tv.com','received',$6,now()) RETURNING id`, [leadId, GMAIL_ID, `【合成テスト】仕様確認 ${tag}`, '原料を支給してカレーを作りたいです。どの情報をお伝えすればよいですか？\n【返信案の合成テスト・実顧客・実注文・支払・実送信なし】', EMAIL, '<synthetic-reply-assist-v1@example.invalid>'])).rows[0].id
    await db.query('COMMIT')
    console.log(JSON.stringify({ leadId, messageId, adminId: admin.rows[0].user_id, reused, emailSent: false }))
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); console.error(JSON.stringify({ code: error.code, message: error.message })); process.exitCode = 1 }
  finally { await db.end() }
}
if (require.main === module) main()
