import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Play } from 'lucide-react'
import {
  ClearFiltersButton,
  FilterSelect,
  ReopenedIcon,
  SideConversationIcon,
  Spinner,
  StatusAlert,
  StatusBadge,
  StatusToggles,
  TicketIdLink,
  dateFieldFor,
  reopensSinceReview,
} from '@/components/common'
import { TicketSubject } from '@/components/TicketTimeline'
import FieldValues from '@/components/FieldValues'
import { rowToggleProps } from '@/lib/rowToggle'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatDateTime, yesterday } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { DatePicker } from '@/components/DatePicker'
import { SortableHead, useSortable } from '@/components/sorting'
import { Pagination, usePagination } from '@/components/pagination'
import { TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// Table filters; a row matches a filter when it matches any of its selected values.
const NO_FILTERS = { status: [], group: [], lastUpdatedBy: [], assignee: [], side: [], reopened: [] }

const WITH_WITHOUT = (withLabel, withoutLabel) => [
  { value: 'with', label: withLabel },
  { value: 'without', label: withoutLabel },
]

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)

// Exports the given results (the rows currently shown) of a run.
function download(run, results) {
  const header = [
    'Ticket ID',
    'Subject',
    'Side conversations',
    'Re-opens',
    'Group',
    'Last Updated By',
    'Assignee',
    'Status',
    'Result',
    'Missing fields',
    'Not applicable',
    'URL',
  ]
  const label = Object.fromEntries(run.fields.map(f => [f.key, f.label]))
  const rows = results.map(r => [
    r.id,
    r.subject,
    r.sideConversations ?? '',
    r.reopens ?? '',
    r.group,
    r.lastUpdatedBy,
    r.assignee,
    r.status,
    r.pass ? 'Pass' : 'Fail',
    r.missing.map(k => label[k] || k).join('; '),
    (r.notApplicable || []).map(k => label[k] || k).join('; '),
    r.url,
  ])
  downloadCsv([header, ...rows], `ticket-qc_${run.window.from}_${run.window.to}.csv`)
}

function Stat({ title, value, description, valueClass }) {
  return (
    <Card className="gap-1 py-5">
      <CardHeader className="px-5">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={cn('text-3xl tabular-nums', valueClass)}>{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground px-5 text-xs">{description}</CardContent>
    </Card>
  )
}

export default function MetadataQC({ active }) {
  const [run, setRun] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [from, setFrom] = useState(yesterday)
  const [to, setTo] = useState(yesterday)
  const [statuses, setStatuses] = useState(['solved'])
  const [filter, setFilter] = usePersistentState('metadataQC.show', 'failed')
  const [search, setSearch] = usePersistentState('metadataQC.search', '')
  // Missing-field filter: keys of the selected fields; a ticket shows if it misses any of them.
  const [fieldFilter, setFieldFilter] = usePersistentState('metadataQC.fields', [])
  // Multi-select table filters; an empty list means "all".
  const [filters, setFilters] = usePersistentState('metadataQC.filters', NO_FILTERS)
  // Rows opened to show their field values (ticket ids); cleared by a new run.
  const [openRows, setOpenRows] = useState(() => new Set())
  const toggleRow = id =>
    setOpenRows(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  useEffect(() => {
    api.lastRun().then(r => r && setRun(r)).catch(() => {})
    api
      .getSettings()
      .then(s => {
        setSettings(s)
        if (s.qc.statuses.length) setStatuses(s.qc.statuses)
      })
      .catch(e => setError(e.message))
  }, [])

  // The page stays mounted between visits; pick up Settings changes (groups, required fields)
  // when it is shown again, without touching the dates, statuses or filters on screen.
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) api.getSettings().then(setSettings).catch(() => {})
    wasActive.current = active
  }, [active])

  async function runCheck() {
    setLoading(true)
    setError('')
    try {
      setRun(await api.runQc({ from, to, statuses }))
      setOpenRows(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const labels = useMemo(() => Object.fromEntries((run?.fields || []).map(f => [f.key, f.label])), [run])

  // Filter options from the current run's results.
  const facets = useMemo(() => {
    const results = run?.results || []
    const distinct = key => [...new Set(results.map(r => r[key]).filter(v => v && v !== '—'))].sort()
    return {
      statuses: distinct('status'),
      groups: distinct('group'),
      lastUpdatedBy: distinct('lastUpdatedBy'),
      assignees: distinct('assignee'),
    }
  }, [run])

  const rows = useMemo(() => {
    if (!run) return []
    const q = search.trim().toLowerCase()
    const f = filters
    const inList = (list, value) => !list.length || list.includes(value)
    // With/without filters: both or neither selected means no filtering.
    const withWithout = (list, has) => !list.length || list.includes(has ? 'with' : 'without')
    return run.results.filter(r => {
      if (filter === 'failed' && r.pass) return false
      if (filter === 'passed' && !r.pass) return false
      if (fieldFilter.length && !fieldFilter.some(k => r.missing.includes(k))) return false
      if (!inList(f.status, r.status) || !inList(f.group, r.group)) return false
      if (!inList(f.lastUpdatedBy, r.lastUpdatedBy) || !inList(f.assignee, r.assignee)) return false
      if (!withWithout(f.side, r.sideConversations > 0) || !withWithout(f.reopened, r.reopens > 0)) return false
      if (!q) return true
      return [r.id, r.subject, r.group, r.lastUpdatedBy, r.assignee].some(v => String(v).toLowerCase().includes(q))
    })
  }, [run, filter, search, fieldFilter, filters])

  const { sorted, sort, toggle: toggleSort } = useSortable(rows, {
    id: r => r.id,
    subject: r => r.subject,
    status: r => r.status,
    group: r => r.group,
    lastUpdatedBy: r => r.lastUpdatedBy,
    assignee: r => r.assignee,
    missing: r => r.missing.length,
  })
  const pager = usePagination(sorted, {
    storageKey: 'metadataQC',
    resetKey: JSON.stringify([run?.ranAt, filter, search, fieldFilter, filters, sort]),
  })

  const activeFilters =
    Object.values(filters).filter(v => v.length).length + (fieldFilter.length ? 1 : 0) + (search.trim() ? 1 : 0)
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))
  const clearFilters = () => {
    setFilters(NO_FILTERS)
    setFieldFilter([])
    setSearch('')
  }

  const dateLabel = dateFieldFor(statuses)
  const needsSetup = settings && (!settings.zendesk.hasToken || !settings.qc.requiredFields.length)
  const summary = run?.summary
  const passRate = summary?.total ? Math.round((summary.passed / summary.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metadata QC</h1>
          <p className="text-muted-foreground text-sm">
            Checks that required metadata is populated on {statuses.length ? statuses.join(', ') : 'selected'} tickets
            {settings?.qc.groupIds.length ? ` in ${settings.qc.groupIds.length} selected group(s)` : ' across all groups'}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>Statuses</Label>
            <StatusToggles value={statuses} onChange={setStatuses} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-from">{dateLabel} from</Label>
            <DatePicker id="qc-from" value={from} max={to} onChange={setFrom} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-to">{dateLabel} to</Label>
            <DatePicker id="qc-to" value={to} min={from} onChange={setTo} />
          </div>
          <Button onClick={runCheck} disabled={loading || needsSetup || !statuses.length}>
            {loading ? <Spinner /> : <Play />}
            {loading ? 'Checking…' : 'Run QC'}
          </Button>
        </div>
      </div>

      {needsSetup && (
        <Alert>
          <AlertDescription>
            <span>
              Finish setup first: add a Zendesk API token and pick at least one required field on the{' '}
              <Link to="/settings" className="text-foreground font-medium underline underline-offset-4">
                Settings
              </Link>{' '}
              page.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {error && <StatusAlert state={{ ok: false, message: error }} />}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              title="Tickets checked"
              value={summary.total}
              description={
                <>
                  {run.statuses?.join(', ')} · {run.window.dateField || 'solved'} {formatDate(run.window.from)} → {formatDate(run.window.to)}
                  {run.truncated && ' · hit max ticket limit'}
                </>
              }
            />
            <Stat title="Complete" value={summary.passed} valueClass="text-success" description={`${passRate}% pass rate`} />
            <Stat
              title="Missing metadata"
              value={summary.failed}
              valueClass="text-destructive"
              description={`Ran ${formatDateTime(run.ranAt)}`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={filter}
                onValueChange={v => v && setFilter(v)}
              >
                {['failed', 'passed', 'all'].map(f => (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3 capitalize"
                  >
                    {f}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <CardAction className="flex items-center gap-3 self-center">
                <span className="text-muted-foreground text-sm">
                  {rows.length} of {run.results.length} shown
                </span>
                <Button variant="outline" size="sm" onClick={() => download(run, sorted)} disabled={!rows.length}>
                  <Download /> Export CSV
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="h-8 w-56"
                  placeholder="Search ID, subject, agent…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <FilterSelect
                  label="Missing fields"
                  value={fieldFilter}
                  onChange={keys => {
                    setFieldFilter(keys)
                    if (keys.length) setFilter('failed')
                  }}
                  options={run.fields.map(f => ({ value: f.key, label: f.label }))}
                />
                <FilterSelect
                  label="Statuses"
                  value={filters.status}
                  onChange={setFilterValue('status')}
                  options={facets.statuses.map(s => ({ value: s, label: capitalize(s) }))}
                />
                <FilterSelect label="Groups" value={filters.group} onChange={setFilterValue('group')} options={facets.groups} />
                <FilterSelect
                  label="Last updated by"
                  value={filters.lastUpdatedBy}
                  onChange={setFilterValue('lastUpdatedBy')}
                  options={facets.lastUpdatedBy}
                />
                <FilterSelect
                  label="Assignees"
                  value={filters.assignee}
                  onChange={setFilterValue('assignee')}
                  options={facets.assignees}
                />
                <FilterSelect
                  label="Side conversations"
                  value={filters.side}
                  onChange={setFilterValue('side')}
                  options={WITH_WITHOUT('With side conversations', 'Without side conversations')}
                />
                <FilterSelect
                  label="Re-opened"
                  value={filters.reopened}
                  onChange={setFilterValue('reopened')}
                  options={WITH_WITHOUT('Re-opened', 'Never re-opened')}
                />
                <ClearFiltersButton count={activeFilters} onClear={clearFilters} />
              </div>
              {/* Cells wrap so the table fits the page; the scroller is only a fallback for phone widths. */}
              <Table className="[&_td]:align-top [&_td]:whitespace-normal [&_th]:whitespace-normal">
                <TableHeader>
                  <TableRow>
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
                    <SortableHead sortKey="lastUpdatedBy" sort={sort} onSort={toggleSort}>
                      Last Updated By
                    </SortableHead>
                    <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>
                      Assignee
                    </SortableHead>
                    <SortableHead sortKey="missing" sort={sort} onSort={toggleSort}>
                      Missing fields
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.pageRows.map(r => (
                    <Fragment key={r.id}>
                    <TableRow {...rowToggleProps({ enabled: true, isOpen: openRows.has(r.id), onToggle: () => toggleRow(r.id) })}>
                      <TableCell className="!whitespace-nowrap">
                        <TicketIdLink
                          href={r.url}
                          id={r.id}
                          reopenedSince={reopensSinceReview(r.reopens, r.reviewedReopens)}
                          reviewedAt={r.reviewedAt}
                        />
                      </TableCell>
                      {/* `anywhere` (not break-words) lets long file names/URLs shrink the column. */}
                      <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                        <TicketSubject ticketId={r.id} subject={r.subject} />
                        <SideConversationIcon count={r.sideConversations} />
                        <ReopenedIcon count={r.reopens} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>{r.group}</TableCell>
                      <TableCell>{r.lastUpdatedBy || '—'}</TableCell>
                      <TableCell>{r.assignee}</TableCell>
                      <TableCell>
                        {r.pass ? (
                          <Badge variant="outline" className={TONE.success}>
                            Complete
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.missing.map(k => (
                              <Badge
                                key={k}
                                variant="outline"
                                className={cn(TONE.danger, 'h-auto text-start whitespace-normal')}
                              >
                                {labels[k] || k}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    {openRows.has(r.id) && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-panel border-l-4 border-l-primary/40 p-4">
                          <FieldValues ticketId={r.id} />
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                        No tickets match this view.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <Pagination {...pager} label="tickets" />
            </CardContent>
          </Card>
        </>
      )}

      {!summary && !loading && !needsSetup && (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center">
            Pick a date range and press <strong>Run QC</strong> to check tickets. Tickets created before 2026 are
            never included.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
