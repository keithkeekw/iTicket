// QA Rubrics: the Ticket Quality Review rubric, built live from the reviewer instructions in
// Settings (so it always matches what the AI is told), plus the Metadata QC field requirements.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Pencil } from 'lucide-react'
import { Spinner, StatusAlert } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { parseRubric } from '@/lib/rubric'
import { formatDate, isoDay } from '@/lib/dates'
import { downloadPdf } from '@/lib/pdf'
import { RATING_BANDS } from '@/lib/scoring'
import { RATING_TONE, SCORE_TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { api } from '../api.js'

// Distinct colours for the category weight bar (theme-aware via the chart-friendly palette).
const CATEGORY_COLORS = ['bg-info', 'bg-success', 'bg-warning', 'bg-destructive', 'bg-primary', 'bg-muted-foreground']

const pct = w => `${Math.round(w * 1000) / 10}%`

// App rating bands as "min–max" ranges, for comparison with the instructions.
const APP_BANDS = RATING_BANDS.map(([min, rating], i) => ({
  rating,
  min,
  max: i === 0 ? 5 : Math.round((RATING_BANDS[i - 1][0] - 0.01) * 100) / 100,
}))

// True when the instructions' bands start at different scores from the app's (Poor is the
// floor, so only the other bands' lower limits matter).
function bandsDiffer(fromText) {
  if (!fromText.length) return false
  return APP_BANDS.filter(a => a.rating !== 'Poor').some(a => {
    const t = fromText.find(b => b.rating.toLowerCase() === a.rating.toLowerCase())
    return !t || Math.abs(t.min - a.min) > 0.001
  })
}

export default function QARubrics({ active }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const pageRef = useRef(null)

  // Re-read on every visit so the rubric reflects the latest saved instructions.
  useEffect(() => {
    if (!active) return
    api
      .getSettings()
      .then(setSettings)
      .catch(e => setError(e.message))
  }, [active])

  const rubric = useMemo(() => (settings ? parseRubric(settings.ollama.prompt) : null), [settings])

  if (error) return <StatusAlert state={{ ok: false, message: error }} />
  if (!rubric) return <Spinner className="size-6" />

  // Saves the rubric as a PDF (without the Date Rules and Metadata QC requirements cards).
  async function download() {
    setDownloading(true)
    setDownloadError('')
    try {
      await downloadPdf(pageRef.current, `QA-Rubrics-${isoDay(new Date())}.pdf`)
    } catch (e) {
      setDownloadError(`Could not create the PDF: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  const editLink = (
    <Link to="/settings?tab=prompts" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
      <Pencil /> Edit in Settings
    </Link>
  )
  const bands = rubric.bands.length
    ? rubric.bands
    : APP_BANDS.map(b => ({ min: b.min, max: b.max, rating: b.rating }))
  const scale = rubric.scale.length
    ? rubric.scale
    : [1, 2, 3, 4, 5].map(score => ({ score, label: ['Poor', 'Below Standard', 'Acceptable', 'Good', 'Excellent'][score - 1] }))
  const required = settings.qc.requiredFields

  return (
    <div ref={pageRef} className="mx-auto max-w-6xl space-y-6">
      <div data-pdf-block className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">QA Rubrics</h1>
          <p data-pdf-only className="text-muted-foreground hidden text-xs">
            iTicket · downloaded {formatDate(isoDay(new Date()))}
          </p>
          <p className="text-muted-foreground text-sm">
            How tickets are judged. The Quality Review rubric is read from the AI review instructions in Settings →
            Prompt Management, so it always matches what the AI is asked to apply.
          </p>
        </div>
        <div data-pdf-exclude className="flex gap-2">
          <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
            {downloading ? <Spinner /> : <Download />} Download
          </Button>
          {editLink}
        </div>
      </div>
      {downloadError && (
        <div data-pdf-exclude>
          <StatusAlert state={{ ok: false, message: downloadError }} />
        </div>
      )}

      {!rubric.categories.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Reviewer instructions</CardTitle>
            <CardDescription>
              The instructions don&apos;t list categories as &quot;1. Name – 10%&quot;, so they are shown as written.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap">{settings.ollama.prompt}</pre>
          </CardContent>
        </Card>
      ) : (
        <>
          {rubric.intro.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ticket Quality Review (TQR)</CardTitle>
                <CardDescription>How the reviewer approaches each ticket.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {rubric.intro.map((p, i) => (
                  <div key={i} className="space-y-1">
                    {p.label && <h3 className="text-sm font-medium">{p.label}</h3>}
                    <p className="text-muted-foreground text-sm">{p.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Category weights</CardTitle>
              <CardDescription>
                Each category is scored 1–5 and multiplied by its weight; the weighted scores add up to the final
                score out of 5.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex h-4 w-full overflow-hidden rounded-full" role="img" aria-label="Category weights">
                {rubric.categories.map((c, i) => (
                  <div
                    key={c.name}
                    className={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                    style={{ width: `${c.weight * 100}%` }}
                    title={`${c.name}: ${pct(c.weight)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                {rubric.categories.map((c, i) => (
                  <span key={c.name} className="inline-flex items-center gap-1.5">
                    <span className={cn('size-2.5 rounded-sm', CATEGORY_COLORS[i % CATEGORY_COLORS.length])} />
                    {c.name} <span className="text-muted-foreground tabular-nums">{pct(c.weight)}</span>
                  </span>
                ))}
              </div>
              {rubric.totalWeight !== 100 && (
                <StatusAlert
                  state={{ ok: false, message: `The category weights add up to ${rubric.totalWeight}%, not 100%.` }}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {rubric.categories.map((c, i) => (
              <Card key={c.name} className={cn(c.definitions.length && 'lg:col-span-2')}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-background inline-flex size-6 items-center justify-center rounded-full text-xs',
                        CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      )}
                    >
                      {c.number}
                    </span>
                    {c.name}
                  </CardTitle>
                  <CardAction>
                    <Badge variant="secondary" className="tabular-nums">
                      {pct(c.weight)} weight
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
                      What is assessed
                    </h4>
                    <ul className="ms-4 list-disc space-y-1">
                      {c.criteria.map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  {c.definitions.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead>Definition</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.definitions.map(d => (
                          <TableRow key={d.term}>
                            <TableCell className="font-medium">{d.term}</TableCell>
                            <TableCell className="whitespace-normal">{d.text}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scoring scale</CardTitle>
            <CardDescription>Each category is given one whole score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...scale].reverse().map(s => (
              <div key={s.score} className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className={cn('w-12 justify-center tabular-nums', SCORE_TONE[s.score])}>
                  {s.score}/5
                </Badge>
                {s.label}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overall rating</CardTitle>
            <CardDescription>From the final weighted score (maximum 5.00).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Final score</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bands.map(b => (
                  <TableRow key={b.rating}>
                    <TableCell className="tabular-nums">
                      {b.min.toFixed(2)} – {b.max.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RATING_TONE[b.rating]}>
                        {b.rating}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {bandsDiffer(rubric.bands) && (
              <StatusAlert
                state={{
                  ok: false,
                  message:
                    'These bands differ from the ones the app uses to calculate ratings (4.50 Excellent, 3.50 Good, 2.50 Acceptable, 1.50 Below Standard).',
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {rubric.sections.length > 0 && (
        <div data-pdf-grid className="grid gap-4 lg:grid-cols-2">
          {rubric.sections.map(s => (
            // Date Rules are internal guidance for the AI, so they are left out of the PDF.
            <Card key={s.title} {...(/^date rules?$/i.test(s.title.trim()) ? { 'data-pdf-exclude': '' } : {})}>
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="ms-4 list-disc space-y-1 text-sm">
                  {/* Lines ending in ":" introduce lists shown elsewhere (e.g. the rating bands). */}
                  {s.items
                    .filter(item => !item.endsWith(':'))
                    .map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card data-pdf-exclude>
        <CardHeader>
          <CardTitle>Metadata QC requirements</CardTitle>
          <CardDescription>
            Fields a ticket must have filled in.{' '}
            {settings.qc.followFormConditions
              ? 'A field only counts when Zendesk shows it on the ticket’s form (for example, XR Pay fields only for the XR PAY portfolio); otherwise it is N/A.'
              : 'Every field is required on every ticket.'}
          </CardDescription>
          <CardAction>
            <Link to="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Pencil /> Edit
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {required.length ? (
            <div className="flex flex-wrap gap-2">
              {required.map(f => (
                <Badge key={f.key} variant="outline" className="h-auto py-1 whitespace-normal">
                  {f.label}
                  <span className="text-muted-foreground font-normal">{f.kind === 'custom' ? 'custom' : 'standard'}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No required fields are set.</p>
          )}
          {settings.qc.emptyValues.length > 0 && (
            <p className="text-muted-foreground">
              Also counted as empty: {settings.qc.emptyValues.map(v => `“${v}”`).join(', ')}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
