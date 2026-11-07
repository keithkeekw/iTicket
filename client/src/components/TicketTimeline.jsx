// Ticket timeline shared by the Ticket Inspector page and the timeline pop-up opened from a ticket
// subject: public replies, internal notes (yellow), status / group / assignee movements and side
// conversation messages, in time order, with filters.
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Lock,
  Mail,
  MailCheck,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { LinkifiedText, Spinner, StatusAlert, StatusBadge } from '@/components/common'
import RichText from '@/components/RichText'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatDate, formatDateTime } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { SCORE_TONE, TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { streamInspect } from '../api.js'

// An agent's email reply that Zendesk saved as a private comment: the email itself still went to
// everyone on the thread, so the AI review treats it as a reply to the client.
function EmailReplyBadge({ email }) {
  const to = [
    email.external?.length ? `external: ${email.external.join(', ')}` : null,
    email.internalCount ? `${email.internalCount} XR address${email.internalCount > 1 ? 'es' : ''}` : null,
  ].filter(Boolean)
  return (
    <Badge
      variant="outline"
      className={TONE.info}
      title={`Sent by email${to.length ? ` to ${to.join('; ')}` : ''}. Zendesk saved it as a private comment, but the email went to everyone on the thread, so the AI review counts it as a reply to the client.`}
    >
      Email reply{email.external?.length ? ' · client copied' : ''}
    </Badge>
  )
}

// A comment posted through the API or emailed by a system / no-reply mailbox: not an agent's own
// writing, so it gets no QC comment (hard rule).
function AutomatedBadge() {
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground"
      title="Automated: posted through the API or emailed by a system or no-reply mailbox (e.g. extremereach@extremereach.com). It isn't an agent's own writing, so it gets no QC comment and the AI treats it as context only."
    >
      Automated · no QC
    </Badge>
  )
}

// QC comment categories, in rubric order (keys match the server).
const QC_CATEGORIES = [
  { key: 'troubleshooting', name: 'Troubleshooting & Documentation Quality' },
  { key: 'communication', name: 'Professional Communication' },
  { key: 'english', name: 'Business English Quality' },
]

// Timeline filters; each item kind belongs to one.
const FILTERS = [
  { value: 'public', label: 'Public comments', kinds: ['public'] },
  { value: 'private', label: 'Private comments', kinds: ['private'] },
  { value: 'status', label: 'Status', kinds: [] },
  { value: 'group', label: 'Group', kinds: [] },
  { value: 'assignee', label: 'Assignee', kinds: [] },
  { value: 'side', label: 'Side conversations', kinds: ['side', 'side-state'] },
]
export const ALL_FILTERS = FILTERS.map(f => f.value)
const FIELD_LABEL = { status: 'Status', group: 'Group', assignee: 'Assignee' }

const ROLE_LABEL = { 'end-user': 'Customer', agent: 'Agent', admin: 'Admin', system: 'System' }

// Bodies longer than this are collapsed until expanded.
const LONG_BODY = 700

// Which filters an item matches (a change item can match several fields).
function itemFilters(item) {
  if (item.kind === 'change' || item.kind === 'created') return item.changes.map(c => c.field)
  return FILTERS.filter(f => f.kinds.includes(item.kind)).map(f => f.value)
}

// For change items, keep only the field changes whose filter is on.
function visibleItems(items, on) {
  const out = []
  for (const item of items) {
    if (item.kind === 'change' || item.kind === 'created') {
      const changes = item.changes.filter(c => on.includes(c.field))
      if (changes.length || (item.kind === 'created' && on.length)) out.push({ ...item, changes })
    } else if (itemFilters(item).some(f => on.includes(f))) {
      out.push(item)
    }
  }
  return out
}

function countBy(items) {
  const counts = Object.fromEntries(ALL_FILTERS.map(f => [f, 0]))
  for (const item of items) {
    if (item.kind === 'change' || item.kind === 'created') {
      for (const c of item.changes) if (item.kind === 'change') counts[c.field]++
    } else if (item.kind !== 'side-state') {
      for (const f of itemFilters(item)) counts[f]++
    }
  }
  return counts
}

function Author({ author }) {
  return (
    <span className="font-medium">
      {author?.name || 'Unknown'}
      {author?.role && ROLE_LABEL[author.role] && (
        <span
          className="text-muted-foreground font-normal"
          title={author.formerAgent ? 'Zendesk now lists this user as an end-user, but they acted as an agent on this ticket.' : undefined}
        >
          {' '}
          · {ROLE_LABEL[author.role]}
          {author.formerAgent && ' (former)'}
        </span>
      )}
    </span>
  )
}

function Attachments({ list }) {
  if (!list?.length) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
      {list.map((a, i) => (
        <li key={i} className="flex items-center gap-1">
          <Paperclip className="text-muted-foreground size-3.5" />
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="text-info hover:underline">
              {a.name}
            </a>
          ) : (
            a.name
          )}
        </li>
      ))}
    </ul>
  )
}

function Body({ text, expanded }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG_BODY
  const show = expanded || open || !long ? text : text.slice(0, LONG_BODY).trimEnd() + '…'
  if (!text.trim()) return <p className="text-muted-foreground text-sm italic">(no text)</p>
  return (
    <div className="space-y-1">
      <div className="text-sm break-words whitespace-pre-wrap">
        <LinkifiedText text={show} />
      </div>
      {long && !expanded && (
        <button type="button" className="text-info text-xs hover:underline" onClick={() => setOpen(o => !o)}>
          {open ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  )
}

function ChangeValue({ field, value }) {
  if (!value) return <span className="text-muted-foreground italic">none</span>
  if (field === 'status') return <StatusBadge status={value} />
  return <span className="font-medium">{value}</span>
}

// AI QC comment under an agent's public reply or internal note. `qc` is
// { result } | { error } | { pending: true } | undefined (not an agent comment).
function QcPanel({ qc }) {
  if (!qc) return null
  // Light orange in both public replies and internal notes, so the AI's comment stands apart from
  // the agent's own text (and from the yellow of internal notes).
  const frame = 'rounded-md border border-orange-200 bg-orange-50 p-2.5 dark:border-orange-400/30 dark:bg-orange-950/40'
  if (qc.pending) {
    return (
      <div className={cn(frame, 'text-muted-foreground flex items-center gap-2 text-xs')}>
        <Spinner className="size-3.5" /> Writing QC comment…
      </div>
    )
  }
  if (qc.error) {
    return (
      <div className={cn(frame, 'text-destructive text-xs')}>
        QC comment failed: {qc.error}
      </div>
    )
  }
  const { result } = qc
  const scores = QC_CATEGORIES.map(c => result[c.key]?.score).filter(n => n != null)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return (
    <div className={cn(frame, 'space-y-2')}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
        <ShieldCheck className="text-info size-3.5" /> QC comment
        {avg != null && (
          <span className="text-muted-foreground font-normal">· average {avg.toFixed(1)} / 5</span>
        )}
        <span className="text-muted-foreground ml-auto font-normal" title={result.createdAt}>
          AI ({result.model}) · {formatDateTime(result.createdAt)}
        </span>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-[13rem_auto_1fr] md:gap-x-3">
        {QC_CATEGORIES.map(c => {
          const r = result[c.key] || {}
          return (
            <Fragment key={c.key}>
              <dt className="text-muted-foreground text-xs md:pt-0.5">{c.name}</dt>
              <dd className="md:pt-px">
                {r.score != null ? (
                  <Badge variant="outline" className={cn('tabular-nums', SCORE_TONE[r.score])}>
                    {r.score} / 5
                  </Badge>
                ) : (
                  <Badge variant="outline" className={TONE.muted}>
                    N/A
                  </Badge>
                )}
              </dd>
              <dd className="-mt-1 mb-1 md:m-0">{r.comment || <span className="text-muted-foreground italic">No comment.</span>}</dd>
            </Fragment>
          )
        })}
      </dl>
    </div>
  )
}

// Marker on the timeline line for each kind of entry.
const MARKER = {
  public: { Icon: Globe, className: 'bg-background text-foreground border-border' },
  private: { Icon: Lock, className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-200 dark:border-yellow-500/50' },
  change: { Icon: Workflow, className: 'bg-muted text-muted-foreground border-border' },
  created: { Icon: Sparkles, className: 'bg-primary text-primary-foreground border-primary' },
  side: { Icon: Mail, className: 'bg-info/15 text-info border-info/40' },
  'side-state': { Icon: MailCheck, className: 'bg-info/15 text-info border-info/40' },
}

export function TimelineItem({ item, expanded, qc }) {
  const { Icon, className } = MARKER[item.kind]
  const time = (
    <time className="text-muted-foreground text-xs whitespace-nowrap" dateTime={item.at} title={item.at}>
      {formatDateTime(item.at)}
    </time>
  )

  let content
  if (item.kind === 'change' || item.kind === 'created') {
    content = (
      <div className="space-y-1 py-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {item.kind === 'created' ? <span className="font-semibold">Ticket created</span> : <Author author={item.author} />}
          {item.kind === 'created' && (
            <span className="text-muted-foreground">
              by <Author author={item.author} />
            </span>
          )}
          {item.via && <span className="text-muted-foreground text-xs">via {item.via}</span>}
          <span className="ml-auto">{time}</span>
        </div>
        {item.changes.length > 0 && (
          <ul className="space-y-1">
            {item.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16 shrink-0">{FIELD_LABEL[c.field]}</span>
                {item.kind === 'change' && (
                  <>
                    <ChangeValue field={c.field} value={c.from} />
                    <ArrowRight className="text-muted-foreground size-3.5" />
                  </>
                )}
                <ChangeValue field={c.field} value={c.to} />
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  } else if (item.kind === 'side-state') {
    content = (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
        <span>
          <Author author={item.author} /> marked side conversation {item.thread.index}{' '}
          <span className="text-muted-foreground">“{item.thread.subject}”</span> as{' '}
          <Badge variant="outline" className={cn('capitalize', item.state === 'closed' ? TONE.muted : TONE.info)}>
            {item.state}
          </Badge>
        </span>
        <span className="ml-auto">{time}</span>
      </div>
    )
  } else {
    const tone = {
      public: 'bg-card',
      private: 'border-yellow-300 bg-yellow-50 dark:border-yellow-500/40 dark:bg-yellow-500/10',
      side: 'border-info/40 bg-info/5',
    }[item.kind]
    const label =
      item.kind === 'side' ? (
        <Badge variant="outline" className={TONE.info} title={item.thread.subject}>
          Side conversation {item.thread.index}
        </Badge>
      ) : item.kind === 'private' ? (
        <Badge variant="outline" className="border-yellow-400 bg-yellow-200/70 text-yellow-900 dark:border-yellow-500/50 dark:bg-yellow-500/20 dark:text-yellow-100">
          Private comment
        </Badge>
      ) : (
        <Badge variant="outline">Public reply</Badge>
      )
    content = (
      <div className={cn('space-y-2 rounded-lg border p-3 shadow-xs', tone)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {label}
          {item.automated ? <AutomatedBadge /> : item.email && <EmailReplyBadge email={item.email} />}
          <Author author={item.author} />
          {item.via && <span className="text-muted-foreground text-xs">via {item.via}</span>}
          <span className="ml-auto">{time}</span>
        </div>
        {item.kind === 'side' && (
          <div className="text-muted-foreground space-y-0.5 text-xs">
            <div className="truncate">
              <span className="text-foreground font-medium">{item.thread.subject}</span>
              {item.first && ' · started the side conversation'}
            </div>
            {item.to?.length > 0 && (
              <div className="break-words">
                To: {item.to.map(c => (c.email ? `${c.name} <${c.email}>` : c.name)).join(', ')}
              </div>
            )}
          </div>
        )}
        {item.html ? <RichText html={item.html} expanded={expanded} /> : <Body text={item.body} expanded={expanded} />}
        <Attachments list={item.attachments} />
        <QcPanel qc={qc} />
      </div>
    )
  }

  return (
    // The id lets other sections (e.g. Ticket Inspector feedback) jump to this entry.
    <li id={`tl-${item.id}`} className="relative flex scroll-mt-24 gap-3 rounded-lg pb-4 transition-shadow">
      <span className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-full border', className)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">{content}</div>
    </li>
  )
}

export function TicketHeader({ ticket, sideConversations }) {
  const facts = [
    ['Status', <StatusBadge key="s" status={ticket.status} />],
    ['Group', ticket.group || '—'],
    ['Assignee', ticket.assignee || '—'],
    ['Requester', ticket.requester || '—'],
    ['Priority', <span key="p" className="capitalize">{ticket.priority || '—'}</span>],
    ['Type', <span key="t" className="capitalize">{ticket.type || '—'}</span>],
    ['Created', formatDateTime(ticket.createdAt)],
    ['Last updated', formatDateTime(ticket.updatedAt)],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <a href={ticket.url} target="_blank" rel="noreferrer" className="text-info inline-flex items-center gap-1 hover:underline">
            #{ticket.id}
            <ExternalLink className="size-3.5" />
          </a>
          <span className="min-w-0 break-words">{ticket.subject}</span>
          {ticket.bumpSolve && (
            <Badge
              variant="outline"
              className={cn(TONE.info, 'font-normal')}
              title={`The Zendesk automation “${ticket.bumpSolve.title}” solved this ticket on ${formatDateTime(ticket.bumpSolve.at)} because the requester didn’t reply after repeated reminders${ticket.bumpSolve.reopenedAfter ? '; it was re-opened afterwards' : ''}. The agent isn’t marked down for the missing resolution or confirmation (hard rule).`}
            >
              Solved by Bump Bump Solve{ticket.bumpSolve.reopenedAfter ? ' · re-opened later' : ''}
            </Badge>
          )}
          {ticket.createdViaApi && (
            <Badge variant="outline" className="text-muted-foreground font-normal" title="An automated notification: created via the Zendesk API or sent by a system / no-reply mailbox. No customer-facing reply is required (hard rule).">
              Automated notification
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
        </dl>
        {sideConversations.length > 0 && (
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">Side conversations</div>
            <ul className="space-y-1 text-sm">
              {sideConversations.map(sc => (
                <li key={sc.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={TONE.info}>
                    {sc.index}
                  </Badge>
                  <span className="min-w-0 break-words">{sc.subject}</span>
                  <Badge variant="outline" className={cn('capitalize', sc.state === 'closed' ? TONE.muted : TONE.info)}>
                    {sc.state}
                  </Badge>
                  <span className="text-muted-foreground text-xs">started {formatDateTime(sc.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// The Timeline card: filters with counts, order and expand buttons, legend, and the entries
// grouped by day. `qc` maps item ids to QC comment state (Ticket Inspector only); `note` and
// `actions` add to the description and the button row. Filters, order and expansion are
// remembered in this browser and shared by the page and the pop-up.
export function TimelineView({ items, qc = {}, note, actions }) {
  const [filters, setFilters] = usePersistentState('inspector.filters', ALL_FILTERS)
  const [expanded, setExpanded] = usePersistentState('inspector.expanded', false)
  const [newestFirst, setNewestFirst] = usePersistentState('inspector.newestFirst', false)

  const counts = useMemo(() => countBy(items), [items])
  const shown = useMemo(() => {
    const list = visibleItems(items, filters)
    return newestFirst ? [...list].reverse() : list
  }, [items, filters, newestFirst])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription>
          {shown.length} of {items.length} entries · times in your local time zone
          {note}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={filters}
            onValueChange={setFilters}
            className="flex-wrap"
          >
            {FILTERS.map(f => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
              >
                {f.label}
                <span className="tabular-nums opacity-70">{counts[f.value]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="ml-auto flex flex-wrap gap-2">
            {actions}
            <Button variant="outline" size="sm" onClick={() => setNewestFirst(n => !n)}>
              {newestFirst ? 'Newest first' : 'Oldest first'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExpanded(x => !x)}>
              {expanded ? 'Collapse long messages' : 'Expand all messages'}
            </Button>
          </div>
        </div>

        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-card size-3 rounded-sm border" /> Public comment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-yellow-300 bg-yellow-100 dark:border-yellow-500/50 dark:bg-yellow-500/20" />{' '}
            Private comment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="border-info/40 bg-info/15 size-3 rounded-sm border" /> Side conversation
          </span>
          <span className="flex items-center gap-1.5">
            <Workflow className="size-3.5" /> Status / group / assignee change
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {filters.length ? 'No entries match the selected filters.' : 'Select at least one filter.'}
          </p>
        ) : (
          <ol className="relative before:absolute before:top-2 before:bottom-6 before:left-4 before:w-px before:bg-border">
            {shown.map((item, i) => {
              const day = formatDate(item.at)
              const newDay = i === 0 || formatDate(shown[i - 1].at) !== day
              return (
                <Fragment key={item.id}>
                  {newDay && (
                    <li className="relative z-10 mb-3 flex">
                      <span className="bg-muted text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium">
                        {day}
                      </span>
                    </li>
                  )}
                  <TimelineItem item={item} expanded={expanded} qc={qc[item.id]} />
                </Fragment>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

// A ticket's timeline (no QC comments), retrieved from Zendesk while `active`; leaving stops a
// retrieval still running. Returns { data, progress, error }.
export function useTicketTimeline(ticketId, active = true) {
  const [data, setData] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setData(null)
    setError('')
    setProgress({ percent: 1, message: `Retrieving ticket #${ticketId}…` })
    streamInspect(
      String(ticketId),
      { qc: false },
      event => {
        if (event.type === 'progress') setProgress({ percent: event.percent, message: event.message })
        else if (event.type === 'timeline') setData(event.data)
        else if (event.type === 'error') setError(event.error)
      },
      controller.signal,
    )
      .catch(err => err.name !== 'AbortError' && setError(err.message))
      .finally(() => !controller.signal.aborted && setProgress(null))
    return () => controller.abort()
  }, [active, ticketId])

  return { data, progress, error }
}

// Pop-up with a ticket's timeline. "Open in new tab" shows the timeline and the review result on
// the ticket's own page (/ticket/:id).
function TicketTimelineDialog({ ticketId, subject, open, onOpenChange }) {
  const { data, progress, error } = useTicketTimeline(ticketId, open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <a
          href={`/ticket/${ticketId}`}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'absolute top-3 right-12')}
          title="Open the full timeline and the ticket review on its own page, in a new tab"
        >
          <ExternalLink /> Open in New Tab
        </a>
        <DialogHeader className="pe-44">
          <DialogTitle>Timeline of #{ticketId}</DialogTitle>
          {subject && <DialogDescription className="[overflow-wrap:anywhere]">{subject}</DialogDescription>}
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          {progress && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                <span className="flex-1">{progress.message}</span>
                <span className="text-muted-foreground tabular-nums">{Math.round(progress.percent)}%</span>
              </div>
              <Progress value={progress.percent} aria-label="Retrieval progress" />
            </div>
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
      </DialogContent>
    </Dialog>
  )
}

// A ticket subject that opens the ticket's timeline pop-up when clicked.
export function TicketSubject({ ticketId, subject, className }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Show the ticket timeline"
        className={cn(
          'cursor-pointer text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
          className,
        )}
      >
        {subject || '(no subject)'}
      </button>
      {open && <TicketTimelineDialog ticketId={ticketId} subject={subject} open={open} onOpenChange={setOpen} />}
    </>
  )
}
