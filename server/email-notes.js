// Email replies saved as internal notes. When an agent answers a ticket by email (often with the
// client and internal teams such as VAM, Billing or Activation on the thread), Zendesk can store
// the reply as an INTERNAL NOTE even though the email itself went to everyone on it, the client
// included. These helpers recognise such notes so the AI model doesn't conclude the agent never
// got back to the client.

// Domains of XR's own mailboxes and people; any other recipient is external (client, vendor, ...).
const INTERNAL_DOMAINS = ['extremereach.com', 'adstream.com']

const domainOf = address => String(address || '').split('@')[1]?.toLowerCase() || null
const isInternal = domain => INTERNAL_DOMAINS.some(d => domain === d || domain?.endsWith(`.${d}`))

// { external: ['@sdsu.edu (2)'], internalCount } for a private comment that arrived by email,
// or null for anything else. Only domains and counts are kept, not addresses.
export function emailReply({ isPublic, via }) {
  if (isPublic || via?.channel !== 'email') return null
  const recipients = via.source?.from?.original_recipients || []
  const counts = new Map()
  let internalCount = 0
  for (const address of recipients) {
    const domain = domainOf(address)
    if (!domain) continue
    if (isInternal(domain)) internalCount++
    else counts.set(domain, (counts.get(domain) || 0) + 1)
  }
  return { external: [...counts].map(([d, n]) => `@${d}${n > 1 ? ` (${n})` : ''}`), internalCount }
}

// Label used in the AI prompts in place of plain "INTERNAL NOTE".
export function emailReplyLabel(info) {
  const parts = []
  if (info.external.length) parts.push(`external recipients ${info.external.join(', ')}`)
  if (info.internalCount) parts.push(`${info.internalCount} XR address${info.internalCount > 1 ? 'es' : ''}`)
  return `INTERNAL NOTE — EMAIL REPLY (sent by email${parts.length ? ` to ${parts.join(' and ')}` : ''})`
}

// Rule added to both AI prompts.
export const EMAIL_REPLY_RULE = `EMAIL REPLIES SAVED AS INTERNAL NOTES (hard rule)
- When an agent replies by email, Zendesk records the reply as an INTERNAL NOTE, but the email itself was sent to everyone on the email thread. These are labelled "INTERNAL NOTE — EMAIL REPLY" with their recipients.
- Internal teams (e.g. VAM, Billing, Activation) are often on the same email thread and ticket. An email reply sent to the thread reached the client as well, especially when external recipients are listed.
- Never conclude that the agent failed to reply to, update or follow up with the client because the reply is an internal note. Treat an EMAIL REPLY as customer-facing communication: judge it as a reply to the client (tone, clarity, ownership, follow-up) and count it toward response, follow-up and resolution.
- Only an INTERNAL NOTE without the EMAIL REPLY label is internal-only.`
