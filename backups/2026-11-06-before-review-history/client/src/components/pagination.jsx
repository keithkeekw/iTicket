// Page-size selector (25 / 50 / 100 rows) and page navigation for the data tables.
// The chosen page size is remembered per table in this browser.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const PAGE_SIZES = [25, 50, 100]

function readSize(storageKey) {
  try {
    const n = Number(localStorage.getItem(`pageSize:${storageKey}`))
    return PAGE_SIZES.includes(n) ? n : PAGE_SIZES[0]
  } catch {
    return PAGE_SIZES[0]
  }
}

// rows: the full (filtered, sorted) list. Goes back to page 1 whenever `resetKey` changes
// (e.g. filters, search or sort), and stays on a valid page when rows are added or removed.
export function usePagination(rows, { storageKey, resetKey }) {
  const [pageSize, setPageSizeState] = useState(() => readSize(storageKey))
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [resetKey])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  const setPageSize = size => {
    setPageSizeState(size)
    setPage(1)
    try {
      localStorage.setItem(`pageSize:${storageKey}`, String(size))
    } catch {
      /* storage unavailable */
    }
  }

  return { pageRows, page: current, pageCount, pageSize, setPage, setPageSize, total: rows.length, start }
}

// Numbered pages with gaps, e.g. 1 … 4 5 6 … 12
function pageNumbers(page, count) {
  const set = new Set([1, count, page - 1, page, page + 1].filter(n => n >= 1 && n <= count))
  const sorted = [...set].sort((a, b) => a - b)
  const out = []
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(`gap-${n}`)
    out.push(n)
  })
  return out
}

// "Rows per page" selector, "Showing x–y of n", and page buttons (only when there is more than one page).
export function Pagination({ page, pageCount, pageSize, setPage, setPageSize, total, start, label = 'rows' }) {
  if (!total) return null
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm" aria-label="Table pages">
      <div className="text-muted-foreground flex items-center gap-2">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
          <SelectTrigger size="sm" className="w-20" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map(n => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          Showing {start + 1}–{Math.min(start + pageSize, total)} of {total} {label}
        </span>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="First page" disabled={page === 1} onClick={() => setPage(1)}>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          {pageNumbers(page, pageCount).map(n =>
            typeof n === 'string' ? (
              <span key={n} className="text-muted-foreground px-1">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === page ? 'default' : 'outline'}
                size="sm"
                className="min-w-8 px-2 tabular-nums"
                aria-current={n === page ? 'page' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={page === pageCount}
            onClick={() => setPage(pageCount)}
          >
            <ChevronsRight />
          </Button>
        </div>
      )}
    </nav>
  )
}
