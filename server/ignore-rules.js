// Automatic ignore rules for Quality Review: a ticket whose subject starts with or contains one
// of the keywords in Settings › Quality Review is treated as ignored. Rules are checked every time
// tickets are listed or reviewed (nothing is stored per ticket), so editing a rule applies at once.
import { getSettings } from './settings.js'

const MATCHES = ['starts', 'contains']

// Cleaned rules from settings: known match type, trimmed non-empty keyword, no duplicates.
export function ignoreRules(review = getSettings().review) {
  const seen = new Set()
  const out = []
  for (const r of review?.ignoreRules || []) {
    const match = MATCHES.includes(r?.match) ? r.match : 'contains'
    const keyword = String(r?.keyword ?? '').trim()
    const key = `${match}\n${keyword.toLowerCase()}`
    if (!keyword || seen.has(key)) continue
    seen.add(key)
    out.push({ match, keyword })
  }
  return out
}

export const describeRule = r => `Subject ${r.match === 'starts' ? 'starts with' : 'contains'} “${r.keyword}”`

// The first rule the subject matches, or null.
export function matchingRule(subject, rules = ignoreRules()) {
  const s = String(subject ?? '').trim().toLowerCase()
  if (!s) return null
  return (
    rules.find(r => {
      const k = r.keyword.toLowerCase()
      return r.match === 'starts' ? s.startsWith(k) : s.includes(k)
    }) || null
  )
}

// Adds the rule-based ignore state to a ticket or review row that has `subject` and a manual
// `ignored` flag: ignored = manual or rule, ignoredManually = manual flag, ignoreRule = description.
export function withIgnoreRule(row, rules = ignoreRules()) {
  const rule = matchingRule(row.subject, rules)
  const manual = Boolean(row.ignored)
  return { ...row, ignored: manual || Boolean(rule), ignoredManually: manual, ignoreRule: rule ? describeRule(rule) : null }
}
