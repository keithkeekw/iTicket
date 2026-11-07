# iTicket — Product Brief

| | |
|---|---|
| **Product** | iTicket (formerly "iTicket", originally "XR Zendesk Ticket Quality Review Dashboard") |
| **Owner** | Keith Kee (keith.kee@extremereach.com) |
| **Status** | Internal tool, in active use (first release 2026-11-03) |
| **Users** | Support team leads, QA reviewers and support managers |
| **Data source** | Zendesk (`adstream.zendesk.com`), read-only |
| **AI** | Choice of provider: Ollama (local or cloud; currently `gemma4:31b-cloud`), or Claude, ChatGPT, Gemini or DeepSeek through their APIs |
| **Last updated** | 2026-11-06 (evening) |

> **Handling note:** The app processes Zendesk ticket content, customer and agent names and email domains. Treat its exports, images, archives and copied feedback as possibly containing PII or company confidential information, and follow XR data handling doctrine.

---

## 1. Summary

iTicket is an internal web app that helps the support team check the quality of Zendesk tickets consistently and at scale. It does three things:

1. **Quality Review**: scores tickets against the team's QA rubric with an AI model, keeps every review with its history and coaching feedback, and reports averages, trends and category breakdowns.
2. **Ticket Inspector**: shows one ticket's full history as a timeline, with an AI QC comment on every agent comment and coaching feedback for the Global Support agents.
3. **Metadata QC**: checks that required Zendesk fields are filled in, and suggests likely values for the missing ones.

The app runs on a reviewer's computer, reads Zendesk without ever writing to it, and stores results in a local database.

## 2. Problem

- **Manual ticket QA is slow and inconsistent.** Reading a full ticket (public replies, internal notes, side conversations with VAM, Billing or vendors, screenshots) and scoring five rubric categories takes a reviewer a long time, and different reviewers score differently.
- **Coverage is low.** Only a small sample of tickets can be reviewed by hand, so trends by agent, group or ticket type are hard to see.
- **Evidence is scattered.** Zendesk spreads a ticket over comments, audits, side conversations and fields, which makes it hard to understand what happened at a glance.
- **Metadata gaps affect reporting.** Missing ticket fields (type, priority, custom fields) weaken Zendesk reporting and are rarely caught before tickets close.

## 3. Goals

| Goal | How the product supports it |
|---|---|
| Review many more tickets with consistent scoring | AI scoring against one shared rubric; batch review of search results; scheduled automated review; the app calculates scores, not the AI |
| Keep reviewers in control | Every AI score can be edited with a mandatory justification; re-reviews keep previous versions |
| Turn reviews into insight | Average score cards, Trends over time, Categories by Zendesk field, CSV export without limits |
| Make tickets easy to understand | Ticket Inspector timeline with side conversations and per-comment QC |
| Support coaching | AI feedback for the Global Support agents, saved with reviews and ready to copy into an email or Teams |
| Improve data quality | Metadata QC run with filters, export and AI-suggested values for missing fields |
| Judge agents fairly | Hard rules for email replies saved as notes and for automated notifications; automated messages are never QC'd |

**Non-goals:** changing tickets in Zendesk, replacing human judgement on disputed scores, and agent performance management decisions made by the app alone.

## 4. Users and main use cases

| User | Use cases |
|---|---|
| **QA reviewer / team lead** | Find yesterday's solved tickets, review them in batch, check and adjust scores, bookmark tickets of interest, add comments and related tickets or Jira issues, coach agents with the feedback |
| **Support manager** | Follow average scores and trends by group, agent and ticket type; export data for reporting |
| **Admin** | Connect Zendesk and the AI model, maintain the review instructions and prompts, set ignore rules, archive old data |

## 5. Features

### 5.1 Quality Review

- **Find & review**
  - Search by status and solved/updated dates across the configured groups, or look up ticket numbers.
  - Review one ticket, or several selected tickets (two at a time) with progress bars and Stop.
  - Filters: status, group, assignee, review state, side conversations, related tickets, comments, ignored.
  - The last search is kept between visits; an orange notice asks to search again when it is from an earlier day.
- **AI scorecard**
  - Five weighted rubric categories: Comprehension 10%, Troubleshooting & Documentation Quality 35%, Professional Communication 15%, Business English Quality 15%, Resolution Accuracy 25%.
  - Each category gets a 1–5 score with evidence-based findings, plus a summary, the assignee, the resolving agent and the date solved.
  - The app recalculates the weighted total and the rating band (Excellent / Good / Acceptable / Below Standard / Poor).
  - The AI is given the conversation, status timeline, side conversations and screenshots.
  - Values are suggested for missing metadata fields.
  - **Feedback for the agents** (the same coaching feedback as Ticket Inspector) can be written under the scores on request. It is saved with the review and included in Copy, Save as image and Export CSV.
- **Saved reviews**
  - **Simple view**: actions per review (bookmark, related Zendesk tickets and Jira issues, comments, save as image, re-review, edit scores, delete).
  - **Scoring view**: one row per review with subject, status, assignee, resolving agent, category scores (C, TDQ, PC, BEQ, RA), final score and rating, plus an average row.
  - In both views, **click a row** to open its scorecard, and **tick reviews to re-review them together** (two at a time, with progress and Stop).
  - A full-width search box above the filters (ratings, groups, assignees, resolving agents, statuses, related tickets, comments, re-review, previous versions, reviewed dates).
  - Average score cards per category; a **Re-review** flag for tickets re-opened in Zendesk since their review.
  - **Save as image**: a ticket's row and its full scorecard (with any saved feedback) as one PNG.
- **Review history**
  - Re-reviewing keeps the earlier review as a previous version.
  - **View history** compares versions category by category.
  - Only the current review counts in averages and exports.
- **Edit scores**: a manual change needs a justification of at least 10 characters and is logged.
- **Trends**: daily average per category and in total, by reviewed or solved date, with filters.
- **Categories**: average rubric scores per value of any Zendesk field, e.g. Generic Ticket Type or Topic.
- **Ignored tickets**: tickets ignored by hand, by subject rule, or by the pre-2026 hard rule.
- **Bookmarks**: tickets a reviewer bookmarked (red bookmark in Saved reviews) to find again. Bookmarks belong to the ticket, so they stay through re-reviews.
- **Export CSV**: every matching review, no row limit, optionally with all previous versions; includes saved agent feedback.
- A ready-made AI prompt for turning the export into a written quality report is in `docs/QUALITY_REPORT_PROMPT.md`.

### 5.2 Ticket Inspector

- A full ticket timeline from the Zendesk audit log, with side conversations, attachments, status, assignee and group changes, and filters.
- An AI **QC comment** on each agent public reply or internal note, scoring Troubleshooting & Documentation, Professional Communication and Business English. The comments are shown in light orange boxes.
- Messages posted through the API or emailed by system and no-reply mailboxes are marked **Automated · no QC** and are never QC'd.
- **Comprehension** and **Resolution Accuracy** cards for the ticket as a whole.
- **Feedback for the agents**: overall view, what went well, what to improve (with "Try:" suggestions), habits for next time and a note per agent. It is addressed only to **Global Support agents** (members of the Global Support group who are not also in L2 Support); other teams are context only. Points link back to the timeline comments they come from, and **Copy** puts the feedback on the clipboard with formatting.
- **Save as image**: the whole page as one PNG.
- QC comments and feedback are written fresh each time and are not stored.

### 5.3 Metadata QC

- Checks solved and closed tickets (or any statuses) in a date range for required standard and custom fields.
- Follows Zendesk form conditions, so a field is only required when the ticket's form shows it.
- Configurable "empty" values (e.g. `-`, `n/a`), filters, and CSV export.
- **Click a row** to see the ticket's required fields. For each missing field the AI suggests the 1–3 most likely values (only from the values Zendesk allows), with a confidence and a reason. Filled fields show their value, and the full list of allowed values is one click away. Suggestions are shown only, never written to Zendesk.

### 5.4 Settings and administration

- **Connections**: Zendesk API token (legacy; Zendesk retires these on 30 April 2027) or OAuth client credentials, and the Jira site.
- **Metadata QC** and **Quality Review**: groups, statuses, required fields, and auto-ignore rules by subject.
- **AI model**: Ollama URL, model, context size, temperature, image settings.
- **Prompt Management**
  - Edit the AI review instructions (the QA rubric) and the ticket feedback instructions.
  - See the full prompt actually sent to the AI, and view the other built-in prompts.
- **Agents**: the list of Global Production Support agents (who handle tickets across every Zendesk group), built by searching Zendesk or importing the Global Support group. Feedback for the agents is written only for them.
- **Automation**: automated Quality Review on a schedule (start times and days). Each run reviews tickets Solved on the current date (optionally also the day before) that have no review yet, and re-reviews tickets re-opened since their review. Preview, Run now, Stop and a log of recent runs. Off by default, so reviews stay manual.
- **Archive**: moves the reviews, previous versions, score edits, comments and links of tickets closed in a date range into a JSON file named after the dates (e.g. `20261101-20261105`). Archives can be downloaded, restored, or deleted after typing DELETE to confirm.
- **Hard rules**: read-only list of rules built into the app.
- **QA Rubrics** page, an in-app **User Guide** (book icon, top right) with FAQs, and **What's New** release notes.
- Confirmations use in-app pop-ups; destructive ones are red. Success messages are white on green.

## 6. Business rules (hard rules)

1. **Tickets created before 2026 are ignored** in searches, reviews and Metadata QC.
2. **An agent's emailed reply saved as an internal note counts as a reply to the client.**
   - This applies when VAM, Billing or other teams are on the same email thread.
   - Agents are not marked down for "not replying" in that case.
3. **Automated notifications need no customer-facing reply.**
   - Applies to tickets created by an agent through the Zendesk API, and tickets sent by system mailboxes: extremereach@extremereach.com, no-reply@hibob.com, ingest.service@extremereach.com, aqa.es@adstream.com, any "no reply" / "do not reply" address, and the senders an admin adds in Settings › Hard Rules (addresses, * patterns or whole domains).
   - Agents are not marked down for not replying; what they did is still judged.
   - Messages from these senders are context only and are never QC'd.
4. **Scores are calculated by the app.** The AI gives 1–5 per category; weights, totals and rating bands are applied in code.
5. **Resolution Accuracy is always assessed on Solved and Closed tickets.**
6. **One current review per ticket.** Earlier reviews are history and never count twice.
7. **Agent feedback is for Global Production Support agents only** (the list in Settings › Agents; the Global Support group minus L2 Support while the list is empty). Other teams, such as L2 Support, get no feedback.
8. **A ticket solved by Bump Bump Solve is not the agent's fault.** When the requester doesn't reply after repeated reminders, a Zendesk automation solves the ticket; agents aren't marked down for the missing resolution or confirmation. Detected from the audit log (tags alone are inherited by follow-ups).

## 7. How it works

```
Browser (React SPA) ──► Local server (Node.js / Express, 127.0.0.1:8765)
                              │
                              ├──► Zendesk REST API (read only): tickets, audits, users, fields, forms, side conversations
                              ├──► Ollama /api/chat (AI model): JSON-structured reviews, QC comments, feedback, metadata suggestions
                              ├──► SQLite (server/data/ticket-qc.db): reviews, history, edits, feedback, comments, links, bookmarks, ignored tickets
                              ├──► Archive files (server/data/archives/*.json)
                              └──► Scheduler (every 30 s): automated review runs, logged in server/data/automation-runs.json
```

| Layer | Technology |
|---|---|
| Front end | React, Vite, Tailwind CSS v4, shadcn/ui; pages are loaded only when opened |
| Back end | Node.js 24+, Express, compression; NDJSON streaming for Ticket Inspector progress |
| Storage | Node's built-in `node:sqlite`; settings in `server/data/settings.json` |
| AI | One provider layer (`server/ai.js`): Ollama chat API, Anthropic's official SDK for Claude, OpenAI and DeepSeek Chat Completions, Gemini generateContent; JSON replies with repair and retry; screenshots to providers that take images |
| Performance | 10-minute cache of Zendesk groups, group members, fields and forms; 30-minute cache of metadata suggestions; parallel searches; comments taken from the audit log; gzip |

**Requirements:** Node.js 24 or newer, Ollama (signed in for cloud models), and a modern browser. Runs on Windows and macOS.

## 8. Data, security and privacy

- **Read-only to Zendesk.** The app never changes tickets.
- **Local storage.** Reviews and settings stay on the reviewer's computer in `server/data/`, which is excluded from version control.
- **Retention: indefinite.** Reviews, their previous versions, score edits, saved feedback, comments, links and bookmarks are kept with no expiry. Nothing is deleted automatically; a review and its history are removed only when a reviewer deletes it.
- **Archiving.** Settings › Archive can move the data for tickets closed in a date range out of the database into a JSON file in `server/data/archives` (named e.g. `20261101-20261105`). Archives are kept until deleted and can be restored. Deleting an archive that hasn't been restored loses its data for good, so it needs DELETE typed to confirm.
- **Backups.** Back up `server/data/ticket-qc.db` and `server/data/archives` regularly, since they are the only copies.
- **Credentials.** The Zendesk token and OAuth secret are kept on the server and never sent to the browser.
- **AI processing.** Ticket text and screenshots are sent to the configured AI provider. With a cloud model or an API provider (Anthropic, OpenAI, Google, DeepSeek), that content leaves the computer and is processed under the account whose API key is saved; use a provider approved for XR ticket data. API keys stay on the server and are masked in the browser.
- **Model input is limited.** Only email domains of side-conversation participants are shown to the model to tell internal and external parties apart.
- **Sensitive outputs.** Exports, images, archives and copied feedback can contain names, email domains and client details.

## 9. Current status

- In use since 2026-11-03. **852 tickets** currently have a saved review, with 149 previous versions kept; the average final score is **3.82** (as of 2026-11-06).
- 90 changes listed in What's New across four days of releases (3–6 November 2026).
- **Added on 2026-11-06:** click-to-open rows, Save review as image, Bookmarks, batch re-review, saved agent feedback in Quality Review, the comments filter, Settings › Archive, the automated-notification hard rule, Global Support-only feedback, and AI-suggested values in Metadata QC.
- **Known data point:** 92 saved reviews of API-created monitoring alerts (L2 Support) were scored before the automated-notification rule existed and average 2.86. They keep those scores until re-reviewed.
- **Removed on 2026-11-06:** a Data/Privacy Breach detection module, removed at the owner's request. Its data is archived in `backups/`.

## 10. Success measures (proposed)

| Measure | Target idea |
|---|---|
| Tickets reviewed per week | Large increase over the manual baseline |
| Reviewer agreement | Share of AI scores left unedited by reviewers (edits are logged, so this can be measured) |
| Score stability | Small score change when the same ticket is re-reviewed (review history makes this measurable) |
| Quality trend | Average final score and weakest category per group, month on month |
| Metadata completeness | Share of solved tickets passing Metadata QC |
| Suggestion usefulness | Share of AI-suggested metadata values that reviewers go on to apply in Zendesk |

## 11. Risks and limitations

| Risk | Mitigation |
|---|---|
| AI scores can be wrong or vary between runs | Low temperature, evidence-based findings, score edits with justification, review history |
| Changing the model or prompt shifts scores | Each review stores the model and the instructions used; compare versions in View history |
| Single-computer deployment (no shared database) | Move `server/data/` securely, or host centrally (see roadmap) |
| Zendesk API tokens retire on 30 April 2027 | OAuth sign-in is already supported; switch before then |
| Ticket content sent to a cloud AI model | Use an approved provider (e.g. XR's Amazon Bedrock) or a local model |
| Very long tickets are shortened for the model | The middle of the conversation is trimmed first; findings flag data gaps |
| Global Production Support agents can't be told apart by Zendesk group | Settings › Agents holds the team list; until it is filled in, the Global Support group minus L2 Support is used |
| Older reviews predate newer hard rules | Re-review affected tickets (e.g. with batch re-review); previous versions are kept for comparison |
| Batch re-review uses many AI calls | Runs two at a time, with a time estimate and Stop |
| Automated runs depend on the reviewer's computer | The schedule runs only while the app's server is running and missed times are not caught up; central hosting (roadmap) would remove this |

## 12. Roadmap options

1. **More AI providers**
   - Done: Ollama, Claude (Anthropic API), ChatGPT (OpenAI), Gemini and DeepSeek can be chosen in Settings › AI Model.
   - Next: **Amazon Bedrock** (XR inference profile `global.anthropic.claude-opus-5-5`), so Claude runs under XR's AWS account.
   - Rename the provider-specific setting keys (e.g. `ollama.prompt` → `ai.reviewPrompt`).
2. **Central hosting**
   - Host the app for the team, e.g. on AWS (App Runner or ECS behind Cognito sign-in).
   - Use a shared database and an IAM role for Bedrock access.
3. **Calibration**
   - Compare AI scores with a reviewer-scored sample.
   - Report the share of scores reviewers edited, per category.
4. **Agent view**: per-agent score history and coaching notes over time (saved agent feedback now makes this possible).
5. **Saved Ticket Inspector reports** (proposed design):
   - **What is saved:** a full snapshot of the report as shown, not just the AI parts:
     - the ticket header and the whole timeline, including side conversations and attachment names (not the files);
     - the QC comments, the Comprehension and Resolution Accuracy cards and Feedback for the agents;
     - the AI model, date and prompts used.
   - **Why a snapshot:** tickets change after they are inspected, so the report must show the ticket exactly as it was assessed. Each report is about 50–500 KB and is kept indefinitely, like reviews.
   - **Saving:** a **Save report** button, enabled once QC comments and feedback have finished. Saving is optional, so trial runs don't clutter the list.
   - **Saved reports list:** shows ticket, subject, agents, average QC score, Comprehension and Resolution scores and saved date, with search, filters, open and delete.
   - **Opening a report:** shows the same page as a live run, with a "Saved report" banner. Copy, Save as image and **Run again** stay available.
   - **Versions:** saving a ticket again keeps the earlier report as a previous version, like review history.
   - **Links:** Saved reviews shows when a ticket also has an Inspector report and opens it.
   - **Data handling:** reports store full ticket conversations indefinitely, which is more sensitive than scores. Decide this before the app is hosted for the team.
6. **Apply metadata suggestions**: write an accepted suggestion back to Zendesk. This would need write access, which the app does not have today.

## 13. Open questions

- Which AI provider is approved for production use with ticket content: a local Ollama model, an Ollama cloud model or Amazon Bedrock?
- Should the app stay on reviewers' own computers, or be hosted for the whole team with shared reviews?
- Who owns the QA rubric and prompt changes, and how are they approved?
- Should the 92 reviews of automated notification tickets scored before the new hard rule be re-reviewed?
- Who maintains the Global Production Support agent list in Settings › Agents as the team changes?
