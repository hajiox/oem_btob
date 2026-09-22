// Explicit production-only setup; credentials are passed on stdin, never logged.
const fs = require('node:fs')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'))
if (project.projectId !== 'prj_EGhjPM1JhiWesDMUb02WA8AaUYI1') throw new Error('Wrong Vercel project')
const web = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).web
if (web?.project_id !== 'aizu-oem-mail' || !web.redirect_uris?.includes('https://oem.aizubrandhall.com/api/oem/mail/callback')) throw new Error('Unexpected OAuth project or redirect')
const entries = {
    OEM_GOOGLE_CLIENT_ID: web.client_id,
    OEM_GOOGLE_CLIENT_SECRET: web.client_secret,
    OEM_MAIL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    NEXT_PUBLIC_BASE_URL: 'https://oem.aizubrandhall.com',
}
for (const [name, value] of Object.entries(entries)) {
    if (!value) throw new Error('Missing configuration')
    const command = `npx vercel env add ${name} production --yes ${name.startsWith('NEXT_PUBLIC_') ? '--no-sensitive' : '--sensitive'}`
    const result = spawnSync(command, { shell: true, input: value, encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) { console.error(`${name}: setup failed (existing values are not overwritten)`); process.exit(1) }
    console.log(`${name}: configured`)
}
