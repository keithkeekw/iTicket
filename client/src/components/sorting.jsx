// Click-to-sort table headers. Each click on a header cycles ascending → descending → original
// order. Empty values always sort last, text compares case-insensitively with numbers in natural
// order ("Ticket 2" before "Ticket 10").
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { titleCaseChildren } from '@/lib/titleCase'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const isEmpty = v => v == null || v === '' || v === '—' || (typeof v === 'number' && Number.isNaN(v))

function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

// Sorts rows by `sort` ({ key, dir } or null for original order) using getters { sortKey: row => value }.
// Exported so other row sets (e.g. a full CSV export) can be sorted exactly like the table.
export function sortRows(rows, sort, getters) {
  const get = sort && getters[sort.key]
  if (!get) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  // Stable: equal values keep their original relative order.
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((x, y) => {
      const ex = isEmpty(x.value)
      const ey = isEmpty(y.value)
      if (ex || ey) return ex === ey ? x.index - y.index : ex ? 1 : -1
      return sign * compare(x.value, y.value) || x.index - y.index
    })
    .map(x => x.row)
}

// rows: array; getters: { sortKey: row => value }. Returns the sorted rows plus the sort state.
export function useSortable(rows, getters) {
  const [sort, setSort] = useState(null) // { key, dir: 'asc' | 'desc' } or null for original order

  // getters are recreated each render; the sort only needs to follow the rows and sort state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = useMemo(() => sortRows(rows, sort, getters), [rows, sort])

  const toggle = key =>
    setSort(s => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))

  return { sorted, sort, toggle }
}

// Table header cell with a sort button; pass the `sort`/`toggle` from useSortable.
export function SortableHead({ sortKey, sort, onSort, children, className, align = 'start' }) {
  const active = sort?.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={!active ? 'Sort ascending' : sort.dir === 'asc' ? 'Sort descending' : 'Clear sorting'}
        className={cn(
          'hover:text-foreground inline-flex items-center gap-1 rounded-sm text-start font-medium',
          align === 'end' && 'flex-row-reverse text-end',
          align === 'center' && 'justify-center',
          active ? 'text-foreground' : 'text-foreground/90',
        )}
      >
        {/* Centred headers get an empty space as wide as the icon on the other side, so the
            label itself sits in the middle of the column. */}
        {align === 'center' && <span className="size-3.5 shrink-0" aria-hidden="true" />}
        <span>{titleCaseChildren(children)}</span>
        <Icon className={cn('size-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden="true" />
      </button>
    </TableHead>
  )
}
