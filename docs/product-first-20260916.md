# Product-first BTO / 2026-09-16

- Only Fukushima OEM page starts at product selection (internal screen 1). Other LP forms retain quantity entry.
- Quantity remains 400 internally. Product cards retain fixed-lot descriptions; ramen is 400 two-serving sets.
- Removed quantity from visual progress and guarded backward navigation at product selection.
- Mobile product cards use two columns and square photos; packaging choices retain existing layout.
- Pricing, DB, form branching and submission payload unchanged.
- Build passed. UI regression script covers initial product images, absence of quantity fields, backward navigation and existing quote totals on desktop/mobile. No leads submitted.
