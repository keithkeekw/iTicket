// Quality Review module: finds tickets with its own filters (independent of the metadata QC run),
// runs the Ollama review and stores every result in SQLite.
import { getSettings } from './settings.js'
import {
  addRelated,
  createdFor,
  applyScoreEdit,
  commentCountsFor,
  deleteReview,
  getReview,
  setIgnored as setIgnoredFlags,
  ignoredFor,
  isIgnored,
  latestReviewsFor,
  listIgnored,
  listRelated,
  listReviews,
  countReviews,
  exportReviews,
  matchingReviewKeys,
  relatedCountsFor,
  saveReview,
  updateRelatedComment,
} from './db.js'
import { reviewTicket, scoreCategories } from './ollama.js'
import { describeRule, ignoreRules, matchingRule, withIgnoreRule } from './ignore-rules.js'
import { HARD_RULE_TEXT, createdBeforeCutoff, createdDates, rememberCreated, withHardRule } from './hard-rules.js'
import {
  TICKET_STATUSES,
  countSideConversations,
  dateFieldFor,
  getTicket,
  getTicketDetails,
  getUsers,
  listGroups,
  searchTickets,
  ticketUrl,
} from './zendesk.js'

const badRequest = message => Object.assign(new Error(message), { status: 400 })

// Re-review filter values (as in Saved reviews): 'needed' = re-opened in Zendesk since the review.
const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v])

// How many saved reviews match the filters, ignoring the re-review filter (which needs Zendesk).
export function countMatchingReviews(filters = {}) {
  const { rereview: _, limit: __, ...rest } = filters
  return { total: countReviews(rest) }
}

// Full saved reviews for Export CSV: every review matching the filters, with no cap, newest first.
// The re-review filter is applied here with the current Zendesk re-open counts, the same way the
// Saved reviews table applies it (re-opened since review = current count minus the count at review).
export async function exportMatchingReviews(filters = {}) {
  const { rereview, limit: _, ...rest } = filters
  let keys = matchingReviewKeys(rest)
  const wanted = asList(rereview).filter(v => v === 'needed' || v === 'not-needed')
  if (wanted.length === 1) {
    const { reopens } = await getTicketDetails([...new Set(keys.map(k => k.ticketId))])
    keys = keys.filter(k => {
      const current = reopens.get(k.ticketId)
      const needed = current != null && k.reopens != null && current - k.reopens > 0
      return (wanted[0] === 'needed') === needed
    })
  }
  return exportReviews(keys.map(k => k.id))
}

// Either explicit ticket ids, or a status/date search over the Quality Review groups from Settings.
export async function findTickets({ ids, from, to, statuses } = {}) {
  const { review } = getSettings()
  let tickets
  let details = null
  let window = null
  let useStatuses = null

  if (ids?.length) {
    const clean = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    if (!clean.length) throw badRequest('No valid ticket numbers given.')
    if (clean.length > 500) throw badRequest('Look up at most 500 ticket numbers at a time.')
    // One request per 100 tickets returns the tickets and their re-open counts together.
    details = await getTicketDetails(clean)
    tickets = [...details.tickets.values()]
    rememberCreated(tickets)
  } else {
    const requested = (statuses?.length ? statuses : review.statuses).filter(s => TICKET_STATUSES.includes(s))
    useStatuses = requested.length ? requested : ['solved']
    const today = new Date()
    window = {
      from: from || new Date(today.getTime() - review.lookbackDays * 86400000).toISOString().slice(0, 10),
      to: to || today.toISOString().slice(0, 10),
    }
    tickets = await searchTickets({
      groupIds: review.groupIds,
      statuses: useStatuses,
      from: window.from,
      to: window.to,
      limit: review.maxTickets,
    })
  }

  const ticketIds = tickets.map(t => t.id)
  const [users, groups, sideConversations, { reopens }] = await Promise.all([
    getUsers(tickets.map(t => t.assignee_id)),
    listGroups(),
    countSideConversations(ticketIds),
    details ?? getTicketDetails(ticketIds),
  ])
  const groupNames = new Map(groups.map(g => [g.id, g.name]))
  const latest = latestReviewsFor(ticketIds)
  const relatedCounts = relatedCountsFor(ticketIds)
  const commentCounts = commentCountsFor(ticketIds)
  const ignored = ignoredFor(ticketIds)
  const rules = ignoreRules()
  const created = new Map(tickets.map(t => [t.id, t.created_at]))

  return {
    window: window && { ...window, dateField: dateFieldFor(useStatuses) },
    statuses: useStatuses,
    truncated: !ids?.length && tickets.length >= review.maxTickets,
    tickets: tickets
      .map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        url: ticketUrl(t.id),
        group: groupNames.get(t.group_id) || '—',
        assignee: users.get(t.assignee_id) || '—',
        updatedAt: t.updated_at,
        createdAt: t.created_at,
        sideConversations: sideConversations.get(t.id) ?? null,
        reopens: reopens.get(t.id) ?? null,
        latestReview: latest.get(t.id) || null,
        relatedCount: relatedCounts.get(t.id) || 0,
        commentCount: commentCounts.get(t.id) || 0,
        ignored: ignored.has(t.id),
        ignoredAt: ignored.get(t.id) ?? null,
      }))
      // Subject keyword rules from Settings › Quality Review also ignore tickets.
      .map(t => withIgnoreRule(t, rules))
      // Hard rule: looked-up tickets created before 2026 are shown, but as ignored.
      .map(t => withHardRule(t, created.get(t.id)))
      .sort((a, b) => b.id - a.id),
  }
}

// ---------- Related tickets (Zendesk tickets and Jira issues) ----------

function jiraSite() {
  return (getSettings().jira?.siteUrl || '').trim().replace(/\/+$/, '')
}

// Link to open the related item: the Zendesk agent view, or the Jira issue on the configured site.
function withUrl(r) {
  if (r.kind === 'jira') return { ...r, url: jiraSite() ? `${jiraSite()}/browse/${r.ref}` : null }
  return { ...r, url: ticketUrl(r.ref) }
}

// "1674078", "#1674078" or a pasted Zendesk ticket URL → 1674078
function parseZendeskRef(input) {
  const s = String(input ?? '').trim()
  const match = s.match(/\/tickets\/(\d+)/) || s.match(/^#?\s*(\d+)$/)
  return match ? Number(match[1]) : null
}

// "tsd-1234", "TSD-1234" or a pasted Jira URL (…/browse/TSD-1234, …?selectedIssue=TSD-1234) → "TSD-1234"
function parseJiraKey(input) {
  const match = String(input ?? '').trim().match(/(?:^|[/=])([A-Za-z][A-Za-z0-9_]*-\d+)(?:$|[/?#&])/)
  return match ? match[1].toUpperCase() : null
}

export function getRelated(ticketId) {
  return listRelated(Number(ticketId)).map(withUrl)
}

// Zendesk tickets are checked in Zendesk (and their subject stored); Jira keys are checked for
// format only, since the app has no Jira credentials.
export async function linkRelated(ticketId, { kind = 'zendesk', ref, comment }) {
  const id = Number(ticketId)
  const note = String(comment ?? '').trim()

  if (kind === 'jira') {
    const key = parseJiraKey(ref)
    if (!key) throw badRequest('Enter a Jira issue key such as TSD-1234, or paste the Jira issue link.')
    if (!jiraSite()) throw badRequest('Set the Jira site URL on the Settings page first.')
    return withUrl(addRelated({ ticketId: id, kind, ref: key, title: null, comment: note }))
  }

  if (kind !== 'zendesk') throw badRequest('Choose Zendesk or Jira.')
  const relatedId = parseZendeskRef(ref)
  if (!relatedId) throw badRequest('Enter a Zendesk ticket number, or paste the Zendesk ticket link.')
  if (relatedId === id) throw badRequest('A ticket cannot be related to itself.')
  let related
  try {
    related = await getTicket(relatedId)
  } catch (err) {
    if (err.status === 404) throw badRequest(`Ticket #${relatedId} was not found in Zendesk.`)
    throw err
  }
  return withUrl(addRelated({ ticketId: id, kind, ref: String(relatedId), title: related.subject, comment: note }))
}

export function editRelatedComment(id, comment) {
  const updated = updateRelatedComment(Number(id), String(comment ?? '').trim())
  if (!updated) throw Object.assign(new Error('Related ticket not found.'), { status: 404 })
  return withUrl(updated)
}

export async function runAndSaveReview(ticketId) {
  const id = Number(ticketId)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid ticket number.')
  // Ignored tickets are never reviewed, whichever route asks (single, batch or re-review).
  if (isIgnored(id)) throw Object.assign(new Error(`Ticket #${id} is ignored. Unignore it to review it.`), { status: 409 })
  // Checked before the AI runs (one Zendesk request): the pre-2026 hard rule, then subject rules.
  const current = await getTicket(id)
  rememberCreated([current])
  if (createdBeforeCutoff(current.created_at)) {
    throw Object.assign(new Error(`Ticket #${id} was created before 2026 and is ignored (hard rule).`), { status: 409 })
  }
  const rules = ignoreRules()
  if (rules.length) {
    const rule = matchingRule(current.subject, rules)
    if (rule) {
      throw Object.assign(
        new Error(`Ticket #${id} is ignored by a Settings rule (${describeRule(rule)}). Change the rule to review it.`),
        { status: 409 },
      )
    }
  }
  const result = await reviewTicket(id)
  const { ticket, ...review } = result
  return saveReview(review, { ...ticket, instructions: getSettings().ollama.prompt })
}

// Re-reviews the ticket of a saved review and replaces that review with the new one. The old
// record is deleted only after the new review has been saved, so a failed review keeps it.
// Returns { replacedId, review } where review is the new row in Saved reviews list shape.
export async function rereviewAndReplace(reviewId) {
  const old = getReview(Number(reviewId))
  if (!old) throw Object.assign(new Error('Review not found.'), { status: 404 })
  const saved = await runAndSaveReview(old.ticketId)
  deleteReview(old.id)
  return { replacedId: old.id, review: hardRuleRow(withIgnoreRule(listReviews({ ids: [saved.id] })[0])), result: saved.result }
}

const MIN_JUSTIFICATION = 10

// Manually changes category scores of a saved review. A justification is mandatory; weighted
// scores, total and rating are recalculated exactly as for AI scores, and the change is logged.
// `scores` is { categoryName: newScore }. Returns the updated list row, scorecard and edit log.
export function editReviewScores(reviewId, { scores, justification }) {
  const review = getReview(Number(reviewId))
  if (!review) throw Object.assign(new Error('Review not found.'), { status: 404 })
  const why = String(justification ?? '').trim()
  if (why.length < MIN_JUSTIFICATION) {
    throw badRequest(`Explain why the score is changing (at least ${MIN_JUSTIFICATION} characters).`)
  }
  const categories = review.result?.tqr?.categories
  if (!categories?.length) throw badRequest('This review has no category scores to edit.')

  const changes = []
  const updated = categories.map(c => {
    if (!(c.name in (scores || {}))) return c
    const to = Number(scores[c.name])
    if (!Number.isInteger(to) || to < 1 || to > 5) throw badRequest(`Score for "${c.name}" must be a whole number from 1 to 5.`)
    if (to !== c.score) changes.push({ name: c.name, from: c.score, to })
    return { ...c, score: to }
  })
  if (!changes.length) throw badRequest('No score was changed.')

  const tqr = scoreCategories(updated)
  const result = { ...review.result, tqr }
  applyScoreEdit(review.id, {
    result,
    total: tqr.total,
    rating: tqr.rating,
    justification: why,
    changes,
    totalBefore: review.total,
    ratingBefore: review.rating,
  })
  const saved = getReview(review.id)
  return { review: hardRuleRow(withIgnoreRule(listReviews({ ids: [review.id] })[0])), result: saved.result, edits: saved.edits }
}

// Ignore / unignore tickets for Quality Review. Returns how many changed and the current state.
export function setTicketsIgnored({ ids, ignored }) {
  const clean = [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
  if (!clean.length) throw badRequest('Select at least one ticket.')
  const changed = setIgnoredFlags(clean, Boolean(ignored))
  const now = ignoredFor(clean)
  return { changed, tickets: clean.map(id => ({ id, ignored: now.has(id), ignoredAt: now.get(id) ?? null })) }
}

// Every ignored ticket for the "Ignored tickets" tab: tickets flagged Ignore by hand, plus tickets
// in Saved reviews whose subject matches an auto-ignore rule. (Rule-matched tickets that were never
// reviewed are not known to the app until a search finds them, so they are not listed.)
// Current subject, status, group and assignee come from Zendesk; if Zendesk can't be reached the
// details saved with the latest review are used and `zendeskError` says why.
export async function listIgnoredTickets() {
  const manual = new Map(listIgnored().map(r => [r.ticketId, r.ignoredAt]))
  const rules = ignoreRules()
  const latest = new Map()
  for (const r of listReviews({ latestOnly: true, limit: 100000 })) if (!latest.has(r.ticketId)) latest.set(r.ticketId, r)

  // Creation dates for every reviewed ticket (cached after the first time) for the pre-2026 hard rule.
  const created = await createdDates([...latest.keys(), ...manual.keys()])
  const ids = [...new Set([
    ...manual.keys(),
    ...(rules.length ? [...latest.values()].filter(r => matchingRule(r.subject, rules)).map(r => r.ticketId) : []),
    ...[...latest.keys()].filter(id => createdBeforeCutoff(created.get(id))),
  ])]
  if (!ids.length) return { tickets: [], rules: rules.length, zendeskError: null }

  let current = new Map()
  let groupNames = new Map()
  let users = new Map()
  let zendeskError = null
  try {
    const { tickets } = await getTicketDetails(ids)
    current = tickets
    const [groups, names] = await Promise.all([listGroups(), getUsers([...tickets.values()].map(t => t.assignee_id))])
    groupNames = new Map(groups.map(g => [g.id, g.name]))
    users = names
  } catch (err) {
    console.warn(`Ignored tickets: Zendesk details unavailable: ${err.message}`)
    zendeskError = err.message
  }

  const tickets = ids.map(id => {
    const t = current.get(id)
    const review = latest.get(id) || null
    const subject = t?.subject ?? review?.subject ?? null
    const rule = matchingRule(review?.subject, rules) || matchingRule(t?.subject, rules)
    return {
      id,
      url: ticketUrl(id),
      subject,
      status: t?.status ?? review?.ticketStatus ?? null,
      group: t ? groupNames.get(t.group_id) || '—' : review?.group || '—',
      assignee: t ? users.get(t.assignee_id) || '—' : review?.assigneeName || '—',
      // Zendesk didn't return it (deleted, or not reachable).
      missing: !t && !zendeskError,
      ignoredManually: manual.has(id),
      ignoredAt: manual.get(id) ?? null,
      ignoreRule: rule ? describeRule(rule) : null,
      oldTicket: createdBeforeCutoff(t?.created_at ?? created.get(id)),
      createdAt: t?.created_at ?? created.get(id) ?? null,
      latestReview: review && { id: review.id, reviewedAt: review.reviewedAt, total: review.total, rating: review.rating },
    }
  })
  return { tickets, rules: rules.length, zendeskError }
}

// Saved-review row with the pre-2026 hard rule applied from the cached creation date.
function hardRuleRow(row) {
  return row ? withHardRule(row, createdFor([row.ticketId]).get(row.ticketId)) : row
}

// Saved reviews list with subject rules and the pre-2026 hard rule applied.
export async function listReviewsWithRules(query) {
  const rules = ignoreRules()
  const rows = listReviews(query).map(row => withIgnoreRule(row, rules))
  const created = await createdDates(rows.map(row => row.ticketId))
  return rows.map(row => withHardRule(row, created.get(row.ticketId)))
}

export { HARD_RULE_TEXT }
