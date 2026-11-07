// Settings › Hard rules: a read-only list of the rules built into the app's code. For information
// only; none of them can be changed in Settings. Keep in step with the server files named below.
import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TONE } from '@/lib/tones'

const HARD_RULES = [
  {
    title: 'Tickets created before 2026 are ignored',
    summary: 'Any ticket created before 1 January 2026 (UTC) is ignored entirely, including old Closed tickets.',
    points: [
      'Left out of every Quality Review and Metadata QC search.',
      'Can’t be reviewed or re-reviewed: single, batch and re-review are refused before the AI runs.',
      'Shown as “Ignored · before 2026” where it still appears: a ticket looked up by number, Saved reviews, and Ignored tickets (reason “Created before 2026”). It can’t be unignored.',
      'Ticket Inspector and the subject timeline pop-up can still open it, for reading only.',
    ],
    applies: ['Quality Review', 'Metadata QC', 'Ignored tickets'],
    source: 'server/hard-rules.js',
  },
  {
    title: 'An emailed reply saved as an internal note counts as a reply to the client',
    summary:
      'When an agent replies by email, Zendesk can save the reply as a private comment, but the email still went to everyone on the thread. Internal teams such as VAM, Billing or Activation are often on the same email and ticket.',
    points: [
      'The AI is told never to conclude that the agent failed to reply to or follow up with the client because the reply is an internal note.',
      'These comments are judged as replies to the client and count toward follow-up and resolution.',
      'Only private comments from agents that came in by email count. An end-user’s email saved as a private comment (e.g. a copied client) does not.',
      'Recipients ending in extremereach.com or adstream.com are XR; any other address is external (client). Only domains and counts are sent to the AI, not addresses.',
      'Timelines mark these comments “Email reply” (“· client copied” when external recipients were on the email).',
    ],
    applies: ['Quality Review scoring', 'Ticket Inspector QC'],
    source: 'server/email-notes.js',
  },
]

const BUILT_IN = [
  {
    title: 'Solved and Closed tickets always get Resolution Accuracy',
    text: 'In Ticket Inspector, a Solved or Closed ticket is always assessed for Resolution Accuracy; the AI is asked a second time if it skips it.',
    source: 'server/inspector-qc.js',
  },
  {
    title: 'Only agents’ own comments get QC comments',
    text: 'Comments from customers, triggers, automations, API integrations and automatic call logs are not QC’d in Ticket Inspector.',
    source: 'server/inspector-qc.js',
  },
  {
    title: 'Former agents count as agents',
    text: 'Someone who wrote an internal note or moved the assignee or group on a ticket is treated as an agent there, even if Zendesk now lists them as an end-user (“Agent (former)”).',
    source: 'server/inspector.js',
  },
  {
    title: 'Scores are recalculated by the app',
    text: 'Weighted scores, the total and the rating band are worked out by the app, not taken from the AI. Edited scores must be whole numbers from 1 to 5.',
    source: 'server/ollama.js, server/reviews.js',
  },
  {
    title: 'Signature logos are skipped',
    text: 'Images under 5 KB, or smaller than 100 px on the short side or 250 px on the long side, are not sent to the AI.',
    source: 'server/images.js',
  },
  {
    title: 'Ignored tickets are never reviewed',
    text: 'Whatever the route (single, batch or re-review). Which tickets are ignored is up to you: by hand, or with the subject rules under Quality Review.',
    source: 'server/reviews.js',
  },
  {
    title: 'Ticket Inspector QC is never saved',
    text: 'QC comments, Comprehension and Resolution Accuracy in Ticket Inspector are shown only and never stored.',
    source: 'server/inspector-qc.js',
  },
]

const Source = ({ children }) => (
  <p className="text-muted-foreground text-xs">
    Defined in <code>{children}</code>
  </p>
)

export default function HardRules() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" /> Hard rules
          </CardTitle>
          <CardDescription>
            For information only. These rules are written into the app’s code and apply to everyone. They can’t be
            turned off or changed here; ask the app’s maintainer if one needs to change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {HARD_RULES.map((r, i) => (
            <section key={r.title} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={TONE.warning}>
                  Hard rule {i + 1}
                </Badge>
                <h3 className="font-medium">{r.title}</h3>
              </div>
              <p className="text-sm">{r.summary}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {r.points.map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-muted-foreground text-xs">Applies to</span>
                {r.applies.map(a => (
                  <Badge key={a} variant="outline" className={TONE.muted}>
                    {a}
                  </Badge>
                ))}
              </div>
              <Source>{r.source}</Source>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other built-in behaviour</CardTitle>
          <CardDescription>Fixed ways the app works that aren’t labelled as hard rules but can’t be changed in Settings either.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {BUILT_IN.map(b => (
              <li key={b.title} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{b.title}</p>
                <p className="text-sm">{b.text}</p>
                <Source>{b.source}</Source>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
