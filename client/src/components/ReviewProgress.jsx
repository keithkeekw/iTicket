// Full-width progress bar shown under a ticket row while its review runs. A review is one
// request to the model, so progress is estimated from elapsed time against how long recent
// reviews took; it eases towards 95% and never claims to be finished before the result arrives.
import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

function estimate(elapsedMs, expectedMs) {
  // ~90% at the expected duration, then creeping closer to (but never reaching) 95%.
  return Math.min(95, 95 * (1 - Math.exp((-2.3 * elapsedMs) / expectedMs)))
}

export function ReviewProgress({ startedAt, expectedMs, queued = false }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (queued) return
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [queued])

  const elapsed = queued ? 0 : Math.max(0, now - startedAt)
  const pct = queued ? 0 : estimate(elapsed, expectedMs)
  const label = queued ? 'Queued — waiting for a free review slot' : `Reviewing… ${Math.floor(elapsed / 1000)}s`

  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className={cn('font-medium', queued && 'text-muted-foreground')}>{label}</span>
        {!queued && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {Math.round(pct)}% · usually about {Math.round(expectedMs / 1000)}s
          </span>
        )}
      </div>
      <Progress
        value={pct}
        aria-label={queued ? 'Queued for review' : 'Review progress (estimated)'}
        className="h-2.5 [&>[data-slot=progress-indicator]]:duration-200"
      />
    </div>
  )
}
