// Feedback for the agents under a Quality Review scorecard: the same AI coaching feedback as Ticket
// Inspector, written on request (one AI call) and saved with the review so it shows every time.
// It is part of the scorecard, so Save as image includes it; Copy puts it on the clipboard.
import { useState } from 'react'
import { MessageSquareHeart, RefreshCw } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { confirm } from '@/components/confirm'
import TicketFeedback from '@/components/TicketFeedback'
import { Button } from '@/components/ui/button'
import { api } from '../api.js'

// `feedback` is the saved feedback or undefined; `onSaved(feedback)` updates the open scorecard.
export default function ReviewFeedback({ reviewId, ticket, feedback, onSaved }) {
  const [state, setState] = useState(null) // { pending } | { error }

  async function write() {
    if (feedback) {
      const ok = await confirm({
        title: 'Write the feedback again?',
        description: 'The AI writes new feedback from the ticket as it is now in Zendesk, with the current rubric. It replaces the saved feedback.',
        confirmLabel: 'Write again',
      })
      if (!ok) return
    }
    setState({ pending: true })
    try {
      const r = await api.writeReviewFeedback(reviewId)
      onSaved?.(r.feedback)
      setState(null)
    } catch (e) {
      setState({ error: e.message })
    }
  }

  if (state?.pending) return <TicketFeedback state={{ pending: true }} ticket={ticket} />

  if (feedback) {
    return (
      <div className="space-y-2">
        {state?.error && <StatusAlert state={{ ok: false, message: `Feedback could not be written: ${state.error}` }} />}
        <TicketFeedback
          state={{ result: feedback }}
          ticket={ticket}
          saved
          action={
            reviewId && (
              <Button variant="outline" size="sm" onClick={write} title="Write the feedback again from the ticket as it is now">
                <RefreshCw /> Write again
              </Button>
            )
          }
        />
      </div>
    )
  }

  // Not written yet: only the button, left out of Save as image.
  if (!reviewId) return null
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3" data-pdf-exclude>
      <div className="flex flex-wrap items-center gap-3">
        <MessageSquareHeart className="text-info size-4" />
        <span className="flex-1 text-sm">
          <span className="font-medium">Feedback for the agents</span>
          <span className="text-muted-foreground">
            {' '}
            — coaching notes on the whole ticket, as in Ticket Inspector. Written by the AI on request and saved with
            this review.
          </span>
        </span>
        <Button size="sm" onClick={write}>
          {state?.pending ? <Spinner /> : <MessageSquareHeart />} Write feedback
        </Button>
      </div>
      {state?.error && <StatusAlert state={{ ok: false, message: `Feedback could not be written: ${state.error}` }} />}
    </div>
  )
}
