// Settings › Prompt Management: the instructions the AI follows, in one place for admins.
// Two are editable (the Quality Review reviewer instructions and the Ticket Inspector feedback
// instructions); each shows the full prompt actually sent, including the parts the app adds.
// The other built-in prompts are shown read-only. Edits are saved with "Save all settings".
import { useEffect, useState } from 'react'
import { Lock, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { TONE } from '@/lib/tones'
import { api } from '../api.js'

const PREVIEW_DELAY_MS = 500

// Collapsible, read-only view of a full prompt.
function FullPrompt({ title, text, note }) {
  return (
    <details className="group rounded-md border px-3 py-2 text-sm [&[open]]:bg-muted/30">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        <span className="font-medium">{title}</span>
        {text != null && (
          <span className="text-muted-foreground text-xs tabular-nums">{text.length.toLocaleString()} characters</span>
        )}
      </summary>
      {note && <p className="text-muted-foreground mt-2 text-xs">{note}</p>}
      {text == null ? (
        <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
          <Spinner className="size-3" /> Building the prompt…
        </p>
      ) : (
        <pre className="bg-background mt-2 max-h-[60vh] overflow-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </details>
  )
}

function UsedBy({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">Used by</span>
      {items.map(i => (
        <Badge key={i} variant="outline" className={TONE.muted}>
          {i}
        </Badge>
      ))}
    </div>
  )
}

// `ollama` is the settings section being edited, `saved` its last saved version, and `onChange`
// patches it (saved with the other settings by the page's "Save all settings").
export default function PromptManagement({ ollama, saved, onChange }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  // Rebuild the full prompts shortly after the text stops changing.
  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .previewPrompts({ prompt: ollama.prompt, feedbackPrompt: ollama.feedbackPrompt })
        .then(p => {
          setPreview(p)
          setError('')
        })
        .catch(e => setError(e.message))
    }, PREVIEW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [ollama.prompt, ollama.feedbackPrompt])

  const changed = key => saved && ollama[key] !== saved[key]
  const unsaved = <span className="text-warning text-xs font-medium">Unsaved changes — press Save all settings below.</span>
  const isDefaultFeedback = preview && ollama.feedbackPrompt === preview.defaults.feedbackPrompt

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        The instructions the AI follows, in one place. Edit the two prompts below and press <b>Save all settings</b>.
        Under each, <b>Full prompt sent to the AI</b> shows exactly what the model receives, including the parts the
        app adds itself (marked <Lock className="inline size-3" /> below), which keep the output in the format the app
        needs and apply the hard rules.
        {error && <span className="text-destructive"> The full-prompt preview could not be built: {error}</span>}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>AI review instructions</CardTitle>
          <CardDescription>
            How to judge a ticket: the reviewer&apos;s role, the evaluation categories with their % weights, and the
            scoring rules. The category sections are also the QA rubric for the Ticket Inspector QC comments and
            feedback, and the QA Rubrics page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <UsedBy items={['Quality Review scoring', 'Ticket Inspector QC comments', 'Ticket Inspector feedback', 'QA Rubrics page']} />
          <Textarea
            aria-label="AI review instructions"
            className="max-h-[75vh] min-h-[30rem] resize-y text-sm leading-relaxed"
            value={ollama.prompt}
            onChange={e => onChange({ prompt: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Keep each category as a numbered heading with its weight (e.g. “2. Troubleshooting &amp; Documentation
              Quality – 35%”); the app reads these headings. Weighted scores and the rating bands are calculated by the
              app.
            </p>
            {changed('prompt') && unsaved}
          </div>
          <FullPrompt
            title="Full prompt sent to the AI (Quality Review)"
            text={preview?.review}
            note="🔒 Added by the app after your instructions: the email-reply hard rule and the JSON output format. The ticket itself (details, timeline, conversation, side conversations, images and metadata) is sent separately as the message to review."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ticket feedback instructions</CardTitle>
          <CardDescription>
            How the AI writes Feedback for the agents in Ticket Inspector: its tone, what to cover and how much. Keep
            the five parts (overall, went_well, to_improve with a suggestion, next_time, agents), which the page
            displays.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              disabled={!preview || isDefaultFeedback}
              onClick={() => onChange({ feedbackPrompt: preview.defaults.feedbackPrompt })}
              title="Replace the text with the original feedback instructions (press Save all settings to keep it)"
            >
              <RotateCcw /> Reset to default
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <UsedBy items={['Ticket Inspector feedback']} />
          <Textarea
            aria-label="Ticket feedback instructions"
            className="max-h-[60vh] min-h-[18rem] resize-y text-sm leading-relaxed"
            value={ollama.feedbackPrompt ?? ''}
            onChange={e => onChange({ feedbackPrompt: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {isDefaultFeedback ? 'Using the default instructions.' : 'Customised.'} Left empty, the default
              instructions are used.
            </p>
            {changed('feedbackPrompt') && unsaved}
          </div>
          <FullPrompt
            title="Full prompt sent to the AI (Ticket Inspector feedback)"
            text={preview?.feedback}
            note="🔒 Added by the app after your instructions: the QA rubric sections from the AI review instructions, the agents on the ticket, the email-reply hard rule, and the output format (including how comments are referenced for the timeline links). The ticket history is sent separately."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" /> Other built-in prompts
          </CardTitle>
          <CardDescription>
            For information. These are written into the app and built from the AI review instructions above, so
            changing the category sections there changes them too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <FullPrompt
            title="Ticket Inspector: QC comments on each agent comment"
            text={preview?.commentQc}
            note="Troubleshooting & Documentation Quality, Professional Communication and Business English Quality for each public reply or internal note an agent wrote."
          />
          <FullPrompt
            title="Ticket Inspector: Comprehension and Resolution Accuracy"
            text={preview?.ticketQc}
            note="The two cards under the ticket header, judged on the ticket as a whole."
          />
        </CardContent>
      </Card>
    </div>
  )
}
