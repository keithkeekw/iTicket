// Ticket Inspector: one ticket's audit log (comments, status, group and assignee changes) merged
// with its side conversation messages into a single chronological timeline.
import {
  getAudits,
  getSideConversationEvents,
  getSideConversations,
  getTicket,
  getUserProfiles,
  listGroups,
  ticketUrl,
} from './zendesk.js'
import { emailReply } from './email-notes.js'

const badRequest = message => Object.assign(new Error(message), { status: 400 })

// Fields whose changes are shown as movements on the timeline.
const TRACKED = { status: 'status', group_id: 'group', assignee_id: 'assignee' }

function person(id, people) {
  if (id === -1) return { name: 'Zendesk', role: 'system' }
  const p = people.get(id)
  if (!p) return { name: id ? `User ${id}` : 'Unknown', role: null }
  return p.formerAgent ? { name: p.name, role: p.role, formerAgent: true } : { name: p.name, role: p.role }
}

function contact(c) {
  if (!c) return null
  return { name: c.name || c.email || 'Unknown', email: c.email || null }
}

// How the update was made: "Email", "Web", "Trigger: Notify requester", ...
function viaLabel(via) {
  if (!via) return null
  const title = via.source?.from?.title
  const rel = via.source?.rel
  if (rel === 'trigger' || rel === 'automation' || rel === 'macro_reference') {
    const kind = { trigger: 'Trigger', automation: 'Automation', macro_reference: 'Macro' }[rel]
    return title ? `${kind}: ${title}` : kind
  }
  const channel = via.channel
  if (!channel) return null
  return channel.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

// Plain-text bodies can still carry HTML entities (e.g. "&nbsp;" pasted from email).
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeEntities = text =>
  String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n === 160 ? 32 : n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })

const attachmentList = list =>
  (list || []).map(a => ({
    name: a.file_name || a.name || 'attachment',
    url: a.content_url || null,
    size: a.size ?? null,
    contentType: a.content_type || null,
  }))

// `onProgress(percent, message)` reports each retrieval step; the timeline is ready at 70%.
export async function inspectTicket(rawId, onProgress = () => {}) {
  const ticketId = Number(String(rawId).trim().replace(/^#/, ''))
  if (!Number.isInteger(ticketId) || ticketId <= 0) throw badRequest('Enter a valid ticket ID.')

  onProgress(3, 'Retrieving the ticket from Zendesk…')
  const ticket = await getTicket(ticketId).catch(err => {
    if (err.status === 404) throw Object.assign(new Error(`Ticket #${ticketId} was not found in Zendesk.`), { status: 404 })
    throw err
  })
  onProgress(12, 'Retrieving the ticket audit log…')
  const [audits, groups] = await Promise.all([
    getAudits(ticketId).catch(err => (err.status === 404 ? [] : Promise.reject(err))),
    listGroups().catch(() => []),
  ])

  onProgress(35, `Audit log retrieved (${audits.length} updates). Retrieving side conversations…`)
  // Side conversations need a Collaboration add-on; a failure is reported, not fatal.
  let side
  try {
    const list = await getSideConversations(ticketId)
    const threads = []
    for (const [i, sc] of list.entries()) {
      onProgress(40 + Math.round((20 * i) / list.length), `Retrieving side conversation ${i + 1} of ${list.length}…`)
      threads.push({ sc, events: await getSideConversationEvents(ticketId, sc.id) })
    }
    side = { threads }
  } catch (err) {
    side = { threads: [], error: err.message }
  }
  onProgress(62, 'Looking up people…')

  const groupNames = new Map(groups.map(g => [g.id, g.name]))
  const userIds = [ticket.requester_id, ticket.assignee_id, ticket.submitter_id]
  for (const a of audits) {
    userIds.push(a.author_id)
    for (const e of a.events || []) {
      if (e.type === 'Comment') userIds.push(e.author_id)
      if (e.field_name === 'assignee_id') userIds.push(Number(e.value), Number(e.previous_value))
    }
  }
  const people = await getUserProfiles(userIds.map(Number).filter(n => Number.isInteger(n) && n > 0))

  // Someone who wrote an internal note or moved the assignee / group was an agent at the time,
  // even if Zendesk now lists them as an end-user (e.g. an agent who has since left).
  for (const a of audits) {
    for (const e of a.events || []) {
      const actor =
        e.type === 'Comment' && e.public === false
          ? e.author_id ?? a.author_id
          : e.type === 'Change' &&
              (e.field_name === 'assignee_id' || e.field_name === 'group_id') &&
              e.via?.channel !== 'rule' // trigger changes are filed under whoever caused the update
            ? a.author_id
            : null
      const p = actor > 0 ? people.get(actor) : null
      if (p && p.role === 'end-user') people.set(actor, { ...p, role: 'agent', formerAgent: true })
    }
  }

  const valueLabel = (field, value) => {
    if (value == null || value === '') return null
    if (field === 'group_id') return groupNames.get(Number(value)) || `Group ${value}`
    if (field === 'assignee_id') return person(Number(value), people).name
    return String(value)
  }

  const items = []
  for (const a of audits) {
    const author = person(a.author_id, people)
    const via = viaLabel(a.via)
    const events = a.events || []
    const isCreate = events.some(e => e.type === 'Create')

    for (const e of events) {
      if (e.type !== 'Comment') continue
      const commentAuthor = person(e.author_id ?? a.author_id, people)
      // Only real agents: end-users (e.g. a copied client) whose email became a private comment don't count.
      const byAgent = ['agent', 'admin'].includes(commentAuthor.role) && !commentAuthor.formerAgent
      items.push({
        id: `c${e.id}`,
        at: a.created_at,
        kind: e.public ? 'public' : 'private',
        author: commentAuthor,
        body: decodeEntities(e.plain_body ?? e.body),
        html: e.html_body || null,
        attachments: attachmentList(e.attachments),
        via,
        // An emailed reply Zendesk saved as an internal note (the email still went to the thread).
        email: byAgent ? emailReply({ isPublic: e.public, via: e.via ?? a.via }) : null,
      })
    }

    const changes = events
      .filter(e => (e.type === 'Change' || e.type === 'Create') && TRACKED[e.field_name])
      .map(e => ({
        field: TRACKED[e.field_name],
        from: e.type === 'Create' ? null : valueLabel(e.field_name, e.previous_value),
        to: valueLabel(e.field_name, e.value),
      }))
      .filter(c => c.from !== c.to && (c.from || c.to))
    if (isCreate || changes.length) {
      items.push({
        id: `a${a.id}`,
        at: a.created_at,
        kind: isCreate ? 'created' : 'change',
        author,
        changes,
        via,
      })
    }
  }

  // Numbered in the order they were started (Zendesk lists the newest first).
  side.threads.sort((x, y) => new Date(x.sc.created_at) - new Date(y.sc.created_at))
  const threads = side.threads.map(({ sc, events }, i) => {
    const thread = { index: i + 1, subject: sc.subject || '(no subject)', state: sc.state }
    for (const e of events) {
      if (e.message) {
        items.push({
          id: `s${e.id}`,
          at: e.created_at,
          kind: 'side',
          thread,
          author: contact(e.actor) || { name: 'Unknown' },
          from: contact(e.message.from || e.actor),
          to: (e.message.to || []).map(contact).filter(Boolean),
          body: decodeEntities(e.message.body || e.message.preview_text),
          html: e.message.html_body || null,
          attachments: attachmentList(e.message.attachments),
          first: e.type === 'create',
        })
      } else if (e.updates?.state) {
        items.push({
          id: `s${e.id}`,
          at: e.created_at,
          kind: 'side-state',
          thread,
          author: contact(e.actor) || { name: 'Unknown' },
          state: e.updates.state,
        })
      }
    }
    return { ...thread, id: sc.id, createdAt: sc.created_at, participants: (sc.participants || []).map(contact) }
  })

  // Oldest first; within the same audit, the field changes come after the comment.
  const order = { created: 0, public: 1, private: 1, change: 2, side: 3, 'side-state': 4 }
  items.sort((x, y) => new Date(x.at) - new Date(y.at) || order[x.kind] - order[y.kind])

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject || ticket.raw_subject || '(no subject)',
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      group: valueLabel('group_id', ticket.group_id),
      assignee: ticket.assignee_id ? person(ticket.assignee_id, people).name : null,
      requester: ticket.requester_id ? person(ticket.requester_id, people).name : null,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      tags: ticket.tags || [],
      url: ticketUrl(ticket.id),
    },
    sideConversations: threads,
    sideConversationError: side.error || null,
    items,
  }
}
