import sharp from 'sharp'
const assets=[
 ['sauce-square','C:/Users/ts/AppData/Local/Temp/codex-clipboard-5ff3c9e8-646b-4fb8-97ba-05b59b14cfe5.png'],
 ['sauce-round','C:/Users/ts/AppData/Local/Temp/codex-clipboard-baa0f322-d142-4fa1-b612-1ad515839bdd.png'],
 ['sauce-pouch','O:/NEW/★商品パッケージ★/【桃商品】焼き肉のたれ・麻辣湯/ネット用/元画像/万能調味料ぱけ.png'],
 ['furikake-jar','C:/Users/ts/AppData/Local/Temp/codex-clipboard-b1cbb26f-8110-4cee-8d35-c852fe31cb78.png'],
 ['furikake-bag','C:/Users/ts/AppData/Local/Temp/codex-clipboard-3544d635-dfbd-4404-8f6c-f76e4db5cbe5.png'],
]
for(const[name,path]of assets){await sharp(path).rotate().resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(`public/images/bto/${name}.webp`);console.log(name)}
