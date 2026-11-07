// Thin Zendesk REST client with 429 back-off and cursor paging. Signs in with either an agent
// email + API token, or OAuth client credentials (Settings › Zendesk API › Sign-in method).
import crypto from 'node:crypto'
import { getSettings } from './settings.js'
import { CREATED_CUTOFF, createdBeforeCutoff, rememberCreated } from './hard-rules.js'

export class ZendeskError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function baseUrl(cfg) {
  const sub = cfg.subdomain.trim().replace(/^https?:\/\//, '').replace(/\.zendesk\.com.*$/, '')
  return `https://${sub}.zendesk.com`
}

const useOAuth = cfg => cfg.authMethod === 'oauth'

function checkConfig(cfg) {
  const missing = useOAuth(cfg)
    ? !cfg.subdomain || !cfg.clientId || !cfg.clientSecret
    : !cfg.subdomain || !cfg.email || !cfg.token
  if (missing) {
    throw new ZendeskError(
      useOAuth(cfg)
        ? 'Zendesk subdomain, OAuth client identifier and secret must be set on the Settings page.'
        : 'Zendesk subdomain, email and API token must be set on the Settings page.',
      400,
    )
  }
}

// ---------- OAuth client credentials ----------
// Access tokens are requested from /oauth/tokens and reused until shortly before they expire.
// Client credentials issue no refresh token: a new access token is simply requested.
const oauthTokens = new Map() // cache key -> { token, expiresAt } or { pending }
const DEFAULT_TOKEN_SECONDS = 30 * 60 // Zendesk's default access token lifetime
const EXPIRY_MARGIN_MS = 60 * 1000

const oauthKey = cfg =>
  crypto
    .createHash('sha256')
    .update([baseUrl(cfg), cfg.clientId.trim(), cfg.clientSecret.trim(), (cfg.scope || 'read').trim()].join('\n'))
    .digest('hex')

async function requestOAuthToken(cfg) {
  const res = await fetch(`${baseUrl(cfg)}/oauth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: cfg.clientId.trim(),
      client_secret: cfg.clientSecret.trim(),
      scope: (cfg.scope || 'read').trim(),
    }),
    signal: AbortSignal.timeout(20000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.description || body.error || `HTTP ${res.status}`
    throw new ZendeskError(`Zendesk OAuth sign-in failed: ${detail}`, res.status === 400 ? 401 : res.status || 401)
  }
  const seconds = Number(body.expires_in) || DEFAULT_TOKEN_SECONDS
  return { token: body.access_token, expiresAt: Date.now() + seconds * 1000 - EXPIRY_MARGIN_MS }
}

async function oauthToken(cfg) {
  const key = oauthKey(cfg)
  const cached = oauthTokens.get(key)
  if (cached?.pending) return (await cached.pending).token
  if (cached && cached.expiresAt > Date.now()) return cached.token
  // One request at a time per client, even when many Zendesk calls start together.
  const pending = requestOAuthToken(cfg)
  oauthTokens.set(key, { pending })
  try {
    const fresh = await pending
    oauthTokens.set(key, fresh)
    return fresh.token
  } catch (err) {
    oauthTokens.delete(key)
    throw err
  }
}

const forgetOAuthToken = cfg => oauthTokens.delete(oauthKey(cfg))

// Authorization header for the chosen sign-in method.
export async function authHeader(cfg = getSettings().zendesk) {
  checkConfig(cfg)
  if (useOAuth(cfg)) return `Bearer ${await oauthToken(cfg)}`
  return 'Basic ' + Buffer.from(`${cfg.email.trim()}/token:${cfg.token.trim()}`).toString('base64')
}

export async function zdGet(pathOrUrl, cfg = getSettings().zendesk) {
  checkConfig(cfg)
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : baseUrl(cfg) + pathOrUrl
  let renewed = false
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: await authHeader(cfg), Accept: 'application/json' },
    })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 10
      await new Promise(r => setTimeout(r, wait * 1000))
      continue
    }
    if (!res.ok) {
      let body = null
      try {
        body = await res.json()
      } catch {
        /* non-JSON error body */
      }
      // An expired or revoked OAuth access token: get a new one and try once more. Other 401s
      // are scope or permission problems that a new token won't fix.
      if (res.status === 401 && useOAuth(cfg) && !renewed && body?.error === 'invalid_token') {
        forgetOAuthToken(cfg)
        renewed = true
        continue
      }
      const detail = body ? body.error?.message || body.error_description || body.error || body.description || JSON.stringify(body) : ''
      const hint =
        res.status === 403 && useOAuth(cfg) ? ' (check the OAuth client’s allowed scopes include read access)' : ''
      throw new ZendeskError(`Zendesk ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}${hint}`, res.status)
    }
    return res.json()
  }
  throw new ZendeskError('Zendesk rate limit: gave up after repeated 429 responses.', 429)
}

// Follows cursor pagination (links.next / meta.has_more) and collects `key` from each page.
async function getAllPages(firstPath, key, cfg, limit = Infinity) {
  const items = []
  let next = firstPath
  while (next && items.length < limit) {
    const page = await zdGet(next, cfg)
    items.push(...(page[key] || []))
    next = page.meta?.has_more ? page.links?.next : null
  }
  return items.slice(0, limit)
}

export async function testConnection(cfg) {
  const { user } = await zdGet('/api/v2/users/me.json', cfg)
  if (!user || user.id == null || user.role === 'end-user') {
    throw new ZendeskError(
      useOAuth(cfg)
        ? 'Signed in with OAuth, but not as an agent. Create the OAuth client from an agent or admin account.'
        : 'Authenticated, but not as an agent. Check the email and API token.',
      401,
    )
  }
  return { name: user.name, email: user.email, role: user.role, method: useOAuth(cfg) ? 'oauth' : 'token' }
}

// Lists that rarely change (groups, ticket fields, ticket forms) are kept for a few minutes per
// Zendesk account, so searches and reviews don't fetch them again every time. A failed fetch isn't
// kept, and saving Settings clears the lot (see clearLookupCache).
const LOOKUP_TTL_MS = 10 * 60 * 1000
const lookups = new Map() // `${name}|${account}` -> { promise, expiresAt }

export function cachedLookup(name, load) {
  const key = `${name}|${baseUrl(getSettings().zendesk)}`
  const hit = lookups.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.promise
  const promise = load()
  lookups.set(key, { promise, expiresAt: Date.now() + LOOKUP_TTL_MS })
  promise.catch(() => {
    if (lookups.get(key)?.promise === promise) lookups.delete(key)
  })
  return promise
}

export const clearLookupCache = () => lookups.clear()

export function listGroups() {
  return cachedLookup('groups', async () => {
    const groups = await getAllPages('/api/v2/groups.json?page[size]=100', 'groups')
    return groups
      .filter(g => !g.deleted)
      .map(g => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

// User ids of the agents in the Zendesk group with this name (case-insensitive), kept for a few
// minutes like the other lookups. An empty set when no such group exists.
export function groupMemberIds(groupName) {
  return cachedLookup(`members:${groupName.toLowerCase()}`, async () => {
    const group = (await listGroups()).find(g => g.name.toLowerCase() === groupName.toLowerCase())
    if (!group) return new Set()
    const members = await getAllPages(`/api/v2/groups/${group.id}/memberships.json?page[size]=100`, 'group_memberships')
    return new Set(members.map(m => m.user_id))
  })
}

// User ids of the members of one group (by id), kept for a few minutes like the other lookups.
export function groupMemberIdsById(groupId) {
  return cachedLookup(`members-id:${groupId}`, async () => {
    const members = await getAllPages(`/api/v2/groups/${groupId}/memberships.json?page[size]=100`, 'group_memberships')
    return new Set(members.map(m => m.user_id))
  })
}

// Agents and admins whose name or email matches `query` (Zendesk user search), for picking agents
// in Settings › Agents: [{ id, name, email, role }], at most 25.
export async function searchAgents(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const page = await zdGet('/api/v2/users/search.json?per_page=25&query=' + encodeURIComponent(q))
  return (page.users || [])
    .filter(u => ['agent', 'admin'].includes(u.role) && u.active !== false && !u.suspended)
    .map(u => ({ id: u.id, name: u.name, email: u.email || null, role: u.role }))
}

// Agents (id, name, email) for a set of user ids.
export async function agentProfiles(ids) {
  const out = []
  const list = [...ids]
  for (let i = 0; i < list.length; i += 100) {
    const { users } = await zdGet(`/api/v2/users/show_many.json?ids=${list.slice(i, i + 100).join(',')}`)
    for (const u of users || []) if (u.active !== false && !u.suspended) out.push({ id: u.id, name: u.name, email: u.email || null, role: u.role })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function listTicketFields() {
  return cachedLookup('ticket-fields', async () => {
    const fields = await getAllPages('/api/v2/ticket_fields.json?page[size]=100', 'ticket_fields')
    return fields
      .filter(f => f.active)
      .map(f => ({
        id: f.id,
        type: f.type,
        title: f.title,
        system: !f.removable,
        options: (f.custom_field_options || []).map(o => ({ name: o.name, value: o.value })),
      }))
  })
}

export const TICKET_STATUSES = ['new', 'open', 'pending', 'hold', 'solved', 'closed']

// Only solved/closed tickets have a solved date; any other status is windowed by last update.
export function dateFieldFor(statuses) {
  return statuses.every(s => s === 'solved' || s === 'closed') ? 'solved' : 'updated'
}

// Tickets in the given statuses and groups within a date window.
export async function searchTickets({ groupIds, statuses, from, to, limit }) {
  const dateField = dateFieldFor(statuses)
  const dateTerms = [from && `${dateField}>=${from}`, to && `${dateField}<=${to}`].filter(Boolean).join(' ')
  const groupTerms = groupIds.length ? groupIds.map(id => `group:${id}`) : ['']
  // Hard rule: tickets created before 2026 are never included. Zendesk compares dates in the
  // account's time zone, so the query starts a day early and the exact UTC cut-off is applied below.
  const dayBefore = new Date(Date.parse(`${CREATED_CUTOFF}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
  const createdTerm = `created>=${dayBefore}`

  // One query per status/group pair: repeated keywords in a Zendesk query are ANDed, not ORed.
  // They run SEARCH_CONCURRENCY at a time and are merged in status/group order, so the result is
  // the same as running them one after another.
  const queries = statuses.flatMap(status =>
    groupTerms.map(groupTerm => ['type:ticket', `status:${status}`, groupTerm, dateTerms, createdTerm].filter(Boolean).join(' ')),
  )
  const results = new Array(queries.length)
  let nextQuery = 0
  const worker = async () => {
    while (nextQuery < queries.length) {
      const i = nextQuery++
      const path =
        '/api/v2/search/export.json?filter[type]=ticket&page[size]=100&query=' + encodeURIComponent(queries[i])
      results[i] = await getAllPages(path, 'results', undefined, limit)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, queries.length) }, worker))

  const byId = new Map()
  for (const tickets of results) {
    for (const t of tickets) {
      if (byId.size >= limit) break
      if (!createdBeforeCutoff(t.created_at)) byId.set(t.id, t)
    }
  }
  rememberCreated(byId.values())
  return [...byId.values()]
}

const SEARCH_CONCURRENCY = 4

export async function getUsers(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  const users = new Map()
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { users: page } = await zdGet(`/api/v2/users/show_many.json?ids=${chunk.join(',')}`)
    for (const u of page) users.set(u.id, u.name)
  }
  return users
}

// Name and role (agent / admin / end-user) for each user id.
export async function getUserProfiles(ids) {
  const unique = [...new Set(ids.filter(id => id > 0))]
  const users = new Map()
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const { users: page } = await zdGet(`/api/v2/users/show_many.json?ids=${chunk.join(',')}`)
    for (const u of page) users.set(u.id, { name: u.name, role: u.role, email: u.email || null })
  }
  return users
}

export async function getAudits(id) {
  return getAllPages(`/api/v2/tickets/${id}/audits.json?page[size]=100`, 'audits')
}

export async function getSideConversations(ticketId) {
  const { side_conversations = [] } = await zdGet(`/api/v2/tickets/${ticketId}/side_conversations.json`)
  return side_conversations
}

export async function getSideConversationEvents(ticketId, sideConversationId) {
  const events = []
  let next = `/api/v2/tickets/${ticketId}/side_conversations/${sideConversationId}/events.json`
  while (next) {
    const page = await zdGet(next)
    events.push(...(page.events || []))
    next = page.next_page
  }
  return events
}

// Side conversation count per ticket. There is no bulk endpoint, so this makes one request
// per ticket, `concurrency` at a time. A ticket whose lookup fails is left out of the map.
export async function countSideConversations(ticketIds, concurrency = 10) {
  const counts = new Map()
  for (let i = 0; i < ticketIds.length; i += concurrency) {
    await Promise.all(
      ticketIds.slice(i, i + concurrency).map(async id => {
        try {
          counts.set(id, (await getSideConversations(id)).length)
        } catch (err) {
          console.warn(`Side conversations for ticket ${id}: ${err.message}`)
        }
      }),
    )
  }
  return counts
}

// Full ticket objects plus, per ticket, the author of its most recent audit (-1 means Zendesk
// itself, e.g. an automation) and how many times it was re-opened. Fetched 100 tickets per
// request, `concurrency` requests at a time.
export async function getTicketDetails(ticketIds, concurrency = 4) {
  const tickets = new Map()
  const updaters = new Map()
  const reopens = new Map()
  const chunks = []
  for (let i = 0; i < ticketIds.length; i += 100) chunks.push(ticketIds.slice(i, i + 100))
  for (let i = 0; i < chunks.length; i += concurrency) {
    await Promise.all(
      chunks.slice(i, i + concurrency).map(async chunk => {
        const page = await zdGet(
          `/api/v2/tickets/show_many.json?ids=${chunk.join(',')}&include=last_audits,metric_sets`,
        )
        for (const t of page.tickets || []) tickets.set(t.id, t)
        for (const a of page.last_audits || []) updaters.set(a.ticket_id, a.author_id)
        for (const m of page.metric_sets || []) reopens.set(m.ticket_id, m.reopens ?? 0)
      }),
    )
  }
  return { tickets, updaters, reopens }
}

// Tickets plus the names of their assignees in one request per 100 tickets (users sideloaded),
// all chunks at once: { tickets: Map id -> ticket, users: Map id -> name }. Lighter than
// getTicketDetails when audits and re-open counts aren't needed.
export async function getTicketsWithUsers(ticketIds) {
  const tickets = new Map()
  const users = new Map()
  const chunks = []
  for (let i = 0; i < ticketIds.length; i += 100) chunks.push(ticketIds.slice(i, i + 100))
  await Promise.all(
    chunks.map(async chunk => {
      const page = await zdGet(`/api/v2/tickets/show_many.json?ids=${chunk.join(',')}&include=users`)
      for (const t of page.tickets || []) tickets.set(t.id, t)
      for (const u of page.users || []) users.set(u.id, u.name)
    }),
  )
  return { tickets, users }
}

export async function getReopenCount(ticketId) {
  const { ticket_metric } = await zdGet(`/api/v2/tickets/${ticketId}/metrics.json`)
  return ticket_metric?.reopens ?? 0
}

export async function getTicket(id) {
  const { ticket } = await zdGet(`/api/v2/tickets/${id}.json`)
  return ticket
}

// The ticket's comments, taken from its audit log (each audit's Comment event, with the audit's
// time and channel), so a review needn't download them a second time. Same content as getComments.
export function commentsFromAudits(audits) {
  return audits.flatMap(a =>
    (a.events || []).filter(e => e.type === 'Comment').map(e => ({ ...e, created_at: a.created_at, via: e.via ?? a.via })),
  )
}

export async function getComments(id) {
  return getAllPages(`/api/v2/tickets/${id}/comments.json?page[size]=100`, 'comments')
}

export function ticketUrl(id) {
  return `${baseUrl(getSettings().zendesk)}/agent/tickets/${id}`
}
