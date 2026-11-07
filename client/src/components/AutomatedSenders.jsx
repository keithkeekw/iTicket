// Settings › Hard rules: the automated senders an admin adds without changing the code. Tickets and
// messages from them count as automated notifications (hard rule 3): no customer-facing reply is
// needed, and their messages are never QC'd. Entries are exact addresses, patterns with * or
// "@domain"; the server cleans them when settings are saved (settings.js › normaliseSenders) and
// matches them in api-tickets.js › matchesSender. Saved with "Save All Settings".
import { useMemo, useState } from 'react'
import { MailX, Plus, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TONE } from '@/lib/tones'

// Built into the code (server/api-tickets.js); shown for reference.
const BUILT_IN = ['extremereach@extremereach.com', 'no-reply@hibob.com', 'ingest.service@extremereach.com', 'aqa.es@adstream.com']

const VALID = /^[a-z0-9._%+*'-]*@[a-z0-9*.-]+\.[a-z0-9*-]+$/

// Same matching as the server (api-tickets.js › matchesSender).
function matches(pattern, address) {
  if (pattern.startsWith('@')) return address.endsWith(pattern)
  if (!pattern.includes('*')) return address === pattern
  const pieces = pattern.split('*')
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  if (!address.startsWith(first) || !address.endsWith(last) || address.length < first.length + last.length) return false
  let pos = first.length
  for (const piece of pieces.slice(1, -1)) {
    const at = address.indexOf(piece, pos)
    if (at === -1 || at + piece.length > address.length - last.length) return false
    pos = at + piece.length
  }
  return true
}
const isNoReply = a => /noreply|donotreply/.test(a.replace(/[^a-z]/g, ''))

// Why an address counts as automated (or null): which entry or rule matches it.
function why(address, extra) {
  const a = address.trim().toLowerCase()
  if (!a) return null
  if (BUILT_IN.includes(a)) return 'a built-in automated sender'
  const hit = extra.find(p => matches(p, a))
  if (hit) return `your entry “${hit}”`
  if (isNoReply(a)) return 'the “no reply / do not reply” rule'
  return null
}

const kind = p => (p.startsWith('@') ? 'Whole domain' : p.includes('*') ? 'Pattern' : 'Address')

export default function AutomatedSenders({ value, onChange }) {
  const list = value?.automatedSenders || []
  const [draft, setDraft] = useState('')
  const [check, setCheck] = useState('')
  const entry = draft.trim().toLowerCase()
  const problem = !entry
    ? null
    : !VALID.test(entry)
      ? 'Enter an email address (name@domain.com), a pattern with * (e.g. *+vantage@extremereach.com) or @domain.com.'
      : list.includes(entry)
        ? 'Already in the list.'
        : null
  const add = () => {
    if (!entry || problem) return
    onChange({ automatedSenders: [...list, entry].sort() })
    setDraft('')
  }
  const remove = p => onChange({ automatedSenders: list.filter(x => x !== p) })
  const verdict = useMemo(() => (check.trim() ? why(check, list) : undefined), [check, list])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailX className="size-4" /> Automated senders ({list.length} added)
        </CardTitle>
        <CardDescription>
          Email addresses that send automated emails into Zendesk. Their tickets count as automated notifications (Hard
          rule 3): the agent isn’t expected to send a customer-facing reply, and messages from them are never QC’d. Add an
          exact address, a pattern where <b>*</b> stands for anything (e.g. <code>*+vantage@extremereach.com</code>), or{' '}
          <code>@domain.com</code> for a whole domain. Changes apply to new reviews and Ticket Inspector runs after{' '}
          <b>Save All Settings</b>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-1.5"
          onSubmit={e => {
            e.preventDefault()
            add()
          }}
        >
          <div className="flex max-w-xl gap-2">
            <Input
              placeholder="e.g. kkeeton+vantage@extremereach.com"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              aria-label="Automated sender to add"
              aria-invalid={Boolean(problem)}
            />
            <Button type="submit" disabled={!entry || Boolean(problem)}>
              <Plus /> Add
            </Button>
          </div>
          {problem && <p className="text-destructive text-xs">{problem}</p>}
        </form>

        {list.length > 0 ? (
          <ul className="max-w-xl divide-y rounded-md border">
            {list.map(p => (
              <li key={p} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-mono text-xs">{p}</span>
                <Badge variant="outline" className="text-muted-foreground">
                  {kind(p)}
                </Badge>
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${p}`} title={`Remove ${p}`} onClick={() => remove(p)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No senders added yet.</p>
        )}

        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Built in (always counted): {BUILT_IN.join(', ')}, and any address containing “no reply” or “do not reply”.
          </p>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <div className="relative max-w-xl">
            <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              className="ps-8"
              placeholder="Check an address…"
              value={check}
              onChange={e => setCheck(e.target.value)}
              aria-label="Check whether an address counts as automated"
            />
          </div>
          {verdict !== undefined && (
            <p className="text-sm">
              {verdict ? (
                <Badge variant="outline" className={TONE.info}>
                  Automated: {verdict}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not automated: treated as a person
                </Badge>
              )}
            </p>
          )}
          <p className="text-muted-foreground text-xs">Uses the list on screen, including changes not saved yet.</p>
        </div>
      </CardContent>
    </Card>
  )
}
