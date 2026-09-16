const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')

const base = process.argv[2] || 'http://localhost:3107'
const qaDir = '.bto-backups/qa'
const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
]

;(async () => {
  await mkdir(qaDir, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  try {
    for (const view of viewports) {
      if (process.env.QA_MOBILE_ONLY && view.name !== 'mobile') continue
      const page = await browser.newPage({ viewport: view.viewport })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/btob?qa=${Date.now()}#bto-form`, { waitUntil: 'domcontentloaded' })
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' })
      const form = page.locator('#bto-form')
      // Only text-entry steps retain an explicit Next button. Product and radio
      // options advance as soon as they are clicked.
      const next = async () => {
        await page.waitForTimeout(450)
        await form.getByRole('button', { name: /次のステップへ|結果を見る/ }).click()
        await page.waitForTimeout(450)
      }
      const assertAutoAdvanceStep = async label => {
        const advance = form.getByRole('button', { name: /次のステップへ|結果を見る/ })
        assert.equal(await advance.count(), 0, `${label}: explicit next must be hidden`)
      }
      const button = name => form.getByRole('button', { name: new RegExp(`^${name}`) })
      const choose = async name => {
        await assertAutoAdvanceStep(`Radio step (${name})`)
        const option = form.getByText(name, { exact: true })
        await option.scrollIntoViewIfNeeded()
        await option.click()
      }
      const selectProduct = async name => {
        await assertAutoAdvanceStep('Product step')
        await button(name).click()
        await page.waitForTimeout(450)
      }
      const assertNoOverflow = async label => {
        assert(!(await form.evaluate(el => el.scrollWidth > el.clientWidth + 2)), `${label}: horizontal overflow`)
      }

      const initialText = await form.innerText()
      assert(initialText.includes('作りたい商品を選んでください'), `${view.name}: initial product step missing`)
      assert.equal(await form.locator('input[type=number]').count(), 0, `${view.name}: quantity input must be hidden`)
      const productImages = form.locator('button img')
      await productImages.first().waitFor()
      assert.equal(await productImages.count(), 6, 'Six product cards required')
      await productImages.evaluateAll(imgs => imgs.forEach(img => img.loading = 'eager'))
      await page.waitForFunction(() => [...document.querySelectorAll('#bto-form button img')].every(img => img.complete && img.naturalWidth > 0))
      await form.screenshot({ path: `${qaDir}/jar-tea-product-first-${view.name}.png` })

      const jarOptions = [
        ['丸瓶大120g・標準', 148000],
        ['丸瓶大120g・リッチ', 160000],
        ['丸瓶小90g・標準', 130000],
        ['丸瓶小90g・リッチ', 140000],
      ]
      for (const [label, total] of jarOptions) {
        await page.goto(`${base}/btob?qa=${Date.now()}#bto-form`, { waitUntil: 'domcontentloaded' })
        await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' })
        await selectProduct('瓶詰め（ジャム・ご飯のお供）')
        await choose(label)
        await page.waitForTimeout(450)
        await choose('ない')
        await page.waitForTimeout(450)
        const result = await form.innerText()
        assert(result.includes(`¥${total.toLocaleString('en-US')}`), `Jar ${label}: wrong total`)
        assert(result.includes('400個'), `Jar ${label}: quantity label missing`)
        assert(result.includes('製造手数料：180円'), `Jar ${label}: manufacturing fee missing`)
        assert(!result.includes('800個'), `Jar ${label}: unexpected quantity`)
        assert(!result.includes('うち消費税'), `Jar ${label}: tax-inclusive output`)
        assert(!result.includes('何食入'), `Jar ${label}: retired step visible`)
        await assertNoOverflow(`Jar ${label}`)
      }

      // Exercise the jar ingredient-name branch once without submitting.
      if (view.name === 'desktop') {
        await page.goto(`${base}/btob?qa=${Date.now()}#bto-form`, { waitUntil: 'domcontentloaded' })
        await selectProduct('瓶詰め（ジャム・ご飯のお供）')
        await choose('丸瓶大120g・標準')
        await page.waitForTimeout(450)
        await choose('ある')
        await page.waitForTimeout(450)
        const ingredient = form.locator('input[type=text]')
        await ingredient.fill('福島県産りんご（QA入力・送信しません）')
        await next()
        assert((await form.innerText()).includes('お見積り結果'), 'Jar ingredient branch did not reach result')
      }

      // Tea: declining supplied material must show an alert and disable progression.
      await page.goto(`${base}/btob?qa=${Date.now()}#bto-form`, { waitUntil: 'domcontentloaded' })
      await selectProduct('お茶（ティーバッグ）')
      await choose('ない')
      const teaNext = form.getByRole('button', { name: '次のステップへ' })
      assert.equal(await teaNext.count(), 0, 'Tea without supplied material must not show next')
      assert((await form.getByRole('alert').innerText()).includes('原料をご支給'), 'Tea decline alert missing')
      assert(!(await form.innerText()).includes('お見積り結果'), 'Tea without supplied material must not reach result')

      // Tea with supplied material: name is required, then verify both plans.
      const back = form.getByRole('button', { name: '戻る', exact: true })
      await back.click()
      await page.waitForTimeout(450)
      await selectProduct('お茶（ティーバッグ）')
      await choose('ある')
      await page.waitForTimeout(450)
      const teaIngredient = form.locator('input[type=text]')
      assert(await teaIngredient.count() > 0, 'Tea ingredient input missing')
      await teaIngredient.fill('会津産茶葉（QA入力・送信しません）')
      await next()
      await choose('50包×100袋（5000包）')
      await page.waitForTimeout(450)
      let result = await form.innerText()
      assert(result.includes('¥250,000'), 'Tea bulk plan total missing')
      assert(result.includes('50包×100袋'), 'Tea bulk quantity label missing')
      assert(!result.includes('製造手数料：180円'), 'Tea must not show manufacturing fee')
      assert(!result.includes('製造から1年'), 'Tea must not invent one-year shelf life')
      assert(!result.includes('400個'), 'Tea result must not use fixed 400-unit label')
      await form.screenshot({ path: `${qaDir}/${view.name}-tea-result-bulk.png` })
      await back.click()
      await page.waitForTimeout(450)
      await choose('4包×400個')
      await page.waitForTimeout(450)
      result = await form.innerText()
      assert(result.includes('¥100,000'), 'Tea retail plan total missing')
      assert(result.includes('4包×400個'), 'Tea retail quantity label missing')
      assert(!result.includes('製造手数料：180円'), 'Tea retail must not show manufacturing fee')
      assert(!result.includes('製造から1年'), 'Tea retail must not invent one-year shelf life')
      await form.screenshot({ path: `${qaDir}/${view.name}-tea-result-retail.png` })
      await assertNoOverflow(`${view.name}: tea result`)
      await page.close()
      assert.deepEqual(errors, [], `${view.name}: page errors`)
      console.log(`${view.name} jar/tea QA: PASS`)
    }
  } catch (error) {
    console.error('Jar/tea QA error:', error)
    throw error
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
