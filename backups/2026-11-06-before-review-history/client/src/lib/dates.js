// Date helpers. The app shows dates as dd/mm/yyyy regardless of the browser's language,
// while values sent to the server stay as ISO YYYY-MM-DD strings.

const pad = n => String(n).padStart(2, '0')

// YYYY-MM-DD in the viewer's local time zone (toISOString would give the UTC date).
export const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Local-midnight Date for a YYYY-MM-DD string (new Date('YYYY-MM-DD') would parse it as UTC).
export const parseIsoDay = s => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Default date range for the ticket searches: yesterday, local time.
export const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return isoDay(d)
}

// dd/mm/yyyy from a Date, an ISO timestamp, or a YYYY-MM-DD string.
export function formatDate(value) {
  if (!value) return ''
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseIsoDay(value) : new Date(value)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

// dd/mm/yyyy, h:mm am/pm in local time.
export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${formatDate(d)}, ${time}`
}
