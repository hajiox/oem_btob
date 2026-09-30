// Configure the existing production project without writing or logging a secret.
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')

const project = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'))
if (project.projectId !== 'prj_EGhjPM1JhiWesDMUb02WA8AaUYI1' || project.orgId !== 'team_ALWgHRWgR0j19g8MvpcuYX3N') throw new Error('Wrong production project')
const cli = path.join(process.env.APPDATA, 'npm/node_modules/vercel/dist/index.js')
if (!fs.existsSync(cli)) throw new Error('Authenticated Vercel CLI is required')
const metadata = spawnSync(process.execPath, [cli, 'api', `/v9/projects/${project.projectId}/env?teamId=${project.orgId}`, '--method', 'GET'], { encoding: 'utf8', windowsHide: true })
if (metadata.status !== 0) throw new Error('Cannot inspect environment metadata')
const existing = JSON.parse(metadata.stdout).envs || []
if (existing.some(item => item.key === 'CRON_SECRET' && item.target?.includes('production'))) {
  console.log('CRON_SECRET: existing production configuration preserved')
} else {
  const secret = randomBytes(32).toString('hex')
  const result = spawnSync(process.execPath, [cli, 'env', 'add', 'CRON_SECRET', 'production', '--yes', '--sensitive'], { input: secret, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error('Cannot configure production cron authentication')
  console.log('CRON_SECRET: configured in production (secret not written locally)')
}
