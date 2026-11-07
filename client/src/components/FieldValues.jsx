// Metadata QC row details: a ticket's required fields, missing ones first. For each missing field
// the AI suggests the most likely values (from the values Zendesk allows), read from the ticket's
// conversation; the full list of allowed values stays one click away. Loaded fresh when opened.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/dates'
import { CONFIDENCE_TONE, TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

const STATE = {
  missing: { label: 'Missing', tone: TONE.danger },
  set: { label: 'Filled', tone: TONE.success },
  'not-applicable': { label: 'Not on form', tone: 'text-muted-foreground' },
}
const ORDER = { missing: 0, set: 1, 'not-applicable': 2 }

// Display name of a value, from the field's allowed values (the value itself when not listed).
const optionName = (field, value) =>
  field.options?.find(o => String(o.value) === String(value) || String(o.name).toLowerCase() === String(value).toLowerCase())
    ?.name ?? value

// Every allowed value, behind a toggle, with a search box for long lists.
function AllValues({ field, highlight = [] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const options = field.options || []
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? options.filter(o => String(o.name).toLowerCase().includes(term)) : options
  }, [options, q])
  if (!options.length) return <span className="text-muted-foreground text-xs">Free text: no fixed list of values.</span>
  const isCurrent = o => field.current != null && String(field.current).split(', ').includes(String(o.name))
  const isHighlighted = o => highlight.some(v => String(v) === String(o.value) || String(v).toLowerCase() === String(o.name).toLowerCase())
  return (
    <div className="space-y-2">
      <button type="button" className="text-info text-xs hover:underline" onClick={() => setOpen(o => !o)}>
        {open ? 'Hide' : 'Show'} All {options.length} Allowed Value{options.length === 1 ? '' : 's'}
      </button>
      {open && (
        <>
          {options.length > 12 && (
            <Input
              className="h-7 max-w-64 text-xs"
              placeholder={`Search ${options.length} values…`}
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label={`Search the allowed values of ${field.label}`}
            />
          )}
          <div className="flex flex-wrap gap-1">
            {shown.map(o => (
              <Badge
                key={String(o.value)}
                variant="outline"
                className={cn(
                  'h-auto font-normal whitespace-normal',
                  isCurrent(o) && TONE.success,
                  isHighlighted(o) && 'border-info text-info bg-info/10',
                )}
                title={isCurrent(o) ? 'Current value' : `Value: ${o.value}`}
              >
                {o.name}
              </Badge>
            ))}
            {!shown.length && <span className="text-muted-foreground text-xs">No values match.</span>}
          </div>
        </>
      )}
    </div>
  )
}

// The AI's suggested values for one missing field.
function Suggestions({ field, state }) {
  if (state?.pending) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Spinner className="size-3.5" /> Suggesting values…
      </div>
    )
  }
  const values = state?.result?.suggestions?.[field.key] || []
  if (!state?.result) return null
  if (!values.length) return <p className="text-muted-foreground text-xs">No suggestion: the ticket doesn’t say enough.</p>
  return (
    <ul className="space-y-1.5">
      {values.map((v, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-info text-info bg-info/10 h-auto font-medium whitespace-normal">
            <Sparkles className="size-3" /> {optionName(field, v.value)}
          </Badge>
          {v.confidence && (
            <Badge variant="outline" className={CONFIDENCE_TONE[v.confidence]}>
              {v.confidence}
            </Badge>
          )}
          {v.reason && <span className="text-muted-foreground text-xs">{v.reason}</span>}
        </li>
      ))}
    </ul>
  )
}

function FieldRow({ field, suggest }) {
  const suggested = (suggest?.result?.suggestions?.[field.key] || []).map(v => v.value)
  return (
    <div className="grid gap-2 p-3 md:grid-cols-[14rem_1fr]">
      <div className="space-y-1">
        <div className="font-medium">{field.label}</div>
        <Badge variant="outline" className={STATE[field.state].tone}>
          {STATE[field.state].label}
        </Badge>
      </div>
      <div className="space-y-2">
        {field.state === 'missing' ? (
          <Suggestions field={field} state={suggest} />
        ) : (
          <div className="text-sm">{field.current ? <>Now: {field.current}</> : <span className="text-muted-foreground">Empty</span>}</div>
        )}
        <AllValues field={field} highlight={suggested} />
      </div>
    </div>
  )
}

export default function FieldValues({ ticketId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [suggest, setSuggest] = useState(null) // { pending } | { error } | { result }
  const [showOthers, setShowOthers] = useState(false)

  async function loadSuggestions(refresh = false) {
    setSuggest({ pending: true })
    try {
      setSuggest({ result: await api.qcSuggest(ticketId, refresh) })
    } catch (e) {
      setSuggest({ error: e.message })
    }
  }

  useEffect(() => {
    let cancelled = false
    api
      .qcTicketFields(ticketId)
      .then(d => {
        if (cancelled) return
        setData(d)
        // Ask the AI only when something is missing.
        if (d.fields.some(f => f.state === 'missing')) loadSuggestions()
      })
      .catch(e => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  if (error) return <StatusAlert state={{ ok: false, message: `Field values could not be loaded: ${error}` }} />
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Spinner /> Loading the ticket’s fields from Zendesk…
      </div>
    )
  }

  const fields = [...data.fields].sort((a, b) => ORDER[a.state] - ORDER[b.state])
  const main = fields.filter(f => f.state !== 'not-applicable')
  const others = fields.filter(f => f.state === 'not-applicable')
  const anyMissing = main.some(f => f.state === 'missing')

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground flex-1 text-xs">
          Required fields of ticket #{data.ticketId} as they are now in Zendesk.
          {anyMissing &&
            (suggest?.result
              ? ` Suggested values: AI (${suggest.result.model}) from the ticket’s conversation, ${formatDateTime(suggest.result.createdAt)}. Check them before using.`
              : ' The AI suggests likely values for the missing fields from the ticket’s conversation.')}
        </p>
        {anyMissing && suggest && !suggest.pending && (
          <Button variant="outline" size="sm" onClick={() => loadSuggestions(true)}>
            <RefreshCw /> Suggest again
          </Button>
        )}
      </div>
      {suggest?.error && <StatusAlert state={{ ok: false, message: `Values could not be suggested: ${suggest.error}` }} />}
      <div className="bg-background divide-y rounded-md border">
        {main.map(f => (
          <FieldRow key={f.key} field={f} suggest={suggest} />
        ))}
        {!main.length && <p className="text-muted-foreground p-3">None of the required fields is on this ticket’s form.</p>}
      </div>
      {others.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="text-info text-xs hover:underline" onClick={() => setShowOthers(s => !s)}>
            {showOthers ? 'Hide' : 'Show'} {others.length} Required Field{others.length === 1 ? '' : 's'} Not on This Ticket’s Form
          </button>
          {showOthers && (
            <div className="bg-background divide-y rounded-md border">
              {others.map(f => (
                <FieldRow key={f.key} field={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
