// Read-only verification of the exact synthetic demo; no mail, updates, or customer content.
const { connection } = require('./oem-db-migrate.cjs')
async function main() {
  const db = connection()
  try {
    await db.connect()
    const lead = await db.query(`SELECT id FROM public.leads WHERE page_id='35e7d402-0443-4703-94a4-fc2873b8f933' AND company_name='返信案動作テスト・支払不要' AND email='reply-assist-demo@example.invalid' ORDER BY created_at DESC LIMIT 1`)
    if (!lead.rowCount) throw new Error('Synthetic demo not found')
    const id = lead.rows[0].id
    const messages = await db.query('SELECT direction,status,count(*)::integer AS count FROM public.oem_conversation_messages WHERE lead_id=$1 GROUP BY direction,status', [id])
    const generations = await db.query('SELECT status,model,count(*)::integer AS count FROM public.oem_reply_generations WHERE lead_id=$1 GROUP BY status,model', [id])
    const draft = await db.query('SELECT length(text_body) AS text_length,reply_template_id,reply_context_hash IS NOT NULL AS has_context,updated_at FROM public.oem_conversation_drafts WHERE lead_id=$1', [id])
    const orders = await db.query('SELECT count(*)::integer AS count FROM public.oem_orders WHERE lead_id=$1', [id])
    console.log(JSON.stringify({ leadId: id, messages: messages.rows, generations: generations.rows, draft: draft.rows, orders: orders.rows[0].count }))
  } finally { await db.end() }
}
main().catch(error => { console.error('Synthetic demo verification failed:', error.message); process.exitCode = 1 })
