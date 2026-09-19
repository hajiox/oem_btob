export const OEM_QUOTE_PAGE_ID = '35e7d402-0443-4703-94a4-fc2873b8f933'

// One charge per order, outside unit/quantity and percentage calculations.
export function oemShippingPackingFee(pageId: string, productId: string | null): number {
    return pageId === OEM_QUOTE_PAGE_ID && productId ? 6_000 : 0
}
