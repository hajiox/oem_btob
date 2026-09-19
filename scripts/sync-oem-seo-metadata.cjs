// Sync only the public OEM page's editable SEO fields with the checked-in SEO source.
// This script never logs connection details and refuses to update another page.
const fs = require('node:fs')
const path = require('node:path')
const { connection } = require('./oem-db-migrate.cjs')

const PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
const PAGE_SLUG = 'btob'
const SEO = {
  seo_title: '福島の食品OEM・小ロット商品開発｜会津ブランド館',
  seo_description: '福島の農家・地域事業者・道の駅・観光施設向けに、地域食材を使ったオリジナル食品づくりを支援。カレー・ラーメン・調味料・瓶詰めなど、基本1ロット約400個で製造。商品と包装を選んで概算見積もりを確認できます。お茶は専用プラン。',
  og_title: '福島の食材を、あなたのお店・農園のオリジナル商品に。',
  og_description: 'カレー、調味料、ジャムなど、地域の素材を活かした商品づくり。会津ブランド館が試作から包装・製造までサポート。商品とパッケージを選んで、まずは概算を確認できます。',
  og_image_url: '/images/btob/oem-social-v1.jpg',
  favicon_url: '/images/btob/favicon.png',
}

const columns = Object.keys(SEO)
const backupPath = path.resolve('output/oem-seo-db-backup.json')

async function main() {
  const apply = process.argv.includes('--apply')
  const client = connection()
  try {
    await client.connect()
    await client.query('BEGIN')
    const result = await client.query(
      `SELECT id, slug, ${columns.join(', ')} FROM public.pages WHERE id = $1 AND slug = $2 FOR UPDATE`,
      [PAGE_ID, PAGE_SLUG],
    )
    if (result.rowCount !== 1) throw new Error('Target OEM page was not found with the expected id and slug')

    const current = result.rows[0]
    const changed = columns.filter((column) => current[column] !== SEO[column])
    console.log(JSON.stringify({ id: current.id, slug: current.slug, changed }))
    if (!apply) {
      await client.query('ROLLBACK')
      return
    }
    if (!changed.length) {
      await client.query('ROLLBACK')
      return
    }

    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.writeFileSync(backupPath, `${JSON.stringify({ backed_up_at: new Date().toISOString(), page: current }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(', ')
    await client.query(`UPDATE public.pages SET ${assignments}, updated_at = now() WHERE id = $${columns.length + 1} AND slug = $${columns.length + 2}`, [...columns.map((column) => SEO[column]), PAGE_ID, PAGE_SLUG])
    await client.query('COMMIT')
    console.log(`OEM SEO metadata updated; backup: ${backupPath}`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('OEM SEO metadata sync failed:', { code: error.code, message: error.message })
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

if (require.main === module) main()
