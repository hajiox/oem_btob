# OEM search-intent copy — 2026-09-19

- Scope: public OEM page only, gated by SAMPLE_PAGE_ID. No DB, BTO pricing, LP-builder, analytics or image changes.
- Expanded the explanation below the first image: Fukushima agricultural processing, farmers supplying ingredients, and businesses selling their own original foods.
- Added server-rendered FAQs before the estimate: supported products, lot quantities, tea-specific supply requirements, estimated pricing and shipping fee, limits on sales-channel assistance.
- Retained existing SEO metadata, canonical and social assets; avoided keyword stuffing or new ranking/price-superiority claims.
- Added responsive two-column/one-column explanatory copy with 17px body text and scoped CSS.
- Verification before deployment: production build/TypeScript passed, existing verify-oem-copy.cjs passed, git diff --check passed.
- Browser validation previously stopped because the Windows tool could not establish the current browser URL. Per user direction, deploy first and verify the production response without blocking on browser operation. Do not treat HTML checks as a visual mobile review.
