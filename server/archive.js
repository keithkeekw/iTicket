// Settings › Archive: moves the app's data for tickets closed in a date range out of the database
// into a JSON file (server/data/archives/YYYYMMDD-YYYYMMDD.json), and puts it back on restore.
//
// "Closed in the range" = Zendesk status Closed and last updated in the range (this computer's
// time zone): a closed ticket can't be changed any more, so its last update is when it was closed. Archived per ticket: every review
// (current and previous versions), their score edits, reviewer comments and related links.
// Ignored-ticket flags and lookup caches stay in the database.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './settings.js'
import { db } from './db.js'
import { zdGet } from './zendesk.js'

export const ARCHIVE_DIR = path.join(DATA_DIR, 'archives')
const FORMAT = 1

const badRequest = message => Object.assign(new Error(message), { status: 400 })
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function checkRange({ start, end } = {}) {
  if (!ISO_DAY.test(start || '') || !ISO_DAY.test(end || '')) throw badRequest('Choose a start date and an end date.')
  if (start > end) throw badRequest('The start date must be on or before the end date.')
  return { start, end }
}

// e.g. 2026-11-01 … 2026-11-05 → 20261101-20261105
export const archiveName = ({ start, end }) => `${start.replaceAll('-', '')}-${end.replaceAll('-', '')}`

// YYYY-MM-DD of a timestamp in this computer's time zone (as the app shows dates).
const pad = n => String(n).padStart(2, '0')
const localDay = ts => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const marks = list => list.map(() => '?').join(',')

// Every ticket the app holds data for (reviews, comments or related links).
const ticketsWithData = () =>
  db
    .prepare('SELECT ticket_id FROM reviews UNION SELECT ticket_id FROM ticket_comments UNION SELECT ticket_id FROM related_links')
    .all()
    .map(r => r.ticket_id)

// Of the tickets the app holds data for, those now Closed in Zendesk whose last update (when it
// was closed) falls in the range, both days included. Asking Zendesk about only these tickets,
// 100 per request, is much faster than searching every closed ticket. Returns
// { tickets: [{ id, subject, closedAt }], missing } (missing = tickets Zendesk no longer has).
async function closedTickets({ start, end }) {
  const ids = ticketsWithData()
  const found = []
  let seen = 0
  const chunks = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  for (let i = 0; i < chunks.length; i += 4) {
    await Promise.all(
      chunks.slice(i, i + 4).map(async chunk => {
        const page = await zdGet(`/api/v2/tickets/show_many.json?ids=${chunk.join(',')}`)
        for (const t of page.tickets || []) {
          seen++
          const day = localDay(t.updated_at)
          if (t.status === 'closed' && day >= start && day <= end) {
            found.push({ id: t.id, subject: t.subject || '', closedAt: t.updated_at })
          }
        }
      }),
    )
  }
  return { tickets: found.sort((a, b) => a.id - b.id), missing: ids.length - seen }
}

// Runs `sql` (with one IN (…) placeholder list) over `ids` in chunks.
function allIn(sql, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    rows.push(...db.prepare(sql.replace('(?)', `(${marks(chunk)})`)).all(...chunk))
  }
  return rows
}
function runIn(sql, ids) {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    db.prepare(sql.replace('(?)', `(${marks(chunk)})`)).run(...chunk)
  }
}

// The app's data for the given tickets, as raw table rows.
function gather(ticketIds) {
  const reviews = allIn('SELECT * FROM reviews WHERE ticket_id IN (?) ORDER BY ticket_id, reviewed_at', ticketIds)
  const reviewEdits = allIn('SELECT * FROM review_edits WHERE review_id IN (?) ORDER BY id', reviews.map(r => r.id))
  const comments = allIn('SELECT * FROM ticket_comments WHERE ticket_id IN (?) ORDER BY id', ticketIds)
  const links = allIn('SELECT * FROM related_links WHERE ticket_id IN (?) ORDER BY id', ticketIds)
  return { reviews, reviewEdits, comments, links }
}

function countsOf(data, closedCount) {
  const tickets = new Set([...data.reviews, ...data.comments, ...data.links].map(r => r.ticket_id))
  return {
    closedTickets: closedCount,
    tickets: tickets.size,
    reviews: data.reviews.filter(r => r.superseded_by == null).length,
    previousVersions: data.reviews.filter(r => r.superseded_by != null).length,
    scoreEdits: data.reviewEdits.length,
    comments: data.comments.length,
    links: data.links.length,
  }
}

// A file name that isn't taken yet: 20261101-20261105, then 20261101-20261105-2, …
function freeName(base) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
  const taken = name => fs.existsSync(path.join(ARCHIVE_DIR, `${name}.json`)) || fs.existsSync(path.join(ARCHIVE_DIR, `${name}.restored.json`))
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`
}

let busy = false
async function exclusive(fn) {
  if (busy) throw Object.assign(new Error('An archive or restore is already running. Try again in a moment.'), { status: 409 })
  busy = true
  try {
    return await fn()
  } finally {
    busy = false
  }
}

// What an archive of this range would hold, without changing anything.
export async function previewArchive(range) {
  const { start, end } = checkRange(range)
  const { tickets: closed } = await closedTickets({ start, end })
  const data = gather(closed.map(t => t.id))
  return { name: archiveName({ start, end }), start, end, counts: countsOf(data, closed.length) }
}

// Writes the archive file, checks it reads back complete, then removes the data from the database.
export function createArchive(range) {
  return exclusive(async () => {
    const { start, end } = checkRange(range)
    const { tickets: closed } = await closedTickets({ start, end })
    const data = gather(closed.map(t => t.id))
    const counts = countsOf(data, closed.length)
    if (!counts.tickets) throw badRequest('Nothing to archive: no tickets closed in this range have reviews, comments or links in the app.')

    const name = freeName(archiveName({ start, end }))
    const withData = new Set([...data.reviews, ...data.comments, ...data.links].map(r => r.ticket_id))
    const archive = {
      format: FORMAT,
      name,
      start,
      end,
      createdAt: new Date().toISOString(),
      counts,
      tickets: closed.filter(t => withData.has(t.id)),
      ...data,
    }
    const file = path.join(ARCHIVE_DIR, `${name}.json`)
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(archive, null, 1))
    const check = JSON.parse(fs.readFileSync(tmp, 'utf8'))
    if (check.reviews.length !== data.reviews.length || check.comments.length !== data.comments.length) {
      fs.rmSync(tmp, { force: true })
      throw new Error('The archive file could not be verified; nothing was removed.')
    }
    fs.renameSync(tmp, file)

    db.exec('BEGIN')
    try {
      runIn('DELETE FROM review_edits WHERE id IN (?)', data.reviewEdits.map(r => r.id))
      runIn('DELETE FROM reviews WHERE id IN (?)', data.reviews.map(r => r.id))
      runIn('DELETE FROM ticket_comments WHERE id IN (?)', data.comments.map(r => r.id))
      runIn('DELETE FROM related_links WHERE id IN (?)', data.links.map(r => r.id))
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`The archive file was saved but the data could not be removed from the app: ${err.message}`)
    }
    return summary(archive, file)
  })
}

function summary(archive, file) {
  const restored = file.endsWith('.restored.json')
  return {
    name: archive.name,
    start: archive.start,
    end: archive.end,
    createdAt: archive.createdAt,
    restoredAt: archive.restoredAt || null,
    restored,
    counts: archive.counts,
    size: fs.statSync(file).size,
  }
}

// Every archive, newest first. Restored archives stay listed (marked restored) as a record.
export function listArchives() {
  if (!fs.existsSync(ARCHIVE_DIR)) return []
  return fs
    .readdirSync(ARCHIVE_DIR)
    .filter(f => f.endsWith('.json'))
    .flatMap(f => {
      const file = path.join(ARCHIVE_DIR, f)
      try {
        return [summary(JSON.parse(fs.readFileSync(file, 'utf8')), file)]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Path of an archive's file, by name (restored or not); throws 404 when there is none.
export function archiveFile(name) {
  if (!/^\d{8}-\d{8}(-\d+)?$/.test(name || '')) throw Object.assign(new Error('Unknown archive.'), { status: 404 })
  for (const f of [`${name}.json`, `${name}.restored.json`]) {
    const file = path.join(ARCHIVE_DIR, f)
    if (fs.existsSync(file)) return file
  }
  throw Object.assign(new Error('Unknown archive.'), { status: 404 })
}

// Permanently deletes an archive's file (restored or not). Data still in the archive (not
// restored) is gone for good: the file is its only copy.
export function deleteArchive(name) {
  return exclusive(async () => {
    const file = archiveFile(name)
    const restored = file.endsWith('.restored.json')
    fs.rmSync(file)
    return { name, deleted: true, restored }
  })
}

// Inserts rows into `table`, keeping their original ids; columns the table no longer has are
// dropped and rows that already exist are skipped. Returns how many were added.
function insertRows(table, rows) {
  if (!rows.length) return 0
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name))
  let added = 0
  for (const row of rows) {
    const keys = Object.keys(row).filter(k => columns.has(k))
    const result = db
      .prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${marks(keys)})`)
      .run(...keys.map(k => row[k]))
    added += Number(result.changes)
  }
  return added
}

// Puts an archive's data back. If a ticket was reviewed again after it was archived, that newer
// review stays current and the restored ones become its previous versions.
export function restoreArchive(name) {
  return exclusive(async () => {
    const file = archiveFile(name)
    if (file.endsWith('.restored.json')) throw badRequest('This archive has already been restored.')
    const archive = JSON.parse(fs.readFileSync(file, 'utf8'))
    const added = {}
    db.exec('BEGIN')
    try {
      added.reviews = insertRows('reviews', archive.reviews || [])
      added.scoreEdits = insertRows('review_edits', archive.reviewEdits || [])
      added.comments = insertRows('ticket_comments', archive.comments || [])
      added.links = insertRows('related_links', archive.links || [])
      // One current review per ticket: the newest.
      const ticketIds = [...new Set((archive.reviews || []).map(r => r.ticket_id))]
      for (const ticketId of ticketIds) {
        const current = db
          .prepare('SELECT id, reviewed_at FROM reviews WHERE ticket_id = ? AND superseded_by IS NULL ORDER BY reviewed_at DESC, id DESC')
          .all(ticketId)
        const [newest, ...older] = current
        for (const r of older) {
          db.prepare('UPDATE reviews SET superseded_by = ?, superseded_at = ? WHERE id = ?').run(newest.id, newest.reviewed_at, r.id)
        }
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    archive.restoredAt = new Date().toISOString()
    const restoredFile = path.join(ARCHIVE_DIR, `${archive.name}.restored.json`)
    fs.writeFileSync(restoredFile, JSON.stringify(archive, null, 1))
    fs.rmSync(file)
    return { ...summary(archive, restoredFile), added }
  })
}
