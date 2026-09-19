// Restricted additive migrations for OEM operations. Never prints credentials.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { Client } = require('pg')
const allowed = new Set(['008_oem_mail.sql','009_oem_intake.sql','010_oem_cases.sql','011_oem_intake_enforcement.sql'])
function connection() {
    // Reuse the repository's existing DB connection until moved to environment configuration.
    const connectionString = process.env.OEM_DATABASE_URL || fs.readFileSync('run-schema.js','utf8').match(/connectionString: '([^']+)'/)?.[1]
    if (!connectionString) throw new Error('OEM_DATABASE_URL is required')
    return new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
}
async function main() {
    const apply = process.argv.includes('--apply')
    const files = process.argv.slice(2).filter(arg => arg !== '--apply')
    if (!files.length || files.some(file => !allowed.has(file))) throw new Error('Specify approved OEM migration filenames')
    const client = connection()
    try {
        await client.connect()
        await client.query('BEGIN')
        await client.query('CREATE TABLE IF NOT EXISTS public.oem_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
        await client.query('ALTER TABLE public.oem_schema_migrations ENABLE ROW LEVEL SECURITY')
        await client.query('REVOKE ALL ON public.oem_schema_migrations FROM anon,authenticated')
        for (const file of files) {
            const sql = fs.readFileSync(`sql/${file}`,'utf8')
            const checksum = crypto.createHash('sha256').update(sql).digest('hex')
            const old = await client.query('SELECT checksum FROM public.oem_schema_migrations WHERE name=$1',[file])
            if (old.rowCount) { if (old.rows[0].checksum !== checksum) throw new Error(`Migration changed after application: ${file}`); console.log(`${file}: already applied`); continue }
            await client.query(sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''))
            await client.query('INSERT INTO public.oem_schema_migrations(name,checksum) VALUES($1,$2)',[file,checksum])
            console.log(`${file}: ${apply ? 'applied' : 'validated (rollback)'}`)
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK')
    } catch(error) {
        await client.query('ROLLBACK').catch(()=>{})
        console.error('OEM migration failed:', { code:error.code, message:error.message })
        process.exitCode=1
    } finally { await client.end() }
}
if (require.main === module) main()
module.exports = { connection }
