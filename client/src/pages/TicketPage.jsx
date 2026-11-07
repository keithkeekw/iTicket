// A ticket on its own page (/ticket/:id), opened from the timeline pop-up's "Open in new tab":
// the ticket's current Quality Review result (scorecard, history and agent feedback) and its
// full timeline from Zendesk, on one page with its own address.
import { useEffect, useState } from 'react'
import { ClipboardCheck, ImageDown } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import ReviewCard, { RatingBadge } from '@/components/ReviewCard'
import { ReviewHistoryLine } from '@/components/ReviewHistory'
import { TicketHeader, TimelineView, useTicketTimeline } from '@/components/TicketTimeline'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatDateTime, isoDay } from '@/lib/dates'
import { downloadImage } from '@/lib/image'
import { api } from '../api.js'

export default function TicketPage({ ticketId }) {
  const { data, progress, error } = useTicketTimeline(ticketId)
  const [review, setReview] = useState(null) // { row, full } | { error }
  const [imageState, setImageState] = useState(null)

  useEffect(() => {
    setReview(null)
    api
      .ticketReview(ticketId)
      .then(setReview)
      .catch(e => setReview({ error: e.message }))
  }, [ticketId])

  // The browser tab shows the ticket number and subject.
  useEffect(() => {
    const subject = data?.ticket?.subject || review?.row?.subject
    document.title = `#${ticketId}${subject ? ` ${subject}` : ''} · iTicket`
    return () => {
      document.title = 'iTicket'
    }
  }, [ticketId, data, review])

  const row = review?.row
  const full = review?.full
  const scorecard = full && { ...full.result, reviewedAt: full.reviewedAt, edits: full.edits }

  async function saveImage() {
    setImageState({ loading: true, message: 'Creating the image…' })
    try {
      const { scale } = await downloadImage(document.getElementById('ticket-page'), `ticket-${ticketId}-${isoDay(new Date())}.png`)
      setImageState({
        ok: true,
        message: scale < 1 ? 'Image saved at a lower resolution to fit this long ticket; zoom in to read it.' : 'Image saved to your downloads.',
      })
    } catch (e) {
      setImageState({ ok: false, message: `The image could not be saved: ${e.message}` })
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ticket #{ticketId}</h1>
          <p className="text-muted-foreground text-sm">The ticket’s review result and its full timeline. Bookmark or share this page’s address.</p>
        </div>
        <Button variant="outline" size="sm" onClick={saveImage} disabled={!data || imageState?.loading}>
          {imageState?.loading ? <Spinner /> : <ImageDown />} Save as image
        </Button>
      </div>
      <StatusAlert state={imageState} />

      <div id="ticket-page" className="space-y-6">
        {/* Review result */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4" /> Ticket review result
            </CardTitle>
            <CardDescription>
              {!review
                ? 'Loading…'
                : review.error
                  ? 'The review could not be loaded.'
                  : row
                    ? `Current review of ${formatDateTime(row.reviewedAt)}${row.previousCount ? ` · ${row.previousCount} previous version${row.previousCount === 1 ? '' : 's'}` : ''}.`
                    : 'This ticket has not been reviewed yet. Review it from Quality Review › Find & Review.'}
            </CardDescription>
            {row && (
              <CardAction>
                <RatingBadge total={row.total} rating={row.rating} />
              </CardAction>
            )}
          </CardHeader>
          {(review?.error || scorecard) && (
            <CardContent>
              {review.error ? (
                <StatusAlert state={{ ok: false, message: review.error }} />
              ) : (
                <ReviewCard
                  review={scorecard}
                  reviewedAt={full.reviewedAt}
                  reviewId={full.id}
                  ticket={{ id: ticketId, subject: row?.subject }}
                  onFeedback={f => setReview(r => ({ ...r, full: { ...r.full, result: { ...r.full.result, feedback: f } } }))}
                  historyLine={row?.previousCount > 0 && <ReviewHistoryLine review={{ ...row, result: scorecard, edits: full.edits }} />}
                />
              )}
            </CardContent>
          )}
        </Card>

        {/* Timeline */}
        {progress && (
          <Card className="py-4" role="status" aria-live="polite">
            <CardContent className="space-y-2 px-4">
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                <span className="flex-1">{progress.message}</span>
                <span className="text-muted-foreground tabular-nums">{Math.round(progress.percent)}%</span>
              </div>
              <Progress value={progress.percent} aria-label="Retrieval progress" />
            </CardContent>
          </Card>
        )}
        <StatusAlert state={error ? { message: error } : null} />
        {data && (
          <>
            <TicketHeader ticket={data.ticket} sideConversations={data.sideConversations} />
            {data.sideConversationError && (
              <StatusAlert state={{ message: `Side conversations could not be loaded: ${data.sideConversationError}` }} />
            )}
            <TimelineView items={data.items} />
          </>
        )}
      </div>
    </div>
  )
}
