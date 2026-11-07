// Ticket Inspector: AI coaching feedback for the agents on the whole ticket, shown under the
// timeline. Written fresh with the QC comments and never stored. Each point can link to the
// timeline comments it is based on.
import { useState } from 'react'
import { ArrowRight, Check, CircleCheck, Copy, Lightbulb, MessageSquareHeart, TrendingUp, UserRound } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/dates'

const escapeHtml = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// The feedback as plain text and as simple HTML (headings and lists), for pasting into an email,
// Teams or a document. The comment links are left out.
export function feedbackText(f, ticket) {
  const title = `Feedback for the agents${ticket ? ` – Ticket #${ticket.id}${ticket.subject ? `: ${ticket.subject}` : ''}` : ''}`
  const text = [title, '']
  const html = [`<h3>${escapeHtml(title)}</h3>`]
  if (f.overall) {
    text.push(f.overall, '')
    html.push(`<p>${escapeHtml(f.overall)}</p>`)
  }
  const list = (heading, lines) => {
    if (!lines.length) return
    text.push(heading, ...lines.map(l => `- ${l}`), '')
    html.push(`<p><b>${escapeHtml(heading)}</b></p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`)
  }
  list('What went well', f.wentWell.map(w => w.point))
  list(
    'What to improve',
    f.toImprove.map(w => (w.suggestion ? `${w.point} Try: ${w.suggestion}` : w.point)),
  )
  list('For next time', f.nextTime)
  list('For each agent', f.agents.map(a => `${a.name}: ${a.feedback}`))
  return { text: text.join('\n').trim(), html: html.join('') }
}

// Puts the feedback on the clipboard, formatted where the target app accepts it, else as text.
async function copyFeedback(f, ticket) {
  const { text, html } = feedbackText(f, ticket)
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
      return
    } catch {
      // Fall through to plain text.
    }
  }
  await navigator.clipboard.writeText(text)
}

function CopyButton({ feedback, ticket }) {
  const [state, setState] = useState(null) // 'copied' | 'failed'
  async function copy() {
    try {
      await copyFeedback(feedback, ticket)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState(null), 2000)
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} data-pdf-exclude title="Copy the feedback to the clipboard">
      {state === 'copied' ? <Check className="text-success" /> : <Copy />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </Button>
  )
}

// Scrolls to a timeline entry and briefly outlines it.
function jumpTo(id) {
  const el = document.getElementById(`tl-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-primary/50')
  setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 2000)
}

// Small links to the comments a point is based on, e.g. "Jane · 05/11/2026, 2:11 pm".
function Refs({ refs, items }) {
  if (!refs?.length) return null
  const byId = new Map(items.map(i => [i.id, i]))
  return (
    <span className="ms-1 inline-flex flex-wrap gap-1 align-middle" data-pdf-exclude>
      {refs.map(id => {
        const item = byId.get(id)
        if (!item) return null
        return (
          <button
            key={id}
            type="button"
            onClick={() => jumpTo(id)}
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded border px-1.5 py-0.5 text-[11px] leading-none"
            title="Show this comment in the timeline (if the timeline filters hide it, turn them on first)"
          >
            {item.author?.name || 'Comment'} · {formatDateTime(item.at)}
          </button>
        )
      })}
    </span>
  )
}

function Block({ icon: Icon, title, tone, children }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={`size-4 ${tone}`} /> {title}
      </h3>
      {children}
    </section>
  )
}

// `state` is { pending } | { error } | { result }; `items` are the timeline items (for the links);
// `ticket` ({ id, subject }) heads the copied text. `saved` says the feedback is stored (Quality
// Review) rather than written fresh; `action` is an extra header button (e.g. Write again).
export default function TicketFeedback({ state, items = [], ticket, saved = false, action = null }) {
  if (!state) return null
  const f = state.result
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareHeart className="text-info size-4" /> Feedback for the agents
        </CardTitle>
        <CardDescription>
          {f
            ? `AI (${f.model}) · ${formatDateTime(f.createdAt)} · ${saved ? 'saved with this review' : 'not saved'}. Coaching notes on the whole ticket, based on the QA rubric, ready to pass on.`
            : 'Coaching notes on the whole ticket, based on the QA rubric, ready to pass on to the agents.'}
        </CardDescription>
        {(f || action) && (
          <CardAction className="flex gap-2" data-pdf-exclude>
            {action}
            {f && <CopyButton feedback={f} ticket={ticket} />}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-5 text-sm leading-relaxed">
        {state.pending && (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner className="size-3.5" /> Writing feedback…
          </div>
        )}
        {state.error && <StatusAlert state={{ ok: false, message: `Feedback could not be written: ${state.error}` }} />}
        {f && (
          <>
            {f.overall && <p>{f.overall}</p>}

            {f.wentWell.length > 0 && (
              <Block icon={CircleCheck} title="What went well" tone="text-success">
                <ul className="space-y-1.5">
                  {f.wentWell.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <CircleCheck className="text-success mt-1 size-3.5 shrink-0" />
                      <span>
                        {w.point}
                        <Refs refs={w.refs} items={items} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {f.toImprove.length > 0 && (
              <Block icon={TrendingUp} title="What to improve" tone="text-warning">
                <ul className="space-y-3">
                  {f.toImprove.map((w, i) => (
                    <li key={i} className="space-y-1 rounded-md border p-3">
                      <p>
                        {w.point}
                        <Refs refs={w.refs} items={items} />
                      </p>
                      {w.suggestion && (
                        <p className="text-muted-foreground flex gap-1.5">
                          <ArrowRight className="text-foreground mt-1 size-3.5 shrink-0" />
                          <span>
                            <span className="text-foreground font-medium">Try: </span>
                            {w.suggestion}
                          </span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {f.nextTime.length > 0 && (
              <Block icon={Lightbulb} title="For next time" tone="text-info">
                <ul className="ms-5 list-disc space-y-1">
                  {f.nextTime.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </Block>
            )}

            {f.agents.length > 0 && (
              <Block icon={UserRound} title="For each agent" tone="text-muted-foreground">
                <ul className="space-y-1.5">
                  {f.agents.map(a => (
                    <li key={a.name}>
                      <span className="font-medium">{a.name}:</span> {a.feedback}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
