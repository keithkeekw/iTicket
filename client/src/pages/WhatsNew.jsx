// What's New: a timeline of the app's new features, improvements and bug fixes, from
// lib/changelog.js, grouped by day (newest first) with a filter by type.
import { useMemo } from 'react'
import { Bug, Sparkles, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CHANGELOG } from '@/lib/changelog'
import { formatDate, parseIsoDay } from '@/lib/dates'
import { usePersistentState } from '@/lib/persist'
import { TONE } from '@/lib/tones'
import { cn } from '@/lib/utils'

const TYPES = {
  feature: { label: 'New feature', plural: 'New features', Icon: Sparkles, tone: TONE.success, marker: 'bg-success/15 text-success border-success/40' },
  improvement: { label: 'Improvement', plural: 'Improvements', Icon: Wrench, tone: TONE.info, marker: 'bg-info/15 text-info border-info/40' },
  fix: { label: 'Bug fix', plural: 'Bug fixes', Icon: Bug, tone: TONE.warning, marker: 'bg-warning/20 text-warning border-warning/40' },
}
const ALL_TYPES = Object.keys(TYPES)

const PAGE_LABEL = {
  '/quality-review': 'Quality Review',
  '/ticket-inspector': 'Ticket Inspector',
  '/metadata-qc': 'Metadata QC',
  '/qa-rubrics': 'QA Rubrics',
  '/user-guide': 'User Guide',
  '/settings': 'Settings',
}

const weekday = iso => parseIsoDay(iso).toLocaleDateString('en-GB', { weekday: 'long' })

function Entry({ item }) {
  const { label, Icon, tone, marker } = TYPES[item.type]
  return (
    <li className="relative flex gap-3 pb-4">
      <span className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-full border', marker)}>
        <Icon className="size-4" />
      </span>
      <Card className="min-w-0 flex-1 gap-1.5 py-3">
        <CardContent className="space-y-1.5 px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.title}</span>
            <Badge variant="outline" className={tone}>
              {label}
            </Badge>
            {item.page && PAGE_LABEL[item.page] && (
              <Link to={item.page} className="text-info ml-auto text-xs underline-offset-4 hover:underline">
                {PAGE_LABEL[item.page]} →
              </Link>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{item.description}</p>
        </CardContent>
      </Card>
    </li>
  )
}

export default function WhatsNew() {
  const [types, setTypes] = usePersistentState('whatsNew.types', ALL_TYPES)

  const counts = useMemo(() => {
    const c = Object.fromEntries(ALL_TYPES.map(t => [t, 0]))
    for (const day of CHANGELOG) for (const item of day.items) c[item.type]++
    return c
  }, [])

  const days = CHANGELOG.map(day => ({ ...day, items: day.items.filter(i => types.includes(i.type)) })).filter(
    day => day.items.length,
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">What&apos;s New</h1>
        <p className="text-muted-foreground text-sm">New features, improvements and bug fixes, newest first.</p>
      </div>

      <ToggleGroup type="multiple" variant="outline" size="sm" value={types} onValueChange={setTypes} className="flex-wrap">
        {ALL_TYPES.map(t => {
          const { plural, Icon } = TYPES[t]
          return (
            <ToggleGroupItem
              key={t}
              value={t}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground gap-1.5 px-3"
            >
              <Icon className="size-3.5" />
              {plural}
              <span className="tabular-nums opacity-70">{counts[t]}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      {days.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Select at least one type.</p>
      ) : (
        <ol className="relative space-y-1 before:absolute before:top-2 before:bottom-6 before:left-4 before:w-px before:bg-border">
          {days.map(day => (
            <li key={day.date} className="space-y-3">
              <div className="relative z-10 flex items-center gap-2">
                <span className="bg-muted text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium">
                  {formatDate(day.date)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {weekday(day.date)} · {day.items.length} change{day.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <ol>
                {day.items.map(item => (
                  <Entry key={item.title} item={item} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
