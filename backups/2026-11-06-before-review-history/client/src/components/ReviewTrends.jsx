// Trends tab of Quality Review: daily average TQR scores per category, built from the saved reviews.
// Each ticket counts once (its latest review), on the day it was reviewed or solved.
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, Bar, BarChart, XAxis, YAxis } from 'recharts'
import { ClearFiltersButton, FilterSelect, Spinner, StatusAlert } from '@/components/common'
import { DatePicker } from '@/components/DatePicker'
import { usePersistentState } from '@/lib/persist'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatDate, isoDay, parseIsoDay } from '@/lib/dates'
import { SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// Categorical colours, one per category, readable in both themes.
const PALETTE = [
  { light: '#2563eb', dark: '#60a5fa' },
  { light: '#16a34a', dark: '#4ade80' },
  { light: '#d97706', dark: '#fbbf24' },
  { light: '#dc2626', dark: '#f87171' },
  { light: '#7c3aed', dark: '#a78bfa' },
  { light: '#0891b2', dark: '#22d3ee' },
  { light: '#db2777', dark: '#f472b6' },
  { light: '#65a30d', dark: '#a3e635' },
]
const TOTAL_COLOR = { light: '#334155', dark: '#e2e8f0' }

const BASES = [
  { value: 'reviewed', label: 'Reviewed date' },
  { value: 'solved', label: 'Solved date' },
]
const RANGES = [7, 30, 90]
const NO_FILTERS = { group: [], assignee: [], resolvingAgent: [], status: [] }

const daysAgo = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDay(d)
}
const round2 = n => Math.round(n * 100) / 100
const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Every day from `from` to `to` (YYYY-MM-DD, inclusive), so days without reviews still show on the axis.
function dayRange(from, to) {
  const out = []
  for (let d = parseIsoDay(from); isoDay(d) <= to && out.length < 1000; d.setDate(d.getDate() + 1)) out.push(isoDay(d))
  return out
}

function buildTrends(reviews, basis, from, to) {
  // Newest first from the server, so the first review seen per ticket is its latest.
  const seen = new Set()
  const latest = []
  for (const r of reviews) {
    if (seen.has(r.ticketId)) continue
    seen.add(r.ticketId)
    const when = basis === 'solved' ? r.dateSolved : r.reviewedAt
    if (!when || r.total == null) continue
    const day = isoDay(new Date(when))
    if (day >= from && day <= to) latest.push({ ...r, day })
  }

  // Categories in rubric order, as listed by the most recent reviews.
  const names = []
  for (const r of latest) for (const s of r.scores || []) if (!names.includes(s.name)) names.push(s.name)
  const categories = names.map((name, i) => ({ key: `c${i}`, name, color: PALETTE[i % PALETTE.length] }))
  const keyOf = Object.fromEntries(categories.map(c => [c.name, c.key]))

  const byDay = new Map()
  const overall = { total: [0, 0], ...Object.fromEntries(categories.map(c => [c.key, [0, 0]])) }
  const add = (acc, key, value) => {
    if (value == null || Number.isNaN(Number(value))) return
    acc[key] ??= [0, 0]
    acc[key][0] += Number(value)
    acc[key][1] += 1
  }
  for (const r of latest) {
    if (!byDay.has(r.day)) byDay.set(r.day, { count: 0, sums: {} })
    const d = byDay.get(r.day)
    d.count += 1
    add(d.sums, 'total', r.total)
    add(overall, 'total', r.total)
    for (const s of r.scores || []) {
      add(d.sums, keyOf[s.name], s.score)
      add(overall, keyOf[s.name], s.score)
    }
  }

  const avg = pair => (pair && pair[1] ? round2(pair[0] / pair[1]) : null)
  const data = dayRange(from, to).map(day => {
    const d = byDay.get(day)
    const row = { day, count: d?.count ?? 0, total: avg(d?.sums.total) }
    for (const c of categories) row[c.key] = avg(d?.sums[c.key])
    return row
  })
  const averages = Object.fromEntries(Object.entries(overall).map(([k, v]) => [k, avg(v)]))
  return { data, categories, averages, reviewCount: latest.length, activeDays: byDay.size }
}

const shortDay = day => formatDate(day).slice(0, 5) // dd/mm

function ScoreAxis(props) {
  return <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={24} tickLine={false} axisLine={false} {...props} />
}

function DayAxis({ days }) {
  return (
    <XAxis
      dataKey="day"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={24}
      tickFormatter={shortDay}
      interval={days > 31 ? 'preserveStartEnd' : undefined}
    />
  )
}

const tooltip = (
  <ChartTooltip
    content={
      <ChartTooltipContent
        labelFormatter={(_, payload) => {
          const row = payload?.[0]?.payload
          return row ? `${formatDate(row.day)} · ${row.count} review${row.count === 1 ? '' : 's'}` : ''
        }}
      />
    }
  />
)

function AverageBadge({ value }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[Math.round(value)])}>
      {value.toFixed(2)}
    </Badge>
  )
}

export default function ReviewTrends({ refreshKey }) {
  const [from, setFrom] = useState(() => daysAgo(29))
  const [to, setTo] = useState(() => isoDay(new Date()))
  const [basis, setBasis] = usePersistentState('review.trends.basis', 'reviewed')
  const [filters, setFilters] = usePersistentState('review.trends.filters', NO_FILTERS)
  const [facets, setFacets] = useState({ groups: [], assignees: [], resolvingAgents: [], statuses: [] })
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .reviewFacets()
      .then(setFacets)
      .catch(() => {})
  }, [refreshKey])

  // Dates are applied here rather than on the server so the same rows work for reviewed and solved dates.
  useEffect(() => {
    const params = { limit: 5000 }
    for (const [key, value] of Object.entries(filters)) if (value.length) params[key] = value
    setError('')
    api
      .listReviews(params)
      .then(setReviews)
      .catch(e => setError(e.message))
  }, [filters, refreshKey])

  const trends = useMemo(
    () => (reviews && from && to && from <= to ? buildTrends(reviews, basis, from, to) : null),
    [reviews, basis, from, to],
  )

  const activeFilters = Object.values(filters).filter(v => v.length).length
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))

  const config = useMemo(() => {
    const c = { total: { label: 'Final score', theme: TOTAL_COLOR }, count: { label: 'Reviews', theme: TOTAL_COLOR } }
    for (const cat of trends?.categories || []) c[cat.key] = { label: cat.name, theme: cat.color }
    return c
  }, [trends])

  const lowest = trends?.categories.length
    ? trends.categories
        .filter(c => trends.averages[c.key] != null)
        .sort((a, b) => trends.averages[a.key] - trends.averages[b.key])[0]
    : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
          <CardDescription>
            Daily average TQR scores per category from the saved reviews. Each ticket counts once, using its latest
            review; days without reviews are left blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={basis}
            onValueChange={v => v && setBasis(v)}
            aria-label="Group reviews by"
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
          <div className="flex items-center gap-1.5">
            <Label htmlFor="tr-from" className="text-muted-foreground text-xs font-normal">
              From
            </Label>
            <DatePicker id="tr-from" value={from} max={to} onChange={setFrom} />
            <Label htmlFor="tr-to" className="text-muted-foreground text-xs font-normal">
              to
            </Label>
            <DatePicker id="tr-to" value={to} min={from} onChange={setTo} />
          </div>
          <div className="flex gap-1">
            {RANGES.map(n => (
              <Button
                key={n}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom(daysAgo(n - 1))
                  setTo(isoDay(new Date()))
                }}
              >
                Last {n} days
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <ClearFiltersButton count={activeFilters} onClear={() => setFilters(NO_FILTERS)} />
          </div>
        </CardContent>
      </Card>

      {error && <StatusAlert state={{ ok: false, message: error }} />}
      {!reviews && !error && <Spinner className="size-6" />}

      {trends && !trends.reviewCount && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No saved reviews with a {basis === 'solved' ? 'solved' : 'review'} date between {formatDate(from)} and{' '}
            {formatDate(to)}
            {activeFilters ? ' that match the filters' : ''}.
          </CardContent>
        </Card>
      )}

      {trends?.reviewCount > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tickets reviewed" value={trends.reviewCount} />
            <Stat label="Days with reviews" value={`${trends.activeDays} of ${trends.data.length}`} />
            <Stat label="Average final score" value={<AverageBadge value={trends.averages.total} />} />
            <Stat
              label="Lowest category"
              value={
                lowest ? (
                  <span className="flex items-center gap-2">
                    <span className="truncate" title={lowest.name}>{lowest.name}</span>
                    <AverageBadge value={trends.averages[lowest.key]} />
                  </span>
                ) : (
                  '—'
                )
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All categories</CardTitle>
              <CardDescription>Daily average score (1–5) for each category, with the final weighted score.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={config} className="aspect-auto h-80 w-full">
                <LineChart data={trends.data} margin={{ left: 4, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <DayAxis days={trends.data.length} />
                  <ScoreAxis />
                  {tooltip}
                  <ChartLegend content={<ChartLegendContent />} />
                  {trends.categories.map(c => (
                    <Line
                      key={c.key}
                      dataKey={c.key}
                      type="linear"
                      isAnimationActive={false}
                      stroke={`var(--color-${c.key})`}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls
                    />
                  ))}
                  <Line
                    dataKey="total"
                    type="linear"
                      isAnimationActive={false}
                    stroke="var(--color-total)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {trends.categories.map(c => (
              <Card key={c.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-sm bg-[var(--sw-light)] dark:bg-[var(--sw-dark)]"
                      style={{ '--sw-light': c.color.light, '--sw-dark': c.color.dark }}
                    />
                    {c.name}
                  </CardTitle>
                  <CardDescription>Daily average score</CardDescription>
                  <CardAction className="text-muted-foreground flex items-center gap-2 text-xs">
                    Period average <AverageBadge value={trends.averages[c.key]} />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={config} className="aspect-auto h-48 w-full">
                    <LineChart data={trends.data} margin={{ left: 4, right: 12, top: 8 }}>
                      <CartesianGrid vertical={false} />
                      <DayAxis days={trends.data.length} />
                      <ScoreAxis />
                      {tooltip}
                      <Line
                        dataKey={c.key}
                        type="linear"
                      isAnimationActive={false}
                        stroke={`var(--color-${c.key})`}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle>Reviews per day</CardTitle>
                <CardDescription>How many tickets each daily average is based on.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={config} className="aspect-auto h-48 w-full">
                  <BarChart data={trends.data} margin={{ left: 4, right: 12, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <DayAxis days={trends.data.length} />
                    <YAxis allowDecimals={false} width={24} tickLine={false} axisLine={false} />
                    {tooltip}
                    <Bar isAnimationActive={false} dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
