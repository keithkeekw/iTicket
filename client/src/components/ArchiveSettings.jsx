// Settings › Archive: moves the app's data for tickets closed in a date range out of the database
// into a JSON file named after the range (e.g. 20261101-20261105), lists the archives, and lets
// them be downloaded or restored. See server/archive.js.
import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Download, Search, Trash2 } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { confirm } from '@/components/confirm'
import { DatePicker } from '@/components/DatePicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatDateTime, isoDay } from '@/lib/dates'
import { api } from '../api.js'

const nameFor = (start, end) => (start && end ? `${start.replaceAll('-', '')}-${end.replaceAll('-', '')}` : '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const kb = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

function contents(c) {
  return [
    plural(c.tickets, 'ticket'),
    plural(c.reviews, 'review'),
    c.previousVersions && plural(c.previousVersions, 'previous version'),
    c.scoreEdits && plural(c.scoreEdits, 'score edit'),
    c.comments && plural(c.comments, 'comment'),
    c.links && plural(c.links, 'related link'),
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function ArchiveSettings() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [preview, setPreview] = useState(null) // result of a check, for the dates it was run with
  const [state, setState] = useState(null) // StatusAlert state
  const [archives, setArchives] = useState(null)
  const [listError, setListError] = useState(null)

  const today = isoDay(new Date())
  const name = nameFor(start, end)
  const valid = start && end && start <= end
  const previewCurrent = preview && preview.start === start && preview.end === end
  const busy = state?.loading

  async function loadList() {
    try {
      setArchives(await api.listArchives())
      setListError(null)
    } catch (e) {
      setListError(e.message)
    }
  }
  useEffect(() => {
    loadList()
  }, [])

  async function check() {
    setState({ loading: true, message: 'Checking the app’s tickets in Zendesk…' })
    setPreview(null)
    try {
      setPreview(await api.previewArchive({ start, end }))
      setState(null)
    } catch (e) {
      setState({ ok: false, message: e.message })
    }
  }

  async function archive() {
    const c = preview.counts
    const ok = await confirm({
      title: `Archive ${name}?`,
      description: `${contents(c)} for tickets closed ${formatDate(start)} – ${formatDate(end)} will be saved to the archive file and removed from the app (Saved reviews, Find & review, Trends, Categories and exports).\n\nYou can restore the archive later from this tab.`,
      confirmLabel: 'Archive',
    })
    if (!ok) return
    setState({ loading: true, message: 'Archiving…' })
    try {
      const done = await api.createArchive({ start, end })
      setState({ ok: true, message: `Archive ${done.name} saved: ${contents(done.counts)} moved out of the app.` })
      setPreview(null)
      loadList()
    } catch (e) {
      setState({ ok: false, message: e.message })
    }
  }

  async function restore(a) {
    const ok = await confirm({
      title: `Restore archive ${a.name}?`,
      description: `${contents(a.counts)} will be put back in the app.\n\nIf a ticket was reviewed again since it was archived, the newer review stays current and the restored ones become its previous versions.`,
      confirmLabel: 'Restore',
    })
    if (!ok) return
    setState({ loading: true, message: `Restoring ${a.name}…` })
    try {
      const done = await api.restoreArchive(a.name)
      setState({
        ok: true,
        message: `Archive ${a.name} restored: ${plural(done.added.reviews, 'review')}, ${plural(done.added.comments, 'comment')} and ${plural(done.added.links, 'related link')} are back in the app.`,
      })
      loadList()
    } catch (e) {
      setState({ ok: false, message: e.message })
    }
  }

  async function remove(a) {
    const ok = await confirm({
      title: `Delete archive ${a.name}?`,
      description: a.restored
        ? `The archive file is deleted permanently. Its data was restored and stays in the app; only this record and its download are removed.\n\nThis can't be undone.`
        : `The archive file and everything in it (${contents(a.counts)}) are deleted permanently. This data is no longer in the app, so it can't be restored afterwards. Download a copy first if you may need it.\n\nThis can't be undone.`,
      confirmLabel: 'Delete archive',
      destructive: true,
      typeToConfirm: 'DELETE',
    })
    if (!ok) return
    setState({ loading: true, message: `Deleting ${a.name}…` })
    try {
      await api.deleteArchive(a.name)
      setState({ ok: true, message: `Archive ${a.name} deleted.` })
      loadList()
    } catch (e) {
      setState({ ok: false, message: e.message })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="size-4" /> Archive tickets closed in a date range
          </CardTitle>
          <CardDescription>
            Moves the app’s data for tickets that were closed in Zendesk between the two dates (both included) into an
            archive file named after the dates: every review and its previous versions, score edits, reviewer comments
            and related links. The data leaves Saved reviews, Find &amp; review, Trends, Categories and exports, and can
            be restored here. Tickets that are only Solved, not yet Closed, are not included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="archive-start">Start date</Label>
              <DatePicker id="archive-start" value={start} max={end || today} onChange={setStart} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archive-end">End date</Label>
              <DatePicker id="archive-end" value={end} min={start || undefined} max={today} onChange={setEnd} />
            </div>
            <Button variant="outline" onClick={check} disabled={!valid || busy}>
              {busy && !preview ? <Spinner /> : <Search />} Check
            </Button>
            <Button onClick={archive} disabled={!previewCurrent || !preview.counts.tickets || busy}>
              <Archive /> Archive
            </Button>
          </div>
          {name && (
            <p className="text-sm">
              Archive name: <span className="font-mono font-medium">{name}</span>
              {start > end && <span className="text-destructive ms-2">The start date must be on or before the end date.</span>}
            </p>
          )}
          {previewCurrent && (
            <div className="bg-muted/40 rounded-md border p-3 text-sm">
              <p>
                <b>{plural(preview.counts.closedTickets, 'ticket')}</b> in the app {preview.counts.closedTickets === 1 ? 'was' : 'were'} closed in Zendesk between{' '}
                {formatDate(preview.start)} and {formatDate(preview.end)}.
              </p>
              {preview.counts.tickets ? (
                <p>
                  Will archive: <b>{contents(preview.counts)}</b>.
                </p>
              ) : (
                <p className="text-muted-foreground">None of them have reviews, comments or links in the app, so there is nothing to archive.</p>
              )}
            </div>
          )}
          {!previewCurrent && valid && !busy && (
            <p className="text-muted-foreground text-xs">Choose Check to see what will be archived before archiving.</p>
          )}
          <StatusAlert state={state} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Archives</CardTitle>
          <CardDescription>
            Saved on the server in <code>server/data/archives</code>. Download keeps a copy of the JSON file; Restore puts
            the data back in the app; Delete removes the archive file permanently (type DELETE to confirm). Restored
            archives stay listed as a record until deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listError ? (
            <StatusAlert state={{ ok: false, message: listError }} />
          ) : !archives ? (
            <Spinner />
          ) : !archives.length ? (
            <p className="text-muted-foreground text-sm">No archives yet.</p>
          ) : (
            <Table className="[&_td]:align-top [&_td]:whitespace-normal">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Closed between</TableHead>
                  <TableHead>Archived</TableHead>
                  <TableHead>Contents</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archives.map(a => (
                  <TableRow key={a.name}>
                    <TableCell className="font-mono font-medium">
                      {a.name}
                      {a.restored && (
                        <Badge variant="outline" className="text-muted-foreground ms-2 font-sans" title={`Restored ${formatDateTime(a.restoredAt)}`}>
                          Restored
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="!whitespace-nowrap">
                      {formatDate(a.start)} – {formatDate(a.end)}
                    </TableCell>
                    <TableCell className="text-muted-foreground !whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell className="min-w-56 text-xs">{contents(a.counts)}</TableCell>
                    <TableCell className="text-muted-foreground !whitespace-nowrap text-xs">{kb(a.size)}</TableCell>
                    <TableCell className="!whitespace-nowrap text-end">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={api.archiveDownloadUrl(a.name)} download={`${a.name}.json`}>
                          <Download /> Download
                        </a>
                      </Button>
                      {!a.restored && (
                        <Button variant="ghost" size="sm" onClick={() => restore(a)} disabled={busy}>
                          <ArchiveRestore /> Restore
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => remove(a)}
                        disabled={busy}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
