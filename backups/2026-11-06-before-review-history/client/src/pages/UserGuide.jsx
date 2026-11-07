// User Guide: how to use each part of XR Ticket Insight. Static content with a contents list.
import {
  Ban,
  ArrowUpDown,
  Eye,
  EyeOff,
  Link2,
  Mail,
  MessageSquare,
  PenLine,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'getting-started', title: 'Getting started (Settings)' },
  { id: 'metadata-qc', title: 'Metadata QC' },
  { id: 'find-review', title: 'Quality Review: find & review' },
  { id: 'saved-reviews', title: 'Quality Review: saved reviews' },
  { id: 'ignored-tickets', title: 'Quality Review: ignored tickets' },
  { id: 'ticket-inspector', title: 'Ticket Inspector' },
  { id: 'related-comments', title: 'Related tickets & comments' },
  { id: 'rubrics', title: 'QA Rubrics' },
  { id: 'tables', title: 'Working with tables' },
  { id: 'icons', title: 'Icons & indicators' },
  { id: 'whats-new', title: "What's New & appearance" },
  { id: 'tips', title: 'Tips & good practice' },
  { id: 'faq', title: 'FAQs' },
  { id: 'data-handling', title: 'Data handling' },
]

// Frequently asked questions, grouped by topic. Each answer is JSX so it can use bold text and links.
// A function, so the answers are built at render time (PageLink is defined further down this file).
const faqGroups = () => [
  {
    topic: 'Reviews & scores',
    items: [
      {
        q: 'The agent replied to the client, so why does the review say they didn’t?',
        a: (
          <>
            Check whether the reply was sent <b>by email</b>. Zendesk often saves an agent&apos;s email reply as a{' '}
            <b>private comment</b>, even though the email went to the client and any internal teams on the thread (VAM,
            Billing, Activation…). The AI treats these as replies to the client (a hard rule), and timelines mark them{' '}
            <b>Email reply</b>. Reviews saved before this rule was added may still say otherwise; <b>Re-review</b> the
            ticket to apply it.
          </>
        ),
      },
      {
        q: 'Why did the same ticket get a different score when I re-reviewed it?',
        a: (
          <>
            The AI reads the ticket afresh each time, so scores can move slightly between runs. A temperature of 0 in{' '}
            Settings › AI model keeps them steadier. If you disagree with a score, use <b>Edit scores</b> with a
            justification rather than re-reviewing until it changes.
          </>
        ),
      },
      {
        q: 'How is the final score worked out?',
        a: (
          <>
            Each rubric category is scored 1–5 and multiplied by its weight (e.g. Troubleshooting 35%). The weighted
            scores add up to the final score out of 5, which sets the rating: Excellent 4.50+, Good 3.50+, Acceptable
            2.50+, Below Standard 1.50+, otherwise Poor. The app does this arithmetic itself, for AI scores and edited
            scores alike, so the AI can&apos;t miscalculate it.
          </>
        ),
      },
      {
        q: 'If I edit scores and then re-review the ticket, is my edit kept?',
        a: (
          <>
            No. A re-review replaces the old review, and the old review&apos;s <b>score edits and justifications are
            removed with it</b>. Reviewer comments and related-ticket links are kept, because they belong to the ticket.
            If an edit matters, note it in a reviewer comment or export a CSV before re-reviewing.
          </>
        ),
      },
      {
        q: 'What does a red ticket number mean?',
        a: (
          <>
            The ticket was <b>re-opened in Zendesk after it was reviewed</b>, so the review may be out of date. Hover
            the number for details, and use the <b>Re-review → Needs re-review</b> filter in Saved reviews to list them
            all.
          </>
        ),
      },
      {
        q: 'Why can’t I review a ticket?',
        a: (
          <>
            It is ignored. The badge says why: <b>Ignored</b> (flagged by hand; you can unignore it),{' '}
            <b>Ignored · rule</b> (its subject matches an auto-ignore rule in Settings › Quality Review), or{' '}
            <b>Ignored · before 2026</b> (created before 1 January 2026, a hard rule). Hover the badge for details.
          </>
        ),
      },
    ],
  },
  {
    topic: 'Ignoring tickets & hard rules',
    items: [
      {
        q: 'How do I stop a whole type of ticket from being reviewed, e.g. out-of-office replies?',
        a: (
          <>
            Add a rule under <PageLink to="/settings">Settings</PageLink> › Quality Review › <b>Auto-ignore by subject</b>,
            such as <i>Subject contains</i> “Out of office”. Use <b>Test a subject</b> to check it before saving. Matching
            tickets are ignored straight away, including in Saved reviews.
          </>
        ),
      },
      {
        q: 'Can a ticket created before 2026 be unignored?',
        a: (
          <>
            No. That is a hard rule built into the app, not a setting. Such tickets can still be opened in Ticket
            Inspector or the timeline pop-up to read them. Settings › <b>Hard rules</b> lists every rule of this kind.
          </>
        ),
      },
      {
        q: 'Where can I see every ignored ticket?',
        a: (
          <>
            Quality Review › <b>Ignored tickets</b>. Filter by reason (by hand, subject rule, before 2026); tickets
            ignored by hand can be unignored there.
          </>
        ),
      },
    ],
  },
  {
    topic: 'Reports & exports',
    items: [
      {
        q: 'Does Export CSV export everything, or only what I have filtered?',
        a: (
          <>
            Only what matches your <b>search and filters</b>, but <b>all</b> of it: every page, with no limit, in the
            current sort order. In Saved reviews the table shows at most the newest 1,000 matches; when more match, a
            notice says so, and Export CSV still includes them all.
          </>
        ),
      },
      {
        q: 'Why is the Category field empty in the Categories tab?',
        a: (
          <>
            The Zendesk field called <b>Category</b> isn&apos;t filled in on the reviewed tickets. The tab starts with{' '}
            <b>Generic Ticket Type</b>, which most tickets have. The <b>Group by</b> list shows how many reviewed
            tickets use each field, so pick one near the top (e.g. Topic or a product field).
          </>
        ),
      },
      {
        q: 'Why do Trends and Categories show different numbers from Saved reviews?',
        a: (
          <>
            Trends and Categories count <b>each ticket once</b>, using its latest review. Saved reviews lists every
            saved review, so a ticket reviewed twice (without Re-review) appears twice there. Check the date basis too:
            Trends can group by reviewed date or solved date.
          </>
        ),
      },
    ],
  },
  {
    topic: 'Ticket Inspector',
    items: [
      {
        q: 'Are Ticket Inspector QC comments saved?',
        a: (
          <>
            No. They are written fresh each time and disappear when you retrieve another ticket. To keep them, use{' '}
            <b>Save as image</b>, or review the ticket in Quality Review, which is saved.
          </>
        ),
      },
      {
        q: 'Why is the saved image hard to read, or why are some pictures blank?',
        a: (
          <>
            Very long tickets are saved at a lower resolution so they fit in one image; zoom in to read them, or hide
            parts of the timeline with its filters first. Pictures inside Zendesk comments can come out blank when
            Zendesk doesn&apos;t allow them to be copied; the text is always included. Press <b>Expand all messages</b>{' '}
            first to include long messages in full. <b>Safari</b> (and every browser on iPhone/iPad) allows smaller
            images than Chrome, Edge or Firefox, so long tickets come out at a lower resolution there; use Chrome or
            Edge for the sharpest image.
          </>
        ),
      },
    ],
  },
  {
    topic: 'Settings & connection',
    items: [
      {
        q: 'Should I use an API token or OAuth to connect to Zendesk?',
        a: (
          <>
            Either works, and only one is active at a time (Settings › Connections). Zendesk is moving away from API
            tokens, so set up an <b>OAuth client</b>, press <b>Test</b>, then switch to it when it works.
          </>
        ),
      },
      {
        q: 'I added a group or ticket field in Zendesk. Why don’t I see it?',
        a: (
          <>
            Groups, ticket fields and ticket forms are remembered for up to <b>10 minutes</b> to keep searches fast.
            Wait a few minutes, or press <b>Save all settings</b> in Settings to refresh them immediately.
          </>
        ),
      },
      {
        q: 'Reviews fail with an AI or Ollama error. What should I check?',
        a: (
          <>
            In Settings › AI model, make sure AI review is turned on, a model is selected and the Ollama address is
            correct (use the model list to test it). Then try again; very long tickets can also time out, in which case
            a smaller context size or fewer images can help.
          </>
        ),
      },
    ],
  },
  {
    topic: 'General',
    items: [
      {
        q: 'Does the app change anything in Zendesk?',
        a: (
          <>
            No. It only <b>reads</b> from Zendesk. Reviews, scores, ignored tickets, comments and related links are
            stored in the app&apos;s own database, never written back to tickets.
          </>
        ),
      },
      {
        q: 'Does the app work on a Mac?',
        a: (
          <>
            Yes. It runs on Windows, macOS and Linux with <b>Node.js 24 or newer</b> and Ollama installed. Copy the
            project without its <code>node_modules</code> and <code>dist</code> folders, then run{' '}
            <code>npm install</code>, <code>npm run build</code> and <code>npm start</code>, and open{' '}
            <code>http://localhost:8765</code>. Copy <code>server/data</code> as well to keep existing reviews and
            settings; it contains the Zendesk credentials, so move it securely. The README has the full steps. Any
            browser works; in Safari, very long tickets are saved as images at a lower resolution.
          </>
        ),
      },
      {
        q: 'Why are my filters still set after I closed the app?',
        a: (
          <>
            Filters, sorting choices and options are remembered in your browser so you can pick up where you left off.
            Use <b>Clear filters</b> to reset them.
          </>
        ),
      },
      {
        q: 'How do I find out what changed in the app?',
        a: (
          <>
            Open <PageLink to="/whats-new">What&apos;s New</PageLink> from the button beside the Dark switch. A blue dot
            on it means there are changes since your last visit.
          </>
        ),
      },
    ],
  },
]

// One question that opens to show its answer.
function Faq({ q, children }) {
  return (
    <details className="group rounded-md border px-3 py-2 [&[open]]:bg-muted/40">
      <summary className="flex cursor-pointer list-none items-start gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground mt-0.5 transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        <span>{q}</span>
      </summary>
      <div className="text-muted-foreground mt-2 ps-4">{children}</div>
    </details>
  )
}

function Section({ id, title, children }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed [&_li]:mt-1 [&_ol]:ms-5 [&_ol]:list-decimal [&_ul]:ms-5 [&_ul]:list-disc">
        {children}
      </CardContent>
    </Card>
  )
}

const H = ({ children }) => <h3 className="pt-1 font-medium">{children}</h3>
const PageLink = ({ to, children }) => (
  <Link to={to} className="font-medium underline underline-offset-4">
    {children}
  </Link>
)

const ICONS = [
  { icon: <Mail className="text-info size-4" />, name: 'Side conversation', where: 'After a ticket subject', meaning: 'The ticket has side conversations (the number shows when more than one). They are included in AI reviews.' },
  { icon: <RotateCcw className="text-warning size-4" />, name: 'Re-opened', where: 'After a ticket subject', meaning: 'Zendesk recorded the ticket being re-opened after it was solved (number shows when more than once).' },
  { icon: <span className="text-destructive text-sm font-semibold">#1683509</span>, name: 'Red ticket number', where: 'Ticket column', meaning: 'The ticket was re-opened after it was reviewed. Hover to see how many times and since which review. Filter them with Re-review → Needs re-review (Saved reviews) or Review states → Needs re-review (Find &amp; review).' },
  { icon: <Badge variant="outline" className="text-muted-foreground gap-1"><Ban className="size-3" /> Ignored</Badge>, name: 'Ignored ticket', where: 'After the status / subject', meaning: 'The ticket will not be reviewed (single, batch or re-review). “Ignored” was flagged by hand and can be unignored; “Ignored · rule” matches an auto-ignore subject rule in Settings › Quality Review; “Ignored · before 2026” was created before 2026 and is always ignored — hover for details.' },
  { icon: <Badge variant="outline" className={TONE.info}>Email reply · client copied</Badge>, name: 'Email reply', where: 'On a private comment (timelines)', meaning: 'An agent’s email reply that Zendesk saved as a private comment. The email went to everyone on the thread (“client copied” when non-XR addresses were on it), so the AI review counts it as a reply to the client. Hover for the recipients’ domains.' },
  { icon: <Link2 className="size-4" />, name: 'Related tickets', where: 'Actions', meaning: 'Link Zendesk tickets or Jira issues to this ticket, each with a note. Blue with a number when links exist.' },
  { icon: <MessageSquare className="size-4" />, name: 'Comments', where: 'Actions', meaning: 'Add, edit or delete reviewer comments on the ticket. Pasted links become clickable.' },
  { icon: <Eye className="size-4" />, name: 'View / hide review', where: 'Actions', meaning: 'Open or close the scorecard under the row.' },
  { icon: <Sparkles className="size-4" />, name: 'Review', where: 'Find & review', meaning: 'Run an AI review of a ticket that has not been reviewed yet.' },
  { icon: <RefreshCw className="size-4" />, name: 'Re-review', where: 'Actions', meaning: 'Find & review: adds a new review. Saved reviews: replaces that review once the new one is saved.' },
  { icon: <SquarePen className="size-4" />, name: 'Edit scores', where: 'Saved reviews (Simple)', meaning: 'Change category scores; a written justification is required and kept.' },
  { icon: <PenLine className="text-warning size-4" />, name: 'Edited score', where: 'Score column', meaning: 'A reviewer changed the AI scores by hand. Hover for the latest justification.' },
  { icon: <Trash2 className="size-4" />, name: 'Delete review', where: 'Saved reviews', meaning: 'Permanently delete that saved review (asks first).' },
  { icon: <ArrowUpDown className="size-4" />, name: 'Sort', where: 'Column headers', meaning: 'Click to sort ascending, again for descending, a third time for the original order.' },
  { icon: <span className="text-sm underline underline-offset-4">Subject</span>, name: 'Ticket subject', where: 'Subject column', meaning: 'Click to open the ticket timeline in a pop-up (underlines on hover).' },
  {
    icon: (
      <span className="relative inline-flex rounded-md border p-1">
        <Sparkles className="size-4" />
        <span className="bg-info absolute -top-1 -right-1 size-2 rounded-full" />
      </span>
    ),
    name: "What's New",
    where: 'Top right, beside Dark',
    meaning: "Opens the list of changes to the app. The blue dot means there are changes you haven't seen yet.",
  },
]

export default function UserGuide() {
  const jump = id => e => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[14rem_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <h1 className="text-2xl font-semibold tracking-tight">User Guide</h1>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">How to use XR Ticket Insight.</p>
        <nav aria-label="Guide contents">
          <ol className="space-y-1 text-sm">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={jump(s.id)}
                  className="text-muted-foreground hover:text-foreground flex gap-2 rounded-md px-2 py-1 hover:bg-accent"
                >
                  <span className="tabular-nums">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <Section id="overview" title="1. Overview">
          <p>XR Ticket Insight checks Zendesk tickets in two independent ways:</p>
          <ul>
            <li>
              <PageLink to="/quality-review">Quality Review</PageLink> (the landing page) — an AI model reads each
              ticket&apos;s conversation, status history, side conversations and attached screenshots (PNG/JPEG, up to
              the limit set in Settings → AI model; signature logos are skipped) and scores it against the QA rubric
              (Ticket Quality Review). Each scorecard lists the images it looked at. Every review is saved so you can
              revisit, filter, adjust and export it.
            </li>
            <li>
              <b>Email replies saved as internal notes.</b> When an agent replies by email, Zendesk often stores the
              reply as a private comment, even though the email went to everyone on the thread (the client, and
              internal teams such as VAM, Billing or Activation). The AI review treats these as replies to the client,
              so an agent is never marked down for “not replying” when they answered by email.
            </li>
            <li>
              <PageLink to="/metadata-qc">Metadata QC</PageLink> — checks that the required ticket fields (Portfolio,
              Type, Client List…) are filled in, following each Zendesk form&apos;s rules.
            </li>
          </ul>
          <p>
            <PageLink to="/ticket-inspector">Ticket Inspector</PageLink> shows any ticket&apos;s history as a timeline,
            with AI QC comments on every agent comment. You can also click a ticket&apos;s <b>subject</b> in any table to
            see its timeline in a pop-up. <PageLink to="/qa-rubrics">QA Rubrics</PageLink> shows exactly how tickets are
            judged, and <PageLink to="/settings">Settings</PageLink> holds the connections and rules for everything.
          </p>
          <p>
            The <PageLink to="/whats-new">What&apos;s New</PageLink> button beside the Dark switch lists the app&apos;s new
            features, improvements and bug fixes by date; a blue dot on it means there are changes you haven&apos;t seen yet.
          </p>
        </Section>

        <Section id="getting-started" title="2. Getting started (Settings)">
          <p>Settings is split into tabs. Change anything on any tab, then press <b>Save all settings</b> at the bottom — one click saves every tab. Tabs with unsaved changes show an amber dot, and <b>Discard changes</b> undoes them.</p>
          <ul>
            <li><b>Connections</b> — Zendesk subdomain and sign-in, and the Jira site URL used to link Jira issues. Sign in with an agent email and <b>API token</b> (legacy — Zendesk retires API tokens on 30 April 2027) or with <b>OAuth</b>: a Zendesk admin creates a <i>Confidential</i> client under Admin Center › Apps and integrations › APIs › OAuth clients (read-only scope is enough) and copies its Identifier and Secret here. Use <b>Test API token</b> / <b>Test OAuth</b> to check either one without switching, then turn on the method to use (only one switch can be on — turning one on turns the other off) and <b>Save</b>.</li>
            <li><b>Metadata QC</b> — which groups to check, default statuses, the required fields, values that count as empty (e.g. “-”), and <b>Follow Zendesk form rules</b> (recommended: a field is only required when the ticket&apos;s form shows it).</li>
            <li><b>Quality Review</b> — default statuses, maximum tickets per search, which groups the Quality Review searches, and <b>Auto-ignore by subject</b>: rules such as <i>Subject starts with</i> “[Test]” or <i>Subject contains</i> “Out of office”. Matching tickets are ignored automatically (upper/lower case doesn&apos;t matter). Use <b>Test a subject</b> to check a subject against the rules before saving.</li>
            <li><b>AI model</b> — the Ollama model, context size, temperature and the <b>reviewer instructions</b> (the QA rubric). Lower temperature (e.g. 0) gives steadier scores.</li>
            <li><b>Hard rules</b> — read-only, for information. Lists the rules written into the app&apos;s code that apply to everyone and can&apos;t be changed in Settings: <b>tickets created before 2026 are ignored</b>, and <b>an agent&apos;s emailed reply saved as an internal note counts as a reply to the client</b>. It also lists other built-in behaviour, such as Resolution Accuracy always being assessed on Solved / Closed tickets, scores being recalculated by the app and signature logos being skipped. Nothing on this tab needs saving.</li>
          </ul>
        </Section>

        <Section id="metadata-qc" title="3. Metadata QC">
          <ol>
            <li>Choose the <b>statuses</b> and the <b>date range</b> (it starts at yesterday). With only Solved/Closed the dates are solved dates; otherwise they are last-updated dates.</li>
            <li>Press <b>Run QC</b>. The summary shows how many tickets were checked, complete and missing metadata.</li>
            <li>Narrow the table with <b>Failed / Passed / All</b>, search, and the filters (missing fields, statuses, groups, last updated by, assignees, side conversations, re-opened).</li>
            <li><b>Export CSV</b> downloads every row that matches Failed / Passed / All, the search and the filters (on all pages, not only the one on screen), in the current sort order.</li>
          </ol>
          <p>Tickets created <b>before 2026</b> are never included in a run (hard rule).</p>
          <p>The last run is kept, so the page shows it again next time you open the app.</p>
        </Section>

        <Section id="find-review" title="4. Quality Review: find & review">
          <H>Find tickets</H>
          <ul>
            <li><b>Search</b> by statuses and dates (default: yesterday) across the groups chosen in Settings → Quality Review, or</li>
            <li>type <b>ticket numbers</b> (comma separated) and press <b>Look up</b>.</li>
          </ul>
          <H>Filter the results</H>
          <p>
            Search, statuses, groups, assignees, <b>review states</b> (not reviewed, reviewed, a rating, or{' '}
            <b>Needs re-review</b> — reviewed, then re-opened in Zendesk), side conversations, related tickets and
            ignored. Filters stay on for your next search.
          </p>
          <H>Review</H>
          <ul>
            <li>Review one ticket with <Sparkles className="inline size-4" /> (or <RefreshCw className="inline size-4" /> to review it again).</li>
            <li>Or tick tickets and press <b>Review selected</b>. The header checkbox selects the tickets on the current page; selections on other pages are kept. Two tickets are reviewed at a time; the others show “Queued”. <b>Stop</b> cancels tickets that haven&apos;t started.</li>
            <li>While a review runs, a progress bar fills under the row. It is an estimate based on how long recent reviews took.</li>
          </ul>
          <H>Ignore / Unignore</H>
          <ul>
            <li>Tick tickets and press <b>Ignore</b> to flag them as not to be reviewed (e.g. spam, test or duplicate tickets). They show an <b>Ignored</b> badge, their row is faded and their review button is disabled.</li>
            <li>When you <b>Review selected</b> — including after selecting every ticket — ignored tickets are skipped automatically, and the result says how many were skipped.</li>
            <li>Tick ignored tickets and press <b>Unignore</b> to allow them to be reviewed again. Use the <b>Ignored</b> filter to list ignored or not-ignored tickets, or the <b>Ignored tickets</b> tab to see every ignored ticket in one place.</li>
            <li>The flag belongs to the ticket and is kept between searches. Re-review in Saved reviews is also blocked while a ticket is ignored.</li>
            <li><b>Created before 2026</b> — a hard rule that can&apos;t be switched off: tickets created before 1 January 2026 are left out of every search, can&apos;t be reviewed or re-reviewed, and show <b>Ignored · before 2026</b> when you look one up by number or it has an older saved review. This is mainly for old <b>Closed</b> tickets that still come up in searches.</li>
            <li><b>Ignored by rule</b> — tickets whose subject matches an auto-ignore rule in Settings › Quality Review show <b>Ignored · rule</b> (hover to see which rule) and can&apos;t be reviewed. They can&apos;t be unignored here: change or remove the rule instead. Rules apply straight away to new searches and to Saved reviews.</li>
          </ul>
          <H>The scorecard</H>
          <p>Each review shows a summary, the assignee and resolving agent, the date solved, the 1–5 score and findings for every category, the weighted total and rating, and suggested values for any missing metadata. Weighted scores and the rating are always calculated by the app, not the AI.</p>
          <p><b>Show all reviews / Hide all reviews</b> opens or closes every scorecard in the list at once.</p>
        </Section>

        <Section id="saved-reviews" title="5. Quality Review: saved reviews">
          <p>Every review is saved. The <b>Saved reviews</b> tab has two views:</p>
          <ul>
            <li><b>Simple</b> — one row per review with subject, group, agents and score, plus actions.</li>
            <li><b>Scoring</b> — date/time, ticket, the score for every category, the final score and rating, with an average row.</li>
          </ul>
          <H>Filters</H>
          <p>Search, ratings, groups, assignees, resolving agents, statuses, related tickets, <b>Re-review</b> (tickets re-opened in Zendesk since their review, shown with a red ticket number) and the reviewed date range.</p>
          <H>Average score cards</H>
          <p>Above the table, one card per rubric category shows its <b>average score</b> (out of 5, with its weight) for the reviews currently listed. The cards, the review count and <b>Export CSV</b> all follow the search and filters.</p>
          <H>Re-review (Simple view)</H>
          <p><RefreshCw className="inline size-4" /> runs a fresh review. Once it is saved, the old review is <b>deleted and replaced</b>. If the new review fails, the old one is kept.</p>
          <H>Edit scores (Simple view)</H>
          <ol>
            <li>Press <SquarePen className="inline size-4" /> and choose new scores for the categories you disagree with. The new total and rating are previewed.</li>
            <li>Write a <b>justification</b> (required, at least 10 characters) explaining the change.</li>
            <li>Save. The total and rating are recalculated, the score is marked with <PenLine className="text-warning inline size-4" />, and the change is logged with its justification in the scorecard and CSV.</li>
          </ol>
          <p><b>Export CSV</b> includes every category score and finding, comments and score edits.</p>
          <p>
            <b>How many reviews are exported.</b> Export CSV includes <b>every</b> saved review that matches the search,
            filters and reviewed dates (including Re-review), across all pages and in the current sort order. There is
            no limit. The table itself lists at most the newest 1,000 matching reviews to stay fast. When more match, a
            notice says so (e.g. “Showing the newest 1,000 of 1,350 matching reviews”); the table, averages and score
            cards then cover those 1,000, while Export CSV still includes all 1,350. Narrow the search or dates to see
            older reviews in the table.
          </p>
          <H>Trends</H>
          <p>
            The <b>Trends</b> tab charts the <b>daily average score of each category</b> (and the final score), one
            chart with every category plus one chart per category and a reviews-per-day chart. Choose whether days are
            based on the <b>reviewed date</b> or the <b>solved date</b>, pick a date range (or Last 7 / 30 / 90 days),
            and filter by group, assignee, resolving agent or status. Each ticket counts once (its latest review); hover
            a point to see that day&apos;s averages and how many reviews they are based on.
          </p>
          <H>Categories</H>
          <p>
            The <b>Categories</b> tab shows the <b>average score of each QA rubric category</b>, and the final score,
            for every value of a Zendesk ticket field you choose:
          </p>
          <ul>
            <li><b>Group by</b> — pick any Zendesk drop-down or multi-select field, such as <b>Generic Ticket Type</b> (the default), <b>Topic</b> or a product field. Fields used on the reviewed tickets are listed first, with how many tickets have a value; fields no reviewed ticket uses are listed after them, greyed out. Type to search the list. Your choice is remembered.</li>
            <li>Each row is one value of that field, with how many reviewed tickets have it and their average scores (1–5, coloured like scorecards). Tickets with the field empty are grouped under <b>Not set</b>; tick <b>Hide “Not set”</b> to leave them out. The <b>All tickets</b> row at the bottom is the average of everything listed.</li>
            <li>Click a column heading to sort, e.g. by <b>Final score</b> to find the weakest categories. Click a row to list its tickets, lowest final score first; click a subject to open its timeline.</li>
            <li>Choose <b>All time</b>, or limit it by <b>Reviewed date</b> or <b>Solved date</b>, and filter by group, assignee, resolving agent or status, as in Trends.</li>
            <li>Each ticket counts once (its latest review). Field values are read from Zendesk as they are now, so a ticket re-categorised after its review appears under its new value. In a multi-select field a ticket counts under each value it has. Use <b>Refresh</b> to read them again; otherwise they are kept for 5 minutes.</li>
          </ul>
        </Section>

        <Section id="ignored-tickets" title="6. Quality Review: ignored tickets">
          <p>The <b>Ignored tickets</b> tab lists every ticket that won&apos;t be reviewed:</p>
          <ul>
            <li><b>Created before 2026</b> — saved-review tickets created before 1 January 2026 (always ignored; can&apos;t be unignored).</li>
            <li><b>Ignored by hand</b> — tickets you flagged with <b>Ignore</b> in Find &amp; review, with the date they were ignored.</li>
            <li><b>Subject rule</b> — saved-review tickets whose subject matches an auto-ignore rule in Settings › Quality Review, with the rule that matched. Tickets that match a rule but were never reviewed show as ignored when a search finds them.</li>
          </ul>
          <p>Each row shows the ticket&apos;s current subject, status, group and assignee from Zendesk, and its latest review if it has one. Click the subject to see the timeline. Filter by reason (created before 2026, by hand, subject rule), status, group or assignee, or search.</p>
          <p>To allow tickets to be reviewed again, tick them and press <b>Unignore</b>. Only tickets ignored by hand can be ticked; for a subject rule, change or remove the rule in Settings. Use <b>Refresh</b> after ignoring tickets elsewhere.</p>
        </Section>

        <Section id="ticket-inspector" title="7. Ticket Inspector">
          <p>
            <PageLink to="/ticket-inspector">Ticket Inspector</PageLink> shows one ticket&apos;s full history as a
            timeline, built from its Zendesk audit log and side conversations, with an AI QC comment on every comment
            the agents wrote.
          </p>
          <ol>
            <li>Type a <b>ticket ID</b> (with or without #) and press <b>Retrieve ticket audit</b> (or Enter). Untick <b>Write QC comments (AI)</b> to only retrieve the timeline.</li>
            <li>A <b>progress bar</b> shows each step: the ticket, the audit log, each side conversation, then the QC comments (“Writing QC comments: 6 of 18…”). The timeline appears as soon as it is retrieved, and QC comments fill in as they are written. <b>Stop</b> cancels the rest.</li>
            <li>The header shows the ticket&apos;s current status, group, assignee, requester, priority, type, dates and its side conversations. The ticket number opens it in Zendesk.</li>
            <li>
              The <b>timeline</b> lists everything in time order, grouped by day:
              <ul>
                <li><b>Public comments</b> — white cards.</li>
                <li><b>Private comments</b> (internal notes) — <span className="rounded bg-yellow-100 px-1 dark:bg-yellow-500/20">highlighted in yellow</span>.</li>
                <li><b>Status, group and assignee</b> movements — “from → to”, with who made the change and how (e.g. Web, Email, or the trigger/automation name).</li>
                <li><b>Side conversations</b> — blue cards with the side conversation number, subject and recipients, plus when a side conversation was closed or re-opened.</li>
              </ul>
            </li>
            <li>Comments keep their <b>formatting</b> from Zendesk (bold, lists, links, tables, quotes, inline images). Colours and fonts from emails are removed so text stays readable in dark mode, and anything unsafe (scripts, forms) is stripped.</li>
            <li>Use the filter buttons (each shows its count) to show or hide entry types, switch <b>Oldest first / Newest first</b>, and <b>Expand all messages</b> to show long messages in full.</li>
          </ol>
          <H>QC comments</H>
          <ul>
            <li>Two cards under the ticket header assess the <b>ticket as a whole</b>: <b>Comprehension</b> (the customer&apos;s issue in a sentence or two, a 1–5 score and a QC comment on whether the agents understood it) and <b>Resolution Accuracy</b> (the resolution, a score and a QC comment). Resolution Accuracy is only filled in when the ticket contains a resolution — a fix, an answer, a completed request or a definite outcome — and is always filled in for Solved or Closed tickets (a ticket closed without a real outcome scores low). Otherwise the card is left empty.</li>
            <li>Every public reply and private comment written by an agent gets a <b>QC comment</b> with a 1–5 score and a short note for <b>Troubleshooting &amp; Documentation Quality</b>, <b>Professional Communication</b> and <b>Business English Quality</b>. N/A means the category doesn&apos;t apply to that comment (e.g. troubleshooting in a short acknowledgement).</li>
            <li>The definitions come from the reviewer instructions in Settings → AI model, so they follow the rubric. Public replies are judged as customer-facing; private comments on how well they document the work for other agents. An agent&apos;s <b>email reply</b> saved as a private comment (marked “Email reply”) is judged as customer-facing, because the email went to the client. The rest of the ticket is given as context.</li>
            <li>Comments from customers, triggers, automations, integrations and automatic call logs are not QC&apos;d. Someone who wrote internal notes or moved the assignee or group is treated as an agent, even if Zendesk now lists them as an end-user (shown as “Agent (former)”).</li>
            <li>QC comments and scores are <b>only shown, never saved</b>. They are written fresh each time you retrieve the ticket, so they can differ slightly between runs and disappear when you retrieve another ticket. <b>Re-run QC comments</b> writes them again for the ticket on screen.</li>
            <li><b>Save as image</b> (above the timeline) downloads the ticket header, the Comprehension and Resolution Accuracy cards and the whole timeline, including QC comments, as <b>one PNG image</b>. It follows the timeline as shown: hide what you don&apos;t need with the filters, and press <b>Expand all messages</b> first if you want long messages in full. The image is always light-themed, with a footer giving the ticket number and when it was saved. It is available once the ticket and its QC comments have finished loading. Very long tickets are saved at a lower resolution so they fit in one image; zoom in to read them. The image contains ticket content, so share it only as XR&apos;s data-handling rules allow.</li>
            <li>QC comments are written by AI: use them as a starting point and check them against the ticket.</li>
          </ul>
        </Section>

        <Section id="related-comments" title="8. Related tickets & comments">
          <ul>
            <li><Link2 className="inline size-4" /> <b>Related tickets</b> — choose <b>JIRA</b> or <b>Zendesk</b>, enter the issue key or ticket number (or paste its link) and an optional note. The app builds the link for you. Zendesk tickets are checked to exist; Jira keys are checked for format only.</li>
            <li><MessageSquare className="inline size-4" /> <b>Comments</b> — free-text notes on a ticket (Ctrl+Enter to save). Links you paste become clickable.</li>
          </ul>
          <p>Related tickets and comments belong to the ticket, so every review of the same ticket shows them.</p>
        </Section>

        <Section id="rubrics" title="9. QA Rubrics">
          <p>
            <PageLink to="/qa-rubrics">QA Rubrics</PageLink> shows the categories and weights, what each category
            assesses, the ticket status definitions, the 1–5 scale, the overall rating bands and the required metadata
            fields. It is built from your Settings, so editing the reviewer instructions updates it automatically.
          </p>
          <p>
            <b>Download</b> saves the rubric as a PDF (without the Date Rules and Metadata QC requirements).
          </p>
        </Section>

        <Section id="tables" title="10. Working with tables">
          <ul>
            <li><b>Ticket timeline</b> — click a ticket&apos;s <b>subject</b> (Metadata QC, Find &amp; review, Saved reviews) to open its timeline in a pop-up, the same as Ticket Inspector: public and private comments, status / group / assignee changes and side conversations, with the same filters. It is retrieved fresh from Zendesk each time and has no QC comments; use Ticket Inspector for those.</li>
            <li><b>Sort</b> — click a column header: ascending, then descending, then back to the original order. Empty values always go last.</li>
            <li><b>Rows per page</b> — choose 25, 50 or 100 under the table; page buttons appear when there are more rows. Changing filters or sorting returns to page 1.</li>
            <li><b>Filters</b> — every dropdown lets you tick several values; a row matches if it fits any ticked value. <b>Clear filters</b> resets them.</li>
            <li>Your place on each page (results, filters, open scorecards) is kept when you switch pages in the app.</li>
            <li><b>Back to top</b> — on long pages a round <b>↑</b> button appears in the bottom-right corner once you scroll down. Click it to return to the top of the page. On Settings it sits just above the save bar.</li>
            <li><b>Remembered filters</b> — table filters, search boxes, Failed / Passed / All, the Trends date basis and the Ticket Inspector options are saved in this browser, so they come back after a reload or a server restart and stay on for new searches. Search dates and statuses still start from yesterday and the Settings defaults.</li>
          </ul>
        </Section>

        <Section id="icons" title="11. Icons & indicators">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Where</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td]:align-top [&_td]:whitespace-normal">
              {ICONS.map(i => (
                <TableRow key={i.name}>
                  <TableCell>{i.icon}</TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="text-muted-foreground">{i.where}</TableCell>
                  <TableCell>{i.meaning}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <Badge variant="outline" className={cn(TONE.danger)}>Type</Badge>
                </TableCell>
                <TableCell className="font-medium">Missing field</TableCell>
                <TableCell className="text-muted-foreground">Metadata QC</TableCell>
                <TableCell>A required field that is empty on the ticket.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section id="whats-new" title="12. What's New & appearance">
          <ul>
            <li>
              <b>What&apos;s New</b> (top right) opens a timeline of the app&apos;s changes, newest day first. Each entry is
              marked <Badge variant="outline" className={TONE.success}>New feature</Badge>,{' '}
              <Badge variant="outline" className={TONE.info}>Improvement</Badge> or{' '}
              <Badge variant="outline" className={TONE.warning}>Bug fix</Badge>, and most link to the page they apply
              to. Use the buttons at the top to show only some types. A blue dot on the button means there are changes
              since you last opened it.
            </li>
            <li><b>Dark</b> switches between light and dark mode. Your choice is remembered in this browser.</li>
            <li>On narrow screens the page links scroll sideways and the app name wraps onto more lines.</li>
          </ul>
        </Section>

        <Section id="tips" title="13. Tips & good practice">
          <ul>
            <li>The AI score is a starting point. Read the findings, and use <b>Edit scores</b> with a clear justification when you disagree.</li>
            <li>Scores can vary slightly between runs of the same ticket; a temperature of 0 keeps them steadier.</li>
            <li>To update a review, use <b>Re-review</b> in Saved reviews: it replaces the old review, so each ticket is counted once in your reports.</li>
            <li>A <span className="text-destructive font-semibold">red ticket number</span> means the ticket came back after review — consider re-reviewing it. The <b>Needs re-review</b> filter lists them all.</li>
            <li>Before scoring, click the ticket&apos;s subject to read its whole timeline, including side conversations.</li>
            <li>If a ticket looks different from Zendesk, retrieve it again: the timeline and QC comments are always fetched fresh.</li>
            <li>Large searches (hundreds of tickets) take longer because side conversations and re-open counts are fetched for each ticket.</li>
          </ul>
        </Section>

        <Section id="faq" title="14. FAQs">
          <p>Click a question to see the answer.</p>
          {faqGroups().map(group => (
            <div key={group.topic} className="space-y-2">
              <H>{group.topic}</H>
              {group.items.map(item => (
                <Faq key={item.q} q={item.q}>
                  {item.a}
                </Faq>
              ))}
            </div>
          ))}
        </Section>

        <Section id="data-handling" title="15. Data handling">
          <Alert>
            <ShieldAlert />
            <AlertDescription>
              Ticket data, agent and customer names, AI judgements, score edits, comments and CSV exports contain
              personal and company-confidential information. Handle and store them according to XR doctrine, and
              check that sending ticket conversations to the configured AI model is permitted.
            </AlertDescription>
          </Alert>
          <ul>
            <li>The Zendesk API token and OAuth client secret are kept on the server in <code>server/data/settings.json</code> and are never shown in the browser. Keep that file private.</li>
            <li>Saved reviews, comments, related tickets and score edits are stored in the app&apos;s database on the server. Ticket Inspector QC comments are not stored.</li>
            <li>Filters, the theme and What&apos;s New status are remembered only in your own browser.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
