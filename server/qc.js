// Metadata completeness check for a batch of tickets.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, getSettings } from './settings.js'
import { applicabilityFor, loadFormRules } from './forms.js'
import { getReview, latestReviewsFor } from './db.js'
import {
  TICKET_STATUSES,
  countSideConversations,
  dateFieldFor,
  getTicketDetails,
  getTicket,
  getUsers,
  listGroups,
  listTicketFields,
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

// Allowed values for the standard ticket properties that have a fixed list.
const SYSTEM_OPTIONS = {
  type: ['question', 'incident', 'problem', 'task'],
  priority: ['low', 'normal', 'high', 'urgent'],
}
const titleCase = v => String(v).charAt(0).toUpperCase() + String(v).slice(1)

// One ticket's required fields for the Metadata QC row details: whether each is filled, its
// current value, the values Zendesk allows, and the AI's suggested value from the ticket's latest
// Quality Review when there is one. The ticket is read fresh from Zendesk.
export async function ticketFieldDetails(rawId) {
  const ticketId = Number(rawId)
  if (!Number.isInteger(ticketId) || ticketId <= 0) throw Object.assign(new Error('Unknown ticket.'), { status: 400 })
  const { qc } = getSettings()
  const [ticket, zdFields, groups, check] = await Promise.all([getTicket(ticketId), listTicketFields(), listGroups(), ticketChecker()])
  const { missing, notApplicable } = check(ticket)
  const fieldsById = new Map(zdFields.map(f => [f.id, f]))
  const latest = latestReviewsFor([ticketId]).get(ticketId)
  const suggestions = latest ? getReview(latest.id)?.result?.suggestions || [] : []

  const fields = qc.requiredFields.map(f => {
    const zd = f.kind === 'custom' ? fieldsById.get(Number(f.id)) : null
    let options = null
    if (zd?.options?.length) options = zd.options.map(o => ({ value: o.value, name: o.name }))
    else if (zd?.type === 'checkbox') options = [{ value: true, name: 'Ticked' }, { value: false, name: 'Not ticked' }]
    else if (SYSTEM_OPTIONS[f.key]) options = SYSTEM_OPTIONS[f.key].map(v => ({ value: v, name: titleCase(v) }))
    else if (f.key === 'group_id') options = groups.map(g => ({ value: g.id, name: g.name }))

    const raw = fieldValue(ticket, f)
    // Matches a stored value, or a display name (the AI sometimes suggests the name).
    const findOption = v =>
      options?.find(o => String(o.value) === String(v)) ||
      options?.find(o => String(o.name).toLowerCase() === String(v).toLowerCase())
    const nameOf = v => findOption(v)?.name ?? v
    let current = null
    if (Array.isArray(raw)) current = raw.length ? raw.map(nameOf).join(', ') : null
    else if (raw !== null && raw !== undefined && raw !== '') current = String(nameOf(raw))
    const sg = suggestions.find(x => x.key === f.key)
    return {
      key: f.key,
      label: f.label,
      type: zd?.type || (SYSTEM_OPTIONS[f.key] ? 'dropdown' : f.key),
      state: notApplicable.includes(f.key) ? 'not-applicable' : missing.includes(f.key) ? 'missing' : 'set',
      current,
      options,
      suggestion: sg
        ? {
            value: findOption(sg.suggested_value)?.value ?? sg.suggested_value,
            name: nameOf(sg.suggested_value),
            confidence: sg.confidence,
            reason: sg.reason,
          }
        : null,
    }
  })
  return { ticketId, reviewedAt: latest?.reviewedAt ?? null, fields }
}
