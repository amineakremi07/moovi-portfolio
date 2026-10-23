'use client'

import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LazyCalendar } from '@/components/ui/lazy-calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, formatVenueDate, formatVenueDayMonth } from '@/lib/court-time'
import { cn } from '@/lib/utils'

/**
 * Day navigation for a club's availability: previous / next day, a calendar, and
 * a shortcut back to today labelled with today's date ("Aujourd'hui, 16 oct.").
 * The board passes a live `today` (hooks/use-venue-today.ts), so the label and the
 * jump follow the real date while the page stays open. Dates are venue calendar days as YYYY-MM-DD strings,
 * never `Date` objects in the browser's timezone, so "today" means today in Tunis.
 */

/** A YYYY-MM-DD string as a local-midnight Date, which is what the calendar widget wants. */
function toCalendarDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fromCalendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DayPicker({
  dateStr,
  today,
  minDate,
  maxDate,
  onChange,
  pending = false,
}: {
  dateStr: string
  /** Today's venue date. Defaults to `minDate` (the public grid starts today; the staff board can look back). */
  today?: string
  /** Earliest bookable day (venue today). */
  minDate: string
  /** Latest bookable day. */
  maxDate: string
  onChange: (dateStr: string) => void
  /** A new day is loading. */
  pending?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const todayStr = today ?? minDate
  const onToday = dateStr === todayStr

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <Button
        variant="outline"
        size="icon"
        className="max-md:size-12"
        aria-label="Jour précédent"
        disabled={dateStr <= minDate}
        onClick={() => onChange(addDays(dateStr, -1))}
      >
        <ChevronLeft aria-hidden />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-44 justify-center tabular-nums max-md:h-12 max-md:flex-1">
            <CalendarDays aria-hidden />
            {formatVenueDate(dateStr)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <LazyCalendar
            mode="single"
            selected={toCalendarDate(dateStr)}
            defaultMonth={toCalendarDate(dateStr)}
            onSelect={(date) => {
              if (!date) return
              onChange(fromCalendarDate(date))
              setOpen(false)
            }}
            disabled={{ before: toCalendarDate(minDate), after: toCalendarDate(maxDate) }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        className="max-md:size-12"
        aria-label="Jour suivant"
        disabled={dateStr >= maxDate}
        onClick={() => onChange(addDays(dateStr, 1))}
      >
        <ChevronRight aria-hidden />
      </Button>

      <Button
        variant={onToday ? 'secondary' : 'ghost'}
        className={cn('tabular-nums max-md:h-12 max-md:px-4', onToday && 'font-semibold')}
        aria-pressed={onToday}
        aria-label={`Aujourd'hui, ${formatVenueDate(todayStr)}`}
        data-testid="today-button"
        onClick={() => {
          if (!onToday) onChange(todayStr)
        }}
      >
        Aujourd&apos;hui, {formatVenueDayMonth(todayStr)}
      </Button>
    </div>
  )
}

const WEEKDAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
/** Days shown at once in the strip; the calendar reaches the rest. */
const STRIP_DAYS = 14

/**
 * Players' date choice: a row of the next two weeks ("lun. 3", "mar. 4", ...) to tap, swipeable on phones,
 * and a calendar button for anything further out. The chosen day stays in view.
 */
export function DateStrip({
  dateStr,
  minDate,
  maxDate,
  onChange,
  pending = false,
}: {
  dateStr: string
  minDate: string
  maxDate: string
  onChange: (dateStr: string) => void
  pending?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  // Two weeks from today, or around the chosen day when it is further out.
  const first = dateStr >= addDays(minDate, STRIP_DAYS) ? addDays(dateStr, -3) : minDate
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(first, i)).filter((d) => d <= maxDate)
  const listRef = React.useRef<HTMLUListElement>(null)
  const selectedRef = React.useRef<HTMLButtonElement>(null)
  // Keep the chosen day in view by scrolling the strip only (never the page).
  React.useEffect(() => {
    const list = listRef.current
    const btn = selectedRef.current
    if (!list || !btn) return
    const left = btn.offsetLeft - list.clientWidth / 2 + btn.clientWidth / 2
    list.scrollLeft = Math.max(0, left)
  }, [dateStr])

  return (
    <div className="flex items-stretch gap-2" aria-busy={pending}>
      <ul
        ref={listRef}
        aria-label="Choisir un jour"
        className="relative -ml-1 flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => {
          const [y, m, day] = d.split('-').map(Number)
          const weekday = WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
          const selected = d === dateStr
          return (
            <li key={d} className="snap-start">
              <button
                ref={selected ? selectedRef : undefined}
                type="button"
                aria-pressed={selected}
                aria-label={formatVenueDate(d)}
                onClick={() => !selected && onChange(d)}
                className={cn(
                  'flex h-14 w-12 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected ? 'border-forest-depths bg-forest-depths text-bone-linen' : 'border-border bg-card hover:border-forest-depths/40'
                )}
              >
                <span className={cn(selected ? 'text-bone-linen/75' : 'text-muted-foreground')}>{d === minDate ? 'auj.' : weekday}</span>
                <span className="text-base font-semibold tabular-nums">{day}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-auto w-12 shrink-0 self-stretch" aria-label={`Autre date (actuellement ${formatVenueDate(dateStr)})`}>
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <LazyCalendar
            mode="single"
            selected={toCalendarDate(dateStr)}
            defaultMonth={toCalendarDate(dateStr)}
            onSelect={(date) => {
              if (!date) return
              onChange(fromCalendarDate(date))
              setOpen(false)
            }}
            disabled={{ before: toCalendarDate(minDate), after: toCalendarDate(maxDate) }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
