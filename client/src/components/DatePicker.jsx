// Date field that always shows dd/mm/yyyy (the browser's own date input follows the browser
// language, e.g. mm/dd/yyyy in US English). Value in and out is an ISO YYYY-MM-DD string, or ''.
import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, isoDay, parseIsoDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'dd/mm/yyyy',
  clearable = false,
  size = 'default',
  className,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseIsoDay(value) : undefined
  const disabled = [min && { before: parseIsoDay(min) }, max && { after: parseIsoDay(max) }].filter(Boolean)

  return (
    <div className={cn('relative inline-flex', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className={cn(
              'justify-start gap-2 font-normal tabular-nums',
              size === 'sm' ? 'h-8 w-36 px-2.5' : 'w-40',
              clearable && value && 'pe-8',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="text-muted-foreground" />
            {value ? formatDate(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            weekStartsOn={1}
            disabled={disabled}
            onSelect={date => {
              if (date) onChange(isoDay(date))
              setOpen(false)
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear date"
          title="Clear date"
          onClick={() => onChange('')}
          className="text-muted-foreground hover:text-foreground absolute end-2 top-1/2 -translate-y-1/2"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
