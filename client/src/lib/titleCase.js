// Title Case for button labels ("Re-review selected" → "Re-review Selected"). Each word starts with a
// capital, except short joining words (a, and, of, to, …) that are not first. Words already holding
// a capital (AI, CSV, OAuth), and anything with digits or symbols (dates, ticket numbers, emails,
// "dd/mm/yyyy") are left as they are. The rest of a word is never lowered.
import { Children, cloneElement, isValidElement } from 'react'

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with'])

export function titleCase(text, { continues = false } = {}) {
  let first = !continues
  return String(text).replace(/[^\s]+/g, word => {
    const isFirst = first
    first = false
    // Leave mixed or upper case, numbers, dates, emails, #tickets and paths alone.
    if (/[A-Z0-9@#/\\_.:]/.test(word.replace(/[’'.,;:!?)…]+$/, ''))) return word
    const letters = word.match(/^([^a-z]*)([a-z])(.*)$/)
    if (!letters) return word
    const bare = word.replace(/^[^a-z]+|[^a-z’'-]+$/g, '')
    if (!isFirst && SMALL.has(bare)) return word
    return letters[1] + letters[2].toUpperCase() + letters[3]
  })
}

// Title-cases the text parts of React children (one level deep, through a single wrapping
// element such as an <a> inside <Button asChild>). Later text parts don't count as a label's
// first word, so "Re-review selected (" + n + ")" reads "Re-review Selected (n)".
export function titleCaseChildren(children) {
  let seenText = false
  const walk = child => {
    if (typeof child === 'string') {
      const out = titleCase(child, { continues: seenText })
      if (child.trim()) seenText = true
      return out
    }
    if (isValidElement(child) && child.props?.children !== undefined && typeof child.type === 'string') {
      return cloneElement(child, undefined, ...Children.toArray(child.props.children).map(walk))
    }
    return child
  }
  return Children.map(children, walk)
}

// For <Button asChild>: keeps the single child element (the slot needs exactly one) and
// title-cases the text inside it.
export function titleCaseSlot(child) {
  if (!isValidElement(child) || child.props?.children === undefined) return child
  return cloneElement(child, undefined, ...(titleCaseChildren(child.props.children) || []))
}
