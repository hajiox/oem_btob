# Packaging samples / 2026-09-16

- Scope: only page 35e7d402-0443-4703-94a4-fc2873b8f933 (/btob). No database, quote arithmetic, routing, admin/CMS or authentication changes.
- Added 14-card illustration carousel after first LP image; swipe, arrows, keyboard; respects reduced motion.
- BTO product/packaging images map by stable IDs to photographic AI samples. Explicitly marked as generated samples, not real photos or a scale comparison.
- Bulk curry is label-free in both assets. Small furikake uses the same jar scaled down, explicitly approved by user. Tea uses corrected gloss coated paper + separate vertical band.
- Jar and tea photo examples shown separately as individual-consultation items; not silently enabled as quote options.
- Original generated PNGs preserved in output; production WebP assets in public/images/package-samples. output excluded from Vercel uploads.
- Rollback: revert this presentation commit. DB untouched; old /images/bto assets preserved.
- Validation: TypeScript/build, gallery desktop/mobile interaction/image/overflow checks; BTO existing 10 scenarios on desktop/mobile. No enquiry submitted.
