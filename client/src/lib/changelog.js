// Release notes shown on the What's New page, newest day first and newest change first within a
// day. Add new entries at the top. type: 'feature' | 'improvement' | 'fix'. page (optional) is the
// app page the change is on, shown as a link.

export const CHANGELOG = [
  {
    date: '2026-11-07',
    items: [
      {
        type: 'feature',
        title: 'Choose the AI provider: Claude, ChatGPT, Gemini or DeepSeek',
        description:
          'Settings › AI Model now has a Provider choice: Ollama as before, or Claude, ChatGPT, Gemini or DeepSeek through their APIs. Paste the API key (kept on the server, never shown in full), load the models your key can use and pick one; Claude also has an Effort setting. Every AI feature (review scoring, Ticket Inspector QC and feedback, metadata suggestions) uses the chosen provider. Ticket content is sent to that provider under your account.',
        page: '/settings',
      },
      {
        type: 'improvement',
        title: 'The app is now called iTicket',
        description: 'XR Ticket Insight has been renamed iTicket: in the top bar, the browser tab, the User Guide and saved images.',
      },
      {
        type: 'improvement',
        title: 'Saved Reviews lists up to 2,500 reviews',
        description:
          'Saved Reviews now loads the newest 2,500 matching reviews (was 1,000), so the table, averages and score cards cover more reviews before the “Showing the newest …” note appears. Search, filters and Export CSV still cover every saved review.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Add automated senders in Settings',
        description:
          'Settings › Hard Rules has a new Automated Senders list. An admin can add email addresses that send automated emails (e.g. kkeeton+vantage@extremereach.com), patterns with * (e.g. *+vantage@extremereach.com) or a whole @domain, without a code change. Their tickets count as automated notifications, and Check an Address shows whether any address counts and why.',
        page: '/settings',
      },
      {
        type: 'improvement',
        title: 'Button labels in Title Case',
        description:
          'Every button, toggle and sortable column header now reads in Title Case, for example Save All Settings, Re-review Selected, Show All Reviews and Resolving Agent. Short joining words (in, to, of, for…), abbreviations such as CSV and AI, dates and ticket numbers keep their usual form. The User Guide uses the new names.',
      },
    ],
  },
  {
    date: '2026-11-06',
    items: [
      {
        type: 'feature',
        title: 'Ticket page with its own address',
        description:
          'The ticket timeline pop-up (click a subject) has an Open in new tab button at the top right. It opens the ticket on its own page, /ticket/<number>, with the ticket review result (scorecard, history and agent feedback) above the full timeline. The page can be bookmarked, shared or saved as an image.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Hard rule: Bump Bump Solve',
        description:
          'A ticket solved or closed by a Bump Bump Solve automation (the requester didn’t reply after repeated reminders) is not the agent’s fault. Quality Review scoring and Ticket Inspector no longer mark the agent down for the missing resolution or confirmation, and judge Resolution Accuracy on the handling up to the point the ticket waited on the requester. Detected from the Zendesk audit log; Ticket Inspector shows “Solved by Bump Bump Solve”. Existing reviews are not re-scored.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Settings: Agents',
        description:
          'A new Agents tab in Settings holds the list of Global Production Support agents, who handle tickets across every Zendesk group. Find agents by name or email, or add the Global Support group members (not also in L2 Support) in one go, then remove anyone who isn’t in the team. Agents in the Quality Review groups lists the members of each selected ticket group, to add one by one or a whole group at once. Feedback for the agents is written only for the agents in this list.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Automated Quality Review',
        description:
          'A new Automation tab in Settings runs Quality Review on a schedule when switched on: at the chosen times and days it reviews tickets Solved on the current date (optionally also the day before) that have no review yet, and re-reviews tickets re-opened since their review. Preview shows what a run would do, Run now starts one, and Recent runs lists the results. Off (the default) keeps reviews manual.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Metadata QC: click a row for suggested values',
        description:
          'Click a ticket in Metadata QC to see its required fields. For each missing field, the AI suggests the most likely values (only from the values Zendesk allows), each with a confidence and a short reason from the ticket’s conversation. Filled fields show their current value, and the full list of allowed values is one click away.',
        page: '/metadata-qc',
      },
      {
        type: 'feature',
        title: 'Re-review several saved reviews at once',
        description:
          'Saved Reviews, in both Simple and Scoring views, now has a checkbox on every review (and one in the header for the whole page) and a Re-review selected button. The selected tickets are reviewed again two at a time, with progress and a Stop button; the current reviews are kept as previous versions.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'No QC on automated messages',
        description:
          'Messages posted through the API or emailed by a system or no-reply mailbox (extremereach@extremereach.com, no-reply@hibob.com, ingest.service@extremereach.com, aqa.es@adstream.com, any “no reply” / “do not reply” address) are no longer QC’d, even when they come from an agent account. Ticket Inspector marks them “Automated · no QC”, and the AI treats them as context only in QC, feedback and Quality Review scoring.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Agent feedback is for Global Support agents only',
        description:
          'Feedback for the agents, in Ticket Inspector and Quality Review, is now addressed only to the Global Support agents who wrote on the ticket (members of the Global Support group who are not also in L2 Support). Other teams, such as L2 Support, are treated as context and get no feedback. A ticket with no Global Support agent gets no feedback. Feedback already saved with a review is not changed; use Write again to update it.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Feedback for the agents in Quality Review',
        description:
          'An open review now has Feedback for the agents under its scores, the same coaching feedback as in Ticket Inspector. Choose Write feedback once; it is saved with the review and shown every time. Copy puts it on the clipboard, Write again replaces it, and it is included in Save as image and Export CSV.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Hard rule: automated notifications need no customer reply',
        description:
          'A ticket created by an agent through the Zendesk API, or sent in by a system mailbox (extremereach@extremereach.com, no-reply@hibob.com, ingest.service@extremereach.com, aqa.es@adstream.com, or any “no reply” / “do not reply” address), is treated as an automated notification with no person behind it. Quality Review scoring and the Ticket Inspector QC comments and feedback no longer mark the agent down for not sending a customer-facing reply on such tickets. Listed in Settings › Hard rules. Existing reviews are not re-scored; re-review a ticket to apply it.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Bookmarks',
        description:
          'Bookmark tickets you want to find again: click the bookmark icon in Saved reviews and it turns red. Bookmarked tickets are listed on the new Bookmarks tab of Quality Review, with search, sorting and the review opening when you click a row. Click the red bookmark to remove it. Bookmarks stay through re-reviews.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'User Guide moved beside What’s New',
        description:
          'The User Guide now opens from a button with a book icon at the top right, next to What’s New, instead of from the page links. Success messages across the app are now white on solid green.',
        page: '/user-guide',
      },
      {
        type: 'improvement',
        title: 'Archive: delete archives',
        description:
          'Each archive in Settings › Archive now has a Delete button. To confirm, type DELETE in the pop-up. The archive file is removed permanently; for an archive that hasn’t been restored, its data is gone for good.',
        page: '/settings',
      },
      {
        type: 'improvement',
        title: 'Filter by comments',
        description:
          'Saved reviews and Find & review have a new Comments filter: With comments or Without comments (reviewer comments on the ticket). On Saved reviews it also applies to the averages, the Scoring view and Export CSV.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Settings: Archive',
        description:
          'A new Archive tab in Settings, after Prompt Management, moves the data for tickets closed in Zendesk between a start and an end date out of the app into an archive file named after the dates (e.g. 20261101-20261105): every review with its previous versions, score edits, reviewer comments and related links. Check shows what will be archived first. Archives are listed with Download and Restore.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Save a review as an image',
        description:
          'A new picture button in the Actions column of Saved reviews and Find & review downloads the ticket’s row (ticket, subject, status, group, assignee, score) and its full scorecard as one PNG, ready to attach or share. The review opens first if it is closed; checkboxes, buttons and other rows are left out.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Click a row to open its review',
        description:
          'On Saved reviews (Simple and Scoring views) and Find & review, click anywhere on a row (except its links and buttons) to open the scorecard underneath, and click again to close it. In the Scoring view it is the same scorecard as in Simple, kept in view while the wide table scrolls sideways. The eye button is gone. Rows with a review show a pointer on hover, and an open row stays shaded.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Find & review keeps your last search',
        description:
          'Search results now stay on Find & review after a browser refresh or app restart, until you run a new search, so you don’t need to search again. The search boxes show that search’s values, Searched shows when it ran, and Search again runs the same search to update ticket statuses and review results. When the results are from an earlier day, an orange notice asks you to search again, with one-click Search yesterday and Search again buttons.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Ticket Inspector: copy the agent feedback',
        description:
          'Feedback for the agents has a Copy button. It puts the whole feedback on the clipboard, headed with the ticket number and subject, ready to paste into an email, Teams or a document, with its headings and bullet points.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Ticket Inspector: QC comments in light orange',
        description:
          'QC comment boxes under agent comments are now light orange, so the AI’s comments stand apart from the agents’ own replies and from the yellow of internal notes.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Scoring view shows ticket details',
        description:
          'The Scoring view of Saved reviews now also shows each ticket’s subject, status, assignee and resolving agent, all sortable. Click a subject to open its timeline. To make room, category columns are shortened to their initials (C, TDQ, PC, BEQ, RA); hover a heading for the full name.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Prompt Management tab in Settings',
        description:
          'A new Settings › Prompt Management tab shows the instructions the AI follows in one place. The AI review instructions moved here from the AI model tab, and the Ticket Inspector feedback instructions can now be viewed and edited too (with Reset to default). Each shows the full prompt actually sent to the AI, including the parts the app adds, and the other built-in Ticket Inspector prompts are shown read-only.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'Ticket Inspector: feedback for the agents',
        description:
          'A new Feedback for the agents section under the timeline gives AI coaching notes on the whole ticket: an overall view, what went well, what to improve (each with a “Try:” suggestion), habits for next time and a short note for each agent. Points link to the comments they are based on. It is written with the QC comments, is included in Save as image, and is not saved.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Review history: previous reviews are kept',
        description:
          'Reviewing a ticket again, with Re-review or from Find & review, no longer deletes the earlier review. It becomes a previous version and keeps its scores, findings, score edits and justifications. Each ticket has one current review, and only that one counts in Saved reviews, averages, Trends, Categories and exports, so reviewing a ticket several times never inflates your numbers.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Compare versions with View history',
        description:
          'An opened scorecard shows one line with the previous score and the change (e.g. “Previous: 3.65 Good → now 3.80 ▲ +0.15”). View history opens a side-by-side comparison of every version, category by category, with ▲ ▼ against the version before and “edited from” where a reviewer changed a score. Earlier versions can be expanded to read their findings and score-edit justifications.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: '×n badge and Previous versions filter',
        description:
          'A small ×n beside the score marks tickets reviewed more than once (in Saved reviews and Find & review); hover it for details. The new Previous versions filter lists tickets reviewed more than once, or only once.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Export CSV: previous versions',
        description:
          'Export CSV now has a small menu. Current reviews gives one row per ticket with new Version, Review status, Previous versions, Previous review date, Previous total and Previous rating columns. Include all previous versions adds every earlier version as its own row, marked Superseded, right after its current review.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Clearer Re-review and Delete confirmations',
        description:
          'Re-review now says the current review will be kept as a previous version. Deleting a review that has previous versions says how many will be deleted with it.',
        page: '/quality-review',
      },
      {
        type: 'fix',
        title: 'Tickets no longer listed twice in Saved reviews',
        description:
          'Tickets reviewed twice from Find & review used to appear twice in Saved reviews and count twice in the totals. The older review of each is now a previous version, so every ticket appears once (8 tickets were affected; nothing was deleted).',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'User Guide: review history',
        description:
          'The User Guide has a new Review history section, and the FAQs now explain that score edits are kept when a ticket is re-reviewed and how Trends and Saved reviews count tickets.',
        page: '/user-guide',
      },
    ],
  },
  {
    date: '2026-11-05',
    items: [
      {
        type: 'fix',
        title: 'Save as image works in Safari',
        description:
          'Safari (and every browser on iPhone/iPad) allows much smaller images than Chrome or Edge, so saving a long ticket as an image could fail there. The app now detects Safari and saves long tickets at a lower resolution instead.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Clear Node.js version check (Windows and Mac)',
        description:
          'The app now states that it needs Node.js 24 or newer. Installing or starting it on an older version stops with a plain message explaining what to install, instead of failing with a technical error. The README has steps for moving the app to a Mac.',
      },
      {
        type: 'improvement',
        title: 'FAQs in the User Guide',
        description:
          'The User Guide has a new FAQs section with 21 common questions, on reviews and scores, ignoring tickets, exports, Ticket Inspector, settings and more. Click a question to see its answer.',
        page: '/user-guide',
      },
      {
        type: 'fix',
        title: 'Saved reviews export has no 1,000-review limit',
        description:
          'Export CSV now includes every saved review matching the search and filters, however many there are; before, it stopped at the newest 1,000. When more than 1,000 match, Saved reviews says “Showing the newest 1,000 of N matching reviews”, so nothing is left out without notice.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Save Ticket Inspector as an image',
        description:
          'A Save as image button above the Ticket Inspector timeline downloads the ticket header, QC cards and the whole timeline (as currently filtered) as one PNG, ready to attach or share.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Renamed to XR Ticket Insight',
        description:
          'The app is now called XR Ticket Insight (formerly XR Zendesk Ticket Quality Review Dashboard). The shorter name fits on one line in the navigation bar and is used in the browser tab, User Guide and PDF downloads.',
      },
      {
        type: 'improvement',
        title: 'Darker navigation bar',
        description:
          'The top navigation bar is now dark navy with white text in light mode, and a near-black navy in dark mode, so it stands apart from the page. The current page shows as a lighter pill.',
      },
      {
        type: 'improvement',
        title: 'Back to top button',
        description:
          'A round ↑ button appears in the bottom-right corner once you scroll down a long page, such as Saved reviews or the User Guide. Click it to go straight back to the top.',
      },
      {
        type: 'feature',
        title: 'Categories tab: scores by Zendesk field',
        description:
          'Quality Review has a Categories tab that groups saved reviews by any Zendesk drop-down field — Category, Topic, a product field and more — and shows the average score of each QA rubric category and the final score for every value. Sort to find the weakest categories, click a row to see its tickets, and filter by date, group, assignee or status.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Faster searches, reviews and page loads',
        description:
          'Quality Review searches run their Zendesk queries side by side (about 2× faster, same results). Zendesk groups, ticket fields and forms are remembered for 10 minutes instead of being fetched every time, and AI reviews download each ticket’s history once. The app loads only the page you open (the main download is about a third of its old size), fetches the others in the background, and the server compresses what it sends.',
      },
      {
        type: 'feature',
        title: 'Hard rules tab in Settings',
        description:
          'A read-only Settings › Hard rules tab lists the rules built into the app that apply to everyone — tickets created before 2026 are ignored, and emailed replies saved as internal notes count as client replies — plus other fixed behaviour, each with what it does and where it applies.',
        page: '/settings',
      },
      {
        type: 'improvement',
        title: 'Email replies saved as internal notes count as client replies',
        description:
          'When an agent replies by email, Zendesk can save the reply as a private comment although the email went to the client and any internal teams on the thread (VAM, Billing, Activation…). AI reviews and Ticket Inspector QC comments now treat these as replies to the client, so agents aren’t marked down for not getting back to the client. Timelines mark them “Email reply”.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Tickets created before 2026 are ignored',
        description:
          'A fixed rule: tickets created before 1 January 2026 (such as old Closed tickets) are left out of Quality Review and Metadata QC searches, can’t be reviewed, and show “Ignored · before 2026” when looked up or in Saved reviews and Ignored tickets.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Ignored tickets tab',
        description:
          'Quality Review has an Ignored tickets tab listing every ticket that won’t be reviewed — ignored by hand or by a subject rule — with the reason, current Zendesk details and latest review. Tickets ignored by hand can be unignored from there.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Auto-ignore tickets by subject',
        description:
          'Settings › Quality Review can list keywords: tickets whose subject starts with or contains one are ignored automatically and never reviewed. They show an “Ignored · rule” badge, and a tester checks a subject against the rules.',
        page: '/settings',
      },
    ],
  },
  {
    date: '2026-11-04',
    items: [
      {
        type: 'improvement',
        title: 'User Guide refreshed',
        description:
          "New sections on What's New and appearance, the Find & review filters (including Needs re-review), the average score cards, the ticket timeline pop-up, and where credentials and data are stored.",
        page: '/user-guide',
      },
      {
        type: 'feature',
        title: "What's New",
        description: "This page: a timeline of the app's new features, improvements and bug fixes, opened from the button beside the Dark switch.",
      },
      {
        type: 'improvement',
        title: 'New app name',
        description: 'The app is now called XR Zendesk Ticket Quality Review Dashboard. The header wraps onto more lines on narrow screens.',
      },
      {
        type: 'fix',
        title: 'Wide tables in comments stay inside the comment',
        description:
          'Tables from email comments (e.g. SQL query results) no longer spill out of the comment card, and scrollbars are dark in dark mode.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Ticket timeline pop-up',
        description:
          'Click a ticket subject in Metadata QC, Find & review or Saved reviews to see its full timeline, including side conversations, without leaving the page.',
      },
      {
        type: 'feature',
        title: 'OAuth sign-in for Zendesk',
        description:
          'Zendesk retires API tokens on 30 April 2027. Settings › Connections can now sign in with an OAuth client (client credentials); a switch chooses API token or OAuth, and only one can be on.',
        page: '/settings',
      },
      {
        type: 'fix',
        title: 'Resolution Accuracy on solved tickets',
        description: 'Ticket Inspector now always assesses Resolution Accuracy for Solved and Closed tickets; it was sometimes left empty.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Simpler Saved reviews summary',
        description: 'Removed the Average Final Score, Average Score and Ticket Group Counts cards; the per-category average cards remain.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Re-review filter',
        description:
          'Find tickets re-opened in Zendesk since their review: Re-review › Needs re-review in Saved reviews, and Review states › Needs re-review in Find & review.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Remembered filters',
        description: 'Table filters, search boxes and Ticket Inspector options are kept in your browser, so they survive reloads and server restarts.',
      },
      {
        type: 'improvement',
        title: 'Metadata QC: Missing by field removed',
        description: 'The Missing by field section is gone; use the table’s Missing fields filter instead.',
        page: '/metadata-qc',
      },
      {
        type: 'fix',
        title: 'Ticket Inspector QC comment errors',
        description: 'Fixed “QC comment failed: Expected \':\' after property name in JSON” on some comments; failed comments are now retried automatically.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Comprehension and Resolution Accuracy cards',
        description: 'Ticket Inspector assesses the ticket as a whole: the customer’s issue and how well agents understood it, and the resolution when there is one.',
        page: '/ticket-inspector',
      },
      {
        type: 'improvement',
        title: 'Ticket Inspector QC comments are not saved',
        description: 'QC comments in Ticket Inspector are written fresh each time and only shown, never stored.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Ticket Inspector: progress, formatting and QC comments',
        description:
          'A progress bar while retrieving, comments shown with their original formatting, and an AI QC comment on each agent comment (Troubleshooting & Documentation, Professional Communication, Business English).',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Ticket Inspector',
        description:
          'Enter a ticket ID to see its history from the Zendesk audit as a timeline: public and private comments, status / group / assignee movements and side conversations.',
        page: '/ticket-inspector',
      },
      {
        type: 'feature',
        title: 'Saved reviews summary cards',
        description: 'Average score cards above the Saved reviews table that follow the search and filters.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'App icon',
        description: 'A favicon for the browser tab.',
      },
      {
        type: 'feature',
        title: 'Trends',
        description: 'A Trends tab in Quality Review charting daily average scores for each category.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Download QA Rubrics',
        description: 'A Download button on the QA Rubrics page saves the rubrics as a document.',
        page: '/qa-rubrics',
      },
      {
        type: 'feature',
        title: 'Screenshots in AI reviews',
        description: 'Image attachments (screenshots) are sent to the AI with the conversation; signature logos and oversized files are skipped.',
        page: '/quality-review',
      },
    ],
  },
  {
    date: '2026-11-03',
    items: [
      {
        type: 'feature',
        title: 'Ignore / Unignore tickets',
        description: 'Flag tickets (e.g. spam or duplicates) so they are never reviewed, and unflag them again.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Saved reviews tidy-up',
        description: 'The Reviewed column fits the date and time, and the “Latest review per ticket only” option was removed.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Larger Reviewer Instruction box',
        description: 'More room to edit the AI reviewer instructions in Settings.',
        page: '/settings',
      },
      {
        type: 'feature',
        title: 'QA Rubrics and User Guide pages',
        description: 'A page showing the QA rubrics, and a User Guide explaining every part of the app.',
        page: '/user-guide',
      },
      {
        type: 'feature',
        title: 'Rows per page',
        description: 'Choose 25, 50 or 100 rows per table, with page buttons when there are more.',
      },
      {
        type: 'feature',
        title: 'Sortable tables',
        description: 'Click any column header to sort ascending, descending, or back to the original order.',
      },
      {
        type: 'feature',
        title: 'Edit review scores',
        description: 'Change category scores on a saved review; a written justification is required and every change is logged.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Re-review',
        description: 'Review a ticket again from Saved reviews; the new review replaces the old one.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Red ticket number after re-open',
        description: 'A ticket number turns red when the ticket was re-opened after it was reviewed.',
      },
      {
        type: 'feature',
        title: 'Metadata QC filters',
        description: 'Filter the Metadata QC table by status, group, last updated by, assignee and more.',
        page: '/metadata-qc',
      },
      {
        type: 'feature',
        title: 'Simple and Scoring views',
        description: 'Saved reviews can show one row per review (Simple) or every category score side by side (Scoring).',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Show all / Hide all reviews',
        description: 'Open or close every scorecard in the list at once.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Multi-select filters',
        description: 'Every filter dropdown lets you tick several values.',
      },
      {
        type: 'feature',
        title: 'Review progress bar',
        description: 'A progress bar on each ticket while its review runs.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Dates as dd/mm/yyyy',
        description: 'All dates show day first.',
      },
      {
        type: 'improvement',
        title: 'Quality Review first',
        description: 'Quality Review is first in the navigation and opens by default.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Clearer review panels',
        description: 'Review results under a ticket have a darker background so they don’t look like another row, and the possible metadata issues section was removed from Quality Review.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Reviewer comments',
        description: 'Add notes to a ticket from the Actions column; pasted links are clickable and open in a new tab.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Related Zendesk tickets and Jira issues',
        description: 'Link related Zendesk tickets or Jira issues to a reviewed ticket, with a note.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Quality Review and re-open icon',
        description: 'AI Review is renamed Quality Review, and an icon after the subject shows tickets re-opened after being solved.',
        page: '/quality-review',
      },
      {
        type: 'improvement',
        title: 'Results kept between pages',
        description: 'Results, filters and reviews in progress stay when you switch to another page and back.',
      },
      {
        type: 'feature',
        title: 'Quality Review filters and icon actions',
        description: 'Filter the review table, with View, Review and Re-review as icon buttons.',
        page: '/quality-review',
      },
      {
        type: 'feature',
        title: 'Separate Metadata QC and AI review modules',
        description: 'Metadata checks and AI reviews became separate pages, and AI reviews are saved to a database.',
      },
      {
        type: 'feature',
        title: 'Side conversations',
        description: 'An envelope icon after the subject marks tickets with side conversations, and their content is included in reviews.',
      },
      {
        type: 'improvement',
        title: 'New look',
        description: 'The interface moved to the shadcn/ui component library, and the table widened to avoid sideways scrolling.',
      },
      {
        type: 'feature',
        title: 'Metadata QC columns and form rules',
        description:
          'A Last Updated By column, a configurable list of required fields, and fields only counted as required when the ticket’s form shows them.',
        page: '/metadata-qc',
      },
      {
        type: 'feature',
        title: 'Ticket status selection',
        description: 'Choose which ticket statuses to check.',
        page: '/metadata-qc',
      },
      {
        type: 'feature',
        title: 'First release',
        description: 'Pulls solved Zendesk tickets and checks whether their required metadata is filled in, with a Settings page for the Zendesk connection.',
        page: '/metadata-qc',
      },
    ],
  },
]

// Newest date with release notes; used to show a "new" dot on the What's New button.
export const LATEST_CHANGE = CHANGELOG[0]?.date ?? ''
