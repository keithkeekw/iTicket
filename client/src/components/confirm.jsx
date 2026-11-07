// In-app confirmation pop-up, used instead of the browser's window.confirm. Call
//   if (!(await confirm({ title, description, confirmLabel, destructive }))) return
// from anywhere; <ConfirmHost /> (mounted once in main.jsx) shows it over the page.
// Resolves true for the confirm button, false for Cancel, Esc, the close button or a click outside.
// `typeToConfirm` (e.g. 'DELETE') adds a box the user must type that word into (exactly, capitals
// included) before the confirm button is enabled, for actions that can't be undone.
import { useEffect, useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

let show = null // set by the mounted ConfirmHost

export function confirm({ title, description, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false, typeToConfirm = '' }) {
  // Without a host (should not happen), fall back to the browser's own pop-up.
  if (!show) {
    const text = [title, description].filter(Boolean).join('\n\n')
    if (typeToConfirm) return Promise.resolve(window.prompt(`${text}\n\nType ${typeToConfirm} to confirm.`) === typeToConfirm)
    return Promise.resolve(window.confirm(text))
  }
  return new Promise(resolve => show({ title, description, confirmLabel, cancelLabel, destructive, typeToConfirm, resolve }))
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const inputId = useId()

  useEffect(() => {
    show = req => {
      setRequest(req)
      setTyped('')
      setOpen(true)
    }
    return () => {
      show = null
    }
  }, [])

  const word = request?.typeToConfirm || ''
  const allowed = !word || typed === word

  function finish(answer) {
    if (answer && !allowed) return
    request?.resolve(answer)
    setOpen(false)
  }

  // `description` may be a string with blank lines between paragraphs, or JSX.
  const paragraphs = typeof request?.description === 'string' ? request.description.split(/\n{2,}/) : null

  return (
    <Dialog open={open} onOpenChange={o => !o && finish(false)}>
      <DialogContent className="sm:max-w-md">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {request.destructive && <AlertTriangle className="text-destructive size-5 shrink-0" />}
                {request.title}
              </DialogTitle>
              {request.description && (
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    {paragraphs ? paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : request.description}
                  </div>
                </DialogDescription>
              )}
            </DialogHeader>
            {word && (
              <form
                className="space-y-1.5"
                onSubmit={e => {
                  e.preventDefault()
                  finish(true)
                }}
              >
                <Label htmlFor={inputId}>
                  Type <span className="font-mono font-semibold">{word}</span> to confirm
                </Label>
                <Input
                  id={inputId}
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  aria-invalid={typed !== '' && !word.startsWith(typed)}
                />
              </form>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => finish(false)}>
                {request.cancelLabel}
              </Button>
              <Button
                variant={request.destructive ? 'destructive' : 'default'}
                onClick={() => finish(true)}
                disabled={!allowed}
                autoFocus={!word}
              >
                {request.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
