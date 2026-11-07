// Reviewer comments on a ticket: icon button (with count) + dialog to add, edit and delete
// free-text comments. Stored server-side in SQLite, shared by every review of the ticket.
import { useEffect, useState } from 'react'
import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { LinkifiedText, Spinner, StatusAlert } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/dates'
import { confirm } from '@/components/confirm'
import { api } from '../api.js'

// Ctrl/Cmd+Enter submits from a comment box.
const submitOnCtrlEnter = submit => e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submit()
  }
}

function CommentItem({ comment, onChanged, onRemoved }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!body.trim()) return
    setBusy(true)
    setError('')
    try {
      onChanged(await api.updateComment(comment.id, body))
      setEditing(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this comment?',
      description: "This can't be undone.",
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteComment(comment.id)
      onRemoved(comment.id)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const edited = comment.updatedAt !== comment.createdAt
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground flex-1 text-xs">
          {formatDateTime(comment.createdAt)}
          {edited && ` · edited ${formatDateTime(comment.updatedAt)}`}
        </span>
        {!editing && (
          <Button variant="ghost" size="icon-xs" title="Edit comment" aria-label="Edit comment" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" title="Delete comment" aria-label="Delete comment" onClick={remove} disabled={busy}>
          <Trash2 />
        </Button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={submitOnCtrlEnter(save)}
            className="min-h-24"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBody(comment.body)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
              {busy && <Spinner />} Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"><LinkifiedText text={comment.body} /></p>
      )}
      {error && <StatusAlert state={{ ok: false, message: error }} />}
    </li>
  )
}

function CommentsDialog({ ticketId, subject, open, onOpenChange, onCountChange }) {
  const [comments, setComments] = useState(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setComments(null)
    setError('')
    api
      .listComments(ticketId)
      .then(setComments)
      .catch(e => setError(e.message))
  }, [open, ticketId])

  const update = next => {
    setComments(next)
    onCountChange?.(next.length)
  }

  async function add() {
    if (!body.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = await api.addComment(ticketId, body)
      update([...(comments || []), saved])
      setBody('')
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
          <DialogTitle>Comments for #{ticketId}</DialogTitle>
          {subject && <DialogDescription className="[overflow-wrap:anywhere]">{subject}</DialogDescription>}
        </DialogHeader>

        {!comments ? (
          !error && <Spinner />
        ) : comments.length ? (
          <ul className="space-y-2">
            {comments.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                onChanged={changed => update(comments.map(x => (x.id === changed.id ? changed : x)))}
                onRemoved={id => update(comments.filter(x => x.id !== id))}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        )}

        <Separator />

        <form
          onSubmit={e => {
            e.preventDefault()
            add()
          }}
          className="space-y-3"
        >
          <div className="grid gap-2">
            <Label htmlFor="new-comment">Add a comment</Label>
            <Textarea
              id="new-comment"
              placeholder="Write your comment…"
              className="min-h-28"
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={submitOnCtrlEnter(add)}
            />
            <p className="text-muted-foreground text-xs">Ctrl+Enter to save.</p>
          </div>
          {error && <StatusAlert state={{ ok: false, message: error }} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={saving || !body.trim()}>
              {saving && <Spinner />} Add comment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Icon button for the Actions column; shows how many comments the ticket has.
export function CommentsButton({ ticketId, subject, count = 0, onCountChange }) {
  const [open, setOpen] = useState(false)
  const label = count ? `${count} comment${count > 1 ? 's' : ''}` : 'Add comment'
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
        <MessageSquare />
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </Button>
      <CommentsDialog
        ticketId={ticketId}
        subject={subject}
        open={open}
        onOpenChange={setOpen}
        onCountChange={onCountChange}
      />
    </>
  )
}
