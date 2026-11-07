// Review history: when a ticket is reviewed again, its previous review is kept as an earlier
// version instead of being deleted. Three pieces, kept deliberately small so Saved reviews doesn't
// get cluttered: a tiny "×n" badge in the table, one summary line in an opened scorecard, and the
// full version-by-version comparison in a pop-up ("View history").
import { useEffect, useState } from 'react'
import { History, PenLine } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { ScoreEditEntry } from '@/components/EditScores'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatDateTime } from '@/lib/dates'
import { RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// Previous versions shown before "Show all" in the pop-up.
const VERSIONS_SHOWN = 2

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Small grey "×2" beside a rating: the ticket has 2 earlier versions of its review.
export function PreviousVersionsBadge({ count }) {
  if (!count) return null
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-0.5 text-xs tabular-nums"
      title={`Reviewed ${count + 1} times. ${plural(count, 'earlier version')} kept; open the scorecard and choose View history.`}
      aria-label={`${plural(count, 'earlier version')}`}
    >
      <History className="size-3" />×{count}
    </span>
  )
}

// ▲ +0.35 / ▼ −1 / — comparing a value with the version before it.
function Delta({ value, previous, digits = 0 }) {
  if (value == null || previous == null) return null
  const d = Math.round((value - previous) * 100) / 100
  if (!d) return <span className="text-muted-foreground text-xs">—</span>
  const up = d > 0
  return (
    <span className={cn('text-xs tabular-nums', up ? 'text-success' : 'text-destructive')}>
      {up ? '▲ +' : '▼ −'}
      {Math.abs(d).toFixed(digits)}
    </span>
  )
}

// One version as columns in the comparison: { id, label, reviewedAt, model, total, rating, categories, edits, current }.
function toVersion(review, label, current = false) {
  return {
    id: review.id,
    label,
    current,
    reviewedAt: review.reviewedAt,
    model: review.model ?? review.result?.model,
    total: review.total ?? review.result?.tqr?.total ?? null,
    rating: review.rating ?? review.result?.tqr?.rating ?? null,
    categories: review.result?.tqr?.categories || [],
    summary: review.result?.summary || '',
    edits: review.edits || [],
  }
}

// The score a category had before anyone edited it in this version, or null if never edited.
function originalScore(version, name) {
  for (const e of version.edits) {
    const change = e.changes.find(c => c.name === name)
    if (change) return change.from
  }
  return null
}

// One summary line under the final score of an opened scorecard, plus the pop-up it opens.
// `review` is the current review (list row merged with its saved result).
export function ReviewHistoryLine({ review }) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const count = review.previousCount || 0

  useEffect(() => {
    if (!count) return
    let cancelled = false
    api
      .reviewHistory(review.id)
      .then(h => !cancelled && setHistory(h))
      .catch(e => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [review.id, count])

  if (!count) return null
  if (error) return <StatusAlert state={{ ok: false, message: `Review history could not be loaded: ${error}` }} />
  if (!history) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Spinner className="size-3" /> Loading review history…
      </p>
    )
  }
  const previous = history[0]
  const total = review.total ?? review.result?.tqr?.total
  return (
    <>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
        <History className="size-3.5" />
        <span>
          Previous: <span className="text-foreground tabular-nums">{previous.total?.toFixed(2) ?? '—'}</span>{' '}
          {previous.rating} on {formatDate(previous.reviewedAt)} → now{' '}
          <span className="text-foreground tabular-nums">{total?.toFixed(2) ?? '—'}</span>
        </span>
        <Delta value={total} previous={previous.total} digits={2} />
        {history.length > 1 && <span>· {plural(history.length, 'earlier version')}</span>}
        <span>·</span>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setOpen(true)}>
          View history
        </Button>
      </p>
      <ReviewHistoryDialog open={open} onOpenChange={setOpen} review={review} history={history} />
    </>
  )
}

function ReviewHistoryDialog({ open, onOpenChange, review, history }) {
  const [showAll, setShowAll] = useState(false)
  const all = [
    toVersion(review, `Current · v${history.length + 1}`, true),
    ...history.map(h => toVersion(h, `v${h.version}`)),
  ]
  const versions = showAll ? all : all.slice(0, VERSIONS_SHOWN + 1)
  const hidden = all.length - versions.length
  // Category rows in the current rubric order, plus any names only older versions used.
  const names = [...new Set(all.flatMap(v => v.categories.map(c => c.name)))]
  const scoreOf = (v, name) => v.categories.find(c => c.name === name)?.score ?? null
  // Each version is compared with the one just before it (to its right).
  const older = i => all[all.indexOf(versions[i]) + 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review history · ticket #{review.ticketId}</DialogTitle>
          <DialogDescription>
            Reviewed {all.length} times. Earlier versions are kept for reference; only the current review counts in
            Saved reviews, Trends, Categories and averages. ▲ ▼ compare each version with the one before it.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table className="[&_td]:align-top">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Category</TableHead>
                {versions.map(v => (
                  <TableHead key={v.id} className={cn('min-w-36', v.current && 'bg-muted/50')}>
                    <div className="font-semibold">{v.label}</div>
                    <div className="text-muted-foreground text-xs font-normal">{formatDate(v.reviewedAt)}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {names.map(name => (
                <TableRow key={name}>
                  <TableCell className="font-medium whitespace-normal">{name}</TableCell>
                  {versions.map((v, i) => {
                    const score = scoreOf(v, name)
                    const before = older(i)
                    const edited = originalScore(v, name)
                    return (
                      <TableCell key={v.id} className={cn(v.current && 'bg-muted/50')}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {score == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[score])}>
                              {score}
                            </Badge>
                          )}
                          {before && <Delta value={score} previous={scoreOf(before, name)} />}
                          {edited != null && edited !== score && (
                            <span className="text-warning inline-flex items-center gap-0.5 text-xs" title="Changed by a reviewer; see Score edits below">
                              <PenLine className="size-3" />
                              edited from {edited}
                            </span>
                          )}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-semibold">Final score</TableCell>
                {versions.map((v, i) => (
                  <TableCell key={v.id} className={cn(v.current && 'bg-muted/50')}>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{v.total?.toFixed(2) ?? '—'}</span>
                      {v.rating && (
                        <Badge variant="outline" className={RATING_TONE[v.rating]}>
                          {v.rating}
                        </Badge>
                      )}
                      {older(i) && <Delta value={v.total} previous={older(i).total} digits={2} />}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-muted-foreground text-xs">Model · score edits</TableCell>
                {versions.map(v => (
                  <TableCell key={v.id} className={cn('text-muted-foreground text-xs whitespace-normal', v.current && 'bg-muted/50')}>
                    {v.model || '—'}
                    {v.edits.length > 0 && ` · ${plural(v.edits.length, 'edit')}`}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {hidden > 0 && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setShowAll(true)}>
            Show all {all.length} versions
          </Button>
        )}

        {/* Details of the earlier versions: summary, findings and score edits, one at a time. */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Earlier versions in detail</h4>
          {all.slice(1).map(v => (
            <details key={v.id} className="group rounded-md border px-3 py-2 text-sm [&[open]]:bg-muted/30">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
                <span className="font-medium">{v.label}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(v.reviewedAt)} · {v.model}
                </span>
                <span className="tabular-nums">{v.total?.toFixed(2) ?? '—'}</span>
                {v.rating && (
                  <Badge variant="outline" className={RATING_TONE[v.rating]}>
                    {v.rating}
                  </Badge>
                )}
              </summary>
              <div className="mt-2 space-y-3 ps-4">
                {v.summary && (
                  <p>
                    <span className="font-medium">Summary:</span> {v.summary}
                  </p>
                )}
                {v.categories.map(c => (
                  <div key={c.name}>
                    <p className="font-medium">
                      {c.name} · {c.score} / 5
                    </p>
                    {c.findings?.length ? (
                      <ul className="text-muted-foreground ms-4 list-disc space-y-0.5">
                        {c.findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No findings</p>
                    )}
                  </div>
                ))}
                {v.edits.length > 0 && (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 font-medium">
                      <PenLine className="text-warning size-4" /> Score edits ({v.edits.length})
                    </p>
                    <ul className="space-y-2">
                      {[...v.edits].reverse().map(e => (
                        <ScoreEditEntry key={e.id} edit={e} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
