# OEM copy correction — 2026-09-19

Status: deployed and verified on production (implementation commit ffb81b9, deployment oem-pqsre5gj8-hajioxs-projects.vercel.app). Tea database copy correction applied; prices unchanged.

## Confirmed business conditions

- User confirmed cancellation after materials procurement is actual incurred costs. Before materials procurement, retain existing 30,000 yen after-contract fee.
- User confirmed packaging price includes 500 sheets: 400 products plus 100 spares.

## Prepared changes

- Hero fixed approximate 400-unit lot; ramen sets and tea exceptions.
- Case examples: surplus crop utilization, farmers/local businesses, no registration/sales-channel introduction service.
- Initial-free image: tax-exclusive prices and nutrition-label terminology.
- BTO initial-free scope, product-cost gross-margin explanation, tea shelf life.
- Tea description-only migration: total → product subtotal; shipping fee separately indicated. Applied to two exact options, prices unchanged.
- New image source mapping is restricted to OEM page and exact original URLs.
- Original assets retained for rollback.

## Verification

- npm run build: PASS
- node scripts/verify-oem-security.cjs: PASS, 94 paths; no submission/email
- node scripts/verify-oem-mail.cjs: PASS, mocks only
- Production visual verification: desktop and 390px mobile screenshots checked. All five replacement images loaded; no horizontal page overflow. Readable HTML notes verified under packaging/notice images.
- Tea 4-pack result verified on production: product subtotal 100,000 + shipping/packing 6,000 = 106,000 yen before tax; one-year shelf life, initial-free scope and gross-margin notes confirmed. No inquiry submitted or live email sent.

## Final image prompts

Built-in image generation/editing was used. Project assets: `public/images/btob/oem-hero-copy-v3.webp`, `oem-cases-copy-v3.webp`, `oem-first-order-offer-v3.webp`, `oem-notice-copy-v3.webp`, `oem-problems-copy-v3.webp` in the same directory.

### notice

Use case: text-localization. Edit target: supplied Japanese OEM notice infographic. Keep warm yellow green orange 2x2 illustration layout, apologetic woman, icons, professional legible bold Japanese. Preserve header and panel1 text unchanged. Panel2 heading「② 製造数量について」 illustration use「全数買い取り」instead of ±30個 and body「製造数量は多少前後します。完成した全数を買い取り、実際の数量で精算します。」 Remove ±30 from scale too. Panel3 heading「③ 既存商品のサンプル」 body「既存商品の無料配布はありません。ECでご購入ください。商品開発の試作は初回無料特典の対象です（2回まで）。」 Panel4 heading「④ キャンセル規定」 body exactly「契約後・資材手配前は3万円。資材手配後は、発生した実費をご負担いただきます。」 Remove ALL 100% text and replace red tag100% with「実費」. Existing contract30000 sign may remain. Do not imply 30000 plusactualcost. No extra terms or invented fees. All Japanese fully legible, no clipping, enlarge canvas if needed; portrait originalaspect.

### problems

Use case: text-localization. Edit target: supplied Japanese OEM manga LP. Preserve original manga characters, dark pain upper scene, bright factory lower scene and overall layout. Replace upper「最小ロットの地獄（10,000）」with「大量ロットの不安」. Bottom left replace「最小400個から」with「1ロット約400個」. Bottom center replace「パッケージも500枚〜（予備付）」with「包装500枚分込み」「400個分＋予備100枚」(2 lines). Bottom right replace「BTO見積もりで流れが明白」with「自動見積もりで流れが明確」. Phone heading「自動見積もり」 and steps「商品」「仕様」「概算」. Footer retain original tagline but add clearly readable note「※ラーメンは約400セット。お茶は専用プラン。」 near lotcaption or bottom. No other changes, preserve striking manga design and exact typography, no new claims.

Final notice follow-up: Use case: text-localization. Edit this exact notice infographic. ONLY change the small red circular sign in lower-left panel currently reading「無料サンプル」to「ECで購入」. Keep ALL other Japanese text, numbers, figures, panel layout, illustrations, colors and dimensions exactly unchanged. The sign must clearly read ECで購入, no 無料サンプル text anywhere.

### hero

Reference: C:/作業用/oem_btob/output/copy-audit-20260919/hero-original.jpg

Use case text-localization. Edit this exact Japanese food OEM LP image, preserve all photographs, real product packaging, woman, navy/gold style, medals and all other text exactly. Only replace the top middle text 「小ロット400個からの」 with 「1ロット約400個の」. Add a legible modest note below the headline block: 「※ラーメンは約400セット。お茶は専用プラン。」 Keep portrait aspect and original visual impact. Perfect Japanese text, no other changes, no new claims.

### cases

Reference: C:/作業用/oem_btob/output/copy-audit-20260919/cases-original.jpg

Use case text-localization. Edit exact three-row food OEM application image. Keep photographic people and products and three-row layout. Replace top black banner with 「農家：余剰農産物を活かした商品づくりへ」. Replace middle banner with 「農家・地域事業者：ふるさと納税向けの商品づくり」. Keep bottom 「道の駅・ホテル：オリジナル商品 → ここにしかない自社ブランド」. Add small but legible footer 「※返礼品の登録・販路紹介の代行は行っていません。」. Remove 「廃棄なし」 and 「自治体」 and 「ネタ」. Typography crisp large Japanese. Preserve original photographic style and aspect ratio.

### offer

Reference: C:/作業用/oem_btob/public/images/btob/oem-first-order-offer-v2.png

Use case text-localization. Edit this approved Japanese promotional image with minimal changes. Preserve exact composition, dark kitchen, gloved hand, gold heading, green checks, all prices 10000/5000/5000/30000 and total50000 to initial0, initialoncepercompany/person condition and extra trial3000. Change row 「栄養成分作成（計算値）」 to 「栄養成分表示作成（計算値）」 with enough width, may wrap row label to two lines, never truncate. Change table heading 「通常料金」 to 「通常料金（税別）」. Change extra trial line to 「追加試作は1回につき3,000円（税別）」. No other copy or imagery changes. Perfect legible Japanese text and all numbers.
