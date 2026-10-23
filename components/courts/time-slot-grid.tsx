'use client'

import * as React from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { slotIsPeak, SLOT_TAG_LABEL, type MatrixCourt, type SlotTag } from '@/components/courts/court-slot-matrix'
import { SPRING } from '@/components/ui/motion-button'
import { useRealtimeBookings } from '@/hooks/use-realtime-bookings'
import { formatVenueTime } from '@/lib/court-time'
import { formatTND } from '@/lib/payments'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { aggregateTimeSlots, type PricedCourt, type TimeSlot } from '@/lib/time-slots'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Time-first slot timelines for players: every sport of the club in its own
   row, then a TIME. The courts are merged: a time is free when any court of the
   sport is free then, and its price is the cheapest free court's (what the
   server will charge). The court itself is assigned by the club. Live:
   refreshes on any slot-lock change.
   ========================================================================== */

export const SPORTS: { value: Sport; label: string; icon: (typeof SPORT_ICON)[Sport] }[] = [
  { value: 'padel', label: 'Padel', icon: SPORT_ICON.padel },
  { value: 'tennis', label: 'Tennis', icon: SPORT_ICON.tennis },
  { value: 'football', label: 'Football', icon: SPORT_ICON.football },
]

export type PlayerTimeSlot = TimeSlot<SlotTag>

export function toPricedCourts(courts: MatrixCourt[]) {
  return courts.map((c) => ({
    id: c.id,
    name: c.name,
    sport: c.sport,
    pricePerHour: c.pricePerHour,
    nightSurchargePerHour: c.nightSurchargePerHour ?? 0,
    nightStartsAt: c.nightStartsAt ?? '18:00:00',
    slots: c.slots,
  }))
}

/** The merged times of one sport on a day (same rules as the server's court choice). */
export function useTimeSlots(courts: MatrixCourt[], sport: Sport, dateStr: string): PlayerTimeSlot[] {
  return React.useMemo(() => aggregateTimeSlots<SlotTag>(toPricedCourts(courts), sport, dateStr), [courts, sport, dateStr])
}

const STATE_LABEL: Record<PlayerTimeSlot['state'], string> = {
  available: 'Disponible',
  occupied: 'Complet',
  locked_buffer: 'Complet',
  past: 'Passé',
}

const SHORT_TAG: Record<SlotTag, string> = { recommended: 'Pour vous', high_demand: 'Demandé', quiet: 'Creux' }

/**
 * The timeline of ONE sport, the one the player picked: its slot length, cheapest price and how many
 * times are free, then its times. Other sports, their courts and prices are not rendered at all.
 * Phones: a row to swipe; from `md` the times wrap.
 */
export function TimeSlotGrid({
  orgId,
  courts,
  dateStr,
  sport,
  selectedSport,
  selectedStart,
  onSelect,
  onRealtimeChange,
}: {
  orgId: string
  courts: MatrixCourt[]
  dateStr: string
  /** The sport being shown. */
  sport: Sport
  /** The sport of the chosen time, if any. */
  selectedSport: Sport | null
  /** The start of the chosen time, if any. */
  selectedStart: string | null
  /** A time was tapped (null = the selected one was tapped again). */
  onSelect: (slot: PlayerTimeSlot | null, sport: Sport) => void
  /** Another booking changed availability: re-fetch. */
  onRealtimeChange: () => void
}) {
  const courtIds = React.useMemo(() => courts.map((c) => c.id), [courts])
  useRealtimeBookings(orgId, dateStr, onRealtimeChange, { courtIds })

  const shown = SPORTS.find((s) => s.value === sport && courts.some((c) => c.sport === s.value))

  return (
    <div data-testid="time-grid">
      {shown && (
        <SportTimeline
          // A new sport starts with its own past-times toggle closed.
          key={shown.value}
          sport={shown}
          courts={courts}
          dateStr={dateStr}
          selectedStart={selectedSport === shown.value ? selectedStart : null}
          onSelect={(slot) => onSelect(slot, shown.value)}
        />
      )}
    </div>
  )
}

function SportTimeline({
  sport,
  courts,
  dateStr,
  selectedStart,
  onSelect,
}: {
  sport: (typeof SPORTS)[number]
  courts: MatrixCourt[]
  dateStr: string
  selectedStart: string | null
  onSelect: (slot: PlayerTimeSlot | null) => void
}) {
  const reduce = useReducedMotion()
  const slots = useTimeSlots(courts, sport.value, dateStr)
  // "Dernier" only means something when the sport has several courts.
  const severalCourts = courts.filter((c) => c.sport === sport.value).length > 1
  const free = slots.filter((sl) => sl.state === 'available')
  const cheapest = free.reduce<number | null>((min, sl) => (sl.price !== null && (min === null || sl.price < min) ? sl.price : min), null)
  const Icon = sport.icon
  const headingId = `slots-${sport.value}`
  // Today's earlier times lead every row and push the bookable ones off screen: fold them away
  // (they are contiguous at the start), one tap brings them back.
  const pastCount = slots.filter((sl) => sl.state === 'past').length
  const [showPast, setShowPast] = React.useState(false)
  const shown = showPast ? slots : slots.filter((sl) => sl.state !== 'past')

  return (
    <section id={`creneaux-${sport.value}`} aria-labelledby={headingId} className="scroll-mt-40">
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="flex items-center gap-1.5 font-semibold">
          <Icon className="size-4 text-peacock-teal" aria-hidden />
          {sport.label}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{SPORT_DURATION_MIN[sport.value]} min</span>
        </h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {free.length === 0 ? 'Complet ce jour-là' : `${free.length} horaire${free.length > 1 ? 's' : ''} libre${free.length > 1 ? 's' : ''}`}
          {cheapest !== null && (
            <>
              {' · dès '}
              <span className="font-semibold text-foreground">{formatTND(cheapest)}</span>
            </>
          )}
        </p>
      </header>

      {slots.length === 0 ? (
        <p className="rounded-lg bg-card px-4 py-5 text-center text-sm text-muted-foreground">Aucun horaire ce jour-là pour ce sport.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-card px-4 py-5 text-center text-sm text-muted-foreground">
          Plus d&apos;horaire aujourd&apos;hui pour ce sport. Essayez demain.
        </p>
      ) : (
        <ul
          aria-label={`Horaires de ${sport.label.toLowerCase()}`}
          // scroll-px keeps snapped times on the page gutter instead of the screen edge.
          className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:scroll-px-0 md:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((slot) => {
            const available = slot.state === 'available'
            const selected = selectedStart === slot.start
            const priced = slot.court ? courts.find((c) => c.id === (slot.court as PricedCourt).id) : undefined
            const peak = available && priced ? slotIsPeak(priced, slot, dateStr) : false
            const time = `${formatVenueTime(slot.start)} – ${formatVenueTime(slot.end)}`
            const note = available ? (slot.tag ? SHORT_TAG[slot.tag] : peak ? 'Pointe' : severalCourts && slot.freeCourts === 1 ? 'Dernier' : null) : null
            return (
              <li key={slot.start} className="shrink-0 snap-start">
                <motion.button
                  type="button"
                  disabled={!available}
                  aria-pressed={selected}
                  data-time-slot={slot.start}
                  aria-label={`${sport.label}, ${time}, ${STATE_LABEL[slot.state]}${available && slot.price !== null ? `, ${formatTND(slot.price)}${peak ? ', tarif de pointe' : ''}${slot.tag ? `, ${SLOT_TAG_LABEL[slot.tag].toLowerCase()}` : ''}` : ''}`}
                  onClick={() => onSelect(selected ? null : slot)}
                  whileTap={reduce || !available ? undefined : { scale: 0.96 }}
                  transition={SPRING}
                  className={cn(
                    // Same size for every time, whatever it carries: the row never goes ragged.
                    'grid h-[4.75rem] w-[6.5rem] grid-rows-[1.375rem_1.125rem_1rem] content-center gap-0.5 rounded-lg border px-2.5 text-left transition-[background-color,border-color,color] duration-150 ease-out md:w-full',
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    // Bookable = a solid Oat Milk card; taken = an outline only. The difference is the surface,
                    // not a faded opacity, so both stay readable (contrast) and the tappable ones stand out.
                    available && !selected && 'border-transparent bg-card hover:border-foreground/25',
                    selected && 'border-primary bg-primary text-primary-foreground',
                    !available && 'cursor-not-allowed border-dashed border-border bg-transparent text-muted-foreground'
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-base font-semibold tabular-nums">{formatVenueTime(slot.start)}</span>
                    {selected && <Check className="size-4" aria-hidden />}
                  </span>
                  <span className={cn('truncate text-xs tabular-nums', !selected && 'text-muted-foreground')}>
                    {available && slot.price !== null ? formatTND(slot.price) : STATE_LABEL[slot.state]}
                  </span>
                  <span
                    data-slot-tag={available ? slot.tag : undefined}
                    className={cn(
                      'flex min-w-0 items-center gap-1 truncate text-[0.6875rem] font-medium',
                      selected ? 'text-primary-foreground/80' : slot.tag === 'recommended' ? 'text-foreground' : peak || slot.tag === 'high_demand' ? 'text-accent-foreground' : 'text-success'
                    )}
                  >
                    {slot.tag === 'recommended' && available && <Sparkles className="size-3 shrink-0" aria-hidden />}
                    {note}
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}

      {pastCount > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          aria-expanded={showPast}
          className="mt-2 inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {showPast ? 'Masquer les horaires passés' : `${pastCount} horaire${pastCount > 1 ? 's' : ''} déjà passé${pastCount > 1 ? 's' : ''}`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', showPast && 'rotate-180')} aria-hidden />
        </button>
      )}
    </section>
  )
}
