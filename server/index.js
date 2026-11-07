import fs from 'node:fs'
import path from 'node:path'
import compression from 'compression'
import express from 'express'
import { ROOT, getSettings, isMasked, publicSettings, saveSettings } from './settings.js'
import { agentProfiles, clearLookupCache, getTicketDetails, groupMemberIdsById, searchAgents, listGroups, listTicketFields, testConnection } from './zendesk.js'
import { SYSTEM_FIELDS, lastRun, runQc, ticketFieldDetails } from './qc.js'
import { listModels, reviewSystemPrompt, suggestMetadata } from './ollama.js'
import { listProviderModels } from './ai.js'
import {
  MAX_LIST_ROWS,
  addComment,
  bookmarksWithoutReview,
  setBookmark,
  deleteComment,
  deleteRelated,
  deleteReview,
  exportReviews,
  getReview,
  latestReviewsFor,
  listComments,
  listReviews,
  reviewFacets,
  updateComment,
} from './db.js'
import {
  countMatchingReviews,
  exportMatchingReviews,
  getReviewHistory,
  editRelatedComment,
  editReviewScores,
  findTickets,
  listReviewsWithRules,
  listIgnoredTickets,
  getRelated,
  linkRelated,
  rereviewAndReplace,
  runAndSaveReview,
  setTicketsIgnored,
  writeReviewFeedback,
} from './reviews.js'
import { inspectTicket } from './inspector.js'
import { ticketFieldValues } from './field-values.js'
import {
  agentCommentIds,
  commentQcSystemPrompt,
  feedbackSystemPrompt,
  groupFallbackIds,
  qcUnavailable,
  runCommentQc,
  runTicketFeedback,
  runTicketQc,
  ticketSystemPrompt,
} from './inspector-qc.js'
import { DEFAULT_FEEDBACK_INSTRUCTIONS } from './prompts.js'
import { automationStatus, planRun, startRun, startScheduler, stopRun } from './automation.js'
import { archiveFile, createArchive, deleteArchive, listArchives, previewArchive, restoreArchive } from './archive.js'

const app = express()
// Gzip responses (the app bundle and large JSON lists shrink by about 70%). The Ticket Inspector
// stream is left uncompressed so its progress events arrive as they are sent.
app.use(
  compression({
    filter: (req, res) =>
      !String(res.getHeader('Content-Type') || '').includes('ndjson') && compression.filter(req, res),
  }),
)
app.use(express.json({ limit: '1mb' }))

// Wraps async handlers so thrown errors become JSON responses.
const handle = fn => async (req, res) => {
  try {
    res.json(await fn(req, res))
  } catch (err) {
    console.error(err)
    res.status(err.status && err.status < 600 ? err.status : 500).json({ error: err.message })
  }
}

app.get('/api/settings', handle(() => publicSettings()))
app.put(
  '/api/settings',
  handle(req => {
    const saved = saveSettings(req.body)
    clearLookupCache() // the Zendesk account or sign-in may have changed
    return publicSettings(saved)
  }),
)

app.post(
  '/api/zendesk/test',
  handle(req => {
    // Test with the values on screen (including the chosen sign-in method), falling back to the
    // saved token / OAuth secret if it was left masked.
    const saved = getSettings().zendesk
    const body = req.body || {}
    const keep = key => (!body[key] || isMasked(body[key]) ? saved[key] : body[key])
    return testConnection({ ...saved, ...body, token: keep('token'), clientSecret: keep('clientSecret') })
  }),
)
app.get('/api/zendesk/groups', handle(() => listGroups()))
app.get(
  '/api/zendesk/fields',
  handle(async () => ({
    system: SYSTEM_FIELDS,
    // Type and Priority are "removable" in Zendesk but are already offered as standard fields.
    custom: (await listTicketFields()).filter(f => !f.system && !['tickettype', 'priority'].includes(f.type)),
  })),
)

app.get('/api/ollama/models', handle(req => listModels(req.query.url)))
// Models the chosen AI provider offers (Settings › AI model): { provider, url?, key? } – `key` is a
// key typed but not saved yet; otherwise the saved key is used.
app.post('/api/ai/models', handle(req => listProviderModels(req.body || {})))

// Prompt Management: the full system prompts as they will be sent, built from the instructions on
// screen (unsaved edits included) by the same functions the reviews use.
app.post(
  '/api/prompts/preview',
  handle(req => {
    const saved = getSettings().ollama
    const prompt = req.body?.prompt ?? saved.prompt
    const feedbackPrompt = req.body?.feedbackPrompt ?? saved.feedbackPrompt
    return {
      review: reviewSystemPrompt(prompt),
      feedback: feedbackSystemPrompt(prompt, feedbackPrompt, '<the Global Production Support agents who wrote comments on the ticket>'),
      commentQc: commentQcSystemPrompt(prompt),
      ticketQc: ticketSystemPrompt(prompt),
      defaults: { feedbackPrompt: DEFAULT_FEEDBACK_INSTRUCTIONS },
    }
  }),
)

app.post('/api/qc/run', handle(req => runQc(req.body)))
app.get('/api/qc/last', handle(() => lastRun()))
// One ticket's required fields with their current and possible values (Metadata QC row details).
app.get('/api/qc/ticket/:id', handle(req => ticketFieldDetails(req.params.id)))
// AI-suggested values for the ticket's missing required fields (cached 30 min; ?refresh=1 asks again).
app.get('/api/qc/ticket/:id/suggest', handle(req => suggestMetadata(req.params.id, { refresh: req.query.refresh === '1' })))

// Quality Review module
app.post('/api/reviews/tickets', handle(req => findTickets(req.body)))
app.post('/api/reviews/run/:ticketId', handle(req => runAndSaveReview(req.params.ticketId)))
// Subject keyword rules (Settings › Quality Review) mark matching saved reviews as ignored too.
app.get('/api/reviews', handle(req => listReviewsWithRules(req.query)))
app.get('/api/reviews/facets', handle(() => reviewFacets()))
// Full reviews by id (scorecards), or, for Export CSV, every review matching { filters } with no cap.
app.post(
  '/api/reviews/export',
  handle(req =>
    req.body?.filters ? exportMatchingReviews(req.body.filters) : exportReviews((req.body?.ids || []).map(Number)),
  ),
)
// How many saved reviews match the filters (the list itself is capped), ignoring re-review.
app.get('/api/reviews/count', handle(req => countMatchingReviews(req.query)))
app.get(
  '/api/reviews/:id',
  handle(req => {
    const review = getReview(Number(req.params.id))
    if (!review) throw Object.assign(new Error('Review not found.'), { status: 404 })
    return review
  }),
)
// Deleting a current review also deletes its previous versions: { deleted, previousDeleted }.
app.delete('/api/reviews/:id', handle(req => deleteReview(Number(req.params.id))))
// Previous versions of a review's ticket (kept when it is reviewed again), newest first.
app.get('/api/reviews/:id/history', handle(req => getReviewHistory(req.params.id)))
// A ticket's current review for the ticket page (/ticket/:id): `row` as in Saved reviews (previous
// versions count, bookmark, …) and `full` with the result and score edits; both null when the
// ticket has no review.
app.get(
  '/api/tickets/:id/review',
  handle(async req => {
    const ticketId = Number(req.params.id)
    const latest = latestReviewsFor([ticketId]).get(ticketId)
    if (!latest) return { row: null, full: null }
    const [row] = await listReviewsWithRules({ ids: [latest.id] })
    return { row: row || null, full: getReview(latest.id) }
  }),
)
// Re-review a saved review's ticket; the new review replaces (deletes) the old record.
app.post('/api/reviews/:id/rereview', handle(req => rereviewAndReplace(req.params.id)))
// Writes and saves Feedback for the agents for a saved review (Ticket Inspector's feedback).
app.post('/api/reviews/:id/feedback', handle(req => writeReviewFeedback(req.params.id)))
// Manually change category scores; a justification is mandatory and every change is logged.
app.patch('/api/reviews/:id/scores', handle(req => editReviewScores(req.params.id, req.body || {})))
// Ignore / unignore tickets for Quality Review: { ids, ignored: true | false }.
app.post('/api/tickets/ignore', handle(req => setTicketsIgnored(req.body || {})))
// Every ignored ticket (by hand, or by a subject rule on a saved review) for the Ignored tickets tab.
app.get('/api/tickets/ignored', handle(req => listIgnoredTickets({ refresh: req.query.refresh === '1' })))

// Current Zendesk custom field values per ticket ({ values, missing }), for the Categories tab.
app.post('/api/tickets/field-values', handle(req => ticketFieldValues(req.body?.ids)))

// Current Zendesk re-open count per ticket ({ ticketId: count }), for flagging re-opens after review.
app.post(
  '/api/tickets/reopens',
  handle(async req => {
    const ids = [...new Set((req.body?.ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
    if (ids.length > 2000) throw Object.assign(new Error('At most 2000 tickets at a time.'), { status: 400 })
    const { reopens } = await getTicketDetails(ids)
    return Object.fromEntries(reopens)
  }),
)

// Ticket Inspector: audit timeline with side conversations
// Streams newline-delimited JSON events so the page can show progress:
//   { type: 'progress', percent, message }  while retrieving and while QC comments run
//   { type: 'timeline', data }               the ticket, timeline items and which comments get QC
//   { type: 'qc', id, result } / { type: 'qc-error', ids, error }   per agent comment
//   { type: 'ticket-qc', result } / { type: 'ticket-qc-error', error }  comprehension and resolution
//   { type: 'feedback', result } / { type: 'feedback-error', error }    coaching feedback for the agents
//   { type: 'done' } or { type: 'error', error, status }
// ?qc=0 skips QC comments. QC comments are written fresh each time and are not stored.
app.get('/api/inspect/:ticketId', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  let closed = false
  res.on('close', () => (closed = true))
  const send = event => !closed && res.write(JSON.stringify(event) + '\n')
  const progress = (percent, message) => send({ type: 'progress', percent, message })
  try {
    const data = await inspectTicket(req.params.ticketId, progress)
    const wantQc = req.query.qc !== '0'
    const unavailable = wantQc ? qcUnavailable() : null
    const runQc = wantQc && !unavailable
    const todo = runQc ? agentCommentIds(data.items) : []
    send({
      type: 'timeline',
      data: { ...data, qc: { pending: todo, ticketPending: runQc, feedbackPending: runQc, unavailable } },
    })
    if (runQc) {
      // Progress over all three jobs; the ticket assessment and the feedback count as 3 comments each.
      const TICKET_WEIGHT = 3
      const FEEDBACK_WEIGHT = 3
      let commentsDone = 0
      let ticketDone = false
      let feedbackDone = false
      const report = () => {
        const done = commentsDone + (ticketDone ? TICKET_WEIGHT : 0) + (feedbackDone ? FEEDBACK_WEIGHT : 0)
        const parts = [
          todo.length ? `${commentsDone} of ${todo.length} agent comments` : null,
          ticketDone ? 'ticket assessment done' : 'assessing comprehension and resolution',
          feedbackDone ? 'feedback done' : 'writing feedback',
        ].filter(Boolean)
        progress(
          72 + Math.round((28 * done) / (todo.length + TICKET_WEIGHT + FEEDBACK_WEIGHT)),
          `Writing QC comments: ${parts.join(' · ')}…`,
        )
      }
      report()
      await Promise.all([
        runTicketFeedback({ ticket: data.ticket, items: data.items })
          .then(
            result => send({ type: 'feedback', result }),
            err => send({ type: 'feedback-error', error: err.message }),
          )
          .finally(() => {
            feedbackDone = true
            report()
          }),
        runTicketQc({ ticket: data.ticket, items: data.items })
          .then(
            result => send({ type: 'ticket-qc', result }),
            err => send({ type: 'ticket-qc-error', error: err.message }),
          )
          .finally(() => {
            ticketDone = true
            report()
          }),
        todo.length &&
          runCommentQc({
            ticket: data.ticket,
            items: data.items,
            ids: todo,
            onResult: (id, result) => send({ type: 'qc', id, result }),
            onError: (ids, error) => send({ type: 'qc-error', ids, error }),
            onProgress: done => {
              commentsDone = done
              report()
            },
            isCancelled: () => closed,
          }),
      ])
    }
    progress(100, 'Done')
    send({ type: 'done' })
  } catch (err) {
    console.error(err)
    send({ type: 'error', error: err.message, status: err.status || 500 })
  }
  res.end()
})

// Related tickets linked to a reviewed ticket
app.get('/api/related/:ticketId', handle(req => getRelated(req.params.ticketId)))
app.post('/api/related/:ticketId', handle(req => linkRelated(req.params.ticketId, req.body || {})))
app.patch('/api/related/item/:id', handle(req => editRelatedComment(req.params.id, req.body?.comment)))
app.delete('/api/related/item/:id', handle(req => ({ deleted: deleteRelated(Number(req.params.id)) })))

// Reviewer comments on a ticket
const commentBody = req => {
  const body = String(req.body?.body ?? '').trim()
  if (!body) throw Object.assign(new Error('Write a comment first.'), { status: 400 })
  if (body.length > 10000) throw Object.assign(new Error('Comments are limited to 10,000 characters.'), { status: 400 })
  return body
}
app.get('/api/comments/:ticketId', handle(req => listComments(Number(req.params.ticketId))))
app.post('/api/comments/:ticketId', handle(req => addComment(Number(req.params.ticketId), commentBody(req))))
app.patch(
  '/api/comments/item/:id',
  handle(req => {
    const updated = updateComment(Number(req.params.id), commentBody(req))
    if (!updated) throw Object.assign(new Error('Comment not found.'), { status: 404 })
    return updated
  }),
)
app.delete('/api/comments/item/:id', handle(req => ({ deleted: deleteComment(Number(req.params.id)) })))

// Quality Review › Bookmarks: tickets a reviewer bookmarked. `reviews` are their current saved
// reviews (same shape as Saved reviews); `withoutReview` are bookmarked tickets whose review was
// deleted or archived.
app.get(
  '/api/bookmarks',
  handle(async () => ({
    reviews: await listReviewsWithRules({ bookmarked: 'with', limit: MAX_LIST_ROWS }),
    withoutReview: bookmarksWithoutReview(),
  })),
)
app.put(
  '/api/bookmarks/:ticketId',
  handle(req => {
    const ticketId = Number(req.params.ticketId)
    if (!Number.isInteger(ticketId) || ticketId <= 0) throw Object.assign(new Error('Unknown ticket.'), { status: 400 })
    return { ticketId, bookmarkedAt: setBookmark(ticketId, req.body?.bookmarked !== false) }
  }),
)

// Settings › Agents: search Zendesk agents to add, and the Global Support group members not in
// L2 Support (the list used while Settings › Agents is empty), to import.
app.get('/api/agents/search', handle(req => searchAgents(req.query.q)))
app.get('/api/agents/group-suggestions', handle(async () => agentProfiles(await groupFallbackIds())))
// The agents in each ticket group selected in Settings › Quality Review (saved settings), for the
// Agents tab: [{ id, name, members: [{ id, name, email, role }] }]. No groups selected = all groups,
// which is too many to list, so `allGroups` is returned instead.
app.get(
  '/api/agents/review-groups',
  handle(async () => {
    const ids = getSettings().review.groupIds.map(Number)
    if (!ids.length) return { allGroups: true, groups: [] }
    const names = new Map((await listGroups()).map(g => [g.id, g.name]))
    const groups = await Promise.all(
      ids.map(async id => ({ id, name: names.get(id) || `Group ${id}`, members: await agentProfiles(await groupMemberIdsById(id)) })),
    )
    return { allGroups: false, groups: groups.sort((a, b) => a.name.localeCompare(b.name)) }
  }),
)

// Settings › Automation: scheduled Quality Review. Status (settings, run in progress, next run,
// recent runs); Preview lists what a run would do now without reviewing; Run now; Stop.
app.get('/api/automation', handle(() => automationStatus()))
app.post('/api/automation/preview', handle(() => planRun()))
app.post('/api/automation/run', handle(() => startRun('manual')))
app.post('/api/automation/stop', handle(() => stopRun()))

// Settings › Archive: data for tickets closed in a date range, moved to JSON files and back.
app.get('/api/archives', handle(() => listArchives()))
app.post('/api/archives/preview', handle(req => previewArchive(req.body || {})))
app.post('/api/archives', handle(req => createArchive(req.body || {})))
app.post('/api/archives/:name/restore', handle(req => restoreArchive(req.params.name)))
app.delete('/api/archives/:name', handle(req => deleteArchive(req.params.name)))
app.get('/api/archives/:name/download', (req, res) => {
  try {
    const file = archiveFile(req.params.name)
    res.download(file, `${req.params.name}.json`)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Serve the built React app in production.
const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  // Built files under /assets have a content hash in their name, so the browser can keep them for a
  // year; index.html is always re-checked so a new build is picked up straight away.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(dist, { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const port = Number(process.env.QC_PORT) || 8765
app.listen(port, '127.0.0.1', () => {
  console.log(`iTicket server on http://localhost:${port}`)
  // Automated Quality Review checks its schedule every 30 seconds (nothing runs while it is off).
  startScheduler()
})
