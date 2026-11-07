import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
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
import IgnoredTickets from '@/components/IgnoredTickets'
import ReviewSummary from '@/components/ReviewSummary'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { downloadCsv } from '@/lib/csv'
import { formatDateTime, isoDay, yesterday } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { DatePicker } from '@/components/DatePicker'
import { api } from '../api.js'

// The Trends charts (recharts) load when the Trends tab is first opened.
const ReviewTrends = lazy(() => import('@/components/ReviewTrends'))
// Scores grouped by a Zendesk field (Category, Topic, …); loads when its tab is first opened.
const ReviewCategories = lazy(() => import('@/components/ReviewCategories'))

const RATINGS = ['Excellent', 'Good', 'Acceptable', 'Below Standard', 'Poor']

// Every filter holds a list of selected values; an empty list means "all". A row matches a filter
// when it matches any of its selected values, and must match every filter that is set.
const NO_TICKET_FILTERS = { status: [], group: [], assignee: [], review: [], side: [], related: [], ignored: [] }
const NO_REVIEW_FILTERS = { rating: [], group: [], assignee: [], resolvingAgent: [], status: [], related: [], rereview: [] }
// Saved reviews loads at most this many (newest first); Export CSV is not limited by it.
const LIST_LIMIT = 1000
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

function ViewToggle({ isOpen, ...props }) {
  return (
    <IconAction label={isOpen ? 'Hide review' : 'View review'} aria-pressed={!!isOpen} {...props}>
      {isOpen ? <EyeOff /> : <Eye />}
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
  const [statuses, setStatuses] = useState(settings.review.statuses.length ? settings.review.statuses : ['solved'])
  const [from, setFrom] = useState(yesterday)
  const [to, setTo] = useState(yesterday)
  const [ids, setIds] = useState('')
  const [result, setResult] = useState(null)
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
      // searchedAt marks a new search, so pagination returns to page 1.
      setResult({ ...(await api.findReviewTickets(query)), searchedAt: Date.now() })
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
          <CardDescription>
            Searches{' '}
            {settings.review.groupIds.length
              ? `${settings.review.groupIds.length} group(s) chosen for Quality Review`
              : 'all groups'}{' '}
            (change in{' '}
            <Link to="/settings" className="text-foreground underline underline-offset-4">
              Settings
            </Link>
            ), or look up specific ticket numbers. Tickets created before 2026 are always ignored: searches leave them
            out, and looked-up ones show as <b>Ignored · before 2026</b>.
          </CardDescription>
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 w-56"
                placeholder="Search ID, subject, agent…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
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
                  <TableHead className="w-8">
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
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map(t => (
                  <Fragment key={t.id}>
                    <TableRow data-state={selected.has(t.id) ? 'selected' : undefined} className={cn(t.ignored && 'opacity-60')}>
                      <TableCell>
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
                            <span className="text-muted-foreground text-xs">
                              {formatDateTime(t.latestReview.reviewedAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Not reviewed</span>
                        )}
                      </TableCell>
                      <TableCell className="!whitespace-nowrap text-end">
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
                          <ViewToggle
                            isOpen={open[t.id] && !isBusy(open[t.id])}
                            onClick={() => viewLatest(t)}
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
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className={RESULT_PANEL}>
                          <ReviewCard review={open[t.id]} reviewedAt={open[t.id].reviewedAt} expectedMs={expectedMs} />
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
    ...categories.flatMap(c => [`${c} – score`, `${c} – findings`]),
    'Summary',
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
      ...categories.flatMap(c => [cats[c]?.score ?? '', (cats[c]?.findings || []).join(' | ')]),
      r.result?.summary,
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

// One row per review: date/time, ticket, the 1–5 score for every category, final score and rating.
function ScoringTable({ reviews, subdomain, filtered, currentReopens, resetKey }) {
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
          <SortableHead sortKey="reviewedAt" sort={sort} onSort={toggleSort}>
            Reviewed
          </SortableHead>
          <SortableHead sortKey="ticketId" sort={sort} onSort={toggleSort}>
            Ticket
          </SortableHead>
          {categories.map(c => (
            <SortableHead
              key={c.name}
              sortKey={`cat:${c.name}`}
              sort={sort}
              onSort={toggleSort}
              align="center"
              className="min-w-24 text-center"
            >
              {c.name}
              {c.weight != null && (
                <span className="text-muted-foreground block text-xs font-normal">{Math.round(c.weight * 100)}%</span>
              )}
            </SortableHead>
          ))}
          <SortableHead sortKey="total" sort={sort} onSort={toggleSort} align="end" className="text-end">
            Final score
          </SortableHead>
          <SortableHead sortKey="rating" sort={sort} onSort={toggleSort}>
            Rating
          </SortableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pager.pageRows.map(r => (
          <TableRow key={r.id}>
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
            <TableCell className="text-end font-semibold tabular-nums">
              <EditedMarker review={r} className="me-1.5" />
              {r.total != null ? Number(r.total).toFixed(2) : '—'}
            </TableCell>
            <TableCell>
              {r.rating ? (
                <Badge variant="outline" className={RATING_TONE[r.rating]}>
                  {r.rating}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
        {!reviews.length && (
          <TableRow>
            <TableCell colSpan={categories.length + 4} className="text-muted-foreground py-8 text-center">
              No saved reviews{filtered ? ' match these filters' : ' yet'}.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {reviews.length > 0 && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="font-medium">
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
            <TableCell className="text-end tabular-nums">{finalAverage != null ? finalAverage.toFixed(2) : '—'}</TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      )}
    </Table>
    <Pagination {...pager} label="reviews" />
    </>
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

  // Re-review: run a fresh review of the ticket; once it is saved the server deletes this review,
  // and the row is swapped for the new one in place with its scorecard open.
  const [durations, setDurations] = useState([])
  const expectedMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 10000
  async function rereview(r) {
    const when = formatDateTime(r.reviewedAt)
    if (!window.confirm(`Re-review ticket #${r.ticketId}?\n\nWhen the new review is saved, this review from ${when} will be deleted and replaced.`)) {
      return
    }
    const startedAt = Date.now()
    setOpen(o => ({ ...o, [r.id]: { reviewing: true, startedAt } }))
    try {
      const { replacedId, review, result } = await api.rereview(r.id)
      setDurations(d => [...d.slice(-9), Date.now() - startedAt])
      setReviews(list => list.map(x => (x.id === replacedId ? review : x)))
      setOpen(({ [replacedId]: _, ...rest }) => ({ ...rest, [review.id]: { ...result, reviewedAt: review.reviewedAt } }))
    } catch (e) {
      setOpen(o => ({ ...o, [r.id]: { error: `Re-review failed; the existing review was kept. ${e.message}` } }))
    }
  }

  // After a manual score edit: refresh the row, and the scorecard if it is open.
  function scoresEdited({ review, result, edits }) {
    setReviews(list => list.map(x => (x.id === review.id ? review : x)))
    setOpen(o => (o[review.id] ? { ...o, [review.id]: { ...result, reviewedAt: review.reviewedAt, edits } } : o))
  }

  async function remove(r) {
    if (!window.confirm(`Delete the saved review of ticket #${r.ticketId} from ${formatDateTime(r.reviewedAt)}?`)) {
      return
    }
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
  async function exportAll() {
    setExporting(true)
    setError('')
    try {
      const full = await api.exportMatchingReviews({ ...serverParams(), rereview: filters.rereview })
      exportCsv(sortRows(full, sort, reviewSortGetters))
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

  const avg = reviews?.length
    ? reviews.filter(r => r.total != null).reduce((s, r, _, a) => s + r.total / a.length, 0)
    : null

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
        <CardAction className="flex items-center gap-3 self-center">
          {reviews && (
            <span className="text-muted-foreground text-sm">
              {reviews.length} review{reviews.length === 1 ? '' : 's'}
              {truncated && ` (newest of ${matchCount.toLocaleString()})`}
              {avg != null && ` · average ${avg.toFixed(2)}`}
            </span>
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
          <Button
            variant="outline"
            size="sm"
            disabled={!reviews?.length || exporting}
            onClick={exportAll}
            title={
              truncated
                ? `Exports every review matching the search and filters (${matchCount.toLocaleString()} before the re-review filter), not only the ${fetched.length.toLocaleString()} listed`
                : 'Exports every review matching the search and filters, in the current sort order'
            }
          >
            {exporting ? <Spinner /> : <Download />} Export CSV
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Search ticket, subject, agent, group…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
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
            label="Re-review"
            value={filters.rereview}
            onChange={setFilterValue('rereview')}
            options={REREVIEW_OPTIONS}
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
        {truncated && (
          <Alert className="border-warning/40 py-2">
            <AlertDescription>
              Showing the newest {fetched.length.toLocaleString()} of {matchCount.toLocaleString()} matching reviews;
              the table, averages and score cards use these. <b>Export CSV</b> includes all{' '}
              {matchCount.toLocaleString()}
              {filters.rereview.length ? ' (with the re-review filter applied)' : ''}. Narrow the search or dates to see
              older ones here.
            </AlertDescription>
          </Alert>
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
          />
        ) : (
          <>
          <Table className="[&_td]:align-top [&_td]:whitespace-normal [&_th]:whitespace-normal">
            <TableHeader>
              <TableRow>
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
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageRows.map(r => (
                <Fragment key={r.id}>
                  <TableRow>
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
                      </span>
                    </TableCell>
                    <TableCell className="!whitespace-nowrap text-end">
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
                      <ViewToggle
                        isOpen={open[r.id] && !isBusy(open[r.id])}
                        onClick={() => toggle(r)}
                        disabled={isBusy(open[r.id])}
                      />
                      <IconAction
                        label={r.ignored ? (r.oldTicket ? 'Ignored — created before 2026' : r.ignoreRule ? `Ignored by a Settings rule (${r.ignoreRule})` : 'Ignored — unignore the ticket to re-review') : 'Re-review (replaces this review)'}
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
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className={RESULT_PANEL}>
                        <ReviewCard review={open[r.id]} reviewedAt={open[r.id].reviewedAt} expectedMs={expectedMs} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {!reviews.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
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
          <TabsTrigger value="find">Find &amp; review</TabsTrigger>
          <TabsTrigger value="saved">Saved reviews</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="ignored">Ignored tickets</TabsTrigger>
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
      </Tabs>
    </div>
  )
}
