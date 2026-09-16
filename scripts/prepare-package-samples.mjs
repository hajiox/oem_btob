import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
const dir = 'public/images/package-samples'
await mkdir(dir, { recursive: true })
const ids = ['curry-bulk','curry-box','curry-pp','ramen-bag','ramen-box','sauce-square','sauce-round','sauce-pouch','furikake-jar','furikake-bag','jar-large','jar-small']
for (const id of ids) for (const style of ['photo','illustration']) {
  await sharp(`output/package-samples-20260916/${id}-${style}.png`).resize(800,800).webp({quality:86}).toFile(`${dir}/${id}-${style}.webp`)
}
for (const style of ['photo','illustration']) {
  await sharp(`output/tea-samples-20260916/tea-coated-paper-${style}-v3.png`).resize(800,800).webp({quality:86}).toFile(`${dir}/tea-retail-${style}.webp`)
  // User approved the same jar silhouette at a smaller display size for 35g.
  await sharp(`output/package-samples-20260916/furikake-jar-${style}.png`).resize(640,640).extend({top:80,bottom:80,left:80,right:80,background:'#ffffff'}).webp({quality:86}).toFile(`${dir}/furikake-small-${style}.webp`)
}
await sharp('output/tea-samples-20260916/tea-bulk-photo.png').resize(800,800).webp({quality:86}).toFile(`${dir}/tea-bulk-photo.webp`)
console.log('Prepared 29 sample images; source originals preserved.')
