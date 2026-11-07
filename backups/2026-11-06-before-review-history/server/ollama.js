// Quality Review scoring: a Ticket Quality Review (TQR) scored by an Ollama model, plus
// suggested values for any missing metadata. The reviewer instructions in Settings say how
// to judge the ticket; this module supplies the evidence and fixes the output format.
import { getSettings } from './settings.js'
import { fieldValue, ticketChecker } from './qc.js'
import { collectImages } from './images.js'
import {
  getAudits,
  commentsFromAudits,
  getReopenCount,
  getSideConversationEvents,
  getSideConversations,
  getTicket,
  getUserProfiles,
  listGroups,
  listTicketFields,
} from './zendesk.js'
import { EMAIL_REPLY_RULE, emailReply, emailReplyLabel } from './email-notes.js'

function ollamaBase(url) {
  return url.trim().replace(/\/+$/, '')
}

export async function listModels(url = getSettings().ollama.url) {
  const res = await fetch(`${ollamaBase(url)}/api/tags`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Ollama ${res.status} ${res.statusText}`)
  const { models = [] } = await res.json()
  return models.map(m => m.name).sort()
}

const MAX_CONVERSATION_CHARS = 24000
const MAX_SIDE_CONVERSATION_CHARS = 12000

const SYSTEM_OPTIONS = {
  type: ['question', 'incident', 'problem', 'task'],
  priority: ['low', 'normal', 'high', 'urgent'],
}

// Overall rating bands for the 1–5 weighted total (same bands as the TQR instructions).
const RATING_BANDS = [
  [4.5, 'Excellent'],
  [3.5, 'Good'],
  [2.5, 'Acceptable'],
  [1.5, 'Below Standard'],
  [0, 'Poor'],
]

const OUTPUT_FORMAT = `OUTPUT FORMAT (mandatory, overrides any other format instruction)
Respond ONLY with one JSON object of this shape:
{
  "summary": string,                 // the customer's original issue/request
  "assignee_name": string | null,
  "resolving_agent": string | null,
  "date_solved": string | null,      // ISO timestamp
  "categories": [
    { "name": string, "weight": number, "score": integer, "findings": [string] }
  ],
  "overall_rating": string,
  "metadata_suggestions": [
    { "key": string, "suggested_value": string, "confidence": "high" | "medium" | "low", "reason": string }
  ]
}
Rules:
- "categories": one entry per evaluation category in the instructions, in the same order. "weight" is a fraction (35% = 0.35). "score" is 1-5. "findings" are evidence-based observations (empty list only if there is nothing to note).
- Use the people names from the CONVERSATION, SIDE CONVERSATIONS and TIMELINE sections; never use numeric ids.
- When a finding is based on a side conversation, say so (e.g. "In side conversation 1, ...").
- Attached images (listed under IMAGES) are evidence too, e.g. screenshots of errors, settings or confirmations. Use them, and when a finding relies on one, name it (e.g. "Image 2 shows ...").
- "metadata_suggestions": one entry for each key in missing_fields (empty list if none). Only choose from allowed_values when they are given.`

function truncateMiddle(text, max) {
  // Keep the start and end of very long threads; the middle is usually back-and-forth.
  if (text.length <= max) return text
  const half = max / 2
  return text.slice(0, half) + '\n\n[... conversation truncated ...]\n\n' + text.slice(-half)
}

function personLabel(id, people) {
  if (id === -1) return 'Zendesk (system/automation)'
  const p = people.get(id)
  if (!p) return `Unknown user ${id}`
  return `${p.name} (${p.role === 'end-user' ? 'customer' : p.role})`
}

// "[Attachments: error.png (Image 1), invoice.pdf]" after a message, so the model knows what was
// attached where; `note` says which image number each one became, or why it wasn't included.
function attachmentLine(attachments, note) {
  if (!attachments?.length) return ''
  return `\n[Attachments: ${attachments.map(a => `${attachmentName(a)}${note(a)}`).join(', ')}]`
}

const attachmentName = a => a.file_name || a.name || 'attachment'
const attachmentKey = a => `${attachmentName(a)}|${a.size}`

// "public reply", "INTERNAL NOTE", or the email-reply label for an emailed reply saved as a note.
function commentKind(c, people) {
  if (c.public) return 'public reply'
  // Only real agents: an end-user's (e.g. a copied client's) email saved privately isn't an agent reply.
  const byAgent = ['agent', 'admin'].includes(people.get(c.author_id)?.role)
  const email = byAgent ? emailReply({ isPublic: false, via: c.via }) : null
  return email ? emailReplyLabel(email) : 'INTERNAL NOTE'
}

function conversationText(comments, people, note) {
  const text = comments
    .map(
      c =>
        `[${c.created_at}] ${personLabel(c.author_id, people)} — ${commentKind(c, people)}:\n` +
        (c.plain_body || c.body) +
        attachmentLine(c.attachments, note),
    )
    .join('\n\n---\n\n')
  return truncateMiddle(text, MAX_CONVERSATION_CHARS)
}

// Name plus email domain, enough to tell internal teams from third parties.
function contactLabel(c) {
  if (!c) return 'unknown'
  const domain = c.email?.split('@')[1]
  return domain ? `${c.name} (@${domain})` : c.name || 'unknown'
}

// Side conversations with their message events (fetched before the text is built, so their
// attachments can be considered for image review).
async function loadSideConversations(ticketId) {
  const threads = await getSideConversations(ticketId)
  return Promise.all(threads.map(async sc => ({ sc, events: await getSideConversationEvents(ticketId, sc.id) })))
}

function sideConversationText(threads, note) {
  const blocks = threads.map(({ sc, events }, i) => {
    const messages = events
      .filter(e => e.message)
      .map(
        e =>
          `[${e.created_at}] ${contactLabel(e.actor)} → ${(e.message.to || []).map(contactLabel).join(', ') || '—'}:\n` +
          (e.message.body || e.message.preview_text || '') +
          attachmentLine(e.message.attachments, note),
      )
    return (
      `Side conversation ${i + 1}: "${sc.subject}" (state: ${sc.state}, started ${sc.created_at})\n` +
      `Participants: ${sc.participants.map(contactLabel).join(', ')}\n\n` +
      messages.join('\n\n---\n\n')
    )
  })
  return { count: threads.length, text: truncateMiddle(blocks.join('\n\n=====\n\n'), MAX_SIDE_CONVERSATION_CHARS) }
}

// Status, assignee and group changes from the audit log, oldest first.
function timeline(audits, people, groupNames) {
  const lines = []
  for (const a of audits) {
    for (const e of a.events || []) {
      if (e.type !== 'Change' && e.type !== 'Create') continue
      const by = personLabel(a.author_id, people)
      if (e.field_name === 'status') {
        lines.push(`[${a.created_at}] status ${e.previous_value ? `${e.previous_value} → ` : ''}${e.value} (by ${by})`)
      } else if (e.field_name === 'assignee_id' && e.value) {
        lines.push(`[${a.created_at}] assigned to ${personLabel(Number(e.value), people)} (by ${by})`)
      } else if (e.field_name === 'group_id' && e.value) {
        lines.push(`[${a.created_at}] group set to ${groupNames.get(Number(e.value)) || e.value} (by ${by})`)
      }
    }
  }
  return lines.join('\n') || '(no status history available)'
}

// Last time the ticket moved to solved, else to closed, else null.
function solvedDate(audits) {
  const when = status =>
    audits
      .filter(a => a.events?.some(e => e.field_name === 'status' && e.value === status))
      .map(a => a.created_at)
      .pop() ?? null
  return when('solved') ?? when('closed')
}

const round2 = n => Math.round(n * 100) / 100

// The model echoes names as labelled in the prompt, e.g. "Jane Doe (agent)".
const stripRole = name => (typeof name === 'string' ? name.replace(/\s*\((agent|admin|customer)\)$/i, '') : null)

// Recompute weighted scores, total and rating instead of trusting the model's arithmetic.
export function scoreCategories(categories) {
  if (!Array.isArray(categories) || !categories.length) return null
  const scored = categories.map(c => {
    const score = Math.min(5, Math.max(1, Math.round(Number(c.score) || 1)))
    let weight = Number(c.weight) || 0
    if (weight > 1) weight /= 100
    return {
      name: String(c.name ?? ''),
      weight,
      score,
      weighted: round2(score * weight),
      findings: Array.isArray(c.findings) ? c.findings.map(String) : c.findings ? [String(c.findings)] : [],
    }
  })
  const weightSum = round2(scored.reduce((s, c) => s + c.weight, 0))
  const total = round2(scored.reduce((s, c) => s + c.weighted, 0))
  return {
    categories: scored,
    total,
    rating: RATING_BANDS.find(([min]) => total >= min)[1],
    weightWarning: Math.abs(weightSum - 1) > 0.01 ? `Category weights add up to ${weightSum * 100}%, not 100%.` : null,
  }
}

export async function reviewTicket(ticketId) {
  const { ollama, qc } = getSettings()
  if (!ollama.enabled) throw Object.assign(new Error('Ollama review is disabled in Settings.'), { status: 400 })
  if (!ollama.model) throw Object.assign(new Error('No Ollama model selected in Settings.'), { status: 400 })

  const [ticket, audits, zdFields, groups, check, side, reopens] = await Promise.all([
    getTicket(ticketId),
    getAudits(ticketId),
    listTicketFields(),
    listGroups(),
    ticketChecker(),
    // A side conversation failure shouldn't block the review; it is reported instead.
    loadSideConversations(ticketId).then(
      threads => ({ threads }),
      err => ({ threads: [], error: err.message }),
    ),
    getReopenCount(ticketId).catch(() => null),
  ])
  // Comments come from the audit log already fetched (one download fewer per review).
  const comments = commentsFromAudits(audits)
  const assigneeIds = audits.flatMap(a =>
    (a.events || []).filter(e => e.field_name === 'assignee_id' && e.value).map(e => Number(e.value)),
  )
  const people = await getUserProfiles([
    ticket.requester_id,
    ticket.assignee_id,
    ...comments.map(c => c.author_id),
    ...audits.map(a => a.author_id),
    ...assigneeIds,
  ])
  const groupNames = new Map(groups.map(g => [g.id, g.name]))

  // Image attachments from the conversation and side conversations, in conversation order.
  const candidates = [
    ...comments.flatMap(c =>
      (c.attachments || []).map(a => ({
        attachment: a,
        source: `${c.public ? 'public reply' : 'internal note'} by ${personLabel(c.author_id, people)} at ${c.created_at}`,
      })),
    ),
    ...side.threads.flatMap(({ events }, i) =>
      events
        .filter(e => e.message?.attachments?.length)
        .flatMap(e =>
          e.message.attachments.map(a => ({
            attachment: a,
            source: `side conversation ${i + 1} message by ${contactLabel(e.actor)} at ${e.created_at}`,
          })),
        ),
    ),
  ]
  const { images, skipped: imagesSkipped } = ollama.includeImages
    ? await collectImages(
        candidates.map(({ attachment: a, source }) => ({
          fileName: attachmentName(a),
          contentType: a.content_type,
          size: a.size,
          url: a.content_url || a.mapped_content_url || a.url,
          malware: a.malware_scan_result,
          source,
        })),
      )
    : { images: [], skipped: [] }
  const imageNumber = new Map(images.map(img => [`${img.fileName}|${img.size}`, img.number]))
  const skippedReason = new Map(imagesSkipped.map(s => [s.fileName, s.reason]))
  // Label for each attachment in the conversation text.
  const note = a => {
    const n = imageNumber.get(attachmentKey(a))
    if (n) return ` (Image ${n})`
    const reason = skippedReason.get(attachmentName(a))
    return reason ? ` (not shown: ${reason})` : ''
  }
  const sideText = side.threads.length ? sideConversationText(side.threads, note) : { count: 0, text: '' }

  const { missing: missingKeys, notApplicable } = check(ticket)
  const fieldsById = new Map(zdFields.map(f => [f.id, f]))
  const describe = f => {
    const zd = f.kind === 'custom' ? fieldsById.get(Number(f.id)) : null
    const options = zd?.options?.length ? zd.options.map(o => o.value) : SYSTEM_OPTIONS[f.key] || null
    return { key: f.key, label: f.label, current: fieldValue(ticket, f) ?? null, allowed_values: options }
  }
  // Leave out fields the ticket's form doesn't show; the model shouldn't judge those.
  const required = qc.requiredFields.filter(f => !notApplicable.includes(f.key)).map(describe)

  const ticketInfo = {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    created_at: ticket.created_at,
    // Times the ticket went from solved back to an open state (Zendesk ticket metrics).
    reopen_count: reopens,
    requester: personLabel(ticket.requester_id, people),
    current_assignee: ticket.assignee_id ? personLabel(ticket.assignee_id, people) : null,
    group: groupNames.get(ticket.group_id) || null,
    tags: ticket.tags,
  }
  const metadata = {
    required_fields: required,
    missing_fields: required.filter(f => missingKeys.includes(f.key)).map(f => f.key),
  }

  const userMessage = [
    `TICKET\n${JSON.stringify(ticketInfo, null, 2)}`,
    `TIMELINE (status / assignee / group changes)\n${timeline(audits, people, groupNames)}`,
    `CONVERSATION (oldest first)\n${conversationText(comments, people, note)}`,
    sideText.count
      ? `SIDE CONVERSATIONS (${sideText.count}) — email threads the agent started from this ticket with other teams ` +
        `or third parties. They are part of the ticket evidence: consider them for troubleshooting, ` +
        `documentation, escalation, communication and resolution.\n${sideText.text}`
      : `SIDE CONVERSATIONS\n${side.error ? '(could not be loaded; do not assume there were none)' : '(none)'}`,
    images.length
      ? `IMAGES (${images.length}) — attached to this message in this order; they are part of the ticket evidence:\n` +
        images.map(img => `Image ${img.number}: ${img.fileName} — from the ${img.source}`).join('\n')
      : 'IMAGES\n(none attached)',
    `METADATA\n${JSON.stringify(metadata, null, 2)}`,
  ].join('\n\n')

  const res = await fetch(`${ollamaBase(ollama.url)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5 * 60 * 1000),
    body: JSON.stringify({
      model: ollama.model,
      stream: false,
      format: 'json',
      options: { num_ctx: Number(ollama.numCtx) || 16384, temperature: Number(ollama.temperature) || 0 },
      messages: [
        { role: 'system', content: `${ollama.prompt.trim()}\n\n${EMAIL_REPLY_RULE}\n\n${OUTPUT_FORMAT}` },
        // Images go with the user message (Ollama vision input, base64), in the order listed above.
        { role: 'user', content: userMessage, ...(images.length ? { images: images.map(img => img.base64) } : {}) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const content = data.message?.content || '{}'
  let raw
  try {
    // Some (cloud) models ignore `format` and wrap the JSON in prose or code fences.
    raw = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1))
  } catch {
    raw = { summary: content }
  }

  return {
    ticketId: ticket.id,
    // Ticket context for storage; split off before the result is saved.
    ticket: { subject: ticket.subject, status: ticket.status, group: groupNames.get(ticket.group_id) ?? null },
    model: ollama.model,
    missing: missingKeys,
    sideConversations: sideText.count,
    reopens,
    sideConversationError: side.error ?? null,
    imagesReviewed: images.map(img => ({ number: img.number, fileName: img.fileName, source: img.source })),
    imagesSkipped,
    summary: raw.summary ?? '',
    assigneeName: stripRole(raw.assignee_name),
    resolvingAgent: stripRole(raw.resolving_agent),
    // Taken from the audit log when available; the model's value is only a fallback.
    dateSolved: solvedDate(audits) ?? raw.date_solved ?? null,
    tqr: scoreCategories(raw.categories),
    modelRating: raw.overall_rating ?? null,
    suggestions: (raw.metadata_suggestions ?? raw.suggestions ?? []).map(sg => ({
      ...sg,
      label: qc.requiredFields.find(f => f.key === sg.key)?.label ?? sg.key,
    })),
  }
}
