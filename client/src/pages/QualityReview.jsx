import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  Bookmark,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  ImageDown,
  Info,
  LayoutGrid,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import {
  ClearFiltersButton,
  FilterSelect,
  ReopenedIcon,
  SideConversationIcon,
  TicketIdLink,
  reopensSinceReview,
  Spinner,
  StatusAlert,
  StatusBadge,
  StatusToggles,
  dateFieldFor,
} from '@/components/common'
import { TicketSubject } from '@/components/TicketTimeline'
import { RelatedTicketsButton } from '@/components/RelatedTickets'
import { SortableHead, sortRows, useSortable } from '@/components/sorting'
import { Pagination, usePagination } from '@/components/pagination'
import { CommentsButton } from '@/components/TicketComments'
import { EditScoresButton } from '@/components/EditScores'
import ReviewCard, { RatingBadge } from '@/components/ReviewCard'
import { feedbackText } from '@/components/TicketFeedback'
import { PreviousVersionsBadge, ReviewHistoryLine } from '@/components/ReviewHistory'
import IgnoredTickets from '@/components/IgnoredTickets'
import ReviewSummary from '@/components/ReviewSummary'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { downloadCsv } from '@/lib/csv'
import { downloadImage } from '@/lib/image'
import { formatDate, formatDateTime, isoDay, yesterday } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { rowToggleProps } from '@/lib/rowToggle'
import { DatePicker } from '@/components/DatePicker'
import { confirm } from '@/components/confirm'
import { api } from '../api.js'

// The Trends charts (recharts) load when the Trends tab is first opened.
const ReviewTrends = lazy(() => import('@/components/ReviewTrends'))
// Scores grouped by a Zendesk field (Category, Topic, …); loads when its tab is first opened.
const ReviewCategories = lazy(() => import('@/components/ReviewCategories'))

const RATINGS = ['Excellent', 'Good', 'Acceptable', 'Below Standard', 'Poor']

// Every filter holds a list of selected values; an empty list means "all". A row matches a filter
// when it matches any of its selected values, and must match every filter that is set.
const NO_TICKET_FILTERS = { status: [], group: [], assignee: [], review: [], side: [], related: [], comments: [], ignored: [] }
const NO_REVIEW_FILTERS = { rating: [], group: [], assignee: [], resolvingAgent: [], status: [], related: [], comments: [], rereview: [], history: [] }
// Saved reviews loads at most this many (newest first); Export CSV is not limited by it.
const LIST_LIMIT = 2500
// Saved-review filters sent to the server (the re-review filter is applied in the browser).
const serverFilterKey = ({ rereview: _, ...rest }) => JSON.stringify(rest)

// Re-review: a ticket re-opened in Zendesk after its latest review should be reviewed again.
const REREVIEW_OPTIONS = [
  { value: 'needed', label: 'Needs re-review (re-opened since review)' },
  { value: 'not-needed', label: 'No re-review needed' },
]
const matchesRereview = (selected, needed) => !selected.length || selected.includes(needed ? 'needed' : 'not-needed')

const countActive = filters => Object.values(filters).filter(v => v.length).length

// With/without filters: both or neither selected means no filtering.
const matchesWithWithout = (selected, has) => !selected.length || selected.includes(has ? 'with' : 'without')

const matchesReviewState = (selected, latest, reopens) =>
  !selected.length ||
  selected.some(s =>
    s === 'not-reviewed'
      ? !latest
      : s === 'reviewed'
        ? Boolean(latest)
        : s === 'needs-rereview'
          ? reopensSinceReview(reopens, latest?.reopens) > 0
          : latest?.rating === s,
  )

// Expanded QC result under a ticket row: darker panel plus a left accent bar so it reads as
// detail for the row above rather than another row.
const RESULT_PANEL = 'bg-panel border-l-4 border-l-primary/40 p-4'

const WITH_WITHOUT = noun => [
  { value: 'with', label: `With ${noun}` },
  { value: 'without', label: `Without ${noun}` },
]

// Quality Review tabs, in order, with their icons.
const QR_TABS = [
  { value: 'find', label: 'Find & Review', Icon: Search },
  { value: 'saved', label: 'Saved Reviews', Icon: ClipboardCheck },
  { value: 'trends', label: 'Trends', Icon: TrendingUp },
  { value: 'categories', label: 'Categories', Icon: LayoutGrid },
  { value: 'ignored', label: 'Ignored Tickets', Icon: Ban },
  { value: 'bookmarks', label: 'Bookmarks', Icon: Bookmark },
]

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)
const BATCH_CONCURRENCY = 2

// A ticket's panel is busy while its review runs, waits in a batch, or a saved review loads.
const isBusy = state => Boolean(state?.loading || state?.reviewing || state?.queued)

const ticketLink = (subdomain, id) => `https://${subdomain}.zendesk.com/agent/tickets/${id}`

// Icon-only action button; `label` is the tooltip and the accessible name.
function IconAction({ label, children, ...props }) {
  return (
    <Button variant="ghost" size="icon-xs" title={label} aria-label={label} {...props}>
      {children}
    </Button>
  )
}

// Row action: bookmarks a ticket (red, filled) so it is listed under Bookmarks, or removes the
// bookmark. `onChange(bookmarkedAt | null)` updates the row.
function BookmarkButton({ ticketId, bookmarkedAt, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const on = Boolean(bookmarkedAt)
  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      const r = await api.setBookmark(ticketId, !on)
      onChange(r.bookmarkedAt)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const label = error
    ? `Bookmark could not be changed: ${error}`
    : on
      ? `Bookmarked ${formatDateTime(bookmarkedAt)}. Click to remove the bookmark`
      : 'Bookmark this ticket (listed under Bookmarks)'
  return (
    <IconAction label={label} aria-pressed={on} onClick={toggle} disabled={busy}>
      <Bookmark className={cn(on && 'fill-red-600 text-red-600', error && 'text-destructive')} />
    </IconAction>
  )
}

// Header checkbox that selects or clears the reviews on the current page.
function SelectPageHead({ rows, selected, onSelect, disabled }) {
  const ids = rows.map(r => r.id)
  const all = ids.length > 0 && ids.every(id => selected.has(id))
  return (
    <TableHead className="w-8" data-pdf-exclude>
      <Checkbox
        aria-label="Select all on this page"
        title="Select all on this page"
        checked={all}
        disabled={disabled || !ids.length}
        onCheckedChange={on => onSelect(ids, on === true)}
      />
    </TableHead>
  )
}

// Row checkbox for selecting a review (Re-review selected).
function SelectRowCell({ review, selected, onSelect, disabled }) {
  return (
    <TableCell data-pdf-exclude>
      <Checkbox
        aria-label={`Select the review of ticket ${review.ticketId}`}
        checked={selected.has(review.id)}
        disabled={disabled}
        onCheckedChange={on => onSelect([review.id], on === true)}
      />
    </TableCell>
  )
}

// Search box shown on its own line above a table's filters.
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full">
      <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
      <Input
        type="search"
        className="h-9 ps-8"
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

// Saves a ticket's row and its open scorecard as one PNG. The table is copied with its headers,
// the row and the scorecard only; checkboxes and action buttons ([data-pdf-exclude]) are left out.
// Rows are marked data-snap-row={key}, and the scorecard row data-snap-panel={key} once loaded.
async function saveReviewImage(key, fileName) {
  let panel
  for (let i = 0; i < 300 && !(panel = document.querySelector(`tr[data-snap-panel="${key}"]`)); i++) {
    await new Promise(r => setTimeout(r, 50))
  }
  const row = document.querySelector(`tr[data-snap-row="${key}"]`)
  if (!row || !panel) throw new Error('The review could not be opened.')
  const container = row.closest('[data-slot="table-container"]')
  const head = container.querySelector('thead')
  const size = {
    width: container.getBoundingClientRect().width,
    height: (head?.offsetHeight || 0) + row.offsetHeight + panel.offsetHeight,
  }
  return downloadImage(container, fileName, {
    size,
    prepare: clone => {
      clone.style.overflow = 'visible'
      // Only the outer table's rows: the scorecard has tables of its own.
      clone.querySelectorAll(':scope > table > tbody > tr, :scope > table > tfoot').forEach(tr => {
        if (tr.dataset.snapRow !== key && tr.dataset.snapPanel !== key) tr.remove()
      })
    },
  })
}

// Row action: opens the review if needed (`open`), then saves the row and scorecard as a PNG.
function SaveReviewImageButton({ snapKey, fileName, open, disabled }) {
  const [state, setState] = useState(null) // 'saving' | 'saved' | { error }
  async function save() {
    setState('saving')
    try {
      await open?.()
      await saveReviewImage(snapKey, fileName)
      setState('saved')
      setTimeout(() => setState(null), 2000)
    } catch (e) {
      setState({ error: e.message })
    }
  }
  const label = state?.error
    ? `The image could not be saved: ${state.error}`
    : state === 'saved'
      ? 'Image saved to your downloads'
      : 'Save the ticket details and review as an image (PNG)'
  return (
    <IconAction label={label} onClick={save} disabled={disabled || state === 'saving'}>
      {state === 'saving' ? (
        <Spinner />
      ) : state === 'saved' ? (
        <Check className="text-success" />
      ) : (
        <ImageDown className={state?.error ? 'text-destructive' : undefined} />
      )}
    </IconAction>
  )
}


// Marks a ticket that is ignored (never reviewed): flagged "Ignore" by hand, matched by an
// auto-ignore subject rule from Settings › Quality Review (`ignoreRule` describes it), and/or
// created before 2026 (`oldTicket`, a hard rule that can't be changed).
function IgnoredBadge({ ignored, ignoredAt, ignoredManually, ignoreRule, oldTicket }) {
  if (!ignored) return null
  const subjectRule = String(ignoreRule || '').replace(/^Created before 2026 \(hard rule\);?\s*/, '')
  const manual = ignoredManually ?? (!subjectRule && !oldTicket)
  const lines = [
    oldTicket && 'Created before 2026 — tickets from before 2026 are always ignored (hard rule).',
    manual && `Ignored by hand${ignoredAt ? ` since ${formatDateTime(ignoredAt)}` : ''} — Unignore to allow reviews.`,
    subjectRule && `Ignored by a Settings rule: ${subjectRule}. Change the rule in Settings › Quality Review to allow reviews.`,
  ].filter(Boolean)
  return (
    <Badge variant="outline" className="text-muted-foreground ms-1.5 gap-1" title={lines.join('\n')}>
      <Ban className="size-3" /> Ignored{oldTicket ? ' · before 2026' : subjectRule ? ' · rule' : ''}
    </Badge>
  )
}

// Ignored by hand (can be unignored); tickets ignored only by a subject rule are not.
const manuallyIgnored = t => (t.ignoredManually ?? t.ignored) === true

// Small pen shown next to a score that a reviewer changed by hand.
function EditedMarker({ review, className }) {
  if (!review.editCount) return null
  return (
    <span
      className={cn('text-warning inline-flex translate-y-px', className)}
      title={
        `Score edited manually${review.editCount > 1 ? ` ${review.editCount} times` : ''}.` +
        (review.lastEditJustification ? `\nLatest justification: ${review.lastEditJustification}` : '')
      }
    >
      <PenLine className="size-3.5" aria-label="Score edited manually" />
    </span>
  )
}

// Toolbar button that opens every scorecard in the table, or closes them all when any is open.
function ShowAllReviewsButton({ anyOpen, loading, disabled, onShowAll, onHideAll }) {
  return (
    <Button variant="outline" size="sm" disabled={disabled || loading} onClick={anyOpen ? onHideAll : onShowAll}>
      {loading ? <Spinner /> : anyOpen ? <EyeOff /> : <Eye />}
      {anyOpen ? 'Hide all reviews' : 'Show all reviews'}
    </Button>
  )
}

// Loads full saved results for many reviews in one request: Map reviewId -> scorecard state.
async function loadScorecards(reviewIds) {
  const full = await api.exportReviews(reviewIds)
  return new Map(full.map(r => [r.id, { ...r.result, reviewedAt: r.reviewedAt, edits: r.edits }]))
}

// ---------- Find & review ----------

function FindAndReview({ settings, onSaved }) {
  // The last search and its results are kept in this browser, so they are still there after a page
  // reload or an app restart, until the next search. The search boxes show that search's values.
  const [result, setResult] = usePersistentState('review.find.result', null)
  const lastQuery = result?.query || {}
  const [statuses, setStatuses] = useState(
    lastQuery.statuses?.length ? lastQuery.statuses : settings.review.statuses.length ? settings.review.statuses : ['solved'],
  )
  const [from, setFrom] = useState(lastQuery.from || yesterday)
  const [to, setTo] = useState(lastQuery.to || yesterday)
  const [ids, setIds] = useState(lastQuery.ids ? lastQuery.ids.join(', ') : '')
  // Today's date, kept current (checked every minute and when the tab is shown again) so results
  // from an earlier day are flagged even if the page stays open past midnight.
  const [today, setToday] = useState(() => isoDay(new Date()))
  useEffect(() => {
    const check = () => setToday(isoDay(new Date()))
    const timer = setInterval(check, 60 * 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  const searchedDay = result?.searchedAt ? isoDay(new Date(result.searchedAt)) : null
  const staleResults = Boolean(searchedDay && searchedDay < today)

  // Searches yesterday's tickets with the current statuses (the usual daily search).
  function searchYesterday() {
    const day = yesterday()
    setFrom(day)
    setTo(day)
    find({ from: day, to: day, statuses })
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = usePersistentState('review.find.search', '')
  const [filters, setFilters] = usePersistentState('review.find.filters', NO_TICKET_FILTERS)
  const [selected, setSelected] = useState(new Set())
  // ticketId -> review result | { reviewing, startedAt } | { queued } | { loading } | { error }
  const [open, setOpen] = useState({})
  const [batch, setBatch] = useState(null) // { done, total, failed }
  const stopRef = useRef(false)
  // Recent review durations; their average sets the expected length of the progress bar.
  const [durations, setDurations] = useState([])
  const recordDuration = ms => setDurations(d => [...d.slice(-9), ms])
  const expectedMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 10000

  async function find(query) {
    setLoading(true)
    setError('')
    setSelected(new Set())
    setOpen({})
    try {
      // searchedAt marks a new search, so pagination returns to page 1; query allows "Search again".
      setResult({ ...(await api.findReviewTickets(query)), query, searchedAt: Date.now() })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const lookUpIds = () => {
    const list = ids.split(/[\s,;]+/).map(s => s.replace(/^#/, '')).filter(Boolean)
    if (list.length) find({ ids: list })
  }

  const facets = useMemo(() => {
    const all = result?.tickets || []
    const distinct = key => [...new Set(all.map(t => t[key]).filter(v => v && v !== '—'))].sort()
    return { statuses: distinct('status'), groups: distinct('group'), assignees: distinct('assignee') }
  }, [result])

  const tickets = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const f = filters
    const inList = (list, value) => !list.length || list.includes(value)
    return (result?.tickets || []).filter(t => {
      if (!inList(f.status, t.status) || !inList(f.group, t.group) || !inList(f.assignee, t.assignee)) return false
      if (!matchesReviewState(f.review, t.latestReview, t.reopens)) return false
      if (!matchesWithWithout(f.side, t.sideConversations > 0)) return false
      if (!matchesWithWithout(f.related, t.relatedCount > 0)) return false
      if (!matchesWithWithout(f.comments ?? [], t.commentCount > 0)) return false
      if (!matchesWithWithout(f.ignored, t.ignored)) return false
      return !q || [t.id, t.subject, t.group, t.assignee].some(v => String(v).toLowerCase().includes(q))
    })
  }, [result, filter, filters])

  const activeFilters = countActive(filters) + (filter.trim() ? 1 : 0)
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))

  function setLatest(ticketId, saved) {
    setResult(r => ({
      ...r,
      tickets: r.tickets.map(t =>
        t.id === ticketId
          ? { ...t, latestReview: { id: saved.id, reviewedAt: saved.reviewedAt, total: saved.total, rating: saved.rating, reopens: saved.reopens } }
          : t,
      ),
    }))
  }

  // Reviews one ticket, saves it, and shows the scorecard under its row.
  async function reviewOne(ticketId) {
    const startedAt = Date.now()
    setOpen(o => ({ ...o, [ticketId]: { reviewing: true, startedAt } }))
    try {
      const saved = await api.runReview(ticketId)
      recordDuration(Date.now() - startedAt)
      setOpen(o => ({ ...o, [ticketId]: { ...saved.result, reviewedAt: saved.reviewedAt } }))
      setLatest(ticketId, saved)
      return true
    } catch (e) {
      setOpen(o => ({ ...o, [ticketId]: { error: e.message } }))
      return false
    }
  }

  async function viewLatest(t) {
    if (open[t.id] && !isBusy(open[t.id])) {
      setOpen(({ [t.id]: _, ...rest }) => rest)
      return
    }
    setOpen(o => ({ ...o, [t.id]: { loading: true } }))
    try {
      const saved = await api.getReview(t.latestReview.id)
      setOpen(o => ({ ...o, [t.id]: { ...saved.result, reviewedAt: saved.reviewedAt, edits: saved.edits } }))
    } catch (e) {
      setOpen(o => ({ ...o, [t.id]: { error: e.message } }))
    }
  }

  // Show all: open the latest scorecard of every listed ticket that has one and isn't open yet.
  const [showingAll, setShowingAll] = useState(false)
  async function showAllReviews() {
    const toLoad = tickets.filter(t => t.latestReview && !open[t.id])
    if (!toLoad.length) return
    setShowingAll(true)
    setError('')
    try {
      const cards = await loadScorecards(toLoad.map(t => t.latestReview.id))
      setOpen(o => ({
        ...o,
        ...Object.fromEntries(toLoad.filter(t => !o[t.id]).map(t => [t.id, cards.get(t.latestReview.id)])),
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setShowingAll(false)
    }
  }
  // Hide all: close every scorecard; reviews still running or queued keep their progress bars.
  const hideAllReviews = () => setOpen(o => Object.fromEntries(Object.entries(o).filter(([, v]) => isBusy(v))))

  async function reviewSelected() {
    // Ignored tickets are never reviewed: they are left out of the batch and reported as skipped.
    const chosen = tickets.filter(t => selected.has(t.id))
    const queue = chosen.filter(t => !t.ignored).map(t => t.id)
    const skipped = chosen.length - queue.length
    stopRef.current = false
    let done = 0
    let failed = 0
    setBatch({ done, total: queue.length, failed, skipped })
    // Every ticket in the batch shows a "queued" bar until a review slot picks it up.
    setOpen(o => ({ ...o, ...Object.fromEntries(queue.map(id => [id, { queued: true }])) }))
    const worker = async () => {
      while (queue.length && !stopRef.current) {
        const ok = await reviewOne(queue.shift())
        done++
        if (!ok) failed++
        setBatch({ done, total: done + queue.length, failed, skipped })
      }
    }
    await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker))
    // After Stop, drop the queued bars of tickets that were never started.
    setOpen(o => Object.fromEntries(Object.entries(o).filter(([, v]) => !v.queued)))
    setBatch(b => ({ ...b, finished: true, stopped: stopRef.current }))
    setSelected(new Set())
    onSaved()
  }

  const { sorted: sortedTickets, sort, toggle: toggleSort } = useSortable(tickets, {
    id: t => t.id,
    subject: t => t.subject,
    status: t => t.status,
    group: t => t.group,
    assignee: t => t.assignee,
    lastReview: t => t.latestReview?.total,
  })
  const pager = usePagination(sortedTickets, {
    storageKey: 'findReview',
    resetKey: JSON.stringify([result?.searchedAt, filter, filters, sort]),
  })

  // Selection only counts tickets that pass the current filters; ignored ones are never reviewed.
  const selectedTickets = tickets.filter(t => selected.has(t.id))
  const visibleSelected = selectedTickets.filter(t => !t.ignored).length
  // Unignore only applies to tickets ignored by hand; rule-ignored ones need the rule changed.
  const selectedIgnored = selectedTickets.filter(manuallyIgnored)
  const selectedNotIgnored = selectedTickets.filter(t => !t.ignored)

  // Ignore / Unignore the selected tickets, then clear the selection.
  const [ignoreState, setIgnoreState] = useState(null) // { loading } | { ok, message } | { error }
  async function setSelectedIgnored(ignore) {
    const ids = (ignore ? selectedNotIgnored : selectedIgnored).map(t => t.id)
    if (!ids.length) return
    setIgnoreState({ loading: true })
    try {
      const { tickets: updated } = await api.setIgnored(ids, ignore)
      const byId = new Map(updated.map(u => [u.id, u]))
      setResult(r => ({
        ...r,
        tickets: r.tickets.map(t => {
          const u = byId.get(t.id)
          // A subject rule keeps the ticket ignored whatever the manual flag is.
          return u ? { ...t, ignoredAt: u.ignoredAt, ignoredManually: u.ignored, ignored: u.ignored || Boolean(t.ignoreRule) } : t
        }),
      }))
      setSelected(new Set())
      setIgnoreState({
        ok: true,
        message: `${ids.length} ticket${ids.length > 1 ? 's' : ''} ${ignore ? `ignored — ${ids.length > 1 ? 'they' : 'it'} will not be reviewed` : 'unignored'}.`,
      })
    } catch (e) {
      setIgnoreState({ ok: false, message: e.message })
    }
    setTimeout(() => setIgnoreState(null), 5000)
  }
  // The header checkbox selects or clears the tickets on the current page only.
  const allSelected = pager.pageRows.length > 0 && pager.pageRows.every(t => selected.has(t.id))
  const running = batch && !batch.finished
  const dateLabel = dateFieldFor(statuses)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find tickets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="grid gap-2">
            <Label>Statuses</Label>
            <StatusToggles value={statuses} onChange={setStatuses} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rv-from">{dateLabel} from</Label>
            <DatePicker id="rv-from" value={from} max={to} onChange={setFrom} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rv-to">{dateLabel} to</Label>
            <DatePicker id="rv-to" value={to} min={from} onChange={setTo} />
          </div>
          <Button onClick={() => find({ from, to, statuses })} disabled={loading || !statuses.length || running}>
            {loading ? <Spinner /> : <Search />} Search
          </Button>
          <div className="bg-border hidden h-9 w-px lg:block" />
          <div className="grid min-w-64 flex-1 gap-2">
            <Label htmlFor="rv-ids">Ticket numbers</Label>
            <div className="flex gap-2">
              <Input
                id="rv-ids"
                placeholder="e.g. 1673772, 1684210"
                value={ids}
                onChange={e => setIds(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookUpIds()}
              />
              <Button variant="outline" onClick={lookUpIds} disabled={loading || !ids.trim() || running}>
                Look up
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <StatusAlert state={{ ok: false, message: error }} />}

      {staleResults && (
        <Alert className="border-warning/50 bg-warning/10">
          <CalendarClock className="text-warning" />
          <AlertDescription className="text-foreground flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>
              These results are from a search on <b>{formatDate(searchedDay)}</b>. Tickets and reviews may have
              changed since: please search again.
            </span>
            <span className="flex flex-wrap gap-2">
              {result.query?.from && (
                <Button size="sm" onClick={searchYesterday} disabled={loading || running || !statuses.length}>
                  {loading ? <Spinner /> : <Search />} Search yesterday ({formatDate(yesterday())})
                </Button>
              )}
              <Button
                size="sm"
                variant={result.query?.from ? 'outline' : 'default'}
                onClick={() => find(result.query)}
                disabled={loading || running || !result.query}
              >
                <RefreshCw /> Search again
                {result.query?.from
                  ? ` (${formatDate(result.query.from)}${result.query.to !== result.query.from ? ` – ${formatDate(result.query.to)}` : ''})`
                  : ''}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader className="flex flex-wrap items-center gap-3">
            <CardTitle className="me-2">
              {tickets.length === result.tickets.length
                ? `${result.tickets.length} ticket${result.tickets.length === 1 ? '' : 's'}`
                : `${tickets.length} of ${result.tickets.length} tickets`}
            </CardTitle>
            {result.truncated && (
              <span className="text-warning text-xs">Hit the max tickets per search; narrow the dates.</span>
            )}
            {result.searchedAt && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                Searched {formatDateTime(new Date(result.searchedAt).toISOString())}
                {result.query && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    disabled={loading || running}
                    onClick={() => find(result.query)}
                    title="Run the same search again to update statuses and review results"
                  >
                    · Search again
                  </Button>
                )}
              </span>
            )}
            <CardAction className="flex items-center gap-3 self-center">
              {batch && (
                <span className="text-muted-foreground text-sm tabular-nums">
                  {batch.finished
                    ? `${batch.stopped ? 'Stopped' : 'Done'}: ${batch.done - batch.failed} reviewed${batch.failed ? `, ${batch.failed} failed` : ''}`
                    : `Reviewing ${batch.done + 1}–${Math.min(batch.done + BATCH_CONCURRENCY, batch.total)} of ${batch.total}…`}
                  {batch.skipped > 0 && ` · ${batch.skipped} ignored skipped`}
                </span>
              )}
              {ignoreState && !ignoreState.loading && (
                <span className={cn('text-sm', ignoreState.ok ? 'text-success' : 'text-destructive')}>
                  {ignoreState.message}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                title="Flag the selected tickets so they are not reviewed"
                disabled={!selectedNotIgnored.length || running || ignoreState?.loading}
                onClick={() => setSelectedIgnored(true)}
              >
                <Ban /> Ignore ({selectedNotIgnored.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Remove the Ignore flag so the selected tickets can be reviewed again"
                disabled={!selectedIgnored.length || running || ignoreState?.loading}
                onClick={() => setSelectedIgnored(false)}
              >
                <CircleCheck /> Unignore ({selectedIgnored.length})
              </Button>
              <ShowAllReviewsButton
                anyOpen={tickets.some(t => open[t.id] && !isBusy(open[t.id]))}
                loading={showingAll}
                disabled={!tickets.some(t => t.latestReview)}
                onShowAll={showAllReviews}
                onHideAll={hideAllReviews}
              />
              {running ? (
                <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
                  <Square /> Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={reviewSelected}
                  disabled={!visibleSelected}
                  title={
                    selectedIgnored.length
                      ? `${selectedIgnored.length} selected ignored ticket${selectedIgnored.length > 1 ? 's' : ''} will be skipped`
                      : undefined
                  }
                >
                  <Sparkles /> Review selected ({visibleSelected})
                </Button>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <SearchBox placeholder="Search ID, subject, agent…" value={filter} onChange={setFilter} />
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Statuses"
                value={filters.status}
                onChange={setFilterValue('status')}
                options={facets.statuses.map(s => ({ value: s, label: capitalize(s) }))}
              />
              <FilterSelect label="Groups" value={filters.group} onChange={setFilterValue('group')} options={facets.groups} />
              <FilterSelect
                label="Assignees"
                value={filters.assignee}
                onChange={setFilterValue('assignee')}
                options={facets.assignees}
              />
              <FilterSelect
                label="Review states"
                value={filters.review}
                onChange={setFilterValue('review')}
                options={[
                  { value: 'not-reviewed', label: 'Not reviewed' },
                  { value: 'reviewed', label: 'Reviewed (any rating)' },
                  { value: 'needs-rereview', label: 'Needs re-review (re-opened since review)' },
                  ...RATINGS.map(r => ({ value: r, label: `Rated ${r}` })),
                ]}
              />
              <FilterSelect
                label="Side conversations"
                value={filters.side}
                onChange={setFilterValue('side')}
                options={WITH_WITHOUT('side conversations')}
              />
              <FilterSelect
                label="Related tickets"
                value={filters.related}
                onChange={setFilterValue('related')}
                options={WITH_WITHOUT('related tickets')}
              />
              <FilterSelect
                label="Comments"
                value={filters.comments ?? []}
                onChange={setFilterValue('comments')}
                options={WITH_WITHOUT('comments')}
              />
              <FilterSelect
                label="Ignored"
                value={filters.ignored}
                onChange={setFilterValue('ignored')}
                options={[
                  { value: 'with', label: 'Ignored' },
                  { value: 'without', label: 'Not ignored' },
                ]}
              />
              <ClearFiltersButton
                count={activeFilters}
                onClear={() => {
                  setFilters(NO_TICKET_FILTERS)
                  setFilter('')
                }}
              />
            </div>
            <Table className="[&_td]:align-top [&_td]:whitespace-normal [&_th]:whitespace-normal">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" data-pdf-exclude>
                    <Checkbox
                      aria-label="Select all on this page"
                      title="Select all on this page"
                      checked={allSelected}
                      disabled={running || !pager.pageRows.length}
                      onCheckedChange={on =>
                        setSelected(s => {
                          const next = new Set(s)
                          for (const t of pager.pageRows) on ? next.add(t.id) : next.delete(t.id)
                          return next
                        })
                      }
                    />
                  </TableHead>
                  <SortableHead sortKey="id" sort={sort} onSort={toggleSort}>
                    Ticket
                  </SortableHead>
                  <SortableHead sortKey="subject" sort={sort} onSort={toggleSort}>
                    Subject
                  </SortableHead>
                  <SortableHead sortKey="status" sort={sort} onSort={toggleSort}>
                    Status
                  </SortableHead>
                  <SortableHead sortKey="group" sort={sort} onSort={toggleSort}>
                    Group
                  </SortableHead>
                  <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>
                    Assignee
                  </SortableHead>
                  <SortableHead sortKey="lastReview" sort={sort} onSort={toggleSort}>
                    Last review
                  </SortableHead>
                  <TableHead className="text-end" data-pdf-exclude>
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map(t => (
                  <Fragment key={t.id}>
                    <TableRow
                      data-snap-row={`find-${t.id}`}
                      data-state={selected.has(t.id) ? 'selected' : undefined}
                      {...rowToggleProps({
                        enabled: Boolean(t.latestReview) && !isBusy(open[t.id]),
                        isOpen: Boolean(open[t.id]),
                        onToggle: () => viewLatest(t),
                        className: cn(t.ignored && 'opacity-60'),
                      })}
                    >
                      <TableCell data-pdf-exclude>
                        <Checkbox
                          aria-label={`Select ticket ${t.id}`}
                          checked={selected.has(t.id)}
                          disabled={running}
                          onCheckedChange={on =>
                            setSelected(s => {
                              const next = new Set(s)
                              on ? next.add(t.id) : next.delete(t.id)
                              return next
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="!whitespace-nowrap">
                        <TicketIdLink
                          href={t.url}
                          id={t.id}
                          reopenedSince={reopensSinceReview(t.reopens, t.latestReview?.reopens)}
                          reviewedAt={t.latestReview?.reviewedAt}
                        />
                      </TableCell>
                      <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                        <TicketSubject ticketId={t.id} subject={t.subject} />
                        <SideConversationIcon count={t.sideConversations} />
                        <ReopenedIcon count={t.reopens} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                        <IgnoredBadge ignored={t.ignored} ignoredAt={t.ignoredAt} ignoredManually={t.ignoredManually} ignoreRule={t.ignoreRule} oldTicket={t.oldTicket} />
                      </TableCell>
                      <TableCell>{t.group}</TableCell>
                      <TableCell>{t.assignee}</TableCell>
                      <TableCell>
                        {t.latestReview ? (
                          <div className="grid gap-0.5">
                            <RatingBadge total={t.latestReview.total} rating={t.latestReview.rating} />
                            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                              {formatDateTime(t.latestReview.reviewedAt)}
                              <PreviousVersionsBadge count={t.latestReview.previousCount} />
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not reviewed</span>
                        )}
                      </TableCell>
                      <TableCell className="!whitespace-nowrap text-end" data-pdf-exclude>
                        <RelatedTicketsButton
                          ticketId={t.id}
                          subject={t.subject}
                          count={t.relatedCount}
                          onCountChange={n =>
                            setResult(r => ({
                              ...r,
                              tickets: r.tickets.map(x => (x.id === t.id ? { ...x, relatedCount: n } : x)),
                            }))
                          }
                        />
                        <CommentsButton
                          ticketId={t.id}
                          subject={t.subject}
                          count={t.commentCount}
                          onCountChange={n =>
                            setResult(r => ({
                              ...r,
                              tickets: r.tickets.map(x => (x.id === t.id ? { ...x, commentCount: n } : x)),
                            }))
                          }
                        />
                        {t.latestReview && (
                          <SaveReviewImageButton
                            snapKey={`find-${t.id}`}
                            fileName={`ticket-${t.id}-review-${isoDay(new Date(t.latestReview.reviewedAt))}.png`}
                            open={() => (open[t.id] ? null : viewLatest(t))}
                            disabled={isBusy(open[t.id])}
                          />
                        )}
                        <IconAction
                          label={t.ignored ? (t.oldTicket ? 'Ignored — created before 2026' : t.ignoreRule ? `Ignored by a Settings rule (${t.ignoreRule})` : 'Ignored — unignore to review') : t.latestReview ? 'Re-review' : 'Review'}
                          onClick={() => reviewOne(t.id).then(onSaved)}
                          disabled={isBusy(open[t.id]) || running || t.ignored}
                        >
                          {t.latestReview ? (
                            <RefreshCw className={isBusy(open[t.id]) ? 'animate-spin' : undefined} />
                          ) : isBusy(open[t.id]) ? (
                            <Spinner />
                          ) : (
                            <Sparkles />
                          )}
                        </IconAction>
                      </TableCell>
                    </TableRow>
                    {open[t.id] && (
                      <TableRow
                        className="hover:bg-transparent"
                        data-snap-panel={isBusy(open[t.id]) ? undefined : `find-${t.id}`}
                      >
                        <TableCell colSpan={8} className={RESULT_PANEL}>
                          <ReviewCard
                            review={open[t.id]}
                            reviewedAt={open[t.id].reviewedAt}
                            expectedMs={expectedMs}
                            reviewId={t.latestReview?.id}
                            ticket={{ id: t.id, subject: t.subject }}
                            onFeedback={f => setOpen(o => (o[t.id] ? { ...o, [t.id]: { ...o[t.id], feedback: f } } : o))}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {!tickets.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                      {result.tickets.length ? 'No tickets match these filters.' : 'No tickets found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination {...pager} label="tickets" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------- Saved reviews ----------

// `full` is every saved review to export, with results, comments and edits, already in order.
function exportCsv(full) {
  const categories = [...new Set(full.flatMap(r => r.result?.tqr?.categories.map(c => c.name) || []))]
  const header = [
    'Review ID',
    'Reviewed at',
    'Ticket ID',
    'Subject',
    'Ticket status',
    'Group',
    'Assignee',
    'Resolving agent',
    'Date solved',
    'Side conversations',
    'Re-opens',
    'Total score',
    'Rating',
    'Version',
    'Review status',
    'Previous versions',
    'Previous review date',
    'Previous total',
    'Previous rating',
    ...categories.flatMap(c => [`${c} – score`, `${c} – findings`]),
    'Summary',
    'Feedback for the agents',
    'Reviewer comments',
    'Score edits',
    'Model',
  ]
  const rows = full.map(r => {
    const cats = Object.fromEntries((r.result?.tqr?.categories || []).map(c => [c.name, c]))
    return [
      r.id,
      formatDateTime(r.reviewedAt),
      r.ticketId,
      r.subject,
      r.ticketStatus,
      r.group,
      r.assigneeName,
      r.resolvingAgent,
      formatDateTime(r.dateSolved),
      r.sideConversations,
      r.reopens ?? '',
      r.total,
      r.rating,
      r.version ? `v${r.version}` : '',
      r.superseded ? 'Superseded' : 'Current',
      r.superseded ? '' : (r.previousCount ?? 0),
      r.previous ? formatDateTime(r.previous.reviewedAt) : '',
      r.previous?.total ?? '',
      r.previous?.rating ?? '',
      ...categories.flatMap(c => [cats[c]?.score ?? '', (cats[c]?.findings || []).join(' | ')]),
      r.result?.summary,
      // Saved feedback as plain text (headings and "- " points), without the title line.
      r.result?.feedback ? feedbackText(r.result.feedback).text.split('\n').slice(2).join('\n') : '',
      (r.comments || []).map(c => `[${formatDateTime(c.createdAt)}] ${c.body}`).join(' | '),
      (r.edits || [])
        .map(
          e =>
            `[${formatDateTime(e.editedAt)}] ${e.changes.map(c => `${c.name} ${c.from}→${c.to}`).join(', ')}; ` +
            `total ${e.totalBefore}→${e.totalAfter}. Justification: ${e.justification}`,
        )
        .join(' | '),
      r.model,
    ]
  })
  downloadCsv([header, ...rows], `quality-reviews_${isoDay(new Date())}.csv`)
}

// ---------- Saved reviews: Simple / Scoring views ----------

const SAVED_VIEWS = [
  { value: 'simple', label: 'Simple' },
  { value: 'scoring', label: 'Scoring' },
]
const SAVED_VIEW_KEY = 'savedReviewsView'

function readSavedView() {
  try {
    const v = localStorage.getItem(SAVED_VIEW_KEY)
    return SAVED_VIEWS.some(x => x.value === v) ? v : 'simple'
  } catch {
    return 'simple'
  }
}

// Rating order for sorting: Excellent highest.
const RATING_RANK = { Excellent: 5, Good: 4, Acceptable: 3, 'Below Standard': 2, Poor: 1 }

const average = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

// Short column title for a rubric category in the Scoring view: the initials of its words
// ("Troubleshooting & Documentation Quality" → "TDQ", "Comprehension" → "C"). The full name is
// shown on hover.
const categoryInitials = name =>
  String(name)
    .split(/[\s/-]+/)
    .filter(w => /^[A-Za-z]/.test(w))
    .map(w => w[0].toUpperCase())
    .join('') || name

// One row per review: date/time, ticket, subject, status, assignee and resolving agent, the 1–5
// score for every category, final score and rating.
// The Scoring table is wider than the page and scrolls sideways. A scorecard opened under a row
// is kept to the visible width of the table and stays in view while it scrolls, so it reads the
// same as in the Simple view. Its cells get the Simple view's top alignment and wrapping.
function FitToVisibleTable({ children }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(null)
  useEffect(() => {
    const scroller = ref.current?.closest('[data-slot="table-container"]')
    const cell = ref.current?.parentElement
    if (!scroller || !cell) return
    const measure = () => {
      const style = getComputedStyle(cell)
      const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth)
      setWidth(scroller.clientWidth - inset)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={width ? { width } : undefined}
      className="sticky left-4 !whitespace-normal [&_td]:!align-top [&_td]:!whitespace-normal"
    >
      {children}
    </div>
  )
}

// `open`, `onToggle` and `expectedMs` are shared with the Simple view: clicking a row opens the
// same scorecard under it, and a review opened in one view stays open in the other.
function ScoringTable({
  reviews,
  subdomain,
  filtered,
  currentReopens,
  resetKey,
  open = {},
  onToggle,
  onFeedback,
  expectedMs,
  selected = new Set(),
  onSelect,
  selectDisabled = false,
}) {
  // Category columns in the order they first appear; the weight comes from the first review using it.
  const categories = []
  for (const r of reviews) {
    for (const c of r.scores || []) {
      if (!categories.some(x => x.name === c.name)) categories.push({ name: c.name, weight: c.weight })
    }
  }
  const scoreOf = (r, name) => (r.scores || []).find(c => c.name === name)
  const finalAverage = average(reviews.map(r => r.total).filter(v => v != null))
  const { sorted, sort, toggle: toggleSort } = useSortable(reviews, {
    reviewedAt: r => r.reviewedAt,
    ticketId: r => r.ticketId,
    subject: r => r.subject,
    status: r => r.ticketStatus,
    assignee: r => r.assigneeName,
    resolvingAgent: r => r.resolvingAgent,
    ...Object.fromEntries(categories.map(c => [`cat:${c.name}`, r => scoreOf(r, c.name)?.score])),
    total: r => r.total,
    rating: r => RATING_RANK[r.rating],
  })
  const pager = usePagination(sorted, { storageKey: 'savedScoring', resetKey: JSON.stringify([resetKey, sort]) })

  return (
    <>
    <Table className="[&_td]:align-middle [&_th]:whitespace-normal">
      <TableHeader>
        <TableRow>
          {onSelect && <SelectPageHead rows={pager.pageRows} selected={selected} onSelect={onSelect} disabled={selectDisabled} />}
          <SortableHead sortKey="reviewedAt" sort={sort} onSort={toggleSort}>
            Reviewed
          </SortableHead>
          <SortableHead sortKey="ticketId" sort={sort} onSort={toggleSort}>
            Ticket
          </SortableHead>
          <SortableHead sortKey="subject" sort={sort} onSort={toggleSort}>
            Subject
          </SortableHead>
          <SortableHead sortKey="status" sort={sort} onSort={toggleSort}>
            Status
          </SortableHead>
          <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>
            Assignee
          </SortableHead>
          <SortableHead sortKey="resolvingAgent" sort={sort} onSort={toggleSort}>
            Resolving agent
          </SortableHead>
          {categories.map(c => (
            <SortableHead
              key={c.name}
              sortKey={`cat:${c.name}`}
              sort={sort}
              onSort={toggleSort}
              align="center"
              className="min-w-14 text-center"
            >
              <abbr title={c.name} className="no-underline">
                {categoryInitials(c.name)}
              </abbr>
              {c.weight != null && (
                <span className="text-muted-foreground block text-xs font-normal">{Math.round(c.weight * 100)}%</span>
              )}
            </SortableHead>
          ))}
          <SortableHead sortKey="total" sort={sort} onSort={toggleSort} align="center" className="text-center">
            Final score
          </SortableHead>
          <SortableHead sortKey="rating" sort={sort} onSort={toggleSort} align="center" className="text-center">
            Rating
          </SortableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pager.pageRows.map(r => (
          <Fragment key={r.id}>
          <TableRow
            data-state={selected.has(r.id) ? 'selected' : undefined}
            {...rowToggleProps({
              enabled: Boolean(onToggle) && !isBusy(open[r.id]),
              isOpen: Boolean(open[r.id]),
              onToggle: () => onToggle(r),
            })}
          >
            {onSelect && (
              <SelectRowCell review={r} selected={selected} onSelect={onSelect} disabled={selectDisabled || isBusy(open[r.id])} />
            )}
            <TableCell className="text-muted-foreground !whitespace-nowrap text-xs tabular-nums">
              {formatDateTime(r.reviewedAt)}
            </TableCell>
            <TableCell className="!whitespace-nowrap">
              <TicketIdLink
                href={ticketLink(subdomain, r.ticketId)}
                id={r.ticketId}
                reopenedSince={reopensSinceReview(currentReopens[r.ticketId], r.reopens)}
                reviewedAt={r.reviewedAt}
              />
            </TableCell>
            <TableCell className="max-w-72 min-w-48 !whitespace-normal [overflow-wrap:anywhere]">
              {r.subject ? <TicketSubject ticketId={r.ticketId} subject={r.subject} /> : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell title="Ticket status when it was reviewed">
              {r.ticketStatus ? <StatusBadge status={r.ticketStatus} /> : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>{r.assigneeName || '—'}</TableCell>
            <TableCell>{r.resolvingAgent || '—'}</TableCell>
            {categories.map(c => {
              const s = scoreOf(r, c.name)
              return (
                <TableCell key={c.name} className="text-center">
                  {s ? (
                    <Badge
                      variant="outline"
                      className={cn('tabular-nums', SCORE_TONE[s.score])}
                      title={s.weighted != null ? `Weighted ${Number(s.weighted).toFixed(2)}` : undefined}
                    >
                      {s.score}/5
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )
            })}
            <TableCell className="text-center font-semibold tabular-nums">
              <span className="relative">
                {/* The pen hangs off to the left so the score stays centred. */}
                <EditedMarker review={r} className="absolute top-0.5 right-full me-1.5" />
                {r.total != null ? Number(r.total).toFixed(2) : '—'}
              </span>
            </TableCell>
            <TableCell className="text-center">
              {r.rating ? (
                <Badge variant="outline" className={RATING_TONE[r.rating]}>
                  {r.rating}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
          {open[r.id] && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={categories.length + (onSelect ? 9 : 8)} className={cn(RESULT_PANEL, '!align-top')}>
                <FitToVisibleTable>
                  <ReviewCard
                    review={open[r.id]}
                    reviewedAt={open[r.id].reviewedAt}
                    expectedMs={expectedMs}
                    historyLine={
                      !isBusy(open[r.id]) &&
                      r.previousCount > 0 && <ReviewHistoryLine review={{ ...r, result: open[r.id], edits: open[r.id].edits }} />
                    }
                    reviewId={r.id}
                    ticket={{ id: r.ticketId, subject: r.subject }}
                    onFeedback={f => onFeedback?.(r.id, f)}
                  />
                </FitToVisibleTable>
              </TableCell>
            </TableRow>
          )}
          </Fragment>
        ))}
        {!reviews.length && (
          <TableRow>
            <TableCell colSpan={categories.length + (onSelect ? 9 : 8)} className="text-muted-foreground py-8 text-center">
              No saved reviews{filtered ? ' match these filters' : ' yet'}.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {reviews.length > 0 && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={onSelect ? 7 : 6} className="font-medium">
              Average ({reviews.length})
            </TableCell>
            {categories.map(c => {
              const avg = average(reviews.map(r => scoreOf(r, c.name)?.score).filter(v => v != null))
              return (
                <TableCell key={c.name} className="text-center tabular-nums">
                  {avg != null ? avg.toFixed(2) : '—'}
                </TableCell>
              )
            })}
            <TableCell className="text-center tabular-nums">{finalAverage != null ? finalAverage.toFixed(2) : '—'}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
    <Pagination {...pager} label="reviews" />
    </>
  )
}

// ---------- Bookmarks ----------

// Tickets bookmarked from Saved reviews, with their current review. Click a row to open the
// scorecard; the red bookmark removes the ticket from the list.
function Bookmarks({ settings, refreshKey }) {
  const [data, setData] = useState(null) // { reviews, withoutReview }
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState({})

  useEffect(() => {
    api
      .listBookmarks()
      .then(setData)
      .catch(e => setError(e.message))
  }, [refreshKey])

  async function toggle(r) {
    if (open[r.id] && !isBusy(open[r.id])) {
      setOpen(({ [r.id]: _, ...rest }) => rest)
      return
    }
    setOpen(o => ({ ...o, [r.id]: { loading: true } }))
    try {
      const saved = await api.getReview(r.id)
      setOpen(o => ({ ...o, [r.id]: { ...saved.result, reviewedAt: saved.reviewedAt, edits: saved.edits } }))
    } catch (e) {
      setOpen(o => ({ ...o, [r.id]: { error: e.message } }))
    }
  }

  // Removing a bookmark takes the ticket off this list.
  const unbookmark = ticketId =>
    setData(d => ({
      reviews: d.reviews.filter(r => r.ticketId !== ticketId),
      withoutReview: d.withoutReview.filter(b => b.ticketId !== ticketId),
    }))
  const patchRow = (ticketId, patch) =>
    setData(d => ({ ...d, reviews: d.reviews.map(r => (r.ticketId === ticketId ? { ...r, ...patch } : r)) }))

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.reviews || [])
      .filter(r => !term || [r.ticketId, r.subject, r.group, r.assigneeName, r.resolvingAgent].some(v => String(v ?? '').toLowerCase().includes(term)))
      .sort((a, b) => String(b.bookmarkedAt).localeCompare(String(a.bookmarkedAt)))
  }, [data, q])
  const { sorted, sort, toggle: toggleSort } = useSortable(rows, {
    bookmarkedAt: r => r.bookmarkedAt,
    ticketId: r => r.ticketId,
    subject: r => r.subject,
    status: r => r.ticketStatus,
    group: r => r.group,
    assignee: r => r.assigneeName,
    resolvingAgent: r => r.resolvingAgent,
    total: r => r.total,
  })
  const pager = usePagination(sorted, { storageKey: 'bookmarks', resetKey: JSON.stringify([q, sort]) })

  if (error) return <StatusAlert state={{ ok: false, message: error }} />
  if (!data) return <Spinner className="size-6" />

  const count = data.reviews.length + data.withoutReview.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bookmark className="size-4 fill-red-600 text-red-600" /> Bookmarks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!count ? (
          <p className="text-muted-foreground text-sm">
            No bookmarks yet. In Saved reviews, click <Bookmark className="inline size-3.5" /> on a ticket to bookmark it.
          </p>
        ) : (
          <>
            <SearchBox placeholder="Search ticket, subject, agent, group…" value={q} onChange={setQ} />
            <Table className="[&_td]:align-top [&_td]:whitespace-normal [&_th]:whitespace-normal">
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="bookmarkedAt" sort={sort} onSort={toggleSort}>
                    Bookmarked
                  </SortableHead>
                  <SortableHead sortKey="ticketId" sort={sort} onSort={toggleSort}>
                    Ticket
                  </SortableHead>
                  <SortableHead sortKey="subject" sort={sort} onSort={toggleSort}>
                    Subject
                  </SortableHead>
                  <SortableHead sortKey="status" sort={sort} onSort={toggleSort}>
                    Status
                  </SortableHead>
                  <SortableHead sortKey="group" sort={sort} onSort={toggleSort}>
                    Group
                  </SortableHead>
                  <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>
                    Assignee
                  </SortableHead>
                  <SortableHead sortKey="resolvingAgent" sort={sort} onSort={toggleSort}>
                    Resolving agent
                  </SortableHead>
                  <SortableHead sortKey="total" sort={sort} onSort={toggleSort}>
                    Score
                  </SortableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map(r => (
                  <Fragment key={r.id}>
                    <TableRow
                      {...rowToggleProps({
                        enabled: !isBusy(open[r.id]),
                        isOpen: Boolean(open[r.id]),
                        onToggle: () => toggle(r),
                      })}
                    >
                      <TableCell className="text-muted-foreground !whitespace-nowrap text-xs tabular-nums">
                        {formatDateTime(r.bookmarkedAt)}
                      </TableCell>
                      <TableCell className="!whitespace-nowrap">
                        <TicketIdLink href={ticketLink(settings.zendesk.subdomain, r.ticketId)} id={r.ticketId} reviewedAt={r.reviewedAt} />
                      </TableCell>
                      <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                        <TicketSubject ticketId={r.ticketId} subject={r.subject} />
                        <SideConversationIcon count={r.sideConversations} />
                        <ReopenedIcon count={r.reopens} />
                      </TableCell>
                      <TableCell>{r.ticketStatus ? <StatusBadge status={r.ticketStatus} /> : '—'}</TableCell>
                      <TableCell>{r.group || '—'}</TableCell>
                      <TableCell>{r.assigneeName || '—'}</TableCell>
                      <TableCell>{r.resolvingAgent || '—'}</TableCell>
                      <TableCell>
                        <div className="grid gap-0.5">
                          <span className="inline-flex items-center gap-1.5">
                            <RatingBadge total={r.total} rating={r.rating} />
                            <EditedMarker review={r} />
                          </span>
                          <span className="text-muted-foreground text-xs">Reviewed {formatDateTime(r.reviewedAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="!whitespace-nowrap text-end">
                        <BookmarkButton ticketId={r.ticketId} bookmarkedAt={r.bookmarkedAt} onChange={at => !at && unbookmark(r.ticketId)} />
                        <RelatedTicketsButton
                          ticketId={r.ticketId}
                          subject={r.subject}
                          count={r.relatedCount}
                          onCountChange={n => patchRow(r.ticketId, { relatedCount: n })}
                        />
                        <CommentsButton
                          ticketId={r.ticketId}
                          subject={r.subject}
                          count={r.commentCount}
                          onCountChange={n => patchRow(r.ticketId, { commentCount: n })}
                        />
                      </TableCell>
                    </TableRow>
                    {open[r.id] && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={9} className={RESULT_PANEL}>
                          <ReviewCard
                            review={open[r.id]}
                            reviewedAt={open[r.id].reviewedAt}
                            historyLine={
                              !isBusy(open[r.id]) &&
                              r.previousCount > 0 && <ReviewHistoryLine review={{ ...r, result: open[r.id], edits: open[r.id].edits }} />
                            }
                            reviewId={r.id}
                            ticket={{ id: r.ticketId, subject: r.subject }}
                            onFeedback={f => setOpen(o => (o[r.id] ? { ...o, [r.id]: { ...o[r.id], feedback: f } } : o))}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {!rows.length && data.reviews.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                      No bookmarks match this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {data.reviews.length > 0 && <Pagination {...pager} label="bookmarks" />}

            {data.withoutReview.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Bookmarked tickets with no saved review</p>
                <p className="text-muted-foreground text-xs">Their review was deleted or archived. Review them again, or remove the bookmark.</p>
                <ul className="divide-y text-sm">
                  {data.withoutReview.map(b => (
                    <li key={b.ticketId} className="flex items-center gap-3 py-1.5">
                      <TicketIdLink href={ticketLink(settings.zendesk.subdomain, b.ticketId)} id={b.ticketId} />
                      <span className="text-muted-foreground flex-1 text-xs">Bookmarked {formatDateTime(b.bookmarkedAt)}</span>
                      <BookmarkButton ticketId={b.ticketId} bookmarkedAt={b.bookmarkedAt} onChange={at => !at && unbookmark(b.ticketId)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SavedReviews({ settings, refreshKey }) {
  const [fetched, setReviews] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = usePersistentState('review.saved.search', '')
  const [filters, setFilters] = usePersistentState('review.saved.filters', NO_REVIEW_FILTERS)
  const [reviewedFrom, setReviewedFrom] = usePersistentState('review.saved.from', '')
  const [reviewedTo, setReviewedTo] = usePersistentState('review.saved.to', '')
  const [facets, setFacets] = useState({ groups: [], assignees: [], resolvingAgents: [], statuses: [] })
  const [open, setOpen] = useState({}) // reviewId -> full saved review | { loading } | { error }
  const [exporting, setExporting] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const [view, setView] = useState(readSavedView)
  // Current Zendesk re-open count per ticket, compared with the count stored at each review to
  // flag tickets re-opened after they were reviewed. Fetched only for tickets not yet looked up.
  const [currentReopens, setCurrentReopens] = useState({})
  // The re-review filter is applied here (it needs the current Zendesk re-open counts); every
  // other filter is applied by the server.
  const reviews = useMemo(
    () =>
      fetched &&
      fetched.filter(r =>
        matchesRereview(filters.rereview, reopensSinceReview(currentReopens[r.ticketId], r.reopens) > 0),
      ),
    [fetched, filters.rereview, currentReopens],
  )

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_VIEW_KEY, view)
    } catch {
      /* storage unavailable */
    }
  }, [view])

  useEffect(() => {
    const missing = [...new Set((fetched || []).map(r => r.ticketId))].filter(id => !(id in currentReopens))
    if (!missing.length) return
    api
      .currentReopens(missing)
      // Tickets Zendesk didn't return (e.g. deleted) are stored as null so they aren't asked for again.
      .then(counts => setCurrentReopens(c => ({ ...c, ...Object.fromEntries(missing.map(id => [id, counts[id] ?? null])) })))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched])

  useEffect(() => {
    api
      .reviewFacets()
      .then(setFacets)
      .catch(() => {})
  }, [refreshKey])

  // The search and filters as the server takes them (all but re-review, which is applied here).
  const serverParams = () => {
    const params = {}
    if (q.trim()) params.q = q.trim()
    for (const [key, value] of Object.entries(filters)) if (value.length && key !== 'rereview') params[key] = value
    // Reviewed dates are picked in local time; the server stores UTC timestamps.
    if (reviewedFrom) params.from = new Date(`${reviewedFrom}T00:00`).toISOString()
    if (reviewedTo) params.to = new Date(new Date(`${reviewedTo}T00:00`).getTime() + 86400000).toISOString()
    return params
  }

  // The table shows the newest LIST_LIMIT matches; matchCount says how many match in total, so a
  // longer list is never cut short silently (Export CSV always includes every match).
  const [matchCount, setMatchCount] = useState(null)
  useEffect(() => {
    const params = serverParams()
    const timer = setTimeout(() => {
      api
        .listReviews({ ...params, limit: LIST_LIMIT })
        .then(setReviews)
        .catch(e => setError(e.message))
      api
        .countReviews(params)
        .then(r => setMatchCount(r.total))
        .catch(() => setMatchCount(null))
    }, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, serverFilterKey(filters), reviewedFrom, reviewedTo, refreshKey])

  const activeFilters =
    countActive(filters) +
    [q.trim(), reviewedFrom, reviewedTo].filter(Boolean).length
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))
  const clearFilters = () => {
    setFilters(NO_REVIEW_FILTERS)
    setQ('')
    setReviewedFrom('')
    setReviewedTo('')
  }

  async function toggle(r) {
    if (open[r.id] && !isBusy(open[r.id])) {
      setOpen(({ [r.id]: _, ...rest }) => rest)
      return
    }
    setOpen(o => ({ ...o, [r.id]: { loading: true } }))
    try {
      const saved = await api.getReview(r.id)
      setOpen(o => ({ ...o, [r.id]: { ...saved.result, reviewedAt: saved.reviewedAt, edits: saved.edits } }))
    } catch (e) {
      setOpen(o => ({ ...o, [r.id]: { error: e.message } }))
    }
  }

  // Show all: open the scorecard of every review currently listed (one request); hide all closes them.
  const [showingAll, setShowingAll] = useState(false)
  async function showAllReviews() {
    const ids = (reviews || []).filter(r => !open[r.id]).map(r => r.id)
    if (!ids.length) return
    setShowingAll(true)
    setError('')
    try {
      const cards = await loadScorecards(ids)
      setOpen(o => ({ ...o, ...Object.fromEntries(ids.filter(id => !o[id] && cards.has(id)).map(id => [id, cards.get(id)])) }))
    } catch (e) {
      setError(e.message)
    } finally {
      setShowingAll(false)
    }
  }

  // Re-review: run a fresh review of the ticket. Once it is saved it becomes the current review and
  // this one is kept as a previous version (View history); the row is swapped for the new one in
  // place with its scorecard open.
  const [durations, setDurations] = useState([])
  const expectedMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 10000
  async function rereview(r) {
    const when = formatDateTime(r.reviewedAt)
    const ok = await confirm({
      title: `Re-review ticket #${r.ticketId}?`,
      description: `The new review becomes the current one. This review from ${when} is kept as a previous version, with its scores and score edits, under View history.`,
      confirmLabel: 'Re-review',
    })
    if (!ok) return
    await runRereview(r)
  }

  // Re-reviews one saved review (no confirmation); the new review replaces it in the list and its
  // scorecard opens. Returns true when it worked.
  async function runRereview(r) {
    const startedAt = Date.now()
    setOpen(o => ({ ...o, [r.id]: { reviewing: true, startedAt } }))
    try {
      const { replacedId, review, result } = await api.rereview(r.id)
      setDurations(d => [...d.slice(-9), Date.now() - startedAt])
      setReviews(list => list.map(x => (x.id === replacedId ? review : x)))
      setOpen(({ [replacedId]: _, ...rest }) => ({ ...rest, [review.id]: { ...result, reviewedAt: review.reviewedAt } }))
      return true
    } catch (e) {
      setOpen(o => ({ ...o, [r.id]: { error: `Re-review failed; the existing review was kept. ${e.message}` } }))
      return false
    }
  }

  // ---- Select reviews and re-review them together (Simple and Scoring views) ----
  const [selected, setSelected] = useState(() => new Set()) // review ids
  const [batch, setBatch] = useState(null) // { total, done, failed, stopping }
  const stopBatch = useRef(false)
  const selectReviews = (ids, on) =>
    setSelected(s => {
      const next = new Set(s)
      for (const id of ids) on ? next.add(id) : next.delete(id)
      return next
    })
  // Only selections still in the list count (filters may have hidden some); ignored tickets can't be re-reviewed.
  const selectedReviews = (reviews || []).filter(r => selected.has(r.id))
  const selectedRunnable = selectedReviews.filter(r => !r.ignored && !isBusy(open[r.id]))

  async function rereviewSelected() {
    const list = selectedRunnable
    if (!list.length) return
    const skipped = selectedReviews.length - list.length
    const ok = await confirm({
      title: `Re-review ${list.length} ticket${list.length === 1 ? '' : 's'}?`,
      description:
        `Each ticket is reviewed again by the AI, ${BATCH_CONCURRENCY} at a time. The new review becomes the current one; the existing review is kept as a previous version, with its scores and score edits, under View history.` +
        (skipped ? `\n\n${skipped} selected ${skipped === 1 ? 'review is' : 'reviews are'} ignored or busy and will be skipped.` : '') +
        // Estimate from this session's review times, or about 45 s per review before any has run.
        `\n\nThis takes roughly ${Math.max(1, Math.round((list.length * (durations.length ? expectedMs : 45000)) / BATCH_CONCURRENCY / 60000))} min. You can stop it; reviews already done are kept.`,
      confirmLabel: `Re-review ${list.length}`,
    })
    if (!ok) return
    stopBatch.current = false
    setBatch({ total: list.length, done: 0, failed: 0 })
    setOpen(o => ({ ...o, ...Object.fromEntries(list.map(r => [r.id, { queued: true }])) }))
    const queue = [...list]
    const worker = async () => {
      while (queue.length && !stopBatch.current) {
        const r = queue.shift()
        const worked = await runRereview(r)
        if (worked) setSelected(s => (s.has(r.id) ? new Set([...s].filter(id => id !== r.id)) : s))
        setBatch(b => ({ ...b, done: b.done + 1, failed: b.failed + (worked ? 0 : 1) }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, list.length) }, worker))
    // Stopped: the ones still waiting go back to normal.
    if (queue.length) {
      const left = new Set(queue.map(r => r.id))
      setOpen(o => Object.fromEntries(Object.entries(o).filter(([id, v]) => !(left.has(Number(id)) && v.queued))))
    }
    setBatch(b => ({ ...b, finished: true, stopped: queue.length > 0 }))
  }
  const batchRunning = Boolean(batch && !batch.finished)

  // After a manual score edit: refresh the row, and the scorecard if it is open.
  function scoresEdited({ review, result, edits }) {
    setReviews(list => list.map(x => (x.id === review.id ? review : x)))
    setOpen(o => (o[review.id] ? { ...o, [review.id]: { ...result, reviewedAt: review.reviewedAt, edits } } : o))
  }

  async function remove(r) {
    const also = r.previousCount
      ? ` This also deletes its ${r.previousCount === 1 ? 'previous version' : `${r.previousCount} previous versions`} and their score edits.`
      : ''
    const ok = await confirm({
      title: `Delete the review of ticket #${r.ticketId}?`,
      description: `The saved review from ${formatDateTime(r.reviewedAt)} will be deleted.${also} This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deleteReview(r.id)
      setReviews(list => list.filter(x => x.id !== r.id))
    } catch (e) {
      setError(e.message)
    }
  }

  const reviewSortGetters = {
    reviewedAt: r => r.reviewedAt,
    ticketId: r => r.ticketId,
    subject: r => r.subject,
    group: r => r.group,
    assignee: r => r.assigneeName,
    resolvingAgent: r => r.resolvingAgent,
    total: r => r.total,
  }
  const { sorted: sortedReviews, sort, toggle: toggleSort } = useSortable(reviews || [], reviewSortGetters)
  // True when more reviews match than the table loaded (only the newest LIST_LIMIT are listed).
  const truncated = matchCount != null && fetched != null && matchCount > fetched.length

  // Export CSV: the server returns every review matching the search and filters (re-review
  // included), with no cap; they are sorted here exactly like the table.
  // includeHistory adds every previous version as its own row, right after its ticket's current
  // review; the current reviews are sorted like the table and their versions stay with them.
  async function exportAll(includeHistory = false) {
    setExporting(true)
    setError('')
    setExportMenu(false)
    try {
      const full = await api.exportMatchingReviews({ ...serverParams(), rereview: filters.rereview, includeHistory })
      const currentRows = sortRows(
        full.filter(r => !r.superseded),
        sort,
        reviewSortGetters,
      )
      const older = new Map()
      for (const r of full.filter(x => x.superseded)) older.set(r.ticketId, [...(older.get(r.ticketId) || []), r])
      exportCsv(currentRows.flatMap(r => [r, ...(older.get(r.ticketId) || [])]))
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(false)
    }
  }
  // Filters that change which reviews are listed; pagination returns to page 1 when they change.
  const savedResetKey = JSON.stringify([q, filters, reviewedFrom, reviewedTo])
  const pager = usePagination(sortedReviews, {
    storageKey: 'savedSimple',
    resetKey: JSON.stringify([savedResetKey, sort, view]),
  })


  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-3">
        <CardTitle>Saved reviews</CardTitle>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={v => v && setView(v)}
          aria-label="Saved reviews view"
        >
          {SAVED_VIEWS.map(v => (
            <ToggleGroupItem
              key={v.value}
              value={v.value}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
            >
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <CardAction className="flex flex-wrap items-center gap-3 self-center">
          {batchRunning ? (
            <>
              <span className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
                <Spinner className="size-3.5" />
                Re-reviewing {batch.done} of {batch.total}
                {batch.failed > 0 && <span className="text-destructive">· {batch.failed} failed</span>}
                {batch.stopping && <span className="text-muted-foreground">· stopping after the current ones…</span>}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={batch.stopping}
                onClick={() => {
                  stopBatch.current = true
                  setBatch(b => ({ ...b, stopping: true }))
                }}
              >
                <Square /> Stop
              </Button>
            </>
          ) : (
            <>
              {batch?.finished && (
                <span className={cn('text-sm', batch.failed ? 'text-destructive' : 'text-muted-foreground')}>
                  {batch.stopped ? 'Stopped: ' : ''}re-reviewed {batch.done - batch.failed} of {batch.total}
                  {batch.failed > 0 && ` · ${batch.failed} failed (kept as they were)`}
                </span>
              )}
              {selectedReviews.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              )}
              <Button
                size="sm"
                disabled={!selectedRunnable.length}
                onClick={rereviewSelected}
                title={
                  selectedReviews.length
                    ? 'Review the selected tickets again; the current reviews are kept as previous versions'
                    : 'Tick reviews in the list to re-review them together'
                }
              >
                <RefreshCw /> Re-review selected ({selectedReviews.length})
              </Button>
            </>
          )}
          {view === 'simple' && (
            <ShowAllReviewsButton
              anyOpen={(reviews || []).some(r => open[r.id] && !isBusy(open[r.id]))}
              loading={showingAll}
              disabled={!reviews?.length}
              onShowAll={showAllReviews}
              onHideAll={() => setOpen(o => Object.fromEntries(Object.entries(o).filter(([, v]) => isBusy(v))))}
            />
          )}
          {/* Export CSV with a small menu: current reviews only (the usual), or with every previous version. */}
          <Popover open={exportMenu} onOpenChange={setExportMenu}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!reviews?.length || exporting}
                title={
                  truncated
                    ? `Exports every review matching the search and filters (${matchCount.toLocaleString()} before the re-review filter), not only the ${fetched.length.toLocaleString()} listed`
                    : 'Exports every review matching the search and filters, in the current sort order'
                }
              >
                {exporting ? <Spinner /> : <Download />} Export CSV
                <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-1">
              <button
                type="button"
                className="hover:bg-accent w-full rounded-sm px-3 py-2 text-left text-sm"
                onClick={() => exportAll(false)}
              >
                <span className="font-medium">Current Reviews</span>
                <span className="text-muted-foreground block text-xs">
                  One row per ticket, with its previous total, rating and date.
                </span>
              </button>
              <button
                type="button"
                className="hover:bg-accent w-full rounded-sm px-3 py-2 text-left text-sm"
                onClick={() => exportAll(true)}
              >
                <span className="font-medium">Include All Previous Versions</span>
                <span className="text-muted-foreground block text-xs">
                  Every earlier version as its own row, marked Superseded, after its current review.
                </span>
              </button>
            </PopoverContent>
          </Popover>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <SearchBox placeholder="Search ticket, subject, agent, group…" value={q} onChange={setQ} />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Ratings" value={filters.rating} onChange={setFilterValue('rating')} options={RATINGS} />
          <FilterSelect label="Groups" value={filters.group} onChange={setFilterValue('group')} options={facets.groups} />
          <FilterSelect
            label="Assignees"
            value={filters.assignee}
            onChange={setFilterValue('assignee')}
            options={facets.assignees}
          />
          <FilterSelect
            label="Resolving agents"
            value={filters.resolvingAgent}
            onChange={setFilterValue('resolvingAgent')}
            options={facets.resolvingAgents}
          />
          <FilterSelect
            label="Ticket statuses"
            value={filters.status}
            onChange={setFilterValue('status')}
            options={facets.statuses.map(s => ({ value: s, label: capitalize(s) }))}
          />
          <FilterSelect
            label="Related tickets"
            value={filters.related}
            onChange={setFilterValue('related')}
            options={WITH_WITHOUT('related tickets')}
          />
          <FilterSelect
            label="Comments"
            value={filters.comments ?? []}
            onChange={setFilterValue('comments')}
            options={WITH_WITHOUT('comments')}
          />
          <FilterSelect
            label="Re-review"
            value={filters.rereview}
            onChange={setFilterValue('rereview')}
            options={REREVIEW_OPTIONS}
          />
          <FilterSelect
            label="Previous versions"
            value={filters.history}
            onChange={setFilterValue('history')}
            options={[
              { value: 'with', label: 'Reviewed more than once' },
              { value: 'without', label: 'Reviewed once' },
            ]}
          />
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sr-from" className="text-muted-foreground text-xs font-normal">
              Reviewed
            </Label>
            <DatePicker
              id="sr-from"
              size="sm"
              clearable
              aria-label="Reviewed from"
              placeholder="From"
              value={reviewedFrom}
              max={reviewedTo || undefined}
              onChange={setReviewedFrom}
            />
            <span className="text-muted-foreground text-xs">to</span>
            <DatePicker
              size="sm"
              clearable
              aria-label="Reviewed to"
              placeholder="To"
              value={reviewedTo}
              min={reviewedFrom || undefined}
              onChange={setReviewedTo}
            />
          </div>
          <ClearFiltersButton count={activeFilters} onClear={clearFilters} />
        </div>
        {error && <StatusAlert state={{ ok: false, message: error }} />}
        {/* More reviews match than the table loads: a slim one-line note (wraps only on narrow screens). */}
        {truncated && (
          <p
            role="note"
            className="text-muted-foreground bg-muted/40 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-3 py-1.5 text-xs"
            title={`Saved Reviews lists the newest ${fetched.length.toLocaleString()} matching reviews to stay fast. The table, averages and score cards on this page use those; search and filters still look through every saved review, and Export CSV includes all ${matchCount.toLocaleString()}${filters.rereview.length ? ' (re-review filter applied)' : ''}.`}
          >
            <Info className="text-info size-3.5 shrink-0" />
            <span className="text-foreground font-medium">
              Showing the newest {fetched.length.toLocaleString()} of {matchCount.toLocaleString()} matching reviews
            </span>
            <span aria-hidden="true">·</span>
            <span>Export CSV includes all {matchCount.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>Refine the search or dates to see older reviews</span>
          </p>
        )}
        <ReviewSummary reviews={reviews} />
        {!reviews ? (
          <Spinner />
        ) : view === 'scoring' ? (
          <ScoringTable
            reviews={reviews}
            subdomain={settings.zendesk.subdomain}
            filtered={activeFilters > 0}
            currentReopens={currentReopens}
            resetKey={savedResetKey}
            open={open}
            onToggle={toggle}
            onFeedback={(id, f) => setOpen(o => (o[id] ? { ...o, [id]: { ...o[id], feedback: f } } : o))}
            expectedMs={expectedMs}
            selected={selected}
            onSelect={selectReviews}
            selectDisabled={batchRunning}
          />
        ) : (
          <>
          <Table className="[&_td]:align-top [&_td]:whitespace-normal [&_th]:whitespace-normal">
            <TableHeader>
              <TableRow>
                <SelectPageHead rows={pager.pageRows} selected={selected} onSelect={selectReviews} disabled={batchRunning} />
                <SortableHead sortKey="reviewedAt" sort={sort} onSort={toggleSort}>
                  Reviewed
                </SortableHead>
                <SortableHead sortKey="ticketId" sort={sort} onSort={toggleSort}>
                  Ticket
                </SortableHead>
                <SortableHead sortKey="subject" sort={sort} onSort={toggleSort}>
                  Subject
                </SortableHead>
                <SortableHead sortKey="group" sort={sort} onSort={toggleSort}>
                  Group
                </SortableHead>
                <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>
                  Assignee
                </SortableHead>
                <SortableHead sortKey="resolvingAgent" sort={sort} onSort={toggleSort}>
                  Resolving agent
                </SortableHead>
                <SortableHead sortKey="total" sort={sort} onSort={toggleSort}>
                  Score
                </SortableHead>
                <TableHead className="text-end" data-pdf-exclude>
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageRows.map(r => (
                <Fragment key={r.id}>
                  <TableRow
                    data-snap-row={`saved-${r.id}`}
                    data-state={selected.has(r.id) ? 'selected' : undefined}
                    {...rowToggleProps({
                      enabled: !isBusy(open[r.id]),
                      isOpen: Boolean(open[r.id]),
                      onToggle: () => toggle(r),
                    })}
                  >
                    <SelectRowCell review={r} selected={selected} onSelect={selectReviews} disabled={batchRunning || isBusy(open[r.id])} />
                    <TableCell className="text-muted-foreground !whitespace-nowrap text-xs tabular-nums">
                      {formatDateTime(r.reviewedAt)}
                    </TableCell>
                    <TableCell className="!whitespace-nowrap">
                      <TicketIdLink
                        href={ticketLink(settings.zendesk.subdomain, r.ticketId)}
                        id={r.ticketId}
                        reopenedSince={reopensSinceReview(currentReopens[r.ticketId], r.reopens)}
                        reviewedAt={r.reviewedAt}
                      />
                    </TableCell>
                    <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                      <TicketSubject ticketId={r.ticketId} subject={r.subject} />
                      <SideConversationIcon count={r.sideConversations} />
                      <ReopenedIcon count={r.reopens} />
                      <IgnoredBadge ignored={r.ignored} ignoredManually={r.ignoredManually} ignoreRule={r.ignoreRule} oldTicket={r.oldTicket} />
                    </TableCell>
                    <TableCell>{r.group || '—'}</TableCell>
                    <TableCell>{r.assigneeName || '—'}</TableCell>
                    <TableCell>{r.resolvingAgent || '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <RatingBadge total={r.total} rating={r.rating} />
                        <EditedMarker review={r} />
                        <PreviousVersionsBadge count={r.previousCount} />
                      </span>
                    </TableCell>
                    <TableCell className="!whitespace-nowrap text-end" data-pdf-exclude>
                      <BookmarkButton
                        ticketId={r.ticketId}
                        bookmarkedAt={r.bookmarkedAt}
                        onChange={at =>
                          setReviews(list => list.map(x => (x.ticketId === r.ticketId ? { ...x, bookmarkedAt: at } : x)))
                        }
                      />
                      <RelatedTicketsButton
                        ticketId={r.ticketId}
                        subject={r.subject}
                        count={r.relatedCount}
                        onCountChange={n =>
                          setReviews(list => list.map(x => (x.ticketId === r.ticketId ? { ...x, relatedCount: n } : x)))
                        }
                      />
                      <CommentsButton
                        ticketId={r.ticketId}
                        subject={r.subject}
                        count={r.commentCount}
                        onCountChange={n =>
                          setReviews(list => list.map(x => (x.ticketId === r.ticketId ? { ...x, commentCount: n } : x)))
                        }
                      />
                      <SaveReviewImageButton
                        snapKey={`saved-${r.id}`}
                        fileName={`ticket-${r.ticketId}-review-${isoDay(new Date(r.reviewedAt))}.png`}
                        open={() => (open[r.id] ? null : toggle(r))}
                        disabled={isBusy(open[r.id])}
                      />
                      <IconAction
                        label={r.ignored ? (r.oldTicket ? 'Ignored — created before 2026' : r.ignoreRule ? `Ignored by a Settings rule (${r.ignoreRule})` : 'Ignored — unignore the ticket to re-review') : 'Re-review (this review is kept as a previous version)'}
                        onClick={() => rereview(r)}
                        disabled={isBusy(open[r.id]) || r.ignored}
                      >
                        <RefreshCw className={open[r.id]?.reviewing ? 'animate-spin' : undefined} />
                      </IconAction>
                      <EditScoresButton review={r} disabled={isBusy(open[r.id])} onSaved={scoresEdited} />
                      <IconAction label="Delete review" onClick={() => remove(r)} disabled={isBusy(open[r.id])}>
                        <Trash2 />
                      </IconAction>
                    </TableCell>
                  </TableRow>
                  {open[r.id] && (
                    <TableRow
                      className="hover:bg-transparent"
                      data-snap-panel={isBusy(open[r.id]) ? undefined : `saved-${r.id}`}
                    >
                      <TableCell colSpan={9} className={RESULT_PANEL}>
                        <ReviewCard
                          review={open[r.id]}
                          reviewedAt={open[r.id].reviewedAt}
                          expectedMs={expectedMs}
                          historyLine={
                            !isBusy(open[r.id]) &&
                            r.previousCount > 0 && <ReviewHistoryLine review={{ ...r, result: open[r.id], edits: open[r.id].edits }} />
                          }
                          reviewId={r.id}
                          ticket={{ id: r.ticketId, subject: r.subject }}
                          onFeedback={f => setOpen(o => (o[r.id] ? { ...o, [r.id]: { ...o[r.id], feedback: f } } : o))}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {!reviews.length && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground py-8 text-center">
                    No saved reviews{activeFilters ? ' match these filters' : ' yet'}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination {...pager} label="reviews" />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Page ----------

export default function QualityReview({ active }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('find')
  const [refreshKey, setRefreshKey] = useState(0)

  // Loaded on first visit and again each time the page is shown (it stays mounted between
  // visits), so Settings changes such as the model or groups apply without losing results.
  useEffect(() => {
    if (!active) return
    api
      .getSettings()
      .then(setSettings)
      .catch(e => setError(e.message))
  }, [active])

  if (error) return <StatusAlert state={{ ok: false, message: error }} />
  if (!settings) return <Spinner className="size-6" />

  const ready = settings.zendesk.hasToken && settings.ollama.enabled && settings.ollama.model

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quality Review</h1>
        <p className="text-muted-foreground text-sm">
          Ticket Quality Review scored by <span className="font-medium">{settings.ollama.model || 'no model'}</span>.
          Every review is saved and can be revisited under Saved reviews.
        </p>
      </div>

      {!ready && (
        <Alert>
          <AlertDescription>
            <span>
              Finish setup first: add a Zendesk API token, enable AI scoring and pick an Ollama model on the{' '}
              <Link to="/settings" className="text-foreground font-medium underline underline-offset-4">
                Settings
              </Link>{' '}
              page.
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {QR_TABS.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              <Icon className="size-3.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* forceMount keeps search results and in-flight reviews when switching tabs. */}
        <TabsContent value="find" forceMount hidden={tab !== 'find'} className="mt-4">
          <FindAndReview settings={settings} onSaved={() => setRefreshKey(k => k + 1)} />
        </TabsContent>
        <TabsContent value="saved" className="mt-4">
          <SavedReviews settings={settings} refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <Suspense fallback={<Spinner className="size-6" />}>
            <ReviewTrends refreshKey={refreshKey} />
          </Suspense>
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <Suspense fallback={<Spinner className="size-6" />}>
            <ReviewCategories settings={settings} refreshKey={refreshKey} />
          </Suspense>
        </TabsContent>
        <TabsContent value="ignored" className="mt-4">
          <IgnoredTickets refreshKey={refreshKey} onChanged={() => setRefreshKey(k => k + 1)} />
        </TabsContent>
        <TabsContent value="bookmarks" className="mt-4">
          <Bookmarks settings={settings} refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
