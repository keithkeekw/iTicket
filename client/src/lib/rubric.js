// Turns the free-text reviewer instructions (Settings → Prompt Management) into a structured QA rubric:
// intro sections ("Role: …"), numbered categories with weights and criteria, term definitions
// (e.g. ticket statuses), the 1–5 scoring scale, overall rating bands and any other rule lists.
// It is tolerant: anything it cannot place is kept as plain text, and `categories` is empty when
// the instructions don't follow the "1. Name – 10%" pattern.

// "1. Comprehension – 10%" (en dash, em dash or hyphen)
const CATEGORY = /^(\d+)\.\s*(.+?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*%\s*$/
// "Scoring Rules:" — a heading line on its own
const HEADING = /^([A-Z][A-Za-z &/-]{1,60}):\s*$/
// "Role: You are …" — a labelled intro paragraph
const LABELLED = /^([A-Z][A-Za-z &/-]{1,40}):\s+(.+)$/
// "Pending: Waiting for …" — a short term with its definition (one or two words)
const DEFINITION = /^([A-Z][A-Za-z-]*(?: [A-Za-z-]+)?):\s+(.+)$/
// "4.50–5.00 = Excellent"
const BAND = /^(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*=\s*(.+)$/
// "1 = Poor | 2 = Below Standard | …"
const SCALE = /(\d)\s*=\s*([^|]+)/g

export function parseRubric(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
  const rubric = { intro: [], categories: [], scale: [], bands: [], sections: [] }
  let category = null
  let section = null

  const closeCategory = () => {
    if (category) rubric.categories.push(category)
    category = null
  }

  for (const line of lines) {
    if (!line) continue
    const cat = line.match(CATEGORY)
    if (cat) {
      closeCategory()
      section = null
      category = { number: Number(cat[1]), name: cat[2], weight: Number(cat[3]) / 100, criteria: [], definitions: [] }
      continue
    }
    // Headings are short ("Scoring Rules:"); a longer line ending in ":" is a sentence introducing a list.
    const heading = line.match(HEADING)
    if (heading && heading[1].split(/\s+/).length <= 4 && !(category && /definitions?:?$/i.test(line))) {
      // A heading before the first category ("Evaluation Categories & Weighted Scoring:") just introduces them.
      if (!rubric.categories.length && !category) continue
      closeCategory()
      section = { title: heading[1], items: [] }
      rubric.sections.push(section)
      continue
    }
    if (category) {
      const def = line.match(DEFINITION)
      if (def && category.criteria.some(c => /definitions?:$/i.test(c))) category.definitions.push({ term: def[1], text: def[2] })
      else category.criteria.push(line)
      continue
    }
    if (section) {
      const band = line.match(BAND)
      if (band) {
        rubric.bands.push({ min: Number(band[1]), max: Number(band[2]), rating: band[3].trim() })
        continue
      }
      const scale = [...line.matchAll(SCALE)]
      if (scale.length >= 3) {
        rubric.scale = scale.map(m => ({ score: Number(m[1]), label: m[2].trim() }))
        const lead = line.split(':')[0]
        if (lead && lead !== line) section.items.push(`${lead}.`)
        continue
      }
      section.items.push(line)
      continue
    }
    // A line ending in ":" before the categories (e.g. "Evaluation Categories & Weighted Scoring:") only
    // introduces what follows.
    if (line.endsWith(':')) continue
    const labelled = line.match(LABELLED)
    if (labelled) rubric.intro.push({ label: labelled[1], text: labelled[2] })
    else if (rubric.intro.length) rubric.intro[rubric.intro.length - 1].text += ` ${line}`
    else rubric.intro.push({ label: '', text: line })
  }
  closeCategory()
  rubric.sections = rubric.sections.filter(s => s.items.length)
  rubric.totalWeight = Math.round(rubric.categories.reduce((sum, c) => sum + c.weight, 0) * 1000) / 10
  return rubric
}
