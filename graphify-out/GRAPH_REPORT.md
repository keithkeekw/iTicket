# Graph Report - ticket-qc  (2026-11-05)

## Corpus Check
- 80 files · ~56,080 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 718 nodes · 2717 edges · 22 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.87)
- Token cost: 126,278 input · 0 output

## Community Hubs (Navigation)
- Quality Review Pages
- Settings & Review Dialogs
- Ticket Timeline & Inspector UI
- App Shell & UI Primitives
- Review Orchestration & Ignore Rules
- Trends Charts & Dates
- Zendesk API Client
- Server Entry & Settings
- Review Database Layer
- AI Ticket Review (Ollama)
- Inspector QC Comments
- Root Package Manifest
- shadcn Component Config
- Ticket Inspector Backend
- Runtime Dependencies
- README Concepts
- Dev Dependencies
- PDF Export
- JS Path Config
- npm Scripts
- Zendesk Field Values
- App Icons

## God Nodes (most connected - your core abstractions)
1. `cn()` - 134 edges
2. `FindAndReview()` - 63 edges
3. `SavedReviews()` - 60 edges
4. `Button()` - 48 edges
5. `MetadataQC()` - 45 edges
6. `react` - 43 edges
7. `Badge()` - 39 edges
8. `Spinner()` - 38 edges
9. `IgnoredTickets()` - 37 edges
10. `ReviewCategories()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `AlertTitle()` --calls--> `cn()`  [EXTRACTED]
  client/src/components/ui/alert.jsx → client/src/lib/utils.js
- `PopoverHeader()` --calls--> `cn()`  [EXTRACTED]
  client/src/components/ui/popover.jsx → client/src/lib/utils.js
- `PopoverTitle()` --calls--> `cn()`  [EXTRACTED]
  client/src/components/ui/popover.jsx → client/src/lib/utils.js
- `PopoverDescription()` --calls--> `cn()`  [EXTRACTED]
  client/src/components/ui/popover.jsx → client/src/lib/utils.js
- `SelectLabel()` --calls--> `cn()`  [EXTRACTED]
  client/src/components/ui/select.jsx → client/src/lib/utils.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Settings Page Configuration Areas** — readme_settings, readme_zendesk_api, readme_ticket_groups, readme_qc_rules, readme_ollama_model [EXTRACTED 1.00]

## Communities (22 total, 0 thin omitted)

### Community 0 - "Quality Review Pages"
Cohesion: 0.07
Nodes (111): ClearFiltersButton(), dateFieldFor(), FilterSelect(), ReopenedIcon(), reopensSinceReview(), SideConversationIcon(), StatusAlert(), StatusBadge() (+103 more)

### Community 1 - "Settings & Review Dialogs"
Cohesion: 0.07
Nodes (68): api, TICKET_STATUSES, CheckItem(), LinkifiedText(), Spinner(), EditScoresButton(), EditScoresDialog(), ScoreEditEntry() (+60 more)

### Community 2 - "Ticket Timeline & Inspector UI"
Cohesion: 0.07
Nodes (69): streamInspect(), BUILT_IN, HARD_RULES, HardRules(), Source(), Stat(), BAR_COLOR, categoryAverages() (+61 more)

### Community 3 - "App Shell & UI Primitives"
Cohesion: 0.07
Nodes (38): App(), LEGACY_PATHS, linkClass(), MetadataQC, PAGE_LOADERS, PageLoading(), PAGES, QARubrics (+30 more)

### Community 4 - "Review Orchestration & Ignore Rules"
Cohesion: 0.13
Nodes (40): applyScoreEdit(), commentCountsFor(), createdFor(), deleteReview(), getReview(), ignoredFor(), isIgnored(), latestReviewsFor() (+32 more)

### Community 5 - "Trends Charts & Dates"
Cohesion: 0.10
Nodes (34): AverageBadge(), BASES, buildTrends(), capitalize(), DayAxis(), dayRange(), daysAgo(), NO_FILTERS (+26 more)

### Community 6 - "Zendesk API Client"
Cohesion: 0.13
Nodes (29): applicabilityFor(), conditionValue(), listForms(), loadFormRules(), SYSTEM_FIELD_TYPES, SYSTEM_VALUE_KEYS, collectImages(), imageSize() (+21 more)

### Community 7 - "Server Entry & Settings"
Cohesion: 0.10
Nodes (25): dotenv, app, dist, qcUnavailable(), checkTicket(), fieldValue(), isEmpty(), LAST_RUN_FILE (+17 more)

### Community 8 - "Review Database Layer"
Cohesion: 0.09
Nodes (30): addComment(), addRelated(), asList(), categoryScores(), commentsFor(), db, deleteComment(), deleteRelated() (+22 more)

### Community 9 - "AI Ticket Review (Ollama)"
Cohesion: 0.15
Nodes (27): domainOf(), EMAIL_REPLY_RULE, emailReply(), emailReplyLabel(), INTERNAL_DOMAINS, isInternal(), attachmentKey(), attachmentLine() (+19 more)

### Community 10 - "Inspector QC Comments"
Cohesion: 0.16
Nodes (22): agentCommentIds(), callModel(), categorySchema, clip(), COMMENT_SCHEMA, contextText(), escapeRegex(), isAgentComment() (+14 more)

### Community 11 - "Root Package Manifest"
Cohesion: 0.11
Nodes (18): description, name, private, type, version, clsx, compression, concurrently (+10 more)

### Community 12 - "shadcn Component Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 13 - "Ticket Inspector Backend"
Cohesion: 0.20
Nodes (17): attachmentList(), badRequest(), contact(), decodeEntities(), ENTITIES, inspectTicket(), person(), TRACKED (+9 more)

### Community 14 - "Runtime Dependencies"
Cohesion: 0.12
Nodes (17): dependencies, class-variance-authority, clsx, compression, date-fns, dompurify, dotenv, express (+9 more)

### Community 15 - "README Concepts"
Cohesion: 0.17
Nodes (14): #root Mount Element, env.env Seed Config, Metadata QC Module (/metadata-qc), Ollama Model, QC Rules Setting, Quality Review Module (/quality-review), Run Instructions (port 8765, dev 5173), Saved Reviews (SQLite) (+6 more)

### Community 16 - "Dev Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, concurrently, react, react-dom, react-router-dom, tailwindcss, @tailwindcss/vite, vite (+1 more)

### Community 17 - "PDF Export"
Cohesion: 0.25
Nodes (5): A4, downloadPdf(), download(), html2canvas-pro, jspdf

### Community 18 - "JS Path Config"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, jsx, paths, include

### Community 19 - "npm Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, dev:client, dev:server, start

### Community 20 - "Zendesk Field Values"
Cohesion: 0.60
Nodes (4): badRequest(), cache, ticketFieldValues(), getTicketDetails()

### Community 21 - "App Icons"
Cohesion: 0.50
Nodes (4): Apple Touch Icon (ticket with green QC checkmark), Favicon 32px (ticket with green QC checkmark), Favicon SVG (XR Zendesk Ticket Quality Review Dashboard icon), XR Zendesk Ticket Quality Review Dashboard

## Knowledge Gaps
- **13 isolated node(s):** `date-fns`, `tw-animate-css`, `concurrently`, `tailwindcss`, `Saved Reviews (SQLite)` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 180 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell & UI Primitives` to `Quality Review Pages`, `Settings & Review Dialogs`, `Ticket Timeline & Inspector UI`, `Trends Charts & Dates`, `Root Package Manifest`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `FindAndReview()` (e.g. with `yesterday()` and `manuallyIgnored()`) actually correct?**
  _`FindAndReview()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `date-fns`, `tw-animate-css`, `concurrently` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Quality Review Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.06692063492063492 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `Settings & Review Dialogs` to `Quality Review Pages`, `Ticket Timeline & Inspector UI`, `App Shell & UI Primitives`, `Trends Charts & Dates`, `Root Package Manifest`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `Settings & Review Dialogs` be split into smaller, more focused modules?**
  _Cohesion score 0.06685366993922394 - nodes in this community are weakly interconnected._
- **Why does `compression` connect `Root Package Manifest` to `Server Entry & Settings`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._