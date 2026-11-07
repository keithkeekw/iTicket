# iTicket

AI quality review and metadata QC for Zendesk support tickets (subdomain `adstream`).

iTicket pulls tickets from Zendesk, has an AI model score each one against the team's quality rubric, checks that
required ticket metadata is filled in, and keeps every result in a local database for browsing, trends and export.

> **Data handling.** iTicket stores Zendesk ticket content, customer and agent names, and API credentials. Treat
> the project folder, `server/data/`, exports, archives and saved images as **PII / company confidential**, and
> follow standard handling and processing per XR doctrine.

## Features

| Page | What it does |
|---|---|
| **Quality Review** (`/quality-review`, landing page) | Find tickets by filters or ticket number and run a Ticket Quality Review (TQR) over the conversation, status timeline and side conversations. Tabs: Find & Review, Saved Reviews, Trends, Categories, Ignored Tickets, Bookmarks. Simple and Scoring views, batch re-review, agent feedback, CSV export, copy or save a review as an image. |
| **Ticket page** (`/ticket/:id`) | One ticket's full timeline and review result on its own page, opened in a new tab. |
| **Ticket Inspector** (`/ticket-inspector`) | Inspect a single ticket in depth, with AI QC comments and feedback for Global Production Support agents. |
| **Metadata QC** (`/metadata-qc`) | Pull tickets by status and date and check that the required fields are populated, following Zendesk form conditions. Click a row for AI-suggested values. |
| **QA Rubrics** (`/qa-rubrics`) | The scoring rubric the reviews use. |
| **Settings** (`/settings`) | Connections, Metadata QC, Quality Review, Automation, Agents, AI model, Prompt Management, Archive and Hard rules. |
| **User Guide** / **What's New** | In-app help and the changelog. |

### Hard rules

These are built into the code (`server/hard-rules.js`, `server/api-tickets.js`, `server/bump-solve.js`):

- Tickets created by an agent through the API are treated as **notifications**.
- So are tickets from automated senders: no-reply / do-not-reply addresses, the built-in system addresses, and any
  addresses an admin adds under *Settings › Hard rules › Automated Senders* (exact addresses, `*` patterns or
  `@domain`).
- Automated messages are not quality-checked.
- A ticket solved by the **Bump Bump Solve** automation is not counted against the agent; the requester didn't reply.

## AI providers

Choose the provider under *Settings › AI model*:

| Provider | Notes |
|---|---|
| **Ollama** (local or cloud) | The default. URL, model, context window and temperature. |
| **Claude** (Anthropic API) | Uses the official `@anthropic-ai/sdk`. Starts on `claude-opus-5-5`, with an Effort setting. |
| **ChatGPT** (OpenAI API) | JSON mode. |
| **Gemini** (Google AI API) | JSON output. |
| **DeepSeek** (DeepSeek API) | Text only, so screenshots aren't sent. |

API keys stay on the server and are masked in the browser. *Test & Load Models* lists the models your key can use,
and each provider remembers its own model. With an API provider, ticket content is sent to that company under the
saved key's account and billed to it, so use one approved for XR ticket data.

## Requirements

- **Node.js 24 or newer** on Windows, macOS or Linux. `npm install` refuses older versions (`.npmrc` sets
  `engine-strict`), and `npm start` checks again with a plain message.
- **An AI provider:** either [Ollama](https://ollama.com) (signed in with `ollama signin` for cloud models), or an
  API key for Claude, ChatGPT, Gemini or DeepSeek.
- **A Zendesk API token** for an agent account.
- A browser: Chrome, Edge, Firefox or Safari. Safari saves very long tickets as images at a lower resolution.

## Run

```bash
npm install
npm run build
npm start
```

Then open http://127.0.0.1:8765. To stop the server, press **Ctrl+C** in its terminal.

For development with hot reload, run `npm run dev`. The UI runs on http://localhost:5173 and the API is proxied to
port 8765.

## Configuration

On first run, settings are seeded from `env.env`:

```
ZENDESK_DOMAIN, ZENDESK_EMAIL, ZENDESK_TOKEN, OLLAMA_URL, QC_MODEL, QC_NUM_CTX, QC_PORT, QC_MAX_TICKETS
```

After that, everything is edited on the Settings page and saved to `server/data/settings.json`. Secrets (the Zendesk
token and AI API keys) are never sent back to the browser in full.

| Settings tab | Contents |
|---|---|
| Connections | Zendesk subdomain, agent email, API token; Jira site for issue links |
| Metadata QC | Statuses, look-back days, max tickets, required fields, values treated as empty |
| Quality Review | Ticket groups to review and review options |
| Automation | Scheduled Quality Review runs: schedule, Preview, Run now, Stop, recent runs (off by default) |
| Agents | The Global Production Support agents who receive feedback |
| AI model | Provider, API key or Ollama URL, model, effort or temperature |
| Prompt Management | The reviewer prompts |
| Archive | Move tickets closed in a date range to a JSON file (`YYYYMMDD-YYYYMMDD`); restore or delete |
| Hard rules | The built-in rules, plus admin-editable automated senders |

### When a field counts as "not populated"

A field is not populated when its value is `null`, an empty string, an empty list, `false` (an unchecked
checkbox), or one of the configured empty values (for example `-` or `n/a`).

## Data

| Path | Contents |
|---|---|
| `server/data/ticket-qc.db` | SQLite database (Node's built-in `node:sqlite`): reviews, bookmarks, ignored tickets, feedback |
| `server/data/settings.json` | All settings, including credentials |
| `server/data/archives/` | Archive JSON files |
| `server/data/automation-runs.json` | Automation run history |

`server/data/` and `env.env` are listed in `.gitignore`. Never commit or share them.

## Project layout

```
client/            React app (Vite, Tailwind CSS v4, shadcn/ui)
  src/pages/       Quality Review, Ticket Inspector, Metadata QC, QA Rubrics, Settings, Ticket page, guides
  src/components/  App components; ui/ holds the shadcn/ui components
  src/lib/         Helpers (changelog, Title Case, row toggling, …)
server/            Node.js + Express API, serves dist/ on port 8765
  index.js         Routes
  ai.js            AI provider layer (Ollama, Claude, OpenAI, Gemini, DeepSeek)
  zendesk.js       Zendesk API client
  reviews.js, db.js            Saved reviews (SQLite)
  ollama.js, inspector-qc.js   Review scoring, Inspector QC, metadata suggestions
  qc.js, forms.js              Metadata QC and form conditions
  hard-rules.js, api-tickets.js, bump-solve.js   Hard rules
  automation.js, archive.js    Scheduler and archiving
  settings.js      Settings load, save and masking
docs/              Product brief and the quality-report prompt
dist/              Built client (created by npm run build)
```

To add a shadcn/ui component, run `npx shadcn@latest add <component>`. In plain-JS projects the CLI may write
`import { cn } from "cn"`; change it to `@/lib/utils`.

## Moving to another computer

1. Copy the project **without** `node_modules/` and `dist/`. They contain files built for the original operating
   system.
2. To keep reviews and settings, also copy `server/data/`. It contains credentials and ticket data, so move it
   securely, or re-enter the credentials on the Settings page instead.
3. Install Node.js 24 (and Ollama, if you use it), then run `npm install`, `npm run build` and `npm start`.

## More

- `docs/PRODUCT_BRIEF.md` describes the product, its users and the roadmap.
- The in-app **User Guide** and **What's New** pages.
