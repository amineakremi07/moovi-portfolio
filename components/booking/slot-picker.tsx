'use client'

import * as React from 'react'

import type { MatrixCourt } from '@/components/courts/court-slot-matrix'
import { SPORTS, TimeSlotGrid, type PlayerTimeSlot } from '@/components/courts/time-slot-grid'
import { DateStrip } from '@/components/courts/day-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/info-tip'
import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Slot picker: pick a day, then a TIME in a sport's timeline (time-first
   booking: the club assigns the court). A sticky bar holds the date strip and a
   jump to each sport; below, one timeline per sport (the grid owns the merged
   slot states and the realtime updates), then a legend for the colours.
   ========================================================================== */

const SPORT_NAME: Record<Sport, string> = { padel: 'Padel', tennis: 'Tennis', football: 'Football' }

const peakText = (nightStartsAt?: string) =>
  `Les créneaux de pointe incluent le supplément de soirée${nightStartsAt ? ` (créneaux à partir de ${nightStartsAt.slice(0, 5)})` : ''} ; les autres créneaux sont en heures creuses.`

/** What the colours and tags on the grid mean. */
export function SlotLegend({ hasPeak, nightStartsAt, children }: { hasPeak: boolean; nightStartsAt?: string; children?: React.ReactNode }) {
  const items: { label: string; swatch: string }[] = [
    { label: 'Disponible', swatch: 'border-foreground/15 bg-card' },
    { label: 'Sélectionné', swatch: 'border-primary bg-primary' },
    { label: 'Complet ou passé', swatch: 'border-dashed border-muted-foreground/60 bg-transparent' },
  ]
  return (
    <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {items.map(({ label, swatch }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3.5 rounded-sm border', swatch)} />
          {label}
        </li>
      ))}
      {hasPeak && (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="rounded-sm bg-accent px-1.5 text-[0.6875rem] font-medium text-accent-foreground"
          >
            Pointe
          </span>
          <span className="sr-only">Créneaux de pointe</span>
          {/* With a note of its own (children), the peak explanation goes in that one tip: never two (i) side by side. */}
          {!children && <InfoTip label="À propos des créneaux de pointe">{peakText(nightStartsAt)}</InfoTip>}
        </li>
      )}
      {children && <li className="flex items-center">{children}</li>}
    </ul>
  )
}

export function SlotPicker({
  orgId,
  dateStr,
  minDate,
  maxDate,
  courts,
  onDateChange,
  sport,
  onSportChange,
  selectedSport,
  selectedStart,
  onSelect,
  onRealtimeChange,
  pending = false,
  closedNotice = null,
}: {
  orgId: string
  dateStr: string
  minDate: string
  maxDate: string
  courts: MatrixCourt[]
  onDateChange: (next: string) => void
  /** The one sport shown: its times, legend and rules only. */
  sport: Sport
  onSportChange: (next: Sport) => void
  /** Sport of the chosen time, if any. */
  selectedSport: Sport | null
  /** Start of the chosen time, if any. */
  selectedStart: string | null
  onSelect: (picked: PlayerTimeSlot | null, sport: Sport) => void
  /** Another player's booking changed availability: re-fetch. */
  onRealtimeChange: () => void
  /** A new day is loading. */
  pending?: boolean
  closedNotice?: string | null
}) {
  const sports = SPORTS.filter((sp) => courts.some((c) => c.sport === sp.value))
  // Legend and rules of the shown sport only: no other sport's surcharge or duration.
  const peakCourt = courts.find((c) => c.sport === sport && (c.nightSurchargePerHour ?? 0) > 0)

  return (
    <div className="space-y-5">
      {/* Sticky while the times scroll past: the day, and which sport is shown. */}
      <div className="sticky top-0 z-20 -mx-4 space-y-2.5 border-b border-border/60 bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:-mx-1 md:rounded-b-xl md:px-1">
        <DateStrip dateStr={dateStr} minDate={minDate} maxDate={maxDate} onChange={onDateChange} pending={pending} />
        {sports.length > 1 && (
          <div role="radiogroup" aria-label="Sport" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sports.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={sport === value}
                data-testid={`sport-filter-${value}`}
                onClick={() => onSportChange(value)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  sport === value ? 'border-forest-depths bg-forest-depths text-bone-linen' : 'border-border bg-card hover:border-forest-depths/40'
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {closedNotice && (
        <p role="status" className="rounded-lg bg-card px-4 py-3 text-sm text-muted-foreground">
          {closedNotice}
        </p>
      )}

      {/* A new day is loading: show the shape of the timelines at once instead of stale slots. */}
      {pending && (
        <div role="status" aria-label="Chargement des disponibilités" className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[4.75rem] w-[6.5rem] shrink-0" />
            ))}
          </div>
        </div>
      )}
      <div className={cn(pending && 'hidden')} aria-busy={pending}>
        <TimeSlotGrid
          orgId={orgId}
          courts={courts}
          dateStr={dateStr}
          sport={sport}
          selectedSport={selectedSport}
          selectedStart={selectedStart}
          onSelect={onSelect}
          onRealtimeChange={onRealtimeChange}
        />
      </div>

      <div className="border-t border-border/60 pt-4">
        <SlotLegend hasPeak={Boolean(peakCourt)} nightStartsAt={peakCourt?.nightStartsAt}>
          <InfoTip label="Comment fonctionne la réservation">
            Vous choisissez l&apos;horaire ; le club vous attribue un terrain à votre arrivée. Un créneau de{' '}
            {SPORT_NAME[sport].toLowerCase()} dure {SPORT_DURATION_MIN[sport]} min, et {BUFFER_MIN} min restent libres entre deux
            réservations.{peakCourt ? ` ${peakText(peakCourt.nightStartsAt)}` : ''}
          </InfoTip>
        </SlotLegend>
      </div>
    </div>
  )
}
