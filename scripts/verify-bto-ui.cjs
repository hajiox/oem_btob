const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const base = process.argv[2] || 'http://localhost:3107'
;(async () => {
  await mkdir('.bto-backups/qa', { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  try {
    for (const mobile of [false, true]) {
      if(process.env.QA_MOBILE_ONLY && !mobile) continue
      const page = await browser.newPage({ viewport: mobile ? {width:390,height:844} : {width:1440,height:1000} })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      for (const spec of [
        { product:'レトルトカレー', choices:['リーズナブル','バルク（パウチのみ）'], total:140000, yes:false },
        { product:'レトルトカレー', choices:['リッチ','PP袋＋厚紙'], total:220000, yes:true },
        { product:'ラーメン', choices:['あっさり系','中太ちぢれ麺（140g）','透明袋＋シール'], total:240000, yes:false },
        { product:'ラーメン', choices:['こってり系','オーション麺（200g）','箱＋巻紙'], total:332000, yes:true },
        { product:'ふりかけ', choices:['瓶大・50g'], total:148000, yes:false },
        { product:'ふりかけ', choices:['瓶小・35g'], total:132000, yes:true },
        { product:'ふりかけ', choices:['袋・50g'], total:140000, yes:false },
        { product:'たれ・ソース・ドレッシング', choices:['たれ','角瓶・180〜200cc'], total:148000, yes:false },
        { product:'たれ・ソース・ドレッシング', choices:['ソース','丸瓶・180〜200cc'], total:148000, yes:true },
        { product:'たれ・ソース・ドレッシング', choices:['ドレッシング','キャップ付きパウチ・150g'], total:156000, yes:false },
      ]) {
        if (process.env.QA_SINGLE && (mobile || !spec.yes || spec.product !== 'レトルトカレー')) continue
        await page.goto(`${base}/btob?qa=${Date.now()}#bto-form`, { waitUntil: 'domcontentloaded' })
        await page.addStyleTag({content:'html { scroll-behavior: auto !important; }'})
        const form = page.locator('#bto-form')
        const next = async () => { await page.waitForTimeout(450); await form.getByRole('button', {name: /次のステップへ|結果を見る/}).click(); await page.waitForTimeout(450) }
        const assertAutoAdvanceStep = async label => {
          assert.equal(await form.getByRole('button', {name:/次のステップへ|結果を見る/}).count(), 0, `${label}: explicit next must be hidden`)
        }
        const chooseAuto = async name => {
          await assertAutoAdvanceStep(`Radio step (${name})`)
          await form.getByText(name, {exact:true}).click()
          await page.waitForTimeout(450)
        }
        const back = async () => {
          const button = form.getByRole('button', {name:'戻る', exact:true})
          await button.focus()
          await button.press('Enter')
          await page.waitForTimeout(450)
        }
        // /btob starts at product selection; quantity is fixed by the selected product.
        const assertProductStep = async (label) => {
          const productStepText = await form.innerText()
          assert(productStepText.includes('作りたい商品を選んでください'), `${label}: step must be product selection`)
          assert(!productStepText.includes('製造数'), `${label}: quantity must be excluded from visual labels`)
          assert(!productStepText.includes('OEM製造数の入力'), `${label}: quantity heading must not be shown`)
          assert(!productStepText.includes('製造予定数量'), `${label}: quantity field heading must not be shown`)
          assert.equal(await form.locator('input[type=number]').count(), 0, `${label}: quantity input must not be shown`)
          const productImages = form.locator('button img')
          await productImages.first().waitFor()
          assert(await productImages.count() > 0, `${label}: product option images must be present`)
          for (let i = 0; i < await productImages.count(); i++) {
            assert(await productImages.nth(i).isVisible(), `${label}: product option image ${i + 1} must be visible`)
          }
        }
        await assertProductStep('Initial')
        await assertAutoAdvanceStep('Product step')
        await form.screenshot({path:`.bto-backups/qa/product-first-${mobile?'mobile':'desktop'}.png`})
        await form.getByRole('button', {name: new RegExp(`^${spec.product}`)}).click()
        await page.waitForTimeout(450)
        // Product selection is step 1: going back must not expose a removed step 0.
        await back()
        await assertProductStep('Back from first form')
        const productBack = form.getByRole('button', {name:'戻る', exact:true})
        const productBackCount = await productBack.count()
        assert(productBackCount === 0 || await productBack.first().evaluate(el => getComputedStyle(el).visibility === 'hidden'), 'Back must not navigate before product step')
        await form.getByRole('button', {name: new RegExp(`^${spec.product}`)}).click()
        await page.waitForTimeout(450)
        for (let i=0; i<spec.choices.length; i++) {
          if(spec.product==='たれ・ソース・ドレッシング' && i===1) {
            await form.locator('textarea').fill('福島県産の素材を使った味。QA入力・送信しません。')
            await next()
          }
          await chooseAuto(spec.choices[i])
          if (i === spec.choices.length - 1) {
            await page.waitForTimeout(450) // Framer Motion entry transition (300 ms).
            await form.screenshot({path:`.bto-backups/qa/${mobile?'mobile':'desktop'}-${spec.product}-${spec.total}-package.png`})
          }
        }
        await chooseAuto(spec.yes?'ある':'ない')
        if (spec.yes) {
          const input=form.locator('input[type=text]')
          await input.fill('   ')
          assert(await form.getByRole('button',{name:'結果を見る'}).isDisabled(), 'Whitespace must not pass required ingredient')
          await input.fill('福島県産の原料')
          await next()
        }
        await form.getByRole('button',{name:'この内容で相談する', exact:true}).waitFor()
        await page.waitForTimeout(450)
        await form.getByText('単価・内訳を見る', {exact: true}).click()
        await form.getByText('製造条件・賞味期限・ご注意', {exact: true}).click()
        const text=await form.innerText()
        const finalTotal = spec.total + 6000
        assert(text.includes(`¥${finalTotal.toLocaleString('en-US')}`), `Wrong total: ${spec.product} ${finalTotal}`)
        const breakdown = form.getByTestId('quote-order-breakdown')
        const subtotalRow = breakdown.locator(':scope > div').filter({hasText: '商品小計'}).first()
        assert((await subtotalRow.innerText()).includes(`¥${spec.total.toLocaleString('en-US')}`), `${spec.product}: subtotal changed`)
        const shippingRow = breakdown.locator(':scope > div').filter({hasText: '送料・発送梱包手数料'}).first()
        assert((await shippingRow.innerText()).includes('¥6,000'), `${spec.product}: shipping/packing fee line missing`)
        const quantityUnit = spec.product === 'ラーメン' ? 'セット' : '個'
        const unitCostRow = form.getByText(`1${quantityUnit}あたり（送料等別）`, {exact: false}).locator('..')
        assert((await unitCostRow.innerText()).includes(`¥${Math.ceil(spec.total / 400).toLocaleString('en-US')}`), `${spec.product}: unit cost includes shipping fee`)
        assert(text.includes('400'), 'Fixed quantity missing')
        assert(!text.includes('800個'), 'Quantity not forced to 400')
        assert(!text.includes('うち消費税'), 'Tax-inclusive label on ex-tax quote')
        assert(!text.includes('納期目安60日'), 'Shelf life mistaken for lead time')
        assert(!text.includes('何食入'), 'Retired servings step visible')
        assert(text.includes('OEM見積もり結果'), 'OEM result heading missing')
        assert(text.includes('単価・内訳を見る'), 'Unit breakdown disclosure missing')
        assert(text.includes('製造条件・賞味期限・ご注意'), 'Conditions disclosure missing')
        if (spec.product === 'ラーメン') assert(text.includes('400セット'), 'Ramen unit must be sets')
        const overflow=await form.evaluate(el=>el.scrollWidth>el.clientWidth+2)
        assert(!overflow, 'Form horizontal overflow')
        const manufacturingRow = form.getByText('製造手数料', {exact: true}).locator('..')
        assert((await manufacturingRow.innerText()).includes('¥180'), 'Manufacturing must be 180 yen')
        if(['ふりかけ','たれ・ソース・ドレッシング'].includes(spec.product)) {
          assert(text.includes('製造から1年'))
          assert(!text.includes('内容量200g'))
        }
        await form.screenshot({path:`.bto-backups/qa/${mobile?'mobile':'desktop'}-${spec.product}-${spec.total}-result.png`})
        // Switching the ingredient branch must not retain the old ingredient answer.
        await back()
        if(spec.yes) {
          await form.locator('input[type=text]').waitFor()
          await page.waitForTimeout(450)
          await back()
        }
        await chooseAuto('ない')
        await form.getByRole('button',{name:'この内容で相談する', exact:true}).click()
        await form.getByText('ご相談内容の送信',{exact:true}).waitFor()
        // Never submit: no lead or notification email is generated by this test.
        console.log(`${mobile?'mobile':'desktop'} ${spec.product} ${spec.total}: PASS`)
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
  } catch (error) {
    console.error('Original QA error:', error)
    for (const context of browser.contexts()) for (const page of context.pages()) {
      try {
        console.error('Failure screen:', (await page.locator('#bto-form').innerText({timeout:3000})).slice(-3500))
        await page.screenshot({path:'.bto-backups/qa/failure.png',timeout:3000})
      } catch {}
    }
    throw error
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1})
