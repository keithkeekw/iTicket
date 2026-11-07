// "Ignored tickets" tab of Quality Review: every ticket that is never reviewed, either flagged
// Ignore by hand or matched by an auto-ignore subject rule (Settings › Quality Review). Tickets
// ignored by hand can be unignored here; rule-ignored ones need the rule changed.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CircleCheck, RefreshCw } from 'lucide-react'
import { ClearFiltersButton, FilterSelect, Spinner, StatusAlert, StatusBadge, TicketIdLink } from '@/components/common'
import { Pagination, usePagination } from '@/components/pagination'
import { RatingBadge } from '@/components/ReviewCard'
import { SortableHead, useSortable } from '@/components/sorting'
import { TicketSubject } from '@/components/TicketTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDateTime } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { api } from '../api.js'

const NO_FILTERS = { reason: [], status: [], group: [], assignee: [] }
const REASONS = [
  { value: 'old', label: 'Created before 2026' },
  { value: 'manual', label: 'Ignored by hand' },
  { value: 'rule', label: 'Subject rule' },
]
const distinct = (rows, key) => [...new Set(rows.map(r => r[key]).filter(v => v && v !== '—'))].sort()
const inList = (list, value) => !list.length || list.includes(value)

function Reason({ t }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {t.oldTicket && (
        <Badge variant="outline" className="text-muted-foreground gap-1" title="Tickets created before 2026 are always ignored (hard rule)">
          <Ban className="size-3" /> Created before 2026{t.createdAt ? ` · ${formatDateTime(t.createdAt)}` : ''}
        </Badge>
      )}
      {t.ignoredManually && (
        <Badge variant="outline" className="text-muted-foreground gap-1" title="Flagged Ignore by hand">
          <Ban className="size-3" /> By hand{t.ignoredAt ? ` · ${formatDateTime(t.ignoredAt)}` : ''}
        </Badge>
      )}
      {t.ignoreRule && (
        <Badge variant="outline" className="text-muted-foreground gap-1 whitespace-normal text-left" title="Settings › Quality Review › Auto-ignore by subject">
          <Ban className="size-3 shrink-0" /> {t.ignoreRule}
        </Badge>
      )}
    </div>
  )
}

// The last list loaded, shown at once when the tab is opened again while a fresh copy loads.
let lastList = null

export default function IgnoredTickets({ refreshKey, onChanged }) {
  const [data, setData] = useState(() => lastList)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [q, setQ] = usePersistentState('review.ignored.search', '')
  const [filters, setFilters] = usePersistentState('review.ignored.filters', NO_FILTERS)
  const [selected, setSelected] = useState(new Set())
  const [action, setAction] = useState(null) // { loading } | { ok, message }
  // Refresh asks Zendesk again; otherwise the server may answer from its short-lived copy.
  const forceRefresh = useRef(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    const refresh = forceRefresh.current
    forceRefresh.current = false
    api
      .listIgnored(refresh)
      .then(d => {
        lastList = d
        setData(d)
        setSelected(new Set())
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [refreshKey, reload])

  const all = useMemo(() => data?.tickets || [], [data])
  const facets = useMemo(
    () => ({ statuses: distinct(all, 'status'), groups: distinct(all, 'group'), assignees: distinct(all, 'assignee') }),
    [all],
  )
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter(t => {
      const reasons = [t.oldTicket && 'old', t.ignoredManually && 'manual', t.ignoreRule && 'rule'].filter(Boolean)
      if (filters.reason.length && !reasons.some(r => filters.reason.includes(r))) return false
      if (!inList(filters.status, t.status) || !inList(filters.group, t.group) || !inList(filters.assignee, t.assignee)) return false
      return !s || [t.id, t.subject, t.group, t.assignee, t.ignoreRule].some(v => String(v ?? '').toLowerCase().includes(s))
    })
  }, [all, q, filters])

  const { sorted, sort, toggle: toggleSort } = useSortable(rows, {
    id: t => t.id,
    subject: t => t.subject,
    status: t => t.status,
    group: t => t.group,
    assignee: t => t.assignee,
    ignoredAt: t => t.ignoredAt,
    reviewedAt: t => t.latestReview?.reviewedAt,
  })
  const pager = usePagination(sorted, { storageKey: 'ignoredTickets', resetKey: JSON.stringify([q, filters, sort]) })

  const activeFilters = Object.values(filters).filter(v => v.length).length + (q.trim() ? 1 : 0)
  const setFilterValue = key => value => setFilters(f => ({ ...f, [key]: value }))
  const clearFilters = () => {
    setFilters(NO_FILTERS)
    setQ('')
  }

  // Only tickets ignored by hand can be unignored here.
  const canUnignore = t => t.ignoredManually
  const pageSelectable = pager.pageRows.filter(canUnignore)
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every(t => selected.has(t.id))
  const toggleOne = (id, on) =>
    setSelected(s => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const togglePage = on =>
    setSelected(s => {
      const next = new Set(s)
      for (const t of pageSelectable) {
        if (on) next.add(t.id)
        else next.delete(t.id)
      }
      return next
    })
  const chosen = all.filter(t => selected.has(t.id) && canUnignore(t))

  async function unignore() {
    if (!chosen.length) return
    setAction({ loading: true })
    try {
      await api.setIgnored(
        chosen.map(t => t.id),
        false,
      )
      const stillRule = chosen.filter(t => t.ignoreRule).length
      setAction({
        ok: true,
        message:
          `${chosen.length} ticket${chosen.length > 1 ? 's' : ''} unignored.` +
          (stillRule ? ` ${stillRule} still ignored by a subject rule.` : ''),
      })
      // The page's refresh also reloads this list.
      if (onChanged) onChanged()
      else setReload(k => k + 1)
    } catch (e) {
      setAction({ ok: false, message: e.message })
    }
    setTimeout(() => setAction(null), 6000)
  }

  const manualCount = all.filter(t => t.ignoredManually).length
  const ruleCount = all.filter(t => t.ignoreRule).length
  const oldCount = all.filter(t => t.oldTicket).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ignored tickets</CardTitle>
        <CardAction className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              forceRefresh.current = true
              setReload(k => k + 1)
            }}
            disabled={loading}
            title="Load the tickets again from Zendesk"
          >
            {loading ? <Spinner /> : <RefreshCw />} Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && (
          <div className="text-muted-foreground text-sm">
            {all.length} ignored ticket{all.length === 1 ? '' : 's'} · {oldCount} created before 2026 · {manualCount} by hand ·{' '}
            {ruleCount} by subject rule
            {data.rules === 0 && ' (no subject rules set)'}
          </div>
        )}
        {data?.zendeskError && (
          <StatusAlert
            state={{ message: `Zendesk could not be reached, so details are from the latest saved review where there is one: ${data.zendeskError}` }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Search ticket, subject, agent, rule…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <FilterSelect label="Reasons" value={filters.reason} onChange={setFilterValue('reason')} options={REASONS} />
          <FilterSelect label="Statuses" value={filters.status} onChange={setFilterValue('status')} options={facets.statuses} />
          <FilterSelect label="Groups" value={filters.group} onChange={setFilterValue('group')} options={facets.groups} />
          <FilterSelect label="Assignees" value={filters.assignee} onChange={setFilterValue('assignee')} options={facets.assignees} />
          <ClearFiltersButton count={activeFilters} onClear={clearFilters} />
          <div className="ml-auto flex items-center gap-2">
            {action && !action.loading && (
              <span className={action.ok ? 'text-success text-sm' : 'text-destructive text-sm'}>{action.message}</span>
            )}
            <Button size="sm" variant="outline" disabled={!chosen.length || action?.loading} onClick={unignore}>
              {action?.loading ? <Spinner /> : <CircleCheck />} Unignore ({chosen.length})
            </Button>
          </div>
        </div>

        <StatusAlert state={error ? { message: error } : null} />
        {!data && !error ? (
          <Spinner className="size-6" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      aria-label="Select tickets ignored by hand on this page"
                      checked={allOnPage}
                      disabled={!pageSelectable.length}
                      onCheckedChange={on => togglePage(Boolean(on))}
                    />
                  </TableHead>
                  <SortableHead sortKey="id" sort={sort} onSort={toggleSort}>Ticket</SortableHead>
                  <SortableHead sortKey="subject" sort={sort} onSort={toggleSort}>Subject</SortableHead>
                  <SortableHead sortKey="status" sort={sort} onSort={toggleSort}>Status</SortableHead>
                  <SortableHead sortKey="group" sort={sort} onSort={toggleSort}>Group</SortableHead>
                  <SortableHead sortKey="assignee" sort={sort} onSort={toggleSort}>Assignee</SortableHead>
                  <SortableHead sortKey="ignoredAt" sort={sort} onSort={toggleSort}>Ignored because</SortableHead>
                  <SortableHead sortKey="reviewedAt" sort={sort} onSort={toggleSort}>Latest review</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map(t => (
                  <TableRow key={t.id} data-state={selected.has(t.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ticket ${t.id}`}
                        checked={selected.has(t.id)}
                        disabled={!canUnignore(t)}
                        title={canUnignore(t) ? undefined : 'Ignored by a subject rule: change the rule in Settings to review it'}
                        onCheckedChange={on => toggleOne(t.id, Boolean(on))}
                      />
                    </TableCell>
                    <TableCell className="!whitespace-nowrap">
                      <TicketIdLink href={t.url} id={t.id} />
                    </TableCell>
                    <TableCell className="min-w-40 [overflow-wrap:anywhere]">
                      {t.subject ? <TicketSubject ticketId={t.id} subject={t.subject} /> : <span className="text-muted-foreground italic">—</span>}
                      {t.missing && (
                        <Badge variant="outline" className="text-muted-foreground ms-1.5" title="Zendesk did not return this ticket (deleted or no access)">
                          Not found
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t.status ? <StatusBadge status={t.status} /> : '—'}</TableCell>
                    <TableCell>{t.group}</TableCell>
                    <TableCell>{t.assignee}</TableCell>
                    <TableCell className="max-w-64">
                      <Reason t={t} />
                    </TableCell>
                    <TableCell className="!whitespace-nowrap">
                      {t.latestReview ? (
                        <div className="flex flex-col items-start gap-1">
                          <RatingBadge rating={t.latestReview.rating} total={t.latestReview.total} />
                          <span className="text-muted-foreground text-xs">{formatDateTime(t.latestReview.reviewedAt)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not reviewed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!pager.pageRows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                      {all.length ? 'No ignored tickets match these filters.' : 'No tickets are ignored.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination {...pager} label="tickets" />
          </>
        )}
      </CardContent>
    </Card>
  )
}
