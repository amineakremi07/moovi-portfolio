import { addDays, formatVenueTime, venueDateString } from '@/lib/court-time'
import { generateCourtSlots, type LockRange } from '@/lib/court-slots'
import { weekdayKey } from '@/lib/operating-hours'
import type { Sport } from '@/lib/slot-duration'

/**
 * "Réserver à nouveau": the next free occurrence of a past booking's pattern, i.e. the same sport,
 * the same weekday and the same start time in venue time, on ANY court of that sport (players book
 * a time, not a court; the club assigns the court). Pure, so it is unit-tested; the booking itself
 * still goes through `createBooking`, which re-checks everything on the server.
 */

/** Sport + weekday + venue start time, e.g. "padel|tue|18:00". Two bookings with the same key repeat each other. */
export function rebookPatternKey(sport: Sport, startsAt: string): string {
  const at = new Date(startsAt)
  return `${sport}|${weekdayKey(venueDateString(at))}|${formatVenueTime(at)}`
}

export interface RebookSlot {
  /** Venue calendar day whose grid the slot belongs to (what `createBooking` expects as `date`). */
  date: string
  startsAt: string
  endsAt: string
  /** Courts of the sport free at that time (the server takes the cheapest). */
  freeCourtIds: string[]
}

export function nextRebookSlot(input: {
  sport: Sport
  /** Start of the past booking to repeat. */
  sourceStartsAt: string
  /** First and last bookable venue days, inclusive. */
  today: string
  maxDate: string
  /** Every active court of the sport, with the hours that apply on a day (null = closed) and its locks. */
  courts: { id: string; hoursFor: (date: string) => { openTime: string; closeTime: string } | null; locks: LockRange[] }[]
  now: Date
}): RebookSlot | null {
  const wanted = rebookPatternKey(input.sport, input.sourceStartsAt)
  // A slot after midnight belongs to the previous day's grid, so every day is generated and the
  // match is made on the slot's own weekday + time rather than on the grid day.
  for (let date = input.today; date <= input.maxDate; date = addDays(date, 1)) {
    let found: { startsAt: string; endsAt: string } | null = null
    const freeCourtIds: string[] = []
    for (const court of input.courts) {
      const hours = court.hoursFor(date)
      if (!hours) continue
      const slot = generateCourtSlots({
        sport: input.sport,
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        dateStr: date,
        locks: court.locks,
        now: input.now,
      }).find((s) => s.state === 'available' && rebookPatternKey(input.sport, s.start) === wanted)
      if (!slot) continue
      found ??= { startsAt: slot.start, endsAt: slot.end }
      freeCourtIds.push(court.id)
    }
    if (found) return { date, ...found, freeCourtIds }
  }
  return null
}

/** The club page with this sport + time picked and its checkout open (see `ClubBookingView`'s `preselect`). */
export function rebookHref(s: { orgId: string; sport: Sport; date: string; startsAt: string }): string {
  const q = new URLSearchParams({ date: s.date, sport: s.sport, start: s.startsAt })
  return `/courts/${s.orgId}?${q.toString()}`
}
