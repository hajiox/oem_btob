export const OEM_ACCOUNTING_PAGE = '35e7d402-0443-4703-94a4-fc2873b8f933'

function calendarDate(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日付はYYYY-MM-DDで入力してください。')
  const time = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('実在する日付を入力してください。')
  return value
}

export function accountantDateRange(from?: string, to?: string) {
  const start = calendarDate(from), end = calendarDate(to)
  if (start && end && start > end) throw new Error('終了日は開始日以降にしてください。')
  // Business days are Japan-local. The end is inclusive, expressed as the next midnight.
  const until = end ? new Date(Date.parse(`${end}T00:00:00+09:00`) + 86400000).toISOString() : undefined
  return { start, end, since: start ? new Date(`${start}T00:00:00+09:00`).toISOString() : undefined, until }
}

export function accountantCsvCell(value: unknown) {
  const text = String(value ?? '')
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function accountantCsv(rows: unknown[][]) {
  return '\uFEFF' + rows.map(row => row.map(accountantCsvCell).join(',')).join('\r\n') + '\r\n'
}
