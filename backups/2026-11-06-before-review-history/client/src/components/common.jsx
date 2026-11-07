// Small app-level building blocks shared by the Dashboard and Settings pages.
import { useId, useState } from 'react'
import { ChevronDown, CircleAlert, CircleCheck, Loader2, Mail, RotateCcw, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatDateTime } from '@/lib/dates'
import { STATUS_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { TICKET_STATUSES } from '../api.js'

export const dateFieldFor = statuses =>
  statuses.every(s => s === 'solved' || s === 'closed') ? 'Solved' : 'Updated'

export function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_TONE[status])}>
      {status}
    </Badge>
  )
}

// Envelope shown after a ticket subject when the ticket has side conversations.
export function SideConversationIcon({ count }) {
  if (!(count > 0)) return null
  return (
    <span
      title={`${count} side conversation${count > 1 ? 's' : ''}`}
      className="text-info ms-1.5 inline-flex translate-y-0.5 items-center gap-0.5"
    >
      <Mail className="size-4" aria-label="Has side conversations" />
      {count > 1 && <span className="text-xs">{count}</span>}
    </span>
  )
}

// http(s):// or www. links inside free text. Only these two forms are matched, so text such as
// "javascript:..." never becomes a link.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
// Punctuation that usually ends the sentence rather than the URL.
const TRAILING = /[.,;:!?)\]}'"]+$/

// Renders plain text with any pasted links made clickable (opening in a new tab).
export function LinkifiedText({ text }) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0]
    // Keep a closing bracket that belongs to the URL, e.g. a wiki link ending in "(x)".
    const trail = url.match(TRAILING)?.[0] ?? ''
    if (trail && !(trail.startsWith(')') && url.includes('('))) url = url.slice(0, -trail.length)
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <a
        key={match.index}
        href={/^www\./i.test(url) ? `https://${url}` : url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-info break-all underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>,
    )
    last = match.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// Times a ticket was re-opened since its review: the current Zendesk re-open count minus the
// count stored with the review. null when either count is unknown.
export function reopensSinceReview(currentReopens, reopensAtReview) {
  if (currentReopens == null || reopensAtReview == null) return null
  return Math.max(0, currentReopens - reopensAtReview)
}

// Ticket number linking to Zendesk; shown in red when the ticket was re-opened after its review.
export function TicketIdLink({ href, id, reopenedSince, reviewedAt }) {
  const flagged = reopenedSince > 0
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={
        flagged
          ? `Re-opened ${reopenedSince} time${reopenedSince > 1 ? 's' : ''} since it was reviewed` +
            (reviewedAt ? ` on ${formatDateTime(reviewedAt)}` : '')
          : undefined
      }
      className={cn('font-medium underline-offset-4 hover:underline', flagged && 'text-destructive font-semibold')}
    >
      #{id}
    </a>
  )
}

// Shown after a ticket subject when Zendesk recorded the ticket being re-opened after solve.
export function ReopenedIcon({ count }) {
  if (!(count > 0)) return null
  return (
    <span
      title={`Re-opened ${count} time${count > 1 ? 's' : ''}`}
      className="text-warning ms-1.5 inline-flex translate-y-0.5 items-center gap-0.5"
    >
      <RotateCcw className="size-4" aria-label="Re-opened" />
      {count > 1 && <span className="text-xs">{count}</span>}
    </span>
  )
}

// Multi-select of Zendesk ticket statuses.
export function StatusToggles({ value, onChange, size }) {
  return (
    <ToggleGroup type="multiple" variant="outline" size={size} value={value} onValueChange={onChange}>
      {TICKET_STATUSES.map(st => (
        <ToggleGroupItem
          key={st}
          value={st}
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3 capitalize"
        >
          {st}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// Compact multi-select dropdown filter. `value` is an array of selected option values; an empty
// array means no filtering ("All …"). Options are strings or { value, label }.
export function FilterSelect({ label, value, onChange, options, className }) {
  const [search, setSearch] = useState('')
  const items = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  const selected = new Set(value)
  const labelOf = v => items.find(o => o.value === v)?.label ?? v
  const visible = search.trim()
    ? items.filter(o => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : items
  const toggle = (v, on) => onChange(on ? [...value.filter(x => x !== v), v] : value.filter(x => x !== v))
  const summary = !value.length ? `All ${label.toLowerCase()}` : value.length === 1 ? labelOf(value[0]) : `${label} · ${value.length}`

  return (
    <Popover onOpenChange={open => !open && setSearch('')}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={label}
          className={cn(
            'max-w-60 min-w-36 justify-between gap-2 font-normal',
            value.length && 'border-primary bg-accent font-medium',
            className,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        {items.length > 8 && (
          <div className="border-b p-2">
            <Input
              className="h-8"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="max-h-72 space-y-0.5 overflow-y-auto p-1" role="group" aria-label={label}>
          {visible.map(o => (
            <CheckItem
              key={o.value}
              className="hover:bg-accent rounded-sm px-2 py-1.5"
              checked={selected.has(o.value)}
              onChange={on => toggle(o.value, on)}
            >
              {o.label}
            </CheckItem>
          ))}
          {!visible.length && <p className="text-muted-foreground px-2 py-1.5 text-sm">No matches.</p>}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {value.length ? `${value.length} selected` : 'Showing all'}
          </span>
          <button
            type="button"
            className="text-foreground font-medium underline-offset-4 hover:underline disabled:opacity-40"
            disabled={!value.length}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ClearFiltersButton({ count, onClear }) {
  if (!count) return null
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      <X /> Clear {count} filter{count > 1 ? 's' : ''}
    </Button>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
}

// `state` is { ok?, loading?, message } or null.
export function StatusAlert({ state, className }) {
  if (!state) return null
  const Icon = state.loading ? Spinner : state.ok ? CircleCheck : CircleAlert
  return (
    <Alert
      variant={state.ok || state.loading ? 'default' : 'destructive'}
      className={cn('py-2', state.ok && 'border-success/40 text-success', className)}
    >
      <Icon className="size-4" />
      <AlertDescription className={cn(state.ok && 'text-success')}>{state.message}</AlertDescription>
    </Alert>
  )
}

export function CheckItem({ checked, onChange, children, className }) {
  const id = useId()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">
        {children}
      </Label>
    </div>
  )
}
