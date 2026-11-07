// Ticket Inspector: enter a ticket ID to see its full history from the Zendesk audit log as a
// timeline: public replies, internal notes (yellow), status / group / assignee movements, and
// side conversation messages, all in time order. Each comment an agent wrote gets an AI QC comment
// on Troubleshooting & Documentation Quality, Professional Communication and Business English Quality.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageDown, Mail, RefreshCw, Search, ShieldCheck, UserRound, Users } from 'lucide-react'
import { CheckItem, Spinner, StatusAlert } from '@/components/common'
import TicketFeedback from '@/components/TicketFeedback'
import { TicketHeader, TimelineView } from '@/components/TicketTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatDateTime, isoDay } from '@/lib/dates'
import { downloadImage } from '@/lib/image'
import { usePersistentState } from '@/lib/persist'
import { SCORE_TONE, TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { streamInspect } from '../api.js'

// One ticket-level QC card. `state` is { pending } | { error } | { result } where result is the
// category's part of the ticket QC; `empty` means the category has nothing to assess.
function TicketQcCard({ title, state, meta, children, empty }) {
  const result = state?.result
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className="text-info size-4" />
          {title}
          {result && !empty && (
            result.score != null ? (
              <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[result.score])}>
                {result.score} / 5
              </Badge>
            ) : (
              <Badge variant="outline" className={TONE.muted}>
                N/A
              </Badge>
            )
          )}
        </CardTitle>
        {meta && <CardDescription className="text-xs">{meta}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 px-4 text-sm">
        {state?.pending && (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner className="size-3.5" /> Writing QC comment…
          </div>
        )}
        {state?.error && <div className="text-destructive text-xs">QC comment failed: {state.error}</div>}
        {result && !empty && children}
        {result && empty && <div className="min-h-10" aria-label="No resolution in this ticket" />}
      </CardContent>
    </Card>
  )
}

function Labelled({ label, children }) {
  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{children || <span className="text-muted-foreground italic">—</span>}</div>
    </div>
  )
}

// Comprehension (always) and Resolution Accuracy (when the ticket has a resolution, and always for
// Solved / Closed tickets).
function TicketQcCards({ state }) {
  if (!state) return null
  const result = state.result
  const meta = result ? `AI (${result.model}) · ${formatDateTime(result.createdAt)} · not saved` : null
  const part = key => (result ? { result: result[key] } : state)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TicketQcCard title="Comprehension" state={part('comprehension')} meta={meta}>
        <Labelled label="Customer's issue">{result?.comprehension.issueSummary}</Labelled>
        <Labelled label="QC comment">{result?.comprehension.comment}</Labelled>
      </TicketQcCard>
      <TicketQcCard
        title="Resolution Accuracy"
        state={part('resolution')}
        meta={result?.resolution.resolved ? meta : null}
        empty={result && !result.resolution.resolved}
      >
        <Labelled label="Resolution">{result?.resolution.resolutionSummary}</Labelled>
        <Labelled label="QC comment">{result?.resolution.comment}</Labelled>
      </TicketQcCard>
    </div>
  )
}

export default function TicketInspector() {
  const [ticketId, setTicketId] = useState('')
  const [data, setData] = useState(null)
  const [qc, setQc] = useState({})
  const [qcNote, setQcNote] = useState('')
  const [ticketQc, setTicketQc] = useState(null)
  const [feedback, setFeedback] = useState(null) // { pending } | { result } | { error }
  const [includeQc, setIncludeQc] = usePersistentState('inspector.qc', true)
  const [progress, setProgress] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const captureRef = useRef(null)
  const [imageState, setImageState] = useState(null)

  const id = ticketId.trim().replace(/^#/, '')
  const valid = /^\d+$/.test(id)

  // Stop any retrieval still running when the page is unmounted.
  useEffect(() => () => abortRef.current?.abort(), [])

  function handleEvent(event) {
    switch (event.type) {
      case 'progress':
        setProgress({ percent: event.percent, message: event.message })
        break
      case 'timeline': {
        const { qc: q, ...rest } = event.data
        setData(rest)
        const next = {}
        for (const tid of q.pending) next[tid] = { pending: true }
        setQc(next)
        setTicketQc(q.ticketPending ? { pending: true } : null)
        setFeedback(q.feedbackPending ? { pending: true } : null)
        setQcNote(q.unavailable ? `QC comments are not available: ${q.unavailable}` : '')
        break
      }
      case 'qc':
        setQc(prev => ({ ...prev, [event.id]: { result: event.result } }))
        break
      case 'qc-error':
        setQc(prev => ({ ...prev, ...Object.fromEntries(event.ids.map(tid => [tid, { error: event.error }])) }))
        break
      case 'ticket-qc':
        setTicketQc({ result: event.result })
        break
      case 'ticket-qc-error':
        setTicketQc({ error: event.error })
        break
      case 'feedback':
        setFeedback({ result: event.result })
        break
      case 'feedback-error':
        setFeedback({ error: event.error })
        break
      case 'error':
        setError(event.error)
        break
      default:
    }
  }

  async function retrieve({ ticket = id, rerun = false } = {}) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setError('')
    setProgress({ percent: 1, message: rerun ? 'Re-running QC comments…' : `Retrieving ticket #${ticket}…` })
    if (!rerun) {
      setData(null)
      setQc({})
      setTicketQc(null)
      setFeedback(null)
      setQcNote('')
    }
    try {
      await streamInspect(ticket, { qc: includeQc || rerun }, handleEvent, controller.signal)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setRunning(false)
        setProgress(null)
        // Anything still waiting was stopped.
        setQc(prev =>
          Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.pending ? { error: 'Stopped before it finished.' } : v])),
        )
        setTicketQc(prev => (prev?.pending ? { error: 'Stopped before it finished.' } : prev))
        setFeedback(prev => (prev?.pending ? { error: 'Stopped before it finished.' } : prev))
      }
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function submit(e) {
    e.preventDefault()
    if (valid && !running) retrieve()
  }

  const qcTotals = useMemo(() => {
    const values = Object.values(qc)
    return { total: values.length, done: values.filter(v => v.result).length }
  }, [qc])

  // Saves the ticket header, QC cards and timeline (as currently filtered) as one PNG.
  async function saveImage() {
    if (!captureRef.current || !data) return
    setImageState({ loading: true, message: 'Creating the image…' })
    try {
      const { scale } = await downloadImage(captureRef.current, `ticket-${data.ticket.id}-timeline-${isoDay(new Date())}.png`)
      setImageState({
        ok: true,
        message:
          scale < 1
            ? 'Image saved. This ticket is very long, so it was saved at a lower resolution to fit in one image; zoom in to read it.'
            : 'Image saved to your downloads.',
      })
    } catch (err) {
      setImageState({ ok: false, message: `The image could not be saved: ${err.message}` })
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ticket Inspector</h1>
        <p className="text-muted-foreground text-sm">
          Retrieve a ticket’s audit log from Zendesk and see its history as a timeline: comments, status and group
          movements, and side conversations.
        </p>
      </div>

      <Card>
        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="inspect-ticket-id" className="text-sm font-medium">
                Ticket ID
              </label>
              <Input
                id="inspect-ticket-id"
                inputMode="numeric"
                placeholder="e.g. 1686617"
                value={ticketId}
                onChange={e => setTicketId(e.target.value)}
                className="w-48"
                aria-invalid={ticketId.trim() !== '' && !valid}
              />
            </div>
            <Button type="submit" disabled={!valid || running}>
              {running ? <Spinner /> : <Search />}
              Retrieve ticket audit
            </Button>
            {running && (
              <Button type="button" variant="outline" onClick={stop}>
                Stop
              </Button>
            )}
            <CheckItem checked={includeQc} onChange={setIncludeQc} className="pb-2">
              Write QC comments (AI)
            </CheckItem>
            {ticketId.trim() !== '' && !valid && (
              <span className="text-destructive text-sm">Ticket IDs are numbers only.</span>
            )}
          </form>
        </CardContent>
      </Card>

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
          <StatusAlert state={imageState} />
          {/* Everything in here goes into "Save as image"; [data-pdf-exclude] parts are left out. */}
          <div ref={captureRef} className="space-y-6">
            <TicketHeader ticket={data.ticket} sideConversations={data.sideConversations} />
            {qcNote && <StatusAlert state={{ message: qcNote }} />}
            <TicketQcCards state={ticketQc} />
            {data.sideConversationError && (
              <StatusAlert state={{ message: `Side conversations could not be loaded: ${data.sideConversationError}` }} />
            )}

            <TimelineView
              items={data.items}
              qc={qc}
              note={qcTotals.total > 0 && ` · QC comments on ${qcTotals.done} of ${qcTotals.total} agent comments`}
              actions={
                <div className="flex flex-wrap gap-2" data-pdf-exclude>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={running || imageState?.loading}
                    onClick={saveImage}
                    title={
                      running
                        ? 'Wait until the ticket and its QC comments have finished loading'
                        : 'Save the ticket header, QC and timeline as one PNG image (as currently filtered)'
                    }
                  >
                    {imageState?.loading ? <Spinner /> : <ImageDown />} Save as image
                  </Button>
                  {(qcTotals.total > 0 || ticketQc) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={running}
                      onClick={() => retrieve({ ticket: String(data.ticket.id), rerun: true })}
                      title="Write the QC comments and the feedback again with the current AI model and rubric (they are not saved)"
                    >
                      <RefreshCw /> Re-run QC comments
                    </Button>
                  )}
                </div>
              }
            />
            <TicketFeedback state={feedback} items={data.items} ticket={data.ticket} />
            <p data-pdf-only className="text-muted-foreground hidden text-xs">
              iTicket · Ticket #{data.ticket.id} · saved {formatDateTime(new Date().toISOString())}
              {qcTotals.total > 0 || ticketQc ? ' · AI QC comments are not stored in the app' : ''}
            </p>
          </div>
        </>
      )}

      {!data && !running && !error && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
          <div className="flex gap-2">
            <UserRound className="size-5" />
            <Users className="size-5" />
            <Mail className="size-5" />
          </div>
          Enter a ticket ID to see its timeline.
        </div>
      )}
    </div>
  )
}
