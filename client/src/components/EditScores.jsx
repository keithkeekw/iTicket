// Edit a saved review's category scores. A written justification is mandatory; the server
// recalculates the total and rating and keeps a log of every change.
import { useEffect, useState } from 'react'
import { SquarePen } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/dates'
import { previewTotal } from '@/lib/scoring'
import { RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

const MIN_JUSTIFICATION = 10 // matches the server

// One logged score change: when, total before → after, which categories, and why.
export function ScoreEditEntry({ edit }) {
  return (
    <li className="space-y-1 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground text-xs">{formatDateTime(edit.editedAt)}</span>
        <span className="tabular-nums">
          Total {Number(edit.totalBefore).toFixed(2)} → <span className="font-semibold">{Number(edit.totalAfter).toFixed(2)}</span>
        </span>
        {edit.ratingBefore !== edit.ratingAfter && (
          <span className="text-xs">
            {edit.ratingBefore} → {edit.ratingAfter}
          </span>
        )}
      </div>
      <p className="text-xs">{edit.changes.map(c => `${c.name}: ${c.from} → ${c.to}`).join(' · ')}</p>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        <span className="font-medium">Justification:</span> {edit.justification}
      </p>
    </li>
  )
}

function EditScoresDialog({ review, open, onOpenChange, onSaved }) {
  const [saved, setSaved] = useState(null) // full saved review (scorecard + edit log)
  const [scores, setScores] = useState({}) // category name -> new score
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSaved(null)
    setError('')
    setJustification('')
    api
      .getReview(review.id)
      .then(r => {
        setSaved(r)
        setScores(Object.fromEntries((r.result?.tqr?.categories || []).map(c => [c.name, c.score])))
      })
      .catch(e => setError(e.message))
  }, [open, review.id])

  const categories = saved?.result?.tqr?.categories || []
  const changed = categories.filter(c => scores[c.name] !== c.score)
  const preview = categories.length ? previewTotal(categories.map(c => ({ ...c, score: scores[c.name] }))) : null
  const remaining = MIN_JUSTIFICATION - justification.trim().length

  async function save() {
    setSaving(true)
    setError('')
    try {
      const changedScores = Object.fromEntries(changed.map(c => [c.name, scores[c.name]]))
      onSaved(await api.editScores(review.id, changedScores, justification))
      onOpenChange(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit scores — ticket #{review.ticketId}</DialogTitle>
          <DialogDescription>
            Review from {formatDateTime(review.reviewedAt)}. Weighted scores, the final score and the rating are
            recalculated automatically.
          </DialogDescription>
        </DialogHeader>

        {!saved ? (
          error ? <StatusAlert state={{ ok: false, message: error }} /> : <Spinner />
        ) : !categories.length ? (
          <StatusAlert state={{ ok: false, message: 'This review has no category scores to edit.' }} />
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-end">Weight</TableHead>
                  <TableHead className="text-center">Current</TableHead>
                  <TableHead className="w-28">New score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(c => (
                  <TableRow key={c.name} className={cn(scores[c.name] !== c.score && 'bg-warning/10')}>
                    <TableCell className="font-medium whitespace-normal">{c.name}</TableCell>
                    <TableCell className="text-end tabular-nums">{Math.round(c.weight * 100)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={SCORE_TONE[c.score]}>
                        {c.score}/5
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(scores[c.name])}
                        onValueChange={v => setScores(s => ({ ...s, [c.name]: Number(v) }))}
                      >
                        <SelectTrigger size="sm" className="w-24" aria-label={`New score for ${c.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[5, 4, 3, 2, 1].map(n => (
                            <SelectItem key={n} value={String(n)}>
                              {n} / 5
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                Final score{' '}
                <span className="font-semibold tabular-nums">{Number(saved.total).toFixed(2)}</span>
                {changed.length > 0 && (
                  <>
                    {' '}
                    → <span className="font-semibold tabular-nums">{preview.total.toFixed(2)}</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-2">
                Rating
                <Badge variant="outline" className={RATING_TONE[changed.length ? preview.rating : saved.rating]}>
                  {changed.length ? preview.rating : saved.rating}
                </Badge>
              </span>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-justification">
                Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-justification"
                className="min-h-24"
                placeholder="Why are you changing the score? This is saved with the review."
                value={justification}
                onChange={e => setJustification(e.target.value)}
                aria-required="true"
              />
              <p className={cn('text-xs', remaining > 0 ? 'text-muted-foreground' : 'text-success')}>
                {remaining > 0
                  ? `Required — ${remaining} more character${remaining === 1 ? '' : 's'} needed.`
                  : 'Thanks — the justification will be saved with this change.'}
              </p>
            </div>

            {error && <StatusAlert state={{ ok: false, message: error }} />}

            <div className="flex items-center justify-end gap-2">
              <span className="text-muted-foreground me-auto text-xs">
                {changed.length ? `${changed.length} score${changed.length > 1 ? 's' : ''} changed` : 'No scores changed yet'}
              </span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !changed.length || remaining > 0}>
                {saving && <Spinner />} Save scores
              </Button>
            </div>

            {saved.edits?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Previous score edits</h4>
                <ul className="space-y-2">
                  {[...saved.edits].reverse().map(e => (
                    <ScoreEditEntry key={e.id} edit={e} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Icon button for the Saved reviews Actions column.
export function EditScoresButton({ review, onSaved, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        title="Edit scores"
        aria-label="Edit scores"
        disabled={disabled || review.total == null}
        onClick={() => setOpen(true)}
      >
        <SquarePen />
      </Button>
      {open && <EditScoresDialog review={review} open={open} onOpenChange={setOpen} onSaved={onSaved} />}
    </>
  )
}
