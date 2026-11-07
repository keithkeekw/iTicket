// SQLite store for Quality Review results (Node's built-in node:sqlite, no native dependency).
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIR } from './settings.js'

fs.mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'ticket-qc.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reviews (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id          INTEGER NOT NULL,
    reviewed_at        TEXT    NOT NULL,
    model              TEXT    NOT NULL,
    subject            TEXT,
    ticket_status      TEXT,
    group_name         TEXT,
    assignee_name      TEXT,
    resolving_agent    TEXT,
    date_solved        TEXT,
    total_score        REAL,
    rating             TEXT,
    side_conversations INTEGER,
    instructions       TEXT,   -- reviewer instructions in force when the review ran
    result_json        TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reviews_ticket ON reviews (ticket_id, reviewed_at);
  CREATE INDEX IF NOT EXISTS reviews_time ON reviews (reviewed_at);

  -- Zendesk tickets or Jira issues linked to a reviewed ticket by the reviewer, with a note.
  -- ref is the Zendesk ticket number or the Jira issue key (e.g. TSD-1234).
  CREATE TABLE IF NOT EXISTS related_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL,
    kind       TEXT    NOT NULL CHECK (kind IN ('zendesk', 'jira')),
    ref        TEXT    NOT NULL,
    title      TEXT,
    comment    TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE (ticket_id, kind, ref)
  );

  -- Free-text reviewer comments on a ticket (any number per ticket).
  CREATE TABLE IF NOT EXISTS ticket_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ticket_comments_ticket ON ticket_comments (ticket_id, created_at);

  -- Manual changes to a review's category scores, each with the reviewer's justification.
  CREATE TABLE IF NOT EXISTS review_edits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id     INTEGER NOT NULL,
    edited_at     TEXT    NOT NULL,
    justification TEXT    NOT NULL,
    changes_json  TEXT    NOT NULL,  -- [{ name, from, to }]
    total_before  REAL,
    total_after   REAL,
    rating_before TEXT,
    rating_after  TEXT
  );
  CREATE INDEX IF NOT EXISTS review_edits_review ON review_edits (review_id, edited_at);

  -- Tickets flagged "Ignore": they are skipped by Quality Review until unignored.
  CREATE TABLE IF NOT EXISTS ignored_tickets (
    ticket_id  INTEGER PRIMARY KEY,
    ignored_at TEXT NOT NULL
  );
`)

// Columns added after the first release; existing databases get them on startup.
const reviewColumns = new Set(db.prepare('PRAGMA table_info(reviews)').all().map(c => c.name))
if (!reviewColumns.has('reopens')) db.exec('ALTER TABLE reviews ADD COLUMN reopens INTEGER')

// The first release stored Zendesk-only links in related_tickets; move them to related_links.
const hasOldTable = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'related_tickets'")
  .get()
if (hasOldTable) {
  db.exec(`
    BEGIN;
    INSERT OR IGNORE INTO related_links (ticket_id, kind, ref, title, comment, created_at, updated_at)
      SELECT ticket_id, 'zendesk', CAST(related_ticket_id AS TEXT), related_subject, comment, created_at, updated_at
      FROM related_tickets;
    DROP TABLE related_tickets;
    COMMIT;
  `)
}

const insert = db.prepare(`
  INSERT INTO reviews (ticket_id, reviewed_at, model, subject, ticket_status, group_name, assignee_name,
    resolving_agent, date_solved, total_score, rating, side_conversations, reopens, instructions, result_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

// Row shape returned to the API: summary columns plus the parsed full result.
function toReview(row) {
  if (!row) return null
  return {
    id: row.id,
    ticketId: row.ticket_id,
    reviewedAt: row.reviewed_at,
    model: row.model,
    subject: row.subject,
    ticketStatus: row.ticket_status,
    group: row.group_name,
    assigneeName: row.assignee_name,
    resolvingAgent: row.resolving_agent,
    dateSolved: row.date_solved,
    total: row.total_score,
    rating: row.rating,
    sideConversations: row.side_conversations,
    reopens: row.reopens ?? null,
    ...(row.related_count != null ? { relatedCount: row.related_count } : {}),
    ...(row.comment_count != null ? { commentCount: row.comment_count } : {}),
    ...(row.edit_count != null ? { editCount: row.edit_count, lastEditJustification: row.last_edit_justification } : {}),
    ...(row.ignored != null ? { ignored: Boolean(row.ignored) } : {}),
    ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}),
  }
}

export function saveReview(review, { subject, status, group, instructions }) {
  const reviewedAt = new Date().toISOString()
  const { lastInsertRowid } = insert.run(
    review.ticketId,
    reviewedAt,
    review.model,
    subject ?? null,
    status ?? null,
    group ?? null,
    review.assigneeName ?? null,
    review.resolvingAgent ?? null,
    review.dateSolved ?? null,
    review.tqr?.total ?? null,
    review.tqr?.rating ?? null,
    review.sideConversations ?? null,
    review.reopens ?? null,
    instructions ?? null,
    JSON.stringify(review),
  )
  return getReview(Number(lastInsertRowid))
}

export function getReview(id) {
  const review = toReview(db.prepare('SELECT * FROM reviews WHERE id = ?').get(id))
  return review && { ...review, edits: editsFor([review.id]).get(review.id) || [] }
}

// ---------- Score edits ----------

function toEdit(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    editedAt: row.edited_at,
    justification: row.justification,
    changes: JSON.parse(row.changes_json),
    totalBefore: row.total_before,
    totalAfter: row.total_after,
    ratingBefore: row.rating_before,
    ratingAfter: row.rating_after,
  }
}

// Score edits per review, oldest first: Map reviewId -> [edit].
export function editsFor(reviewIds) {
  const byReview = new Map()
  for (let i = 0; i < reviewIds.length; i += 500) {
    const chunk = reviewIds.slice(i, i + 500)
    const rows = db
      .prepare(`SELECT * FROM review_edits WHERE review_id IN (${chunk.map(() => '?').join(',')}) ORDER BY edited_at`)
      .all(...chunk)
    for (const r of rows) byReview.set(r.review_id, [...(byReview.get(r.review_id) || []), toEdit(r)])
  }
  return byReview
}

// Saves new scores for a review and records the edit, in one transaction.
export function applyScoreEdit(reviewId, { result, total, rating, justification, changes, totalBefore, ratingBefore }) {
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE reviews SET result_json = ?, total_score = ?, rating = ? WHERE id = ?').run(
      JSON.stringify(result),
      total,
      rating,
      reviewId,
    )
    db.prepare(
      `INSERT INTO review_edits (review_id, edited_at, justification, changes_json, total_before, total_after,
         rating_before, rating_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(reviewId, new Date().toISOString(), justification, JSON.stringify(changes), totalBefore, total, ratingBefore, rating)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// A query-string filter as a list: absent → [], "a" → ["a"], ["a","b"] → ["a","b"].
const asList = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v])

// SQL WHERE clause for the saved-review filters, shared by the list, the count and the export so
// they always agree. `from`/`to` are ISO timestamps (to is exclusive); `latestOnly` keeps each
// ticket's newest review. rating/group/assignee/resolvingAgent/status accept one value or a list
// (matching any); `related` is 'with' and/or 'without' linked tickets.
function reviewFilter({ ids, from, to, rating, q, group, assignee, resolvingAgent, status, related, latestOnly } = {}) {
  const where = []
  const args = []
  const add = (clause, value) => {
    where.push(clause)
    args.push(value)
  }
  if (from) add('reviewed_at >= ?', from)
  if (to) add('reviewed_at < ?', to)
  const addIn = (column, values) => {
    const list = asList(values)
    if (!list.length) return
    where.push(`${column} IN (${list.map(() => '?').join(',')})`)
    args.push(...list)
  }
  addIn('id', ids)
  addIn('rating', rating)
  addIn('group_name', group)
  addIn('assignee_name', assignee)
  addIn('resolving_agent', resolvingAgent)
  addIn('ticket_status', status)
  const relatedList = asList(related)
  // Only one of with/without narrows the list; both (or neither) means every review.
  if (relatedList.length === 1 && ['with', 'without'].includes(relatedList[0])) {
    where.push(`${relatedList[0] === 'without' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM related_links rt WHERE rt.ticket_id = reviews.ticket_id)`)
  }
  if (latestOnly === true || latestOnly === 'true') {
    where.push('reviewed_at = (SELECT MAX(r2.reviewed_at) FROM reviews r2 WHERE r2.ticket_id = reviews.ticket_id)')
  }
  if (q) {
    where.push(
      "(CAST(ticket_id AS TEXT) LIKE ? OR subject LIKE ? OR assignee_name LIKE ? OR resolving_agent LIKE ? OR group_name LIKE ?)",
    )
    args.push(...Array(5).fill(`%${q}%`))
  }
  return { clause: where.length ? ` WHERE ${where.join(' AND ')}` : '', args }
}

// Most rows the Saved reviews list returns in one go; the export has no such cap.
export const MAX_LIST_ROWS = 5000

// Saved reviews matching the filters, newest first, at most `limit` rows. The full result is left
// out of list rows to keep them small.
export function listReviews({ limit = 500, ...filters } = {}) {
  const { clause, args } = reviewFilter(filters)
  const sql =
    `SELECT id, ticket_id, reviewed_at, model, subject, ticket_status, group_name, assignee_name, resolving_agent,
       date_solved, total_score, rating, side_conversations, reopens,
       (SELECT COUNT(*) FROM related_links rt WHERE rt.ticket_id = reviews.ticket_id) AS related_count,
       (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = reviews.ticket_id) AS comment_count,
       (SELECT COUNT(*) FROM review_edits re WHERE re.review_id = reviews.id) AS edit_count,
       (SELECT re.justification FROM review_edits re WHERE re.review_id = reviews.id
          ORDER BY re.edited_at DESC LIMIT 1) AS last_edit_justification,
       EXISTS (SELECT 1 FROM ignored_tickets it WHERE it.ticket_id = reviews.ticket_id) AS ignored,
       json_extract(result_json, '$.tqr.categories') AS categories_json
     FROM reviews` +
    clause +
    ' ORDER BY reviewed_at DESC LIMIT ?'
  return db
    .prepare(sql)
    .all(...args, Math.min(Number(limit) || 500, MAX_LIST_ROWS))
    .map(row => ({ ...toReview(row), scores: categoryScores(row.categories_json) }))
}

// How many saved reviews match the filters (no cap).
export function countReviews(filters = {}) {
  const { clause, args } = reviewFilter(filters)
  return db.prepare(`SELECT COUNT(*) AS n FROM reviews${clause}`).get(...args).n
}

// Every saved review matching the filters, newest first, with no cap: [{ id, ticketId, reopens }].
// Just enough to apply the re-review filter before loading the full reviews for export.
export function matchingReviewKeys(filters = {}) {
  const { clause, args } = reviewFilter(filters)
  return db
    .prepare(`SELECT id, ticket_id, reopens FROM reviews${clause} ORDER BY reviewed_at DESC`)
    .all(...args)
    .map(r => ({ id: r.id, ticketId: r.ticket_id, reopens: r.reopens }))
}

// Per-category scores for the Scoring view, without the findings text: [{ name, weight, score, weighted }].
function categoryScores(json) {
  if (!json) return []
  try {
    return JSON.parse(json).map(c => ({ name: c.name, weight: c.weight, score: c.score, weighted: c.weighted }))
  } catch {
    return []
  }
}

// Distinct values for the Saved reviews filter dropdowns.
export function reviewFacets() {
  const distinct = column =>
    db
      .prepare(`SELECT DISTINCT ${column} AS v FROM reviews WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY v`)
      .all()
      .map(r => r.v)
  return {
    groups: distinct('group_name'),
    assignees: distinct('assignee_name'),
    resolvingAgents: distinct('resolving_agent'),
    statuses: distinct('ticket_status'),
  }
}

// Most recent review summary per ticket, for marking search results as already reviewed.
export function latestReviewsFor(ticketIds) {
  if (!ticketIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT r.id, r.ticket_id, r.reviewed_at, r.total_score, r.rating, r.reopens FROM reviews r
       JOIN (SELECT ticket_id, MAX(reviewed_at) AS latest FROM reviews
             WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')}) GROUP BY ticket_id) m
         ON m.ticket_id = r.ticket_id AND m.latest = r.reviewed_at`,
    )
    .all(...ticketIds)
  return new Map(rows.map(r => [r.ticket_id, { id: r.id, reviewedAt: r.reviewed_at, total: r.total_score, rating: r.rating, reopens: r.reopens }]))
}

// Full saved results for CSV export (category scores and findings, plus reviewer comments).
export function exportReviews(ids) {
  if (!ids.length) return []
  // In chunks, so thousands of ids stay within SQLite's limit on query parameters.
  const reviews = []
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    reviews.push(...db.prepare(`SELECT * FROM reviews WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...chunk).map(toReview))
  }
  reviews.sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : a.reviewedAt > b.reviewedAt ? -1 : 0))
  const comments = commentsFor([...new Set(reviews.map(r => r.ticketId))])
  const edits = editsFor(reviews.map(r => r.id))
  return reviews.map(r => ({ ...r, comments: comments.get(r.ticketId) || [], edits: edits.get(r.id) || [] }))
}

// ---------- Related tickets (Zendesk tickets and Jira issues) ----------

function toRelated(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind,
    ref: row.ref,
    title: row.title,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const getLink = id => toRelated(db.prepare('SELECT * FROM related_links WHERE id = ?').get(id))

export function listRelated(ticketId) {
  return db
    .prepare('SELECT * FROM related_links WHERE ticket_id = ? ORDER BY created_at')
    .all(ticketId)
    .map(toRelated)
}

export function relatedCountsFor(ticketIds) {
  if (!ticketIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT ticket_id, COUNT(*) AS n FROM related_links
       WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')}) GROUP BY ticket_id`,
    )
    .all(...ticketIds)
  return new Map(rows.map(r => [r.ticket_id, r.n]))
}

export function addRelated({ ticketId, kind, ref, title, comment }) {
  const now = new Date().toISOString()
  try {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO related_links (ticket_id, kind, ref, title, comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(ticketId, kind, ref, title ?? null, comment || null, now, now)
    return getLink(Number(lastInsertRowid))
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      const label = kind === 'jira' ? `Jira issue ${ref}` : `Zendesk ticket #${ref}`
      throw Object.assign(new Error(`${label} is already linked.`), { status: 409 })
    }
    throw err
  }
}

export function updateRelatedComment(id, comment) {
  const now = new Date().toISOString()
  const { changes } = db
    .prepare('UPDATE related_links SET comment = ?, updated_at = ? WHERE id = ?')
    .run(comment || null, now, id)
  return changes ? getLink(id) : null
}

export function deleteRelated(id) {
  return db.prepare('DELETE FROM related_links WHERE id = ?').run(id).changes > 0
}

// ---------- Reviewer comments ----------

function toComment(row) {
  return { id: row.id, ticketId: row.ticket_id, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at }
}

const getComment = id => toComment(db.prepare('SELECT * FROM ticket_comments WHERE id = ?').get(id))

export function listComments(ticketId) {
  return db
    .prepare('SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at')
    .all(ticketId)
    .map(toComment)
}

export function commentCountsFor(ticketIds) {
  if (!ticketIds.length) return new Map()
  const rows = db
    .prepare(
      `SELECT ticket_id, COUNT(*) AS n FROM ticket_comments
       WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')}) GROUP BY ticket_id`,
    )
    .all(...ticketIds)
  return new Map(rows.map(r => [r.ticket_id, r.n]))
}

// All comments for these tickets, oldest first, for CSV export.
export function commentsFor(ticketIds) {
  const byTicket = new Map()
  for (let i = 0; i < ticketIds.length; i += 500) {
    const chunk = ticketIds.slice(i, i + 500)
    const rows = db
      .prepare(`SELECT * FROM ticket_comments WHERE ticket_id IN (${chunk.map(() => '?').join(',')}) ORDER BY created_at`)
      .all(...chunk)
    for (const r of rows) byTicket.set(r.ticket_id, [...(byTicket.get(r.ticket_id) || []), toComment(r)])
  }
  return byTicket
}

export function addComment(ticketId, body) {
  const now = new Date().toISOString()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO ticket_comments (ticket_id, body, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(ticketId, body, now, now)
  return getComment(Number(lastInsertRowid))
}

export function updateComment(id, body) {
  const { changes } = db
    .prepare('UPDATE ticket_comments SET body = ?, updated_at = ? WHERE id = ?')
    .run(body, new Date().toISOString(), id)
  return changes ? getComment(id) : null
}

export function deleteComment(id) {
  return db.prepare('DELETE FROM ticket_comments WHERE id = ?').run(id).changes > 0
}

export function deleteReview(id) {
  db.prepare('DELETE FROM review_edits WHERE review_id = ?').run(id)
  return db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes > 0
}

// ---------- Ignored tickets ----------

// Flags (ignored = true) or unflags tickets; returns how many changed.
export function setIgnored(ticketIds, ignored) {
  const now = new Date().toISOString()
  const add = db.prepare('INSERT OR IGNORE INTO ignored_tickets (ticket_id, ignored_at) VALUES (?, ?)')
  const remove = db.prepare('DELETE FROM ignored_tickets WHERE ticket_id = ?')
  let changed = 0
  db.exec('BEGIN')
  try {
    for (const id of ticketIds) changed += (ignored ? add.run(id, now) : remove.run(id)).changes
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return changed
}

// Map ticketId -> ignoredAt for the given tickets that are ignored.
export function ignoredFor(ticketIds) {
  if (!ticketIds.length) return new Map()
  const rows = db
    .prepare(`SELECT ticket_id, ignored_at FROM ignored_tickets WHERE ticket_id IN (${ticketIds.map(() => '?').join(',')})`)
    .all(...ticketIds)
  return new Map(rows.map(r => [r.ticket_id, r.ignored_at]))
}

// Every ticket flagged Ignore by hand: [{ ticketId, ignoredAt }], most recently ignored first.
export function listIgnored() {
  return db
    .prepare('SELECT ticket_id, ignored_at FROM ignored_tickets ORDER BY ignored_at DESC')
    .all()
    .map(r => ({ ticketId: r.ticket_id, ignoredAt: r.ignored_at }))
}

export function isIgnored(ticketId) {
  return Boolean(db.prepare('SELECT 1 FROM ignored_tickets WHERE ticket_id = ?').get(ticketId))
}

// ---------- Ticket creation dates ----------
// Zendesk creation date per ticket, cached because it never changes; used by the hard rule that
// tickets created before 2026 are ignored (server/hard-rules.js).
db.exec(`CREATE TABLE IF NOT EXISTS ticket_created (
  ticket_id  INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
)`)

// Map ticketId -> created_at for the given tickets that are cached.
export function createdFor(ticketIds) {
  const out = new Map()
  for (let i = 0; i < ticketIds.length; i += 500) {
    const chunk = ticketIds.slice(i, i + 500)
    const rows = db
      .prepare(`SELECT ticket_id, created_at FROM ticket_created WHERE ticket_id IN (${chunk.map(() => '?').join(',')})`)
      .all(...chunk)
    for (const r of rows) out.set(r.ticket_id, r.created_at)
  }
  return out
}

// entries: [[ticketId, createdAt], …]
export function saveCreated(entries) {
  if (!entries.length) return
  const put = db.prepare('INSERT OR REPLACE INTO ticket_created (ticket_id, created_at) VALUES (?, ?)')
  db.exec('BEGIN')
  try {
    for (const [id, at] of entries) put.run(id, at)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Ticket Inspector QC comments are shown only, never stored; remove the table an earlier
// version used to cache them.
db.exec('DROP TABLE IF EXISTS comment_qc')
