// Hard rule: Bump Bump Solve. A family of Zendesk automations ("Bump Bump Solve (1/3 … 3/3)",
// "Bump Bump Solve Global Production Support (1/2, 2/2)", WB / AdCosts variants) reminds the
// requester of a Pending ticket and, after repeated reminders with no reply, solves or closes the
// ticket automatically. Such a ticket ended because the requester stopped responding: it is not the
// agent's fault that it has no resolution or was solved without the requester's confirmation.
//
// Detected from the audit log, not the BBS tags: Zendesk copies tags into follow-up tickets, so a
// tag alone can belong to an earlier ticket. The signal is an audit made by an automation whose name
// contains "Bump Bump Solve" that changes the status to Solved or Closed.

const BUMP_SOLVE = /bump\s*bump\s*solve/i
const SOLVED = ['solved', 'closed']

// { title, at, reopenedAfter } for the latest automatic solve of the ticket, or null.
export function bumpSolve(audits = []) {
  let hit = null
  for (const a of audits) {
    const rel = a.via?.source?.rel
    const title = a.via?.source?.from?.title || ''
    const status = (a.events || []).find(e => e.type === 'Change' && e.field_name === 'status')?.value
    if (rel === 'automation' && BUMP_SOLVE.test(title) && SOLVED.includes(status)) {
      hit = { title, at: a.created_at, reopenedAfter: false }
    } else if (hit && status && !SOLVED.includes(status)) {
      // Re-opened (e.g. the requester replied) after the automatic solve.
      hit.reopenedAfter = true
    }
  }
  return hit
}

// Line added to the ticket details in the AI prompts for a ticket solved by the automation.
export function bumpSolveFlag(b) {
  return (
    `SOLVED BY BUMP BUMP SOLVE: yes. The Zendesk automation "${b.title}" solved this ticket at ${b.at} because the requester did not reply after repeated reminders` +
    (b.reopenedAfter ? '; the ticket was re-opened afterwards' : '') +
    ' (see the Bump Bump Solve hard rule).'
  )
}

// Rule added to every AI prompt (Quality Review scoring and the Ticket Inspector prompts).
export const BUMP_SOLVE_RULE = `BUMP BUMP SOLVE (hard rule)
- Bump Bump Solve is a Zendesk automation: when the requester does not reply to a pending ticket after repeated reminders (up to 3 attempts), Zendesk solves or closes the ticket automatically.
- On a ticket flagged "SOLVED BY BUMP BUMP SOLVE: yes" (or "solved_by_bump_bump_solve"), the requester stopped responding. It is NOT the agent's fault that the ticket ended without a resolution, or was solved without the requester's confirmation. Never mark the agent down for a missing resolution, a missing confirmation, or the automatic solve itself. This overrides any instruction to score a Solved or Closed ticket low because it has no real or confirmed outcome.
- Judge Resolution Accuracy on the agent's handling up to the point the ticket was waiting on the requester: was the diagnosis right, was the request for information or confirmation clear, were the next steps reasonable. Do not score it low only because no confirmed fix exists.
- The automation's reminder messages are not the agent's writing.
- If the ticket was re-opened after the automatic solve, judge the handling after the re-open normally.`
