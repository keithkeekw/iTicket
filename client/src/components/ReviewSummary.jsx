// Summary cards above the Saved reviews table (Simple and Scoring views): the average score of each
// category for the reviews currently listed, so they follow the search, filters and date range.
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Solid versions of the score badge colours (5 green, 4 blue, 3 amber, 1–2 red).
const BAR_COLOR = { 5: 'bg-success', 4: 'bg-info', 3: 'bg-warning', 2: 'bg-destructive', 1: 'bg-destructive' }

const mean = values => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

// Categories in rubric order, as they appear on the scored reviews, with their average score.
function categoryAverages(reviews) {
  const categories = []
  for (const r of reviews) {
    if (r.total == null) continue
    for (const s of r.scores || []) {
      if (s.score == null) continue
      let c = categories.find(x => x.name === s.name)
      if (!c) categories.push((c = { name: s.name, weight: s.weight, scores: [] }))
      c.scores.push(Number(s.score))
    }
  }
  return categories.map(c => ({ ...c, average: mean(c.scores) }))
}

// Thin bar showing a 1–5 average as a share of 5, coloured like the score badges.
function ScoreBar({ value }) {
  if (value == null) return null
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={cn('h-full rounded-full', BAR_COLOR[Math.max(1, Math.round(value))])}
        style={{ width: `${(value / 5) * 100}%` }}
      />
    </div>
  )
}

function StatCard({ label, hint, className, labelClassName, children }) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardContent className="space-y-2 px-4">
        <div className={cn('text-muted-foreground text-xs font-medium', labelClassName)}>{label}</div>
        {children}
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </CardContent>
    </Card>
  )
}

export default function ReviewSummary({ reviews }) {
  if (!reviews?.length) return null
  const categories = categoryAverages(reviews)
  if (!categories.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {categories.map(c => (
        <StatCard
          key={c.name}
          label={`Average Score for ${c.name}`}
          labelClassName="lg:min-h-8"
          hint={c.weight != null ? `${Math.round(c.weight * 1000) / 10}% weight` : undefined}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums">{c.average.toFixed(2)}</span>
            <span className="text-muted-foreground text-sm">/ 5</span>
          </div>
          <ScoreBar value={c.average} />
        </StatCard>
      ))}
    </div>
  )
}
