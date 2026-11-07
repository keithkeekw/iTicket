# XR Ticket Insight

Two independent modules:

- **Quality Review** (`/quality-review`, the landing page) – finds tickets with its own filters (or by ticket
  number) and runs a Ticket Quality Review with an Ollama model over the conversation, status timeline and side
  conversations. Every review is saved to SQLite (`server/data/ticket-qc.db`, via Node's built-in `node:sqlite`)
  and can be browsed, filtered, exported to CSV or deleted under *Saved reviews*.
- **Metadata QC** (`/metadata-qc`) – pulls Zendesk tickets by status/date and checks whether the required ticket
  metadata is populated (following Zendesk form conditions).

Stack: React + Vite, Tailwind CSS v4, shadcn/ui (Radix, new-york style), Node.js/Express.

UI components live in `client/src/components/ui` and are owned by this repo. Add more with
`npx shadcn@latest add <component>` (configured by `components.json`; the CLI may write
`import { cn } from "cn"` in plain-JS projects — change it to `@/lib/utils`).

## Requirements

- **Node.js 24 or newer** (the current LTS) on Windows, macOS or Linux. `npm install` refuses older versions
  (`.npmrc` sets `engine-strict`), and `npm start` checks again with a plain message.
- **Ollama** for AI reviews (the desktop app on Windows/macOS), signed in (`ollama signin`) for cloud models.
- A browser: Chrome, Edge, Firefox or Safari. In Safari, very long tickets are saved by *Save as image* at a
  lower resolution, because Safari limits image size more strictly.

## Run

```bash
npm install
npm run build
npm start          # http://localhost:8765
```

For development with hot reload: `npm run dev` (UI on http://localhost:5173, API proxied to 8765).

### Moving to another computer (e.g. Windows → Mac)

1. Copy the project **without** `node_modules/` and `dist/`. They contain files built for the original operating
   system (the Vite/Tailwind build tools), so they must be recreated with `npm install` and `npm run build`.
2. To keep existing reviews and settings, also copy `server/data/`. It holds `settings.json`, which includes the
   Zendesk API token / OAuth secret, so move it securely, or re-enter the credentials on the Settings page instead.
3. Install Node.js 24 and Ollama on the new computer, then run the three commands above.

## Settings

First run seeds settings from `env.env` (`ZENDESK_DOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_TOKEN`, `OLLAMA_URL`,
`QC_MODEL`, `QC_NUM_CTX`, `QC_PORT`, `QC_MAX_TICKETS`). After that, everything is edited on the Settings page and
stored in `server/data/settings.json`:

- **Zendesk API** – subdomain, agent email, API token (masked; never returned to the browser).
- **Ticket groups** – which groups to check (none selected = all groups).
- **QC rules** – statuses (solved/closed), look-back days, max tickets, required standard and custom fields,
  and extra values treated as empty (e.g. `-`, `n/a`).
- **Ollama** – enable/disable, URL, model, context window, temperature, reviewer instructions.

`server/data/` and `env.env` contain credentials and ticket data; both are in `.gitignore`.

## How a field is judged "not populated"

`null`, empty string, empty list, `false` (unchecked checkbox), or one of the configured empty values.
