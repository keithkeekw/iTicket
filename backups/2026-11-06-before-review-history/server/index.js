import fs from 'node:fs'
import path from 'node:path'
import compression from 'compression'
import express from 'express'
import { ROOT, getSettings, isMasked, publicSettings, saveSettings } from './settings.js'
import { clearLookupCache, getTicketDetails, listGroups, listTicketFields, testConnection } from './zendesk.js'
import { SYSTEM_FIELDS, lastRun, runQc } from './qc.js'
import { listModels } from './ollama.js'
import {
  addComment,
  deleteComment,
  deleteRelated,
  deleteReview,
  exportReviews,
  getReview,
  listComments,
  listReviews,
  reviewFacets,
  updateComment,
} from './db.js'
import {
  countMatchingReviews,
  exportMatchingReviews,
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
} from './reviews.js'
import { inspectTicket } from './inspector.js'
import { ticketFieldValues } from './field-values.js'
import { agentCommentIds, qcUnavailable, runCommentQc, runTicketQc } from './inspector-qc.js'

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

app.post('/api/qc/run', handle(req => runQc(req.body)))
app.get('/api/qc/last', handle(() => lastRun()))

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
app.delete('/api/reviews/:id', handle(req => ({ deleted: deleteReview(Number(req.params.id)) })))
// Re-review a saved review's ticket; the new review replaces (deletes) the old record.
app.post('/api/reviews/:id/rereview', handle(req => rereviewAndReplace(req.params.id)))
// Manually change category scores; a justification is mandatory and every change is logged.
app.patch('/api/reviews/:id/scores', handle(req => editReviewScores(req.params.id, req.body || {})))
// Ignore / unignore tickets for Quality Review: { ids, ignored: true | false }.
app.post('/api/tickets/ignore', handle(req => setTicketsIgnored(req.body || {})))
// Every ignored ticket (by hand, or by a subject rule on a saved review) for the Ignored tickets tab.
app.get('/api/tickets/ignored', handle(() => listIgnoredTickets()))

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
    send({ type: 'timeline', data: { ...data, qc: { pending: todo, ticketPending: runQc, unavailable } } })
    if (runQc) {
      // Progress over both jobs; the ticket-level assessment counts as 3 comments.
      const TICKET_WEIGHT = 3
      let commentsDone = 0
      let ticketDone = false
      const report = () => {
        const done = commentsDone + (ticketDone ? TICKET_WEIGHT : 0)
        const parts = [
          todo.length ? `${commentsDone} of ${todo.length} agent comments` : null,
          ticketDone ? 'ticket assessment done' : 'assessing comprehension and resolution',
        ].filter(Boolean)
        progress(72 + Math.round((28 * done) / (todo.length + TICKET_WEIGHT)), `Writing QC comments: ${parts.join(' · ')}…`)
      }
      report()
      await Promise.all([
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
app.listen(port, '127.0.0.1', () => console.log(`XR Ticket Insight server on http://localhost:${port}`))
