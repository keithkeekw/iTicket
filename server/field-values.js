// Current Zendesk custom field values of reviewed tickets, for the Quality Review › Categories tab
// (average rubric scores grouped by a Zendesk field such as Category or Topic). Values are read
// live from Zendesk (100 tickets per request) and kept for a few minutes, so switching between
// fields or reloading the tab doesn't fetch them again.
import { getTicketDetails } from './zendesk.js'

const TTL_MS = 5 * 60 * 1000
const MAX_TICKETS = 5000
const cache = new Map() // ticketId -> { fields: { [fieldId]: value }, at }

const badRequest = message => Object.assign(new Error(message), { status: 400 })

// { values: { [ticketId]: { [fieldId]: value } }, missing: [ticketId] } with only the fields that
// have a value. `missing` lists tickets Zendesk didn't return (e.g. deleted).
export async function ticketFieldValues(rawIds) {
  const ids = [...new Set((rawIds || []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
  if (ids.length > MAX_TICKETS) throw badRequest(`At most ${MAX_TICKETS} tickets at a time.`)

  const now = Date.now()
  const stale = ids.filter(id => !(cache.get(id)?.at > now - TTL_MS))
  if (stale.length) {
    const { tickets } = await getTicketDetails(stale)
    for (const t of tickets.values()) {
      const fields = {}
      for (const f of t.custom_fields || []) {
        const empty = f.value == null || f.value === '' || (Array.isArray(f.value) && !f.value.length)
        if (!empty) fields[f.id] = f.value
      }
      cache.set(t.id, { fields, at: now })
    }
  }

  const values = {}
  const missing = []
  for (const id of ids) {
    const hit = cache.get(id)
    if (hit) values[id] = hit.fields
    else missing.push(id)
  }
  return { values, missing }
}
