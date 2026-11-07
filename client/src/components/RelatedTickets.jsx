// Related Zendesk tickets and Jira issues for a reviewed ticket: icon button (with count) +
// dialog to add, comment on, and remove links. Stored server-side in SQLite.
import { useEffect, useState } from 'react'
import { ExternalLink, Link2, Pencil, Trash2 } from 'lucide-react'
import { LinkifiedText, Spinner, StatusAlert } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { confirm } from '@/components/confirm'
import { api } from '../api.js'

// Per link type: display name, badge colour, input hints and a loose format check
// (the server does the real parsing and validation).
const KINDS = {
  zendesk: {
    name: 'Zendesk',
    tone: TONE.success,
    inputLabel: 'Zendesk ticket ID',
    placeholder: 'e.g. 1674078, or paste the ticket link',
    valid: v => /^#?\s*\d+\s*$/.test(v) || /\/tickets\/\d+/.test(v),
  },
  jira: {
    name: 'Jira',
    tone: TONE.info,
    inputLabel: 'Jira issue key',
    placeholder: 'e.g. TSD-1234, or paste the issue link',
    valid: v => /[A-Za-z][A-Za-z0-9_]*-\d+/.test(v),
  },
}

function RelatedItem({ item, onChanged, onRemoved }) {
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState(item.comment || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      onChanged(await api.updateRelated(item.id, comment))
      setEditing(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const label = item.kind === 'jira' ? item.ref : `#${item.ref}`

  async function remove() {
    const ok = await confirm({
      title: `Remove the link to ${KINDS[item.kind].name} ${label}?`,
      description: 'The link and its note are removed from this ticket. The other ticket or issue is not changed.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteRelated(item.id)
      onRemoved(item.id)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <Badge variant="outline" className={cn('mt-0.5', KINDS[item.kind].tone)}>
          {KINDS[item.kind].name}
        </Badge>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 text-sm font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere]"
          >
            {label}
            {item.title && <span className="text-muted-foreground font-normal"> — {item.title}</span>}
            <ExternalLink className="ms-1 inline size-3.5 -translate-y-px" />
          </a>
        ) : (
          <span className="min-w-0 flex-1 text-sm font-medium">
            {label}
            <span className="text-muted-foreground font-normal"> — set the Jira site URL in Settings to link it</span>
          </span>
        )}
        {!editing && (
          <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Remove related ticket" onClick={remove} disabled={busy}>
          <Trash2 />
        </Button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={comment} onChange={e => setComment(e.target.value)} className="min-h-20" autoFocus />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComment(item.comment || '')
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy && <Spinner />} Save comment
            </Button>
          </div>
        </div>
      ) : (
        <p className={item.comment ? 'text-sm whitespace-pre-wrap' : 'text-muted-foreground text-sm italic'}>
          {item.comment ? <LinkifiedText text={item.comment} /> : 'No comment'}
        </p>
      )}
      {error && <StatusAlert state={{ ok: false, message: error }} />}
    </li>
  )
}

function RelatedTicketsDialog({ ticketId, subject, open, onOpenChange, onCountChange }) {
  const [items, setItems] = useState(null)
  const [kind, setKind] = useState('zendesk')
  const [ref, setRef] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setItems(null)
    setError('')
    api
      .listRelated(ticketId)
      .then(setItems)
      .catch(e => setError(e.message))
  }, [open, ticketId])

  const update = next => {
    setItems(next)
    onCountChange?.(next.length)
  }

  async function add(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const saved = await api.addRelated(ticketId, { kind, ref, comment })
      update([...(items || []), saved])
      setRef('')
      setComment('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Related tickets for #{ticketId}</DialogTitle>
          {subject && <DialogDescription className="[overflow-wrap:anywhere]">{subject}</DialogDescription>}
        </DialogHeader>

        {!items ? (
          !error && <Spinner />
        ) : items.length ? (
          <ul className="space-y-2">
            {items.map(item => (
              <RelatedItem
                key={item.id}
                item={item}
                onChanged={changed => update(items.map(i => (i.id === changed.id ? changed : i)))}
                onRemoved={id => update(items.filter(i => i.id !== id))}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No related tickets or Jira issues yet.</p>
        )}

        <Separator />

        <form onSubmit={add} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="related-kind">Type</Label>
              <Select
                value={kind}
                onValueChange={v => {
                  setKind(v)
                  setError('')
                }}
              >
                <SelectTrigger id="related-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jira">JIRA</SelectItem>
                  <SelectItem value="zendesk">Zendesk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="related-id">{KINDS[kind].inputLabel}</Label>
              <Input
                id="related-id"
                placeholder={KINDS[kind].placeholder}
                value={ref}
                onChange={e => setRef(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="related-comment">Comment</Label>
            <Textarea
              id="related-comment"
              placeholder="Why is this related?"
              className="min-h-20"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>
          {error && <StatusAlert state={{ ok: false, message: error }} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={saving || !KINDS[kind].valid(ref.trim())}>
              {saving && <Spinner />} Save related ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Icon button for the Actions column; shows how many related tickets are linked.
export function RelatedTicketsButton({ ticketId, subject, count = 0, onCountChange }) {
  const [open, setOpen] = useState(false)
  const label = count ? `${count} related ticket${count > 1 ? 's' : ''}` : 'Add related ticket'
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        title={label}
        aria-label={label}
        className={count ? 'text-info' : 'text-muted-foreground'}
        onClick={() => setOpen(true)}
      >
        <Link2 />
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </Button>
      <RelatedTicketsDialog
        ticketId={ticketId}
        subject={subject}
        open={open}
        onOpenChange={setOpen}
        onCountChange={onCountChange}
      />
    </>
  )
}
