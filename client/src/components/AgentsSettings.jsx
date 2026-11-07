// Settings › Agents: the Global Production Support agents. They handle tickets across every Zendesk
// group, and Feedback for the agents (Ticket Inspector and Quality Review) is addressed only to
// them. Agents are added by searching Zendesk, or imported from the Global Support group; the list
// is saved with "Save all settings". While it is empty, the group rule is used instead.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// The agents in each ticket group selected in Settings › Quality Review, with Add buttons (one agent,
// or a whole group) and a marker for agents already in the Global Production Support list.
function ReviewGroupAgents({ ids, onAdd }) {
  const [data, setData] = useState(null) // { allGroups, groups } | { error }
  const [open, setOpen] = useState(() => new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api
      .agentReviewGroups()
      .then(setData)
      .catch(e => setData({ error: e.message }))
  }, [])

  const term = filter.trim().toLowerCase()
  const matches = m => !term || m.name.toLowerCase().includes(term) || String(m.email || '').toLowerCase().includes(term)
  const toggle = id =>
    setOpen(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Agents in the Quality Review groups
        </CardTitle>
        <CardDescription>
          The members of each ticket group selected in Settings › Quality Review (saved settings), from Zendesk. Add the
          ones who belong to Global Production Support.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner /> Loading the group members from Zendesk…
          </div>
        ) : data.error ? (
          <StatusAlert state={{ ok: false, message: data.error }} />
        ) : data.allGroups ? (
          <p className="text-muted-foreground text-sm">
            Quality Review searches all groups (none selected in Settings › Quality Review), which is too many to list here.
            Select the groups there and save to see their agents.
          </p>
        ) : (
          <>
            <Input
              className="h-8 max-w-64"
              placeholder="Filter by name or email…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Filter the group members"
            />
            <div className="divide-y rounded-md border">
              {data.groups.map(g => {
                const members = g.members.filter(matches)
                const missing = g.members.filter(m => !ids.has(m.id))
                const expanded = open.has(g.id) || (term && members.length > 0)
                if (term && !members.length) return null
                return (
                  <div key={g.id}>
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-start text-sm font-medium"
                        onClick={() => toggle(g.id)}
                        aria-expanded={Boolean(expanded)}
                      >
                        <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
                        {g.name}
                        <span className="text-muted-foreground text-xs font-normal">
                          {g.members.length} agent{g.members.length === 1 ? '' : 's'} · {g.members.length - missing.length} in the list
                        </span>
                      </button>
                      {missing.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => onAdd(missing)}>
                          <UserPlus /> Add all {missing.length}
                        </Button>
                      )}
                    </div>
                    {expanded && (
                      <ul className="divide-y border-t">
                        {members.map(m => (
                          <li key={m.id} className="flex items-center gap-3 py-1.5 ps-9 pe-3 text-sm">
                            <span className="flex-1">
                              {m.name}
                              <span className="text-muted-foreground ms-2 text-xs">{m.email}</span>
                            </span>
                            {ids.has(m.id) ? (
                              <span className="text-success text-xs">In the list</span>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => onAdd([m])}>
                                <UserPlus /> Add
                              </Button>
                            )}
                          </li>
                        ))}
                        {!g.members.length && <li className="text-muted-foreground py-1.5 ps-9 text-xs">No agents in this group.</li>}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function AgentsSettings({ agents, onChange }) {
  const list = agents?.globalSupport || []
  const ids = useMemo(() => new Set(list.map(a => a.id)), [list])
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null) // null | { loading } | { error } | array
  const [filter, setFilter] = useState('')
  const [importState, setImportState] = useState(null)

  const setList = next => onChange({ globalSupport: [...next].sort((a, b) => a.name.localeCompare(b.name)) })
  const add = agent => !ids.has(agent.id) && setList([...list, { id: agent.id, name: agent.name, email: agent.email }])
  const addMany = agents => setList([...list, ...agents.filter(a => !ids.has(a.id)).map(a => ({ id: a.id, name: a.name, email: a.email }))])
  const remove = id => setList(list.filter(a => a.id !== id))

  // Search Zendesk agents as you type (after a short pause).
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      return
    }
    setResults({ loading: true })
    const timer = setTimeout(() => {
      api
        .searchAgents(term)
        .then(setResults)
        .catch(e => setResults({ error: e.message }))
    }, 350)
    return () => clearTimeout(timer)
  }, [q])

  async function importGroup() {
    setImportState({ loading: true, message: 'Loading the Global Support group from Zendesk…' })
    try {
      const members = await api.agentGroupSuggestions()
      const fresh = members.filter(m => !ids.has(m.id))
      setList([...list, ...fresh.map(m => ({ id: m.id, name: m.name, email: m.email }))])
      setImportState({
        ok: true,
        message: fresh.length
          ? `Added ${fresh.length} agent${fresh.length === 1 ? '' : 's'} from the Global Support group (members not also in L2 Support). Review the list, then Save all settings.`
          : 'Everyone in the Global Support group (not also in L2 Support) is already in the list.',
      })
    } catch (e) {
      setImportState({ ok: false, message: e.message })
    }
  }

  const shown = list.filter(a => {
    const term = filter.trim().toLowerCase()
    return !term || a.name.toLowerCase().includes(term) || String(a.email || '').toLowerCase().includes(term)
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> Global Production Support agents ({list.length})
          </CardTitle>
          <CardDescription>
            The agents of the Global Production Support team. They handle tickets across every Zendesk group, whichever
            group a ticket is in. <b>Feedback for the agents</b> (Ticket Inspector and Quality Review) is written only for
            the agents in this list; everyone else on a ticket, such as L2 Support, is treated as context.
            {!list.length && (
              <>
                {' '}
                While the list is empty, members of the Zendesk group Global Support who are not also in L2 Support are
                used.
              </>
            )}
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={importGroup} disabled={importState?.loading}>
              {importState?.loading ? <Spinner /> : <UserPlus />} Add from Global Support group
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusAlert state={importState} />

          <div className="space-y-2">
            <div className="relative max-w-md">
              <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                className="ps-8"
                placeholder="Find a Zendesk agent to add (name or email)…"
                value={q}
                onChange={e => setQ(e.target.value)}
                aria-label="Find a Zendesk agent to add"
              />
            </div>
            {results?.loading && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Spinner className="size-3.5" /> Searching Zendesk…
              </div>
            )}
            {results?.error && <StatusAlert state={{ ok: false, message: results.error }} />}
            {Array.isArray(results) && (
              <div className="max-w-2xl rounded-md border">
                {!results.length ? (
                  <p className="text-muted-foreground p-3 text-sm">No agents match “{q.trim()}”.</p>
                ) : (
                  <ul className="divide-y">
                    {results.map(r => (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="flex-1">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-muted-foreground ms-2 text-xs">
                            {r.email} · {r.role}
                          </span>
                        </span>
                        {ids.has(r.id) ? (
                          <span className="text-muted-foreground text-xs">In the list</span>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => add(r)}>
                            <UserPlus /> Add
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {list.length > 0 ? (
            <>
              {list.length > 10 && (
                <Input
                  className="h-8 max-w-64"
                  placeholder="Filter the list…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  aria-label="Filter the agent list"
                />
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-end">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{a.email || '—'}</TableCell>
                      <TableCell className="text-end">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${a.name}`}
                          title={`Remove ${a.name} from the list`}
                          onClick={() => remove(a.id)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!shown.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                        No agents match this filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No agents yet. Find agents above, or use <b>Add from Global Support group</b> to start from Zendesk and remove
              anyone who isn’t in the team.
            </p>
          )}
          <p className="text-muted-foreground text-xs">Changes apply after <b>Save all settings</b>.</p>
        </CardContent>
      </Card>

      <ReviewGroupAgents ids={ids} onAdd={addMany} />
    </div>
  )
}
