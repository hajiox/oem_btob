// Presentation-only mapping for the Fukushima OEM page. Never alters quote values or CMS records.
export const SAMPLE_PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'
const optionSamples: Record<string, string> = {
  '08a2075a-2866-4af8-a824-fafb9ccf8c0c': 'curry-bulk',
  '42925883-7e17-45a6-b688-aeb69567852c': 'curry-box',
  '08a2075a-2866-4af8-a824-fafb9ccfc070': 'curry-pp',
  'f3b2d8d9-a8b4-49de-9d7c-9a54618aa15d': 'ramen-bag',
  'b12c7c2f-344c-451b-b427-4b6d27cca002': 'ramen-box',
  'b2026091-6000-4000-8000-000000000102': 'furikake-jar',
  'b2026091-6000-4000-8000-000000000103': 'furikake-small',
  'b2026091-6000-4000-8000-000000000104': 'furikake-bag',
  'b2026091-6000-4000-8000-000000000222': 'sauce-square',
  'b2026091-6000-4000-8000-000000000223': 'sauce-round',
  'b2026091-6000-4000-8000-000000000224': 'sauce-pouch',
}
const productSamples: Record<string, string> = {
  'c0000001-0000-0000-0000-000000000001': 'curry-box',
  'c0000001-0000-0000-0000-000000000002': 'ramen-bag',
  'c0000001-0000-0000-0000-000000000003': 'furikake-jar',
  'c0000001-0000-0000-0000-000000000004': 'sauce-square',
}
export function packageSamplePhoto(pageId: string, id: string, fallback: string | null | undefined) {
  const sample = pageId === SAMPLE_PAGE_ID ? optionSamples[id] || productSamples[id] : undefined
  return sample ? `/images/package-samples/${sample}-photo.webp` : fallback
}
