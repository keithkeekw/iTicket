// Categories tab of Quality Review: saved reviews grouped by a Zendesk ticket field (Category,
// Topic, a product field, …), with the average score of each QA rubric category per value. Each
// ticket counts once (its latest review); field values are read live from Zendesk.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { ClearFiltersButton, FilterSelect, Spinner, StatusAlert, StatusBadge, TicketIdLink } from '@/components/common'
import { DatePicker } from '@/components/DatePicker'
import { Pagination, usePagination } from '@/components/pagination'
import { SortableHead, useSortable } from '@/components/sorting'
import { TicketSubject } from '@/components/TicketTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatDate, isoDay } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

const NOT_SET = '\u0000not-set'
const NO_FILTERS = { group: [], assignee: [], resolvingAgent: [], status: [] }
const BASES = [
  { value: 'all', label: 'All time' },
  { value: 'reviewed', label: 'Reviewed date' },
  { value: 'solved', label: 'Solved date' },
]
// Default field, in order of preference, when it is used on the reviewed tickets.
const PREFERRED = ['generic ticket type', 'category', 'topic']

const round2 = n => Math.round(n * 100) / 100
const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s)
const daysAgo = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDay(d)
}
// Nested Zendesk option names ("Delivery::TV::Late") read better with arrows.
const prettyOption = name => String(name).split('::').join(' › ')
const ticketLink = (subdomain, id) => `https://${subdomain}.zendesk.com/agent/tickets/${id}`

function AverageBadge({ value }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[Math.max(1, Math.round(value))])}>
      {value.toFixed(2)}
    </Badge>
  )
}

// Single-choice, searchable list of Zendesk fields: the ones used on the reviewed tickets first
// (most used first, with how many tickets have a value), then the unused ones.
function FieldPicker({ fields, usage, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const current = fields.find(f => String(f.id) === String(value))
  const q = search.trim().toLowerCase()
  const used = f => usage?.get(String(f.id)) || 0
  const ordered = [...fields].sort((a, b) => used(b) - used(a) || a.title.localeCompare(b.title))
  const visible = q ? ordered.filter(f => f.title.toLowerCase().includes(q)) : ordered
  const firstUnused = usage ? visible.findIndex(f => !used(f)) : -1
  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o)
        if (!o) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-80 min-w-48 justify-between gap-2" aria-label="Zendesk field">
          <span className="truncate">{current ? current.title : 'Choose a Zendesk field'}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <Input autoFocus placeholder="Search fields…" value={search} onChange={e => setSearch(e.target.value)} className="h-8" />
        </div>
        <ul className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Zendesk fields">
          {visible.map((f, i) => (
            <Fragment key={f.id}>
              {i === firstUnused && (
                <li className="text-muted-foreground border-t px-2 pt-2 pb-1 text-xs" role="presentation">
                  Not used on the reviewed tickets
                </li>
              )}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(f.id) === String(value)}
                  onClick={() => {
                    onChange(String(f.id))
                    setOpen(false)
                  }}
                  className={cn(
                    'hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    usage && !used(f) && 'text-muted-foreground',
                  )}
                >
                  <Check className={cn('size-4 shrink-0', String(f.id) === String(value) ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  {used(f) > 0 && (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums" title="Reviewed tickets with a value">
                      {used(f)} tickets
                    </span>
                  )}
                </button>
              </li>
            </Fragment>
          ))}
          {!visible.length && <li className="text-muted-foreground px-2 py-3 text-center text-sm">No fields match.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

// Latest review per ticket within the period (reviews arrive newest first).
function latestReviews(reviews, basis, from, to) {
  const seen = new Set()
  const out = []
  for (const r of reviews) {
    if (seen.has(r.ticketId)) continue
    seen.add(r.ticketId)
    if (r.total == null) continue
    if (basis !== 'all') {
      const when = basis === 'solved' ? r.dateSolved : r.reviewedAt
      if (!when) continue
      const day = isoDay(new Date(when))
      if (day < from || day > to) continue
    }
    out.push(r)
  }
  return out
}

// Groups reviews by the chosen field's value and averages each rubric category per group.
function buildGroups(reviews, field, values) {
  const optionName = new Map(field.options.map(o => [o.value, prettyOption(o.name)]))
  const names = []
  for (const r of reviews) for (const s of r.scores || []) if (!names.includes(s.name)) names.push(s.name)

  const groups = new Map()
  const blank = () => ({ tickets: [], sums: {}, total: [0, 0] })
  const add = (acc, key, v) => {
    if (v == null || Number.isNaN(Number(v))) return
    acc[key] ??= [0, 0]
    acc[key][0] += Number(v)
    acc[key][1] += 1
  }
  for (const r of reviews) {
    const raw = values[r.ticketId]?.[field.id]
    const keys = raw == null ? [NOT_SET] : Array.isArray(raw) ? raw : [raw]
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, blank())
      const g = groups.get(key)
      g.tickets.push(r)
      add(g, 'total', r.total)
      for (const s of r.scores || []) add(g.sums, s.name, s.score)
    }
  }
  const avg = pair => (pair?.[1] ? round2(pair[0] / pair[1]) : null)
  const rows = [...groups].map(([key, g]) => ({
    key,
    label: key === NOT_SET ? 'Not set' : optionName.get(key) ?? prettyOption(key),
    notSet: key === NOT_SET,
    count: g.tickets.length,
    tickets: g.tickets,
    total: avg(g.total),
    averages: Object.fromEntries(names.map(n => [n, avg(g.sums[n])])),
  }))
  rows.sort((a, b) => (a.notSet - b.notSet) || b.count - a.count || a.label.localeCompare(b.label))
  return { rows, categories: names }
}

export default function ReviewCategories({ settings, refreshKey }) {
  const [fieldId, setFieldId] = usePersistentState('review.categories.fieldId', '')
  const [basis, setBasis] = usePersistentState('review.categories.basis', 'all')
  const [filters, setFilters] = usePersistentState('review.categories.filters', NO_FILTERS)
  const [hideNotSet, setHideNotSet] = usePersistentState('review.categories.hideNotSet', false)
  const [from, setFrom] = useState(() => daysAgo(29))
  const [to, setTo] = useState(() => isoDay(new Date()))
  const [fields, setFields] = useState(null)
  const [facets, setFacets] = useState({ groups: [], assignees: [], resolvingAgents: [], statuses: [] })
  const [reviews, setReviews] = useState(null)
  const [values, setValues] = useState(null)
  const [missing, setMissing] = useState([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [expanded, setExpanded] = useState(null)

  // Zendesk fields with a fixed list of options (drop-downs and multi-selects).
  useEffect(() => {
    api
      .fields()
      .then(({ custom }) => {
        setFields(custom.filter(f => f.options?.length))
      })
      .catch(e => setError(`Zendesk fields could not be loaded: ${e.message}`))
    api
      .reviewFacets()
      .then(setFacets)
      .catch(() => {})
  }, [refreshKey])

  // How many of the reviewed tickets in view have a value in each field.
  const usage = useMemo(() => {
    if (!values) return null
    const counts = new Map()
    for (const v of Object.values(values)) for (const id of Object.keys(v)) counts.set(id, (counts.get(id) || 0) + 1)
    return counts
  }, [values])

  // Until a field is chosen: the first preferred field that is in use, else the most used one.
  useEffect(() => {
    if (!fields?.length || !usage || fields.some(f => String(f.id) === String(fieldId))) return
    const inUse = fields.filter(f => usage.get(String(f.id)))
    const preferred = PREFERRED.map(t => inUse.find(f => f.title.toLowerCase() === t)).find(Boolean)
    const mostUsed = [...inUse].sort((a, b) => usage.get(String(b.id)) - usage.get(String(a.id)))[0]
    const pick = preferred || mostUsed || fields[0]
    setFieldId(String(pick.id))
  }, [fields, usage, fieldId, setFieldId])

  useEffect(() => {
    const params = { limit: 5000 }
    for (const [key, value] of Object.entries(filters)) if (value.length) params[key] = value
    setReviews(null)
    api
      .listReviews(params)
      .then(setReviews)
      .catch(e => setError(e.message))
  }, [filters, refreshKey, reload])

  const latest = useMemo(
    () => (reviews && (basis === 'all' || (from && to && from <= to)) ? latestReviews(reviews, basis, from, to) : null),
    [reviews, basis, from, to],
  )

  // Field values for the tickets in view (cached on the server for a few minutes).
  useEffect(() => {
    if (!latest) return
    const ids = latest.map(r => r.ticketId)
    if (!ids.length) {
      setValues({})
      return
    }
    let cancelled = false
    setValues(null)
    setError('')
    api
      .ticketFieldValues(ids)
      .then(res => {
        if (cancelled) return
        setValues(res.values)
        setMissing(res.missing)
      })
      .catch(e => !cancelled && setError(`Ticket fields could not be loaded from Zendesk: ${e.message}`))
    return () => {
      cancelled = true
    }
  }, [latest])

  const field = fields?.find(f => String(f.id) === String(fieldId))
  const grouped = useMemo(
    () => (field && latest && values ? buildGroups(latest, field, values) : null),
    [field, latest, values],
  )
  const shownRows = useMemo(() => (grouped ? grouped.rows.filter(r => !(hideNotSet && r.notSet)) : []), [grouped, hideNotSet])

  const getters = { label: r => r.label, count: r => r.count, total: r => r.total }
  for (const name of grouped?.categories || []) getters[`c:${name}`] = r => r.averages[name]
  const { sorted, sort, toggle } = useSortable(shownRows, getters)
  const page = usePagination(sorted, { storageKey: 'review.categories', resetKey: `${fieldId}|${basis}|${hideNotSet}` })

  const overall = useMemo(() => (latest && values ? buildGroups(latest, { id: '__all__', options: [] }, {}) : null), [latest, values])
  const overallRow = overall?.rows[0]
  const setCount = grouped ? grouped.rows.filter(r => !r.notSet).reduce((n, r) => n + r.count, 0) : 0
  const notSetCount = grouped?.rows.find(r => r.notSet)?.count ?? 0
  const isMulti = field?.type === 'multiselect'
  const activeFilters = Object.values(filters).filter(v => v.length).length
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))
  const loading = !error && (!fields || !latest || !values)
  const colSpan = 3 + (grouped?.categories.length || 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Average QA rubric scores grouped by a Zendesk ticket field, such as Category or Topic. Each ticket counts
            once, using its latest review. Field values are read from Zendesk as they are now.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setReload(n => n + 1)} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} /> Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-xs font-normal">Group by</Label>
              {fields ? <FieldPicker fields={fields} usage={usage} value={fieldId} onChange={setFieldId} /> : <Spinner />}
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={basis}
              onValueChange={v => v && setBasis(v)}
              aria-label="Period"
            >
              {BASES.map(b => (
                <ToggleGroupItem
                  key={b.value}
                  value={b.value}
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
                >
                  {b.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {basis !== 'all' && (
              <div className="flex items-center gap-1.5">
                <Label htmlFor="cat-from" className="text-muted-foreground text-xs font-normal">
                  From
                </Label>
                <DatePicker id="cat-from" value={from} max={to} onChange={setFrom} />
                <Label htmlFor="cat-to" className="text-muted-foreground text-xs font-normal">
                  to
                </Label>
                <DatePicker id="cat-to" value={to} min={from} onChange={setTo} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Groups" value={filters.group} onChange={setFilterValue('group')} options={facets.groups} />
            <FilterSelect label="Assignees" value={filters.assignee} onChange={setFilterValue('assignee')} options={facets.assignees} />
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
            <ClearFiltersButton count={activeFilters} onClear={() => setFilters(NO_FILTERS)} />
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={hideNotSet} onChange={e => setHideNotSet(e.target.checked)} />
              Hide “Not set”
            </label>
          </div>
        </CardContent>
      </Card>

      {error && <StatusAlert state={{ ok: false, message: error }} />}
      {loading && (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner /> {!latest ? 'Loading saved reviews…' : 'Reading ticket fields from Zendesk…'}
        </div>
      )}

      {grouped && field && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tickets reviewed" value={latest.length} />
            <Stat label={`${field.title} values used`} value={grouped.rows.filter(r => !r.notSet).length} />
            <Stat
              label={`Tickets with ${field.title} set`}
              value={
                <span>
                  {isMulti ? latest.length - notSetCount : setCount}
                  <span className="text-muted-foreground text-sm font-normal"> · {notSetCount} not set</span>
                </span>
              }
            />
            <Stat label="Average final score (all)" value={<AverageBadge value={overallRow?.total ?? null} />} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Average scores by {field.title}</CardTitle>
              <CardDescription>
                Scores are 1–5. Click a row to see its tickets.
                {isMulti && ' This field allows several values, so a ticket can count under more than one row.'}
                {missing.length > 0 && ` ${missing.length} reviewed ticket${missing.length === 1 ? ' was' : 's were'} not found in Zendesk and ${missing.length === 1 ? 'is' : 'are'} shown as “Not set”.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!latest.length ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No saved reviews
                  {basis !== 'all' ? ` with a ${basis === 'solved' ? 'solved' : 'review'} date between ${formatDate(from)} and ${formatDate(to)}` : ''}
                  {activeFilters ? ' that match the filters' : ''}.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead sortKey="label" sort={sort} onSort={toggle} className="min-w-48">
                          {field.title}
                        </SortableHead>
                        <SortableHead sortKey="count" sort={sort} onSort={toggle}>
                          Tickets
                        </SortableHead>
                        {grouped.categories.map(name => (
                          <SortableHead key={name} sortKey={`c:${name}`} sort={sort} onSort={toggle} className="whitespace-normal">
                            {name}
                          </SortableHead>
                        ))}
                        <SortableHead sortKey="total" sort={sort} onSort={toggle}>
                          Final score
                        </SortableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {page.pageRows.map(r => {
                        const open = expanded === r.key
                        return (
                          <Fragment key={r.key}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => setExpanded(open ? null : r.key)}
                              aria-expanded={open}
                            >
                              <TableCell className="whitespace-normal">
                                <span className="flex items-start gap-1.5">
                                  {open ? (
                                    <ChevronDown className="mt-0.5 size-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="mt-0.5 size-4 shrink-0" />
                                  )}
                                  <span className={cn(r.notSet && 'text-muted-foreground italic')}>{r.label}</span>
                                </span>
                              </TableCell>
                              <TableCell className="tabular-nums">
                                <div className="flex items-center gap-2">
                                  {r.count}
                                  <div className="bg-muted hidden h-1.5 w-16 rounded-full sm:block">
                                    <div
                                      className="bg-primary/60 h-1.5 rounded-full"
                                      style={{ width: `${Math.round((100 * r.count) / latest.length)}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              {grouped.categories.map(name => (
                                <TableCell key={name}>
                                  <AverageBadge value={r.averages[name]} />
                                </TableCell>
                              ))}
                              <TableCell>
                                <AverageBadge value={r.total} />
                              </TableCell>
                            </TableRow>
                            {open && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={colSpan} className="bg-muted/40 p-3 whitespace-normal">
                                  <TicketList tickets={r.tickets} categories={grouped.categories} subdomain={settings?.zendesk?.subdomain} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        )
                      })}
                      {overallRow && (
                        <TableRow className="bg-muted/30 font-medium hover:bg-muted/30">
                          <TableCell>All tickets</TableCell>
                          <TableCell className="tabular-nums">{latest.length}</TableCell>
                          {grouped.categories.map(name => (
                            <TableCell key={name}>
                              <AverageBadge value={overallRow.averages[name]} />
                            </TableCell>
                          ))}
                          <TableCell>
                            <AverageBadge value={overallRow.total} />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <Pagination {...page} label="values" />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// Tickets under one field value, lowest final score first.
function TicketList({ tickets, categories, subdomain }) {
  const rows = [...tickets].sort((a, b) => (a.total ?? 9) - (b.total ?? 9))
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {rows.length} ticket{rows.length === 1 ? '' : 's'}, lowest final score first. Click a subject to open its timeline.
      </p>
      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead className="min-w-56">Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              {categories.map(name => (
                <TableHead key={name} className="whitespace-normal">
                  {name}
                </TableHead>
              ))}
              <TableHead>Final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.ticketId}>
                <TableCell>
                  {subdomain ? <TicketIdLink href={ticketLink(subdomain, r.ticketId)} id={r.ticketId} /> : `#${r.ticketId}`}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <TicketSubject ticketId={r.ticketId} subject={r.subject} />
                </TableCell>
                <TableCell>{r.ticketStatus ? <StatusBadge status={r.ticketStatus} /> : '—'}</TableCell>
                <TableCell>{r.assigneeName || '—'}</TableCell>
                {categories.map(name => (
                  <TableCell key={name} className="tabular-nums">
                    {r.scores?.find(s => s.name === name)?.score ?? '—'}
                  </TableCell>
                ))}
                <TableCell>
                  <AverageBadge value={r.total} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <div className="text-muted-foreground truncate text-xs" title={label}>
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
