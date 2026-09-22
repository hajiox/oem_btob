const { connection } = require('./oem-db-migrate.cjs')
async function main() {
    if (process.argv[2] !== '--staff') throw new Error('Explicit --staff is required')
    const client = connection()
    try {
        await client.connect()
        const result = await client.query('INSERT INTO public.oem_mail_admins(user_id) SELECT id FROM auth.users WHERE id=$1 AND email=$2 ON CONFLICT DO NOTHING', ['4b3bc661-5b5f-4e9e-a12b-36792333c7be', 'staff@aizu-tv.com'])
        const verified = await client.query('SELECT user_id FROM public.oem_mail_admins WHERE user_id=$1', ['4b3bc661-5b5f-4e9e-a12b-36792333c7be'])
        if (verified.rowCount !== 1) throw new Error('Existing staff administrator not found')
        console.log(`Staff mailbox administrator verified; added=${result.rowCount}`)
    } finally { await client.end() }
}
main().catch(() => { console.error('Administrator provisioning failed'); process.exitCode = 1 })
