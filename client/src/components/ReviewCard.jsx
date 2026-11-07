// TQR scorecard for one Quality Review result (as returned by the server and stored in SQLite).
import { Spinner, StatusAlert } from '@/components/common'
import { ReviewProgress } from '@/components/ReviewProgress'
import { ScoreEditEntry } from '@/components/EditScores'
import ReviewFeedback from '@/components/ReviewFeedback'
import { PenLine } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CONFIDENCE_TONE, RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

function Detail({ label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children || '—'}</span>
    </div>
  )
}

export function RatingBadge({ total, rating }) {
  if (total == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold tabular-nums">{Number(total).toFixed(2)}</span>
      <Badge variant="outline" className={RATING_TONE[rating]}>
        {rating}
      </Badge>
    </span>
  )
}

// `review` is a result object; { reviewing, startedAt } or { queued } while a review is running
// or waiting in a batch; { loading: true } while a saved review is fetched; or { error }.
// `historyLine` (optional) is shown under the TQR score, e.g. the review-history summary.
// `reviewId`, `ticket` ({ id, subject }) and `onFeedback(feedback)` enable Feedback for the agents
// under the scores: shown when saved, otherwise a Write feedback button.
export default function ReviewCard({
  review,
  reviewedAt,
  expectedMs = 10000,
  historyLine = null,
  reviewId = null,
  ticket = null,
  onFeedback,
}) {
  if (review.reviewing || review.queued) {
    return <ReviewProgress startedAt={review.startedAt} expectedMs={expectedMs} queued={review.queued} />
  }
  if (review.loading) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Spinner /> Asking the model…
      </div>
    )
  }
  if (review.error) return <StatusAlert state={{ ok: false, message: review.error }} />
  const tqr = review.tqr
  return (
    <div className="space-y-4 text-sm">
      <p>
        <span className="font-medium">Summary:</span> {review.summary || '—'}{' '}
        <span className="text-muted-foreground text-xs">
          ({review.model}
          {reviewedAt && `, reviewed ${formatDateTime(reviewedAt)}`})
        </span>
      </p>

      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {tqr && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">TQR score</span>
            <span className="text-lg font-semibold tabular-nums">{tqr.total.toFixed(2)}</span>
            <span className="text-muted-foreground">/ 5</span>
            <Badge variant="outline" className={RATING_TONE[tqr.rating]}>
              {tqr.rating}
            </Badge>
          </div>
        )}
        <Detail label="Assignee">{review.assigneeName}</Detail>
        <Detail label="Resolving agent">{review.resolvingAgent}</Detail>
        <Detail label="Date solved">{formatDateTime(review.dateSolved)}</Detail>
        <Detail label="Side conversations reviewed">
          {review.sideConversationError ? 'could not be loaded' : String(review.sideConversations ?? 0)}
        </Detail>
        {review.imagesReviewed && <Detail label="Images reviewed">{String(review.imagesReviewed.length)}</Detail>}
      </div>
      {historyLine}

      {(review.imagesReviewed?.length > 0 || review.imagesSkipped?.length > 0) && (
        <div className="text-muted-foreground space-y-1 text-xs">
          {review.imagesReviewed?.length > 0 && (
            <p>
              <span className="text-foreground font-medium">Images sent to the model: </span>
              {review.imagesReviewed.map(i => `Image ${i.number}: ${i.fileName} (${i.source})`).join(' · ')}
            </p>
          )}
          {review.imagesSkipped?.length > 0 && (
            <p>
              <span className="text-foreground font-medium">Not reviewed: </span>
              {review.imagesSkipped.map(i => `${i.fileName} (${i.reason})`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {tqr ? (
        <>
          {tqr.weightWarning && <StatusAlert state={{ ok: false, message: tqr.weightWarning }} />}
          <Table className="[&_td]:align-top [&_td]:whitespace-normal">
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-end">Weight</TableHead>
                <TableHead className="text-end">Score</TableHead>
                <TableHead className="text-end">Weighted</TableHead>
                <TableHead>Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tqr.categories.map(c => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-end tabular-nums">{Math.round(c.weight * 100)}%</TableCell>
                  <TableCell className="text-end">
                    <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[c.score])}>
                      {c.score} / 5
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{c.weighted.toFixed(2)}</TableCell>
                  <TableCell>
                    {c.findings.length ? (
                      <ul className="ms-4 list-disc space-y-1">
                        {c.findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">No findings</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-end tabular-nums">
                  {Math.round(tqr.categories.reduce((s, c) => s + c.weight, 0) * 100)}%
                </TableCell>
                <TableCell />
                <TableCell className="text-end font-semibold tabular-nums">{tqr.total.toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {review.edits?.length
                    ? 'Includes manual score edits (see below); weighted scores and rating recalculated by the app.'
                    : 'Weighted scores and rating are calculated by the app from the model’s 1–5 scores.'}
                  {!review.edits?.length &&
                    review.modelRating &&
                    review.modelRating !== tqr.rating &&
                    ` (Model said: ${review.modelRating}.)`}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {review.edits?.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 font-medium">
                <PenLine className="text-warning size-4" /> Score edits ({review.edits.length})
              </h4>
              <ul className="space-y-2">
                {[...review.edits].reverse().map(e => (
                  <ScoreEditEntry key={e.id} edit={e} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">
          The model returned no category scores. Check that the reviewer instructions in Settings list the evaluation
          categories.
        </p>
      )}

      <ReviewFeedback reviewId={reviewId} ticket={ticket} feedback={review.feedback} onSaved={onFeedback} />

      {review.suggestions?.length > 0 && (
        <>
          <h4 className="pt-2 font-medium">Suggested values for missing metadata</h4>
          <Table className="[&_td]:whitespace-normal">
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Suggested value</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.suggestions.map((sg, i) => (
                <TableRow key={i}>
                  <TableCell>{sg.label || sg.key}</TableCell>
                  <TableCell className="font-medium">{String(sg.suggested_value ?? '')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={CONFIDENCE_TONE[sg.confidence]}>
                      {sg.confidence || '?'}
                    </Badge>
                  </TableCell>
                  <TableCell>{sg.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
