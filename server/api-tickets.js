// Hard rule: automated notification tickets. A ticket created by an agent account through the
// Zendesk API (via channel "api"), or sent in by a system mailbox (NOTIFICATION_SENDERS, or any
// "no reply" / "do not reply" address), is an automated notification. No person is waiting behind it,
// so the agent is not required to send any customer-facing reply. The rule text is added to every
// AI prompt; tickets it applies to are flagged in the ticket details the AI receives.

import { getSettings } from './settings.js'

// System mailboxes whose emails are notifications, like API-created tickets (lower case). Admins add
// more in Settings › Hard rules (hardRules.automatedSenders) without changing the code.
export const NOTIFICATION_SENDERS = [
  'extremereach@extremereach.com',
  'no-reply@hibob.com',
  'ingest.service@extremereach.com',
  'aqa.es@adstream.com',
]

// Any address containing "no reply" or "do not reply", however it is written (noreply, no-reply,
// no_reply, no.reply, NoReply-Team, donotreply, do-not-reply, …, in the name or the domain): the
// address is compared with everything but letters removed.
const isNoReply = address => /noreply|donotreply/.test(address.replace(/[^a-z]/g, ''))

// True when `address` matches an admin-added sender: an exact address, a pattern where * stands
// for any characters, or "@domain" for every address at that domain.
export function matchesSender(pattern, address) {
  const p = String(pattern || '').toLowerCase()
  if (!p) return false
  if (p.startsWith('@')) return address.endsWith(p)
  if (!p.includes('*')) return address === p
  // Pattern with *: the pieces between the stars must appear in order, the first at the start and
  // the last at the end.
  const pieces = p.split('*')
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  if (!address.startsWith(first) || !address.endsWith(last) || address.length < first.length + last.length) return false
  let pos = first.length
  for (const piece of pieces.slice(1, -1)) {
    const at = address.indexOf(piece, pos)
    if (at === -1 || at + piece.length > address.length - last.length) return false
    pos = at + piece.length
  }
  return true
}

const isNotificationSender = address => {
  const a = String(address || '').trim().toLowerCase()
  if (!a) return false
  const extra = getSettings().hardRules?.automatedSenders || []
  return NOTIFICATION_SENDERS.includes(a) || isNoReply(a) || extra.some(p => matchesSender(p, a))
}

// Why a ticket is an automated notification: 'api', 'sender', or null when it isn't one.
// `requesterEmail` (optional) is checked too, for tickets whose creation channel isn't email.
export function notificationReason(ticket, requesterEmail = null) {
  if (ticket?.via?.channel === 'api') return 'api'
  if (isNotificationSender(ticket?.via?.source?.from?.address) || isNotificationSender(requesterEmail)) return 'sender'
  return null
}

// True when the ticket is an automated notification (created via the API, or from a system mailbox).
export const createdViaApi = (ticket, requesterEmail) => notificationReason(ticket, requesterEmail) != null

// Line added to the ticket details in the AI prompts for a notification ticket.
export function notificationFlag(reason) {
  const how =
    reason === 'sender'
      ? 'It was sent in by a system mailbox (a known notification sender or a no-reply address)'
      : 'It was created by an agent account through the Zendesk API'
  return `AUTOMATED NOTIFICATION: yes. ${how}: no human being is behind it (see the automated-notification hard rule).`
}
// Kept for callers that only know the ticket was created via the API.
export const API_TICKET_FLAG = notificationFlag('api')

// Rule added to every AI prompt (Quality Review scoring and the Ticket Inspector prompts).
export const API_TICKET_RULE = `AUTOMATED NOTIFICATION TICKETS (hard rule)
- A ticket flagged "AUTOMATED NOTIFICATION: yes" (or "automated_notification": true) was either created by an agent account through the Zendesk API, or sent in by a system mailbox (known notification senders, senders the admin marked as automated, or any "no reply" / "do not reply" address). It is an automated notification: there is no human being behind it waiting for an answer.
- The agent is NOT required to send any customer-facing reply on such a ticket. Never mark the agent down, or describe it as a failure, for having no public reply, acknowledgement, update, follow-up or closing message to the requester.
- Messages labelled "AUTOMATED MESSAGE" (posted through the API, or emailed by a system or no-reply mailbox, even from an agent account) are not an agent's own writing: use them as context only and never judge, score or comment on them as the agent's work.
- Still judge what the agent did do: understanding of the notification, the actions taken, internal notes and documentation, and the outcome. Where there is no customer-facing reply at all, judge communication and business English on what the agent did write (e.g. internal notes); do not score them low only because there was no reply to the requester.`

export { isNotificationSender }

// True for a comment that isn't an agent's own writing: posted through the API, or sent by email
// from a system mailbox (above), including agent accounts such as extremereach@extremereach.com.
// Such comments are not QC'd and are labelled AUTOMATED in the AI prompts.
export function automatedComment({ via, authorEmail }) {
  if (via?.channel === 'api') return true
  return isNotificationSender(via?.source?.from?.address) || isNotificationSender(authorEmail)
}

export const AUTOMATED_COMMENT_LABEL = 'AUTOMATED MESSAGE (system mailbox or integration, not written by an agent; do not judge it)'
