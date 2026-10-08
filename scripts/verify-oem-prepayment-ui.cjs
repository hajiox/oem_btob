// Read-only browser QA: no consultation submissions, bank operations, or customer mail.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('C:/Users/ts/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.argv[2] || 'http://127.0.0.1:3330'
const output = path.resolve('output/oem-prepayment-20261008-qa')
async function main() {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort())
    for (const slug of ['curry-oem', 'ramen-oem', 'btob']) {
      await page.goto(`${base}/${slug}?utm_campaign=oem_tracking_test`, { waitUntil: 'networkidle' })
      const text = await page.locator('body').innerText()
      for (const phrase of ['5,500円', '入金確認後', '試作のみ', '1企業', '試作で特殊食材の使用の場合は別途お見積りとなります']) assert(text.includes(phrase), `${slug}: missing ${phrase}`)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${slug}: mobile overflow`)
      await page.screenshot({ path: path.join(output, `${slug}-${base.includes('127.0.0.1') ? 'local' : 'production'}.png`), fullPage: true })
    }
    for (const product of ['curry', 'ramen']) {
      await page.goto(`${base}/btob?product=${product}&utm_campaign=oem_tracking_test#bto-form`, { waitUntil: 'networkidle' })
      for (let step = 0; step < 12 && !await page.locator('[data-testid="quote-trial-prepayment"]').count(); step++) {
        for (const field of await page.locator('#bto-form input[type="text"][required], #bto-form textarea[required]').all()) await field.fill('QA原料（送信なし）')
        const button = page.locator('#bto-form button:enabled').filter({ hasNotText: /戻る|相談|送信|履歴/ }).first()
        assert(await button.count(), `${product}: no specification option at step ${step}`)
        await button.click()
        await page.waitForTimeout(400)
      }
      const trial = page.locator('[data-testid="quote-trial-prepayment"]')
      assert.equal(await trial.count(), 1, `${product}: did not reach quote`)
      assert.match(await trial.innerText(), /5,500/)
      assert.match(await trial.innerText(), /消費税10％/)
      const breakdown = await page.locator('[data-testid="quote-order-breakdown"]').innerText()
      assert(!breakdown.includes('試作・表示'), `${product}: trial is included in manufacturing total`)
      const amounts = [...breakdown.matchAll(/¥([\d,]+)/g)].map(match => Number(match[1].replaceAll(',', '')))
      assert.equal(amounts.length, 3, `${product}: product / shipping / manufacturing total`)
      assert.equal(amounts[0] + amounts[1], amounts[2], `${product}: manufacturing total excludes trial`)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${product}: quote mobile overflow`)
      await page.locator('[aria-labelledby="oem-quote-result-title"]').screenshot({ path: path.join(output, `${product}-quote-${base.includes('127.0.0.1') ? 'local' : 'production'}.png`) })
      console.log(`${product}: trial 5,000 + tax 500 = 5,500; manufacturing ${amounts[0]} + shipping ${amounts[1]} = ${amounts[2]}`)
    }
    console.log(`Read-only mobile LP and BTO prepayment QA passed: ${base}`)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
