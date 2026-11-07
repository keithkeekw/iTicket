// Metadata completeness check for a batch of tickets.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, getSettings } from './settings.js'
import { applicabilityFor, loadFormRules } from './forms.js'
import { latestReviewsFor } from './db.js'
import {
  TICKET_STATUSES,
  countSideConversations,
  dateFieldFor,
  getTicketDetails,
  getUsers,
  listGroups,
  searchTickets,
  ticketUrl,
} from './zendesk.js'

// Standard ticket properties that can be required (custom fields come from Zendesk).
export const SYSTEM_FIELDS = [
  { key: 'subject', label: 'Subject' },
  { key: 'type', label: 'Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee_id', label: 'Assignee' },
  { key: 'group_id', label: 'Group' },
  { key: 'organization_id', label: 'Organization' },
  { key: 'tags', label: 'Tags' },
]

const LAST_RUN_FILE = path.join(DATA_DIR, 'last-run.json')

function isEmpty(value, emptyValues) {
  if (value === null || value === undefined || value === false) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    return v === '' || emptyValues.includes(v)
  }
  return false
}

export function fieldValue(ticket, field) {
  if (field.kind === 'custom') {
    return ticket.custom_fields?.find(cf => cf.id === Number(field.id))?.value ?? null
  }
  return ticket[field.key]
}

// `applies(field)` says whether the field is shown on this ticket's form; fields that
// don't apply are reported separately instead of counting as missing.
export function checkTicket(ticket, requiredFields, emptyValues, applies = () => true) {
  const empties = emptyValues.map(v => v.trim().toLowerCase())
  const missing = []
  const notApplicable = []
  for (const field of requiredFields) {
    if (!applies(field)) notApplicable.push(field.key)
    else if (isEmpty(fieldValue(ticket, field), empties)) missing.push(field.key)
  }
  return { missing, notApplicable }
}

export async function ticketChecker() {
  const { qc } = getSettings()
  const rules = qc.followFormConditions ? await loadFormRules() : null
  return ticket =>
    checkTicket(ticket, qc.requiredFields, qc.emptyValues, rules ? applicabilityFor(ticket, rules) : undefined)
}

export async function runQc({ from, to, statuses } = {}) {
  const { qc } = getSettings()
  if (!qc.requiredFields.length) {
    throw Object.assign(new Error('No required fields configured. Pick some on the Settings page.'), { status: 400 })
  }
  const today = new Date()
  const defaultFrom = new Date(today.getTime() - qc.lookbackDays * 86400000)
  const window = {
    from: from || defaultFrom.toISOString().slice(0, 10),
    to: to || today.toISOString().slice(0, 10),
  }

  const requested = (statuses?.length ? statuses : qc.statuses).filter(s => TICKET_STATUSES.includes(s))
  const useStatuses = requested.length ? requested : ['solved']

  const tickets = await searchTickets({
    groupIds: qc.groupIds,
    statuses: useStatuses,
    from: window.from,
    to: window.to,
    limit: qc.maxTickets,
  })

  const [{ updaters, reopens }, groups, check, sideConversations] = await Promise.all([
    getTicketDetails(tickets.map(t => t.id)),
    listGroups(),
    ticketChecker(),
    countSideConversations(tickets.map(t => t.id)),
  ])
  const users = await getUsers([...tickets.map(t => t.assignee_id), ...updaters.values()].filter(id => id > 0))
  const updaterName = id => (id === -1 ? 'Zendesk (system)' : users.get(id) || (id ? String(id) : '—'))
  const groupNames = new Map(groups.map(g => [g.id, g.name]))
  // Re-open count at each ticket's latest Quality Review, to flag re-opens since that review.
  const latestReviews = latestReviewsFor(tickets.map(t => t.id))

  const results = tickets
    .map(t => {
      const { missing, notApplicable } = check(t)
      return {
        id: t.id,
        subject: t.subject,
        // null when the lookup failed, so the UI can tell "none" from "unknown".
        sideConversations: sideConversations.get(t.id) ?? null,
        reopens: reopens.get(t.id) ?? null,
        reviewedReopens: latestReviews.get(t.id)?.reopens ?? null,
        reviewedAt: latestReviews.get(t.id)?.reviewedAt ?? null,
        status: t.status,
        url: ticketUrl(t.id),
        group: groupNames.get(t.group_id) || (t.group_id ? String(t.group_id) : '—'),
        lastUpdatedBy: updaterName(updaters.get(t.id)),
        assignee: users.get(t.assignee_id) || '—',
        updatedAt: t.updated_at,
        missing,
        notApplicable,
        pass: missing.length === 0,
      }
    })
    .sort((a, b) => Number(a.pass) - Number(b.pass) || b.id - a.id)

  const failed = results.filter(r => !r.pass).length
  const missingByField = Object.fromEntries(qc.requiredFields.map(f => [f.key, 0]))
  const notApplicableByField = Object.fromEntries(qc.requiredFields.map(f => [f.key, 0]))
  for (const r of results) {
    for (const k of r.missing) missingByField[k]++
    for (const k of r.notApplicable) notApplicableByField[k]++
  }

  const run = {
    ranAt: new Date().toISOString(),
    window: { ...window, dateField: dateFieldFor(useStatuses) },
    statuses: useStatuses,
    groupIds: qc.groupIds,
    fields: qc.requiredFields.map(f => ({ key: f.key, label: f.label })),
    truncated: tickets.length >= qc.maxTickets,
    followFormConditions: qc.followFormConditions,
    summary: {
      total: results.length,
      passed: results.length - failed,
      failed,
      missingByField,
      notApplicableByField,
    },
    results,
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(run))
  return run
}

export function lastRun() {
  if (!fs.existsSync(LAST_RUN_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'))
  } catch {
    return null
  }
}
