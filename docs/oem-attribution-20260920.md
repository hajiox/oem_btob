# OEM attribution / product funnel — 2026-09-20

## Implementation
- Canonical OEM page only. Existing explicit consent, no advertising signals, and query-free page_location are preserved.
- All four funnel events carry fixed product_id and human-readable product_name. IDs/names come only from the six-item catalogue, never form text. Each event is deduplicated per product per page runtime, so comparing products remains visible.
- generate_lead still fires only after submitLead returns success. No artificial production inquiries or emails are sent during tests.
- Actions after consent but before tag readiness are buffered in memory, then flushed; withdrawal discards pending events. Pre-consent actions are not replayed.
- Reviewed UTM labels map to Google's campaign_source / campaign_medium / campaign_name / campaign_content configuration. Arbitrary URL queries, utm_term, contact data and click IDs are not forwarded. Missing/invalid source or medium leaves normal referrer attribution unchanged.

## Links for future placement (no ads launched)
- Instagram profile: https://oem.aizubrandhall.com/btob?utm_source=instagram&utm_medium=social&utm_campaign=oem_fukushima&utm_content=profile
- X post: https://oem.aizubrandhall.com/btob?utm_source=x&utm_medium=social&utm_campaign=oem_fukushima&utm_content=post
- Google search ad: https://oem.aizubrandhall.com/btob?utm_source=google&utm_medium=cpc&utm_campaign=oem_fukushima&utm_content=text_ad
- Campaigns: oem_fukushima, oem_curry, oem_ramen, oem_furikake, oem_sauce, oem_jar, oem_tea. oem_tracking_test is reserved for QA.
- Full reviewed label list: OEM_CAMPAIGN_VALUES in src/lib/oem-analytics.ts. Add new non-personal labels there before using new campaigns. Existing untagged links are not retroactively attributed.

## GA4 reporting setup — outstanding
Target ONLY property 555029617 (OEM), stream G-XMJ7H0X30R. Existing generate_lead key event is documented in oem-seo-analytics-20260919.md; do not alter EC properties.
- Inspect existing custom definitions first, then create event-scoped product_id and product_name definitions if absent.
- Product funnel: oem_select_product → oem_view_quote → oem_start_consultation → generate_lead, broken down by product_name. Use users, not raw event counts, for conversion rate; a person may compare multiple products.
- Source comparison: session source/medium and session campaign, with product_name and successful leads. Do not sum per-product users as unique overall users.
- Confirm incoming event parameters and standard campaign attribution with oem_tracking_test; avoid fabricated successful leads. Validate submit-success tracking using mocks.
- Ordinary Windows Computer Use was stopped by URL policy detection. No switch to a different browser tool was made to bypass that stop. GA4 custom definitions and live receiving verification remain pending.

## Verification
- Standalone TypeScript compile / Node tests: 5 passed, covering six products, all success/start events, invalid IDs, UTM allowlist/duplicates, consent and dedupe, PII exclusion.
- Next.js production build passed. Existing middleware deprecation warning remains unrelated.
- Source: https://developers.google.com/analytics/devguides/collection/ga4/reference/config (campaign-prefixed configuration fields).
