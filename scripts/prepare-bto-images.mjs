import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
const output = 'public/images/bto'
await mkdir(output, { recursive: true })
const assets = [
  ['curry-bulk', 'O:/NEW/★商品パッケージ★/【ZEROカレー】/ネット用画像/レトルト袋-removebg-preview.png'],
  ['curry-box', 'O:/NEW/★商品パッケージ★/【はねだ桃園ひゃくぶんのいち】/カレー【桃ZEROカレー】/スクエア/元画像PNG 加工.png'],
  ['curry-pp', 'O:/NEW/★商品パッケージ★/【ネット専用】【悪魔シリーズ】/BUTAカレー/悪魔のbutaカレー写真（Yahoo提出）/2-01.jpg'],
  ['ramen-bag', 'O:/NEW/★商品パッケージ★/【■SNS】/画像/EC/IMG_5105.jpeg'],
  ['ramen-box', 'O:/NEW/★商品パッケージ★/【■SNS】/画像/EC/IMG_5104.jpeg'],
]
for (const [name, source] of assets) {
  const info = await sharp(source).rotate().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(`${output}/${name}.webp`)
  console.log(`${name}: ${info.width}x${info.height} ${info.size} bytes`)
}
