// Ticket Inspector QC comments: the AI model comments on each agent-written public reply and
// internal note against three rubric categories. The category definitions come from the reviewer
// instructions in Settings, so they follow the rubric. Results are only shown, never stored.
import { jsonrepair } from 'jsonrepair'
import { getSettings } from './settings.js'
import { EMAIL_REPLY_RULE, emailReplyLabel } from './email-notes.js'

export const QC_CATEGORIES = [
  {
    key: 'troubleshooting',
    name: 'Troubleshooting & Documentation Quality',
    fallback:
      'Are troubleshooting steps documented, logical, complete and traceable? Would another agent understand the ' +
      'ticket history from this note? Was the ticket status used correctly?',
  },
  {
    key: 'communication',
    name: 'Professional Communication',
    fallback: 'Professionalism and tone: empathy, clarity, ownership, customer focus, follow-up.',
  },
  {
    key: 'english',
    name: 'Business English Quality',
    fallback: 'Grammar, sentence structure, spelling and clarity, to strict business English standards.',
  },
]

const CHUNK_SIZE = 6
const CONCURRENCY = 2
const MAX_CONTEXT_CHARS = 30000
const MAX_COMMENT_CHARS = 6000

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The numbered section for `name` in the reviewer instructions, up to the next numbered section
// or the scoring rules. Falls back to a built-in summary if the section isn't there.
function rubricSection(prompt, { name, fallback }) {
  const start = new RegExp(`^\\s*\\d+\\.\\s*${escapeRegex(name)}[^\\n]*\\n`, 'im').exec(prompt || '')
  if (!start) return fallback
  const rest = prompt.slice(start.index + start[0].length)
  const end = rest.search(/^\s*(\d+\.\s+\S|Scoring Rules)/im)
  return (end === -1 ? rest : rest.slice(0, end)).trim() || fallback
}

// Comments written by an agent themself: not triggers, automations, API integrations or
// automatic call logs.
export function isAgentComment(item) {
  if (item.kind !== 'public' && item.kind !== 'private') return false
  if (!['agent', 'admin'].includes(item.author?.role)) return false
  return !/^(Trigger|Automation|Api|Voice)\b/i.test(item.via || '')
}

// Label for a comment in the prompts; emailed replies saved as notes say so.
const kindLabel = i => (i.kind === 'public' ? 'PUBLIC REPLY' : i.email ? emailReplyLabel(i.email) : 'INTERNAL NOTE')

const clip = (text, max) => (text.length > max ? text.slice(0, max) + ' [… truncated]' : text)

function contextText(items) {
  const lines = items.map(i => {
    if (i.kind === 'public' || i.kind === 'private') {
      const who = `${i.author?.name} (${i.author?.role === 'end-user' ? 'customer' : i.author?.role || 'unknown'})`
      return `[${i.at}] [${i.id}] ${who} — ${kindLabel(i)}:\n${clip(i.body, 2500)}`
    }
    if (i.kind === 'change' || i.kind === 'created')
      return `[${i.at}] ${i.author?.name}: ${i.changes.map(c => `${c.field} ${c.from ?? '—'} → ${c.to ?? '—'}`).join('; ')}`
    if (i.kind === 'side')
      return `[${i.at}] SIDE CONVERSATION ${i.thread.index} message from ${i.author?.name}:\n${clip(i.body, 800)}`
    return null
  })
  const text = lines.filter(Boolean).join('\n\n')
  if (text.length <= MAX_CONTEXT_CHARS) return text
  return text.slice(0, MAX_CONTEXT_CHARS / 2) + '\n\n[… history truncated …]\n\n' + text.slice(-MAX_CONTEXT_CHARS / 2)
}

function systemPrompt(prompt) {
  const categories = QC_CATEGORIES.map(c => `### ${c.name} (key "${c.key}")\n${rubricSection(prompt, c)}`).join('\n\n')
  return `You are a support QA reviewer. You write a short QC comment on individual agent comments in a Zendesk ticket.
Judge ONLY the comment being reviewed, using the rest of the ticket history as context.

Rubric categories:
${categories}

How to apply them:
- PUBLIC REPLY: customer-facing; judge all three categories as written to the customer.
- INTERNAL NOTE — EMAIL REPLY: the agent's email to the thread, client included. Judge it like a PUBLIC REPLY (all three categories, as written to the client).
- INTERNAL NOTE: judge troubleshooting and documentation quality (would another agent understand what was checked, found and done next?), the professionalism of the note, and its business English. Internal notes may be brief, but must be clear.
- Score each category 1-5 (1 Poor, 2 Below Standard, 3 Acceptable, 4 Good, 5 Excellent). Use null only when the category truly cannot apply to this comment, and say why.
- Each "comment" is 1-3 sentences: what is good and, specifically, what should be improved. Quote short phrases when pointing out a language error, using single quotes ('like this'); never put double quotes inside a JSON string.

${EMAIL_REPLY_RULE}

Respond ONLY with one JSON object:
{"comments":[{"id":string,"troubleshooting":{"score":integer|null,"comment":string},"communication":{"score":integer|null,"comment":string},"english":{"score":integer|null,"comment":string}}]}
with exactly one entry per comment id you were asked to review.`
}

function normalise(raw) {
  const out = {}
  for (const { key } of QC_CATEGORIES) {
    const v = raw?.[key] || {}
    const n = Math.round(Number(v.score))
    out[key] = {
      score: Number.isFinite(n) && v.score != null ? Math.min(5, Math.max(1, n)) : null,
      comment: String(v.comment ?? '').trim(),
    }
  }
  return out
}

// JSON schemas for Ollama structured output, so the model is held to valid JSON of this shape.
const categorySchema = {
  type: 'object',
  properties: { score: { type: ['integer', 'null'] }, comment: { type: 'string' } },
  required: ['score', 'comment'],
}
const COMMENT_SCHEMA = {
  type: 'object',
  properties: {
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          troubleshooting: categorySchema,
          communication: categorySchema,
          english: categorySchema,
        },
        required: ['id', 'troubleshooting', 'communication', 'english'],
      },
    },
  },
  required: ['comments'],
}
const TICKET_SCHEMA = {
  type: 'object',
  properties: {
    comprehension: {
      type: 'object',
      properties: { issue_summary: { type: 'string' }, score: { type: 'integer' }, comment: { type: 'string' } },
      required: ['issue_summary', 'score', 'comment'],
    },
    resolution: {
      type: 'object',
      properties: {
        resolved: { type: 'boolean' },
        resolution_summary: { type: ['string', 'null'] },
        score: { type: ['integer', 'null'] },
        comment: { type: ['string', 'null'] },
      },
      required: ['resolved'],
    },
  },
  required: ['comprehension', 'resolution'],
}

// The JSON object in a model reply. Models sometimes wrap it in prose or code fences, or break it
// (e.g. unescaped double quotes inside a string), so near-misses are repaired.
function parseReply(content) {
  const start = content.indexOf('{')
  const text = start === -1 ? content : content.slice(start, content.lastIndexOf('}') + 1)
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(jsonrepair(text))
  }
}

const ATTEMPTS = 2

// Calls the model, retrying once when the reply can't be read as JSON.
async function callModel(ollama, system, user, schema) {
  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const res = await fetch(`${ollama.url.trim().replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5 * 60 * 1000),
      body: JSON.stringify({
        model: ollama.model,
        stream: false,
        format: schema || 'json',
        options: { num_ctx: Number(ollama.numCtx) || 16384, temperature: Number(ollama.temperature) || 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const content = (await res.json()).message?.content || ''
    try {
      return parseReply(content)
    } catch (err) {
      lastError = err
      console.warn(`QC reply was not valid JSON (attempt ${attempt} of ${ATTEMPTS}): ${err.message}`)
    }
  }
  throw new Error(`The AI model's reply could not be read (${lastError.message}). Try Re-run QC comments.`)
}

// Why QC comments can't run, or null when they can.
export function qcUnavailable() {
  const { ollama } = getSettings()
  if (!ollama.enabled) return 'AI review is turned off in Settings → AI model.'
  if (!ollama.model) return 'No AI model is selected in Settings → AI model.'
  return null
}

// Ids of the agent comments that get a QC comment.
export const agentCommentIds = items => items.filter(isAgentComment).map(i => i.id)

// Runs the model on `ids` (agent comment ids), CHUNK_SIZE comments per request. Calls
// onResult(id, result) as each finishes, onError(ids, message) for a failed chunk, and
// onProgress(done, total) after each chunk. Stops early when isCancelled() returns true.
export async function runCommentQc({ ticket, items, ids, onResult, onError, onProgress, isCancelled }) {
  const { ollama } = getSettings()
  const system = systemPrompt(ollama.prompt)
  const context = contextText(items)
  const byId = new Map(items.map(i => [i.id, i]))
  const chunks = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) chunks.push(ids.slice(i, i + CHUNK_SIZE))

  // Reviews one chunk; returns the ids the model gave no usable answer for. Throws if the call fails.
  async function review(chunk) {
    const toReview = chunk
      .map(id => byId.get(id))
      .map(
        c =>
          `[${c.id}] ${kindLabel(c)} by ${c.author?.name} at ${c.at}:\n` +
          clip(c.body, MAX_COMMENT_CHARS),
      )
      .join('\n\n---\n\n')
    const user = [
      `TICKET #${ticket.id}: ${ticket.subject} (current status ${ticket.status}, group ${ticket.group ?? '—'})`,
      `FULL TICKET HISTORY (context, oldest first)\n${context}`,
      `COMMENTS TO REVIEW (ids: ${chunk.join(', ')})\n${toReview}`,
    ].join('\n\n')
    const raw = await callModel(ollama, system, user, COMMENT_SCHEMA)
    const list = Array.isArray(raw.comments) ? raw.comments : []
    const missing = []
    for (const id of chunk) {
      const found = list.find(r => String(r.id).replace(/^\[|\]$/g, '') === id)
      if (!found) {
        missing.push(id)
        continue
      }
      onResult(id, { ...normalise(found), model: ollama.model, createdAt: new Date().toISOString() })
    }
    return missing
  }

  let done = 0
  let next = 0
  async function worker() {
    while (next < chunks.length && !isCancelled()) {
      const chunk = chunks[next++]
      let retry = []
      let failure = 'The model did not return a QC comment for this comment.'
      try {
        retry = await review(chunk)
      } catch (err) {
        retry = chunk
        failure = err.message
      }
      // Comments the batch failed on are tried again one at a time, so one bad reply
      // doesn't fail its neighbours.
      if (retry.length && chunk.length > 1) {
        for (const id of retry) {
          if (isCancelled()) break
          try {
            const missing = await review([id])
            if (missing.length) onError(missing, 'The model did not return a QC comment for this comment.')
          } catch (err) {
            onError([id], err.message)
          }
        }
      } else if (retry.length) {
        onError(retry, failure)
      }
      done += chunk.length
      onProgress(done, ids.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker))
}

// Ticket-level categories, judged once on the whole ticket.
const TICKET_CATEGORIES = {
  comprehension: {
    name: 'Comprehension',
    fallback: "Summarize the customer's original issue/request clearly. Determine whether the agent correctly understood the issue.",
  },
  resolution: {
    name: 'Resolution Accuracy',
    fallback:
      'Determine whether the issue was fully resolved and whether the resolution logically addressed the problem. ' +
      'Identify incorrect, incomplete or unsupported resolution steps, missed escalations, or an unresolved issue.',
  },
}

function ticketSystemPrompt(prompt) {
  const { comprehension, resolution } = TICKET_CATEGORIES
  return `You are a support QA reviewer. Read the whole Zendesk ticket history and write a QC comment on two rubric categories for the ticket as a whole.

### ${comprehension.name}
${rubricSection(prompt, comprehension)}

### ${resolution.name}
${rubricSection(prompt, resolution)}

Rules:
- Comprehension is always assessed: summarise the customer's original issue or request in 1-2 sentences, score 1-5, and comment in 1-3 sentences on whether the agents understood it (quote evidence where useful).
- Resolution Accuracy is assessed when the ticket contains a resolution: the agents fixed the problem, answered the question, completed the request, or gave a definitive outcome (including an agreed workaround or a justified "cannot be done"). A ticket whose status is Solved or Closed is ALWAYS assessed: set "resolved" to true, summarise the outcome, and if the agents closed it without a real or correct outcome, score it low and say why.
- For a ticket that is not Solved or Closed with no resolution yet (still investigating, waiting on a third party or the customer), set "resolved" to false and leave the other resolution fields null.
- Scores: 1 Poor, 2 Below Standard, 3 Acceptable, 4 Good, 5 Excellent.
- Use people's names from the history, never ids.
- When quoting the ticket, use single quotes ('like this'); never put double quotes inside a JSON string.

${EMAIL_REPLY_RULE}

Respond ONLY with one JSON object:
{"comprehension":{"issue_summary":string,"score":integer,"comment":string},
 "resolution":{"resolved":boolean,"resolution_summary":string|null,"score":integer|null,"comment":string|null}}`
}

const score = v => {
  const n = Math.round(Number(v))
  return v != null && Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null
}

// Comprehension and Resolution Accuracy for the whole ticket. Shown only, never stored.
export async function runTicketQc({ ticket, items }) {
  const { ollama } = getSettings()
  const user = [
    `TICKET #${ticket.id}: ${ticket.subject}`,
    `Current status ${ticket.status}, group ${ticket.group ?? '—'}, assignee ${ticket.assignee ?? '—'}, requester ${ticket.requester ?? '—'}`,
    `FULL TICKET HISTORY (oldest first)\n${contextText(items)}`,
  ].join('\n\n')
  const closed = ['solved', 'closed'].includes(String(ticket.status).toLowerCase())
  const system = ticketSystemPrompt(ollama.prompt)
  const isResolved = raw => raw.resolution?.resolved === true || raw.resolution?.resolved === 'true'
  let raw = await callModel(ollama, system, user, TICKET_SCHEMA)
  // A Solved / Closed ticket always gets a Resolution Accuracy assessment; ask once more if the
  // model skipped it.
  if (closed && !isResolved(raw)) {
    console.warn(`Ticket QC #${ticket.id}: solved ticket returned without a resolution assessment; retrying`)
    const retry = await callModel(
      ollama,
      system,
      `${user}\n\nThis ticket is ${ticket.status.toUpperCase()}. You MUST assess Resolution Accuracy: set "resolution.resolved" to true and fill in resolution_summary, score and comment.`,
      TICKET_SCHEMA,
    ).catch(() => null)
    if (retry && isResolved(retry)) raw = retry
  }
  const c = raw.comprehension || {}
  const r = raw.resolution || {}
  const resolved = isResolved(raw) || closed
  return {
    model: ollama.model,
    createdAt: new Date().toISOString(),
    comprehension: {
      issueSummary: String(c.issue_summary ?? '').trim(),
      score: score(c.score),
      comment: String(c.comment ?? '').trim(),
    },
    resolution: resolved
      ? {
          resolved: true,
          resolutionSummary: String(r.resolution_summary ?? '').trim(),
          score: score(r.score),
          comment:
            String(r.comment ?? '').trim() ||
            (isResolved(raw) ? '' : `The ticket is ${ticket.status} but the AI could not identify a resolution in its history. Use Re-run QC comments to try again.`),
        }
      : { resolved: false },
  }
}
