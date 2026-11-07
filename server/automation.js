// Automated Quality Review (Settings › Automation). When switched on, the server checks every
// half minute whether a scheduled time has come; at that time it searches the tickets Solved on
// the current date (optionally also the day before) in the Quality Review groups and:
//   - reviews every ticket that has no review yet;
//   - re-reviews every ticket re-opened in Zendesk since its latest review (its re-open count went
//     up), keeping the earlier review as a previous version.
// Ignored tickets (by hand, by a subject rule, or created before 2026) are skipped. Runs two at a
// time, like batch review. Switched off, nothing runs on its own: reviews are manual as before.
// The schedule only runs while the app's server is running; a time missed while it was off is not
// caught up. Run now / Preview / Stop are available from the Settings tab.
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, getSettings, normaliseAutomation } from './settings.js'
import { findTickets, runAndSaveReview } from './reviews.js'

const RUNS_FILE = path.join(DATA_DIR, 'automation-runs.json')
const KEEP_RUNS = 50
const CONCURRENCY = 2
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = n => String(n).padStart(2, '0')
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// ---------- Run history ----------

function readRuns() {
  try {
    return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'))
  } catch {
    return []
  }
}
function saveRun(run) {
  const runs = [run, ...readRuns().filter(r => r.id !== run.id)].slice(0, KEEP_RUNS)
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 1))
}

// ---------- Planning ----------

// The tickets a run would handle now, without reviewing anything.
export async function planRun(settings = getSettings().automation, now = new Date()) {
  const a = normaliseAutomation(settings)
  const to = localDay(now)
  const from = a.window === 'today-yesterday' ? localDay(new Date(now.getTime() - 86400000)) : to
  const found = await findTickets({ from, to, statuses: ['solved'] })
  const toReview = []
  const toRereview = []
  let skippedIgnored = 0
  let alreadyReviewed = 0
  for (const t of found.tickets) {
    if (t.ignored) {
      skippedIgnored++
      continue
    }
    const r = t.latestReview
    if (!r) {
      if (a.reviewNew) toReview.push({ id: t.id, subject: t.subject })
      continue
    }
    const reopenedSince = t.reopens != null && r.reopens != null && t.reopens - r.reopens > 0
    if (reopenedSince && a.rereviewReopened) toRereview.push({ id: t.id, subject: t.subject, reviewId: r.id })
    else alreadyReviewed++
  }
  return { window: { from, to }, found: found.tickets.length, truncated: found.truncated, toReview, toRereview, skippedIgnored, alreadyReviewed }
}

// ---------- Running ----------

let current = null // the run in progress
let stopRequested = false

export function automationStatus() {
  const a = normaliseAutomation(getSettings().automation)
  return { settings: a, running: current, nextRun: a.enabled ? nextRunTime(a) : null, runs: readRuns().slice(0, 20) }
}

export function stopRun() {
  if (!current) return { stopped: false }
  stopRequested = true
  current.stopping = true
  return { stopped: true }
}

// Starts a run in the background and returns it at once (409 if one is already running).
export async function startRun(trigger = 'manual') {
  if (current) throw Object.assign(new Error('An automated review is already running.'), { status: 409 })
  const { ollama, zendesk } = getSettings()
  if (!ollama.enabled || !ollama.model) throw Object.assign(new Error('AI review is not set up in Settings › AI model.'), { status: 400 })
  if (!zendesk.subdomain) throw Object.assign(new Error('Zendesk is not connected in Settings › Connections.'), { status: 400 })
  stopRequested = false
  current = { id: Date.now(), trigger, startedAt: new Date().toISOString(), status: 'planning', done: 0, total: 0 }
  run(current).catch(err => console.error('Automation run failed:', err))
  return current
}

async function run(state) {
  const log = { ...state, reviewed: [], rereviewed: [], failed: [] }
  try {
    const plan = await planRun()
    Object.assign(log, {
      window: plan.window,
      found: plan.found,
      truncated: plan.truncated,
      skippedIgnored: plan.skippedIgnored,
      alreadyReviewed: plan.alreadyReviewed,
    })
    const jobs = [...plan.toReview.map(t => ({ ...t, kind: 'review' })), ...plan.toRereview.map(t => ({ ...t, kind: 'rereview' }))]
    Object.assign(state, { status: 'reviewing', total: jobs.length, window: plan.window, found: plan.found })
    const queue = [...jobs]
    const worker = async () => {
      while (queue.length && !stopRequested) {
        const job = queue.shift()
        state.currentTickets = [...(state.currentTickets || []), job.id]
        try {
          await runAndSaveReview(job.id)
          ;(job.kind === 'review' ? log.reviewed : log.rereviewed).push(job.id)
        } catch (err) {
          log.failed.push({ id: job.id, kind: job.kind, error: err.message })
        } finally {
          state.done++
          state.currentTickets = state.currentTickets.filter(id => id !== job.id)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))
    log.notRun = queue.length
    log.status = stopRequested ? 'stopped' : log.failed.length ? 'finished with errors' : 'finished'
  } catch (err) {
    log.status = 'failed'
    log.error = err.message
  } finally {
    log.finishedAt = new Date().toISOString()
    log.done = state.done
    log.total = state.total
    delete log.currentTickets
    delete log.stopping
    saveRun(log)
    current = null
    stopRequested = false
  }
}

// ---------- Schedule ----------

// Next scheduled start after `now` (an ISO string), or null when nothing is scheduled.
function nextRunTime(a, now = new Date()) {
  if (!a.times.length || !a.days.length) return null
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    if (!a.days.includes(day.getDay())) continue
    for (const t of a.times) {
      const [h, m] = t.split(':').map(Number)
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
      if (at > now) return at.toISOString()
    }
  }
  return null
}

let lastSlot = null
// Checks the schedule; called every 30 seconds by the server.
function tick() {
  const a = normaliseAutomation(getSettings().automation)
  if (!a.enabled) return
  const now = new Date()
  const slot = `${localDay(now)} ${hhmm(now)}`
  if (slot === lastSlot || !a.days.includes(now.getDay()) || !a.times.includes(hhmm(now))) return
  lastSlot = slot
  if (current) return // still busy with the previous run
  startRun('schedule').catch(err => {
    console.error('Scheduled automated review could not start:', err.message)
    saveRun({ id: Date.now(), trigger: 'schedule', startedAt: now.toISOString(), finishedAt: now.toISOString(), status: 'failed', error: err.message })
  })
}

export function startScheduler() {
  setInterval(tick, 30 * 1000).unref?.()
}
