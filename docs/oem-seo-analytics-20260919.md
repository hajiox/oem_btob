# OEM SEO / Google setup — 2026-09-19

## Scope and production

- Only the OEM `/btob` metadata and tracking are overridden; the LP builder and other pages retain their settings.
- Search title: 福島の食品OEM・小ロット商品開発｜会津ブランド館.
- Replaced expired campaign metadata, provided absolute canonical/OG URL, H1, landscape OGP/X image and scoped brand favicon.
- `robots.txt` is plain text, `sitemap.xml` is XML with `/btob`. Unknown slugs now return 404 instead of a fallback LP.
- DB editable SEO fields synchronized only for page `35e7d402-0443-4703-94a4-fc2873b8f933` / `btob`. Local backup in `output/oem-seo-db-backup.json`; do not overwrite. Script `scripts/sync-oem-seo-metadata.cjs` supports dry run and `--apply`.

## Google

- Existing account: tsstaff (`175450821`). New isolated GA4 property: 会津ブランド館 食品OEM - GA4 (`555029617`).
- Stream: 会津ブランド館 OEM LP・BTO (`15806719797`), measurement ID `G-XMJ7H0X30R`.
- Production Vercel project `oem`, environment `NEXT_PUBLIC_OEM_GA_MEASUREMENT_ID` configured. No EC properties changed.
- Japan timezone / JPY. Food and drink, small OEM operating team. Goals: leads and traffic analysis.
- Enhanced measurement disabled to avoid automatic form collection and duplicated page views.
- Explicit consent required before loading GA. Rejection/revocation disables tracking. Advertising storage/signals/personalization disabled.
- Only canonical page/referrer without query strings or fragments. No contact details, free text, answers, quote amount or idempotency key is sent. Current implementation strips UTM query parameters too; use a reviewed campaign allowlist before campaign attribution is required.
- Events: `page_view`, `oem_select_product` (fixed product ID only), `oem_view_quote`, `oem_start_consultation`, `generate_lead` (server-confirmed success only).
- `generate_lead` registered as key event, once per event, no default monetary value. Event dedupe prevents retry inflation.
- Event and user retention: 14 months; reset on new activity disabled.
- Search Console URL-prefix property `https://oem.aizubrandhall.com/` verified with `public/google7ab12a6960fdc81b.html` (user manually downloaded file after browser restart). Keep verification file deployed.
- Sitemap submitted and successfully processed: 1 URL. `/btob` inspection showed discovered/not indexed; indexing request accepted and queued. This is not a guarantee of indexing or ranking.
- GA4/Search Console cross-service link explicitly approved by the user and created successfully on 2026-09-19. Verified link row: OEM URL-prefix property → stream 15806719797; UI status リンク作成済み.

## Verification

- Production HTTP: `/btob` 200, verification file 200 with exact content, robots text/plain 200, sitemap application/xml 200, missing test slug 404.
- Live HTML title/description/canonical/OG/X match the new copy. Explicit 1200x630 image. Root framework favicon remains for other pages; OEM scoped PNG appears last.
- Build and TypeScript passed. OEM security checks: 94 valid paths and mocked submit integration; no real submissions/email. OEM copy tests passed.
- Analytics standalone compilation plus Node tests: 4/4 including load race, revocation, dedupe, query removal, standard gtag queue and no form PII.
- Browser: before consent zero gtag scripts. After consent performed curry BTO to contact form, without entering or sending contact data.
- GA4 realtime received exactly one each: page_view, oem_select_product, oem_view_quote, oem_start_consultation (plus first_visit/session_start). Live generate_lead was intentionally not fabricated; server-success path tested with mocks.
- Desktop visual check passed, no horizontal overflow. Requested viewport override did not change existing Chrome tab (reported width 1920); reset it. Do not claim a fresh mobile visual test from this session.

## Social asset provenance

- Output: `public/images/btob/oem-social-v1.jpg` (1200x630); built-in image generation then Sharp size/format normalization. Logo icon resized from existing `rogo.jpg`.
- Source generated PNG: `C:/Users/ts/.codex/generated_images/019fc613-b464-7ca1-99a5-75bc0b3ff06c/exec-260fb522-aebe-4495-ad6f-b7a89d0f079d.png`.
- References: `public/images/btob/oem-hero-copy-v3.webp`, `public/images/btob/rogo.jpg`.
- Prompt: Create a landscape 1200x630 social share card for AIZU BRAND HALL Fukushima food OEM. Use existing hero product range and exact black-square logo as reference. Navy/gold/cream, left headline 「福島の食材を、」「オリジナル商品に。」 and subtitle 「小ロット食品OEM｜会津ブランド館」. Right warm tabletop with curry box, jars and dressing bottle. Exclude woman, ranking medals, numeric claims and campaigns. Generous padding; thumbnail readability. Existing package labels are generated illustration details, not documentary product photographs.

## References

- https://developers.google.com/analytics/devguides/collection/ga4/views
- https://developers.google.com/search/docs/appearance/title-link
