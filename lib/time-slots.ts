import { minutesSinceVenueDayStart, timeToMinutes } from '@/lib/court-time'
import type { CourtSlot } from '@/lib/court-slots'
import { computePrice } from '@/lib/pricing'
import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'

/**
 * Time-first booking: players choose a sport, a day and a TIME; the court is the club's business.
 * Pure helpers shared by the time grid (browser) and createBooking (server), unit-tested in
 * tests/time-slots.spec.ts.
 *
 * A time is bookable when at least one court of that sport has that start on its grid and is free.
 * The booking takes the CHEAPEST free court (ties: court name), so the price shown is the price
 * charged; the court is then provisional (`bookings.court_pending`) until staff assign one.
 */

/** What players see while a time-first booking's court is still provisional (`bookings.court_pending`). */
export const COURT_PENDING_LABEL = "Attribution à l'arrivée"

/** The court name a PLAYER is shown: the provisional court stays the club's business. */
export function playerCourtLabel(courtName: string | null | undefined, courtPending: boolean): string {
  return courtPending ? COURT_PENDING_LABEL : courtName || 'Terrain'
}

export interface PricedCourt {
  id: string
  name: string
  sport: Sport
  pricePerHour: number
  nightSurchargePerHour: number
  /** Postgres TIME, e.g. "18:00:00". */
  nightStartsAt: string
}

export function slotTotal(court: PricedCourt, startsAt: string, date: string): number {
  return computePrice({
    pricePerHour: court.pricePerHour,
    nightSurchargePerHour: court.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(court.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(startsAt, date),
    durationMinutes: SPORT_DURATION_MIN[court.sport],
  }).total
}

/** Cheapest first, then by name: the order the server tries courts in, and whose price the grid shows. */
export function byPriceThenName<T extends { price: number; court: { name: string } }>(a: T, b: T): number {
  return a.price - b.price || a.court.name.localeCompare(b.court.name, 'fr')
}

export interface TimeSlot<Tag extends string = string> {
  start: string
  end: string
  state: CourtSlot['state']
  /** Free courts of the sport at this time (0 when not available). */
  freeCourts: number
  /** The court a booking would take (cheapest free), when available. */
  court: PricedCourt | null
  /** Its price in TND, when available. */
  price: number | null
  tag?: Tag
}

/**
 * One row of times for a sport, merged from every court of that sport: a time is "available" if any
 * court is free then, "occupied" if every court that has it is taken, and "past" once it has started.
 */
export function aggregateTimeSlots<Tag extends string>(
  courts: (PricedCourt & { slots: (CourtSlot & { tag?: Tag })[] })[],
  sport: Sport,
  date: string
): TimeSlot<Tag>[] {
  const byStart = new Map<string, { end: string; free: { court: PricedCourt; price: number }[]; past: boolean; tag?: Tag }>()
  for (const court of courts) {
    if (court.sport !== sport) continue
    for (const slot of court.slots) {
      const row = byStart.get(slot.start) ?? { end: slot.end, free: [], past: false }
      if (slot.state === 'past') row.past = true
      if (slot.state === 'available') row.free.push({ court, price: slotTotal(court, slot.start, date) })
      row.tag ??= slot.tag
      byStart.set(slot.start, row)
    }
  }
  return [...byStart.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([start, row]) => {
      const best = [...row.free].sort(byPriceThenName)[0]
      const state: CourtSlot['state'] = best ? 'available' : row.past ? 'past' : 'occupied'
      return {
        start,
        end: row.end,
        state,
        freeCourts: row.free.length,
        court: best?.court ?? null,
        price: best?.price ?? null,
        ...(best && row.tag ? { tag: row.tag } : {}),
      }
    })
}

/** Does a lock range overlap the slot (play + buffer)? Same rule as the GiST constraint. */
export function slotIsBusy(locks: { from: string; until: string }[], startsAt: string, sport: Sport): boolean {
  const from = Date.parse(startsAt)
  const until = from + (SPORT_DURATION_MIN[sport] + BUFFER_MIN) * 60_000
  return locks.some((l) => Date.parse(l.from) < until && Date.parse(l.until) > from)
}
