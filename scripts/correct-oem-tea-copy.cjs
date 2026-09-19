// Copy-only correction. Prices, quantities and other LPs are untouched.
const assert = require('node:assert/strict')
const { connection } = require('./oem-db-migrate.cjs')
const pageId = '35e7d402-0443-4703-94a4-fc2873b8f933'
const ids = ['b2026091-6001-4000-8000-000000000222', 'b2026091-6001-4000-8000-000000000223']
async function main() {
  const db = connection()
  try {
    await db.connect()
    await db.query('BEGIN')
    const result = await db.query(`SELECT o.id,o.description,o.price_modifier FROM form_options o
      JOIN form_questions q ON q.id=o.question_id JOIN form_steps s ON s.id=q.step_id
      WHERE s.page_id=$1 AND o.id=ANY($2::uuid[]) FOR UPDATE OF o`, [pageId, ids])
    assert.equal(result.rowCount, 2)
    for (const row of result.rows) {
      if (row.description.startsWith('商品小計')) { console.log(row.id + ': already corrected'); continue }
      assert.match(row.description, /^概算総額(?:250,000|100,000)円（税別）/)
      const description = row.description.replace('概算総額', '商品小計').replace('（税別）', '（税別・送料等別）') + '送料・発送梱包手数料6,000円（税別）は別途加算されます。'
      // Log only these public descriptions as the rollback record.
      console.log(JSON.stringify({ id: row.id, before: row.description, after: description }))
      await db.query('UPDATE form_options SET description=$1 WHERE id=$2 AND description=$3', [description, row.id, row.description])
    }
    const after = await db.query('SELECT id,price_modifier FROM form_options WHERE id=ANY($1::uuid[])', [ids])
    for (const row of after.rows) assert.equal(row.price_modifier, result.rows.find(old => old.id === row.id).price_modifier)
    await db.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK')
    console.log(process.argv.includes('--apply') ? 'Copy correction applied; prices unchanged.' : 'Dry run rolled back.')
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    console.error(error.message)
    process.exitCode = 1
  } finally { await db.end() }
}
main()
