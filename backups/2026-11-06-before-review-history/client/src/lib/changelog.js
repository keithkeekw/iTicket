// Release notes shown on the What's New page, newest day first and newest change first within a
// day. Add new entries at the top. type: 'feature' | 'improvement' | 'fix'. page (optional) is the
// app page the change is on, shown as a link.

export const CHANGELOG = [
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
