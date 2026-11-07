// Hard rule: tickets created before 2026 are ignored entirely. They are left out of Quality Review
// and Metadata QC searches, can't be reviewed or re-reviewed, and are flagged as ignored wherever
// they still appear (ticket lookups, Saved reviews, Ignored tickets). Not configurable.
import { createdFor, saveCreated } from './db.js'
import { getTicketDetails } from './zendesk.js'

export const CREATED_CUTOFF = '2026-01-01'
const CUTOFF_MS = Date.parse(`${CREATED_CUTOFF}T00:00:00Z`)
export const HARD_RULE_TEXT = 'Created before 2026 (hard rule)'

// True when the ticket was created before 1 Jan 2026 (UTC). Unknown dates are not ignored.
export const createdBeforeCutoff = createdAt => Boolean(createdAt) && Date.parse(createdAt) < CUTOFF_MS

// Stores creation dates from Zendesk ticket objects already fetched (no extra request).
export function rememberCreated(tickets) {
  saveCreated([...tickets].filter(t => t?.id && t.created_at).map(t => [t.id, t.created_at]))
}

// Map ticketId -> created_at, from the cache, fetching the missing ones from Zendesk (100 per
// request). If Zendesk can't be reached the missing ones are simply left out.
export async function createdDates(ticketIds) {
  const ids = [...new Set(ticketIds.map(Number).filter(n => Number.isInteger(n) && n > 0))]
  const known = createdFor(ids)
  const missing = ids.filter(id => !known.has(id))
  if (missing.length) {
    try {
      const { tickets } = await getTicketDetails(missing)
      rememberCreated(tickets.values())
      for (const t of tickets.values()) if (t.created_at) known.set(t.id, t.created_at)
    } catch (err) {
      console.warn(`Ticket creation dates unavailable: ${err.message}`)
    }
  }
  return known
}

// Adds the hard rule to a ticket or review row already carrying ignore state (see ignore-rules.js):
// a pre-2026 ticket is ignored, with the hard rule listed first in `ignoreRule`.
export function withHardRule(row, createdAt) {
  if (!createdBeforeCutoff(createdAt)) return { ...row, createdAt: createdAt ?? null, oldTicket: false }
  return {
    ...row,
    createdAt,
    oldTicket: true,
    ignored: true,
    ignoreRule: row.ignoreRule ? `${HARD_RULE_TEXT}; ${row.ignoreRule}` : HARD_RULE_TEXT,
  }
}
