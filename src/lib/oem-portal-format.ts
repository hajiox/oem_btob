// SQL DATE values are Japanese business dates, not server-local timestamps.
export function portalDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—'
  const instant = new Date(`${value}T00:00:00+09:00`)
  if (Number.isNaN(instant.getTime())) return '—'
  return instant.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export function portalTimestampDate(value: string): string {
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? '—' : instant.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
}
