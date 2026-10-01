import { exportOemAccountantCsv } from '@/actions/oemDocuments'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const url = new URL(request.url)
  const result = await exportOemAccountantCsv(url.searchParams.get('from') || undefined, url.searchParams.get('to') || undefined)
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
  if (!result.success || !result.csv) return new Response(result.error || '出力できませんでした。', { status: result.status || 400, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
  return new Response(result.csv, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="oem-accountant.csv"' } })
}
