// Settings › Automation: switch automated Quality Review on or off, set its schedule and what it
// does, and see its status: the next run, a run in progress (with Stop), Preview, Run now and the
// recent runs. The settings are saved with "Save all settings"; the server runs the schedule.
import { useEffect, useState } from 'react'
import { Bot, CalendarClock, Eye, Play, Plus, Square, X } from 'lucide-react'
import { CheckItem, Spinner, StatusAlert } from '@/components/common'
import { confirm } from '@/components/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatDateTime } from '@/lib/dates'
import { TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// Monday first, as the team's week runs.
const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 0, label: 'Sun' },
]
const STATUS_TONE = {
  finished: TONE.success,
  'finished with errors': TONE.warning,
  stopped: 'text-muted-foreground',
  failed: TONE.danger,
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const windowText = w => (w ? (w.from === w.to ? formatDate(w.from) : `${formatDate(w.from)} – ${formatDate(w.to)}`) : '—')

export default function AutomationSettings({ automation, saved, onChange }) {
  const a = automation
  const unsaved = JSON.stringify(a) !== JSON.stringify(saved)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // { loading } | { error } | plan
  const [action, setAction] = useState(null) // StatusAlert state for Run now / Stop

  async function refresh() {
    try {
      setStatus(await api.automationStatus())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }
  // Poll often while a run is in progress, otherwise every half minute.
  const running = status?.running
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, running ? 3000 : 30000)
    return () => clearInterval(timer)
  }, [Boolean(running)]) // eslint-disable-line react-hooks/exhaustive-deps

  const setTimes = times => onChange({ times })
  const toggleDay = n => onChange({ days: a.days.includes(n) ? a.days.filter(d => d !== n) : [...a.days, n].sort() })

  async function runPreview() {
    setPreview({ loading: true })
    try {
      setPreview(await api.automationPreview())
    } catch (e) {
      setPreview({ error: e.message })
    }
  }

  async function runNow() {
    const ok = await confirm({
      title: 'Run the automated review now?',
      description:
        'The app searches the tickets solved in the window below and reviews the ones with no review yet, and re-reviews the ones re-opened since their review, two at a time. Each review is one AI call; you can stop the run.' +
        (unsaved ? '\n\nIt uses the saved settings. Save your changes first if you want it to use them.' : ''),
      confirmLabel: 'Run now',
    })
    if (!ok) return
    try {
      await api.automationRun()
      setAction(null)
      refresh()
    } catch (e) {
      setAction({ ok: false, message: e.message })
    }
  }

  async function stop() {
    try {
      await api.automationStop()
      refresh()
    } catch (e) {
      setAction({ ok: false, message: e.message })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4" /> Automated Quality Review
          </CardTitle>
          <CardDescription>
            When on, the app reviews tickets on a schedule: tickets <b>Solved</b> on the current date in the Quality Review
            groups (Settings › Quality Review) that have no review yet, and re-reviews tickets that were <b>re-opened</b>{' '}
            since their review. Ignored tickets are skipped. When off, reviews are manual, as now.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Switch id="automation-on" checked={a.enabled} onCheckedChange={on => onChange({ enabled: on })} />
              <Label htmlFor="automation-on" className={cn('font-medium', a.enabled ? 'text-success' : 'text-muted-foreground')}>
                {a.enabled ? 'On' : 'Off'}
              </Label>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className={cn('space-y-5', !a.enabled && 'opacity-60')}>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <CalendarClock className="size-4" /> Start times
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {a.times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    className="h-8 w-32"
                    value={t}
                    aria-label={`Start time ${i + 1}`}
                    onChange={e => setTimes(a.times.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${t}`}
                    title="Remove this time"
                    onClick={() => setTimes(a.times.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setTimes([...a.times, '12:00'])}>
                <Plus /> Add time
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              24-hour times on this computer’s clock ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Add several to
              review during the day as tickets are solved.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map(d => (
                <Button
                  key={d.n}
                  variant={a.days.includes(d.n) ? 'default' : 'outline'}
                  size="sm"
                  className="w-12"
                  aria-pressed={a.days.includes(d.n)}
                  onClick={() => toggleDay(d.n)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-window">Tickets solved on</Label>
              <Select value={a.window} onValueChange={v => onChange({ window: v })}>
                <SelectTrigger id="automation-window" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">The current date</SelectItem>
                  <SelectItem value="today-yesterday">The current date and the day before</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Adding the day before also catches tickets solved after the last run of a day.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Each run</Label>
              <CheckItem checked={a.reviewNew} onChange={v => onChange({ reviewNew: v })}>
                Reviews solved tickets that have no review yet
              </CheckItem>
              <CheckItem checked={a.rereviewReopened} onChange={v => onChange({ rereviewReopened: v })}>
                Re-reviews tickets re-opened since their review (the earlier review is kept as a previous version)
              </CheckItem>
            </div>
          </div>
          {a.enabled && (!a.times.length || !a.days.length) && (
            <StatusAlert state={{ ok: false, message: 'Add at least one start time and one day, or the automation never runs.' }} />
          )}
          <p className="text-muted-foreground text-xs">
            The schedule runs only while the app’s server is running; a time missed while it is off is not caught up. Runs
            review two tickets at a time.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
          <CardDescription>
            {unsaved && <span className="text-warning font-medium">Unsaved changes: the status and runs use the saved settings. </span>}
            {!status
              ? 'Loading…'
              : !status.settings.enabled
                ? 'Automation is off: nothing runs on its own.'
                : status.nextRun
                  ? `Next run: ${formatDateTime(status.nextRun)}.`
                  : 'On, but no start time or day is set.'}
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={runPreview} disabled={preview?.loading}>
              {preview?.loading ? <Spinner /> : <Eye />} Preview
            </Button>
            {running ? (
              <Button variant="outline" size="sm" onClick={stop} disabled={running.stopping}>
                <Square /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={runNow}>
                <Play /> Run now
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <StatusAlert state={{ ok: false, message: error }} />}
          <StatusAlert state={action} />
          {running && (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm" role="status" aria-live="polite">
              <Spinner className="size-4" />
              {running.status === 'planning'
                ? 'Finding tickets…'
                : `Reviewing ${running.done} of ${running.total} (tickets solved ${windowText(running.window)})`}
              {running.stopping && <span className="text-muted-foreground"> · stopping after the current ones…</span>}
              <span className="text-muted-foreground ms-auto text-xs">
                {running.trigger === 'schedule' ? 'Scheduled' : 'Run now'} · started {formatDateTime(running.startedAt)}
              </span>
            </div>
          )}

          {preview && !preview.loading && (
            <div className="bg-muted/40 space-y-1 rounded-md border p-3 text-sm">
              {preview.error ? (
                <StatusAlert state={{ ok: false, message: preview.error }} />
              ) : (
                <>
                  <p className="font-medium">If a run started now (saved settings, tickets solved {windowText(preview.window)}):</p>
                  <ul className="ms-5 list-disc space-y-0.5">
                    <li>{plural(preview.found, 'solved ticket')} found{preview.truncated ? ' (search limit reached)' : ''}</li>
                    <li>
                      <b>{plural(preview.toReview.length, 'ticket')}</b> to review
                      {preview.toReview.length > 0 && `: ${preview.toReview.slice(0, 12).map(t => `#${t.id}`).join(', ')}${preview.toReview.length > 12 ? '…' : ''}`}
                    </li>
                    <li>
                      <b>{plural(preview.toRereview.length, 'ticket')}</b> to re-review (re-opened since their review)
                      {preview.toRereview.length > 0 && `: ${preview.toRereview.slice(0, 12).map(t => `#${t.id}`).join(', ')}${preview.toRereview.length > 12 ? '…' : ''}`}
                    </li>
                    <li>
                      {plural(preview.alreadyReviewed, 'ticket')} already reviewed · {plural(preview.skippedIgnored, 'ignored ticket')} skipped
                    </li>
                  </ul>
                  <p className="text-muted-foreground text-xs">Nothing was reviewed. Preview only reads Zendesk and the saved reviews.</p>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent runs</h4>
            {!status?.runs?.length ? (
              <p className="text-muted-foreground text-sm">No runs yet.</p>
            ) : (
              <Table className="[&_td]:align-top">
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>How</TableHead>
                    <TableHead>Solved</TableHead>
                    <TableHead className="text-end">Found</TableHead>
                    <TableHead className="text-end">Reviewed</TableHead>
                    <TableHead className="text-end">Re-reviewed</TableHead>
                    <TableHead className="text-end">Failed</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.runs.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDateTime(r.startedAt)}</TableCell>
                      <TableCell className="text-xs">{r.trigger === 'schedule' ? 'Scheduled' : 'Run now'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{windowText(r.window)}</TableCell>
                      <TableCell className="text-end tabular-nums">{r.found ?? '—'}</TableCell>
                      <TableCell className="text-end tabular-nums">{r.reviewed?.length ?? 0}</TableCell>
                      <TableCell className="text-end tabular-nums">{r.rereviewed?.length ?? 0}</TableCell>
                      <TableCell
                        className={cn('text-end tabular-nums', r.failed?.length && 'text-destructive')}
                        title={(r.failed || []).map(f => `#${f.id}: ${f.error}`).join('\n')}
                      >
                        {r.failed?.length ?? 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_TONE[r.status]} title={r.error || undefined}>
                          {r.status}
                        </Badge>
                        {r.notRun > 0 && <span className="text-muted-foreground ms-1 text-xs">({r.notRun} not run)</span>}
                        {r.error && <div className="text-destructive text-xs">{r.error}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
