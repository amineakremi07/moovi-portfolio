'use client'

import { LayoutGrid, Loader2, Navigation, Search, Users, X } from 'lucide-react'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { SPORT_LABEL, type SportFilter } from '@/lib/clubs'
import type { LiveAvailability } from '@/lib/live-availability'
import { t } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

const CHIP =
  'relative flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
const ON = 'border-peacock-teal bg-peacock-teal text-white active:bg-peacock-teal/90'
const OFF = 'border-black/[0.08] bg-white text-foreground hover:border-black/20 active:bg-black/[0.04]'

/** Courts free right now for a filter ('all' = every sport); 0 or unknown shows no badge. */
function liveCount(live: LiveAvailability, value: SportFilter): number {
  if (value === 'all') return Object.values(live).reduce((sum, n) => sum + (n ?? 0), 0)
  return live[value] ?? 0
}

/** Search, "Près de moi", the sport chips (each with how many courts are free this minute) and "Parties ouvertes". */
export function ExploreControls({
  query,
  onQuery,
  sport,
  onSport,
  sports,
  live,
  nearest,
  locating,
  onNearest,
  openOnly,
  onOpenOnly,
  openCount,
}: {
  query: string
  onQuery: (value: string) => void
  sport: SportFilter
  onSport: (value: SportFilter) => void
  /** The filters to offer: 'all' plus the sports some club really has. */
  sports: SportFilter[]
  /** Courts open and free right now, per sport. */
  live: LiveAvailability
  nearest: boolean
  locating: boolean
  onNearest: () => void
  /** "Parties ouvertes": show open matches instead of clubs, of the sport already chosen. Picking a sport leaves it. */
  openOnly: boolean
  onOpenOnly: (value: boolean) => void
  /** Open matches with a free place, for the chip's badge. */
  openCount: number
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            // type="text", not "search": browsers draw their own clear (x) on search inputs.
            type="text"
            role="searchbox"
            enterKeyHint="search"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Club, ville ou quartier"
            aria-label={t('disc.searchLabel')}
            className="h-11 w-full rounded-xl border border-black/[0.08] bg-white pl-10 pr-10 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-peacock-teal focus-visible:ring-3 focus-visible:ring-peacock-teal/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label={t('disc.clearSearch')}
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNearest}
          aria-pressed={nearest}
          aria-busy={locating}
          disabled={locating}
          className={cn(
            'relative flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors duration-100 disabled:opacity-70',
            'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            nearest ? ON : OFF
          )}
        >
          {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Navigation className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{locating ? t('disc.locating') : t('disc.nearest')}</span>
          <span className="sr-only sm:hidden">{locating ? t('disc.locating') : t('disc.nearest')}</span>
        </button>
      </div>

      <div
        role="group"
        aria-label={t('disc.filterSport')}
        // Phones: scrolls sideways without widening the page. From md: wraps.
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {sports.map((value) => {
          const Icon = value === 'all' ? LayoutGrid : SPORT_ICON[value]
          const active = sport === value
          const free = liveCount(live, value)
          return (
            <button key={value} type="button" aria-pressed={active} onClick={() => onSport(value)} className={cn(CHIP, active ? ON : OFF)}>
              <Icon className="size-4" aria-hidden />
              {value === 'all' ? t('disc.sport.all') : SPORT_LABEL[value]}
              {free > 0 && (
                <span
                  data-testid="live-count"
                  className={cn(
                    'ml-0.5 flex items-center gap-1 rounded-full px-1.5 text-xs font-semibold leading-5 tabular-nums',
                    active ? 'bg-white/20 text-white' : 'bg-peacock-teal/10 text-peacock-teal'
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />
                  {free}
                  <span className="sr-only"> terrain{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''} maintenant</span>
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => onOpenOnly(!openOnly)}
          className={cn(CHIP, openOnly ? ON : OFF)}
          data-testid="open-matches-filter"
        >
          <Users className="size-4" aria-hidden />
          Parties ouvertes
          {openCount > 0 && (
            <span
              className={cn(
                'ml-0.5 rounded-full px-1.5 text-xs font-semibold leading-5 tabular-nums',
                openOnly ? 'bg-white/20 text-white' : 'bg-peacock-teal/10 text-peacock-teal'
              )}
            >
              {openCount}
              <span className="sr-only"> partie{openCount > 1 ? 's' : ''} avec des places libres</span>
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
