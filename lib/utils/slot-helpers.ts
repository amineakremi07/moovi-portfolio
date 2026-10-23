import { minutesSinceVenueDayStart, timeToMinutes, venueDateString } from '@/lib/court-time'
import { effectiveHours, type WeeklyHours } from '@/lib/operating-hours'
import type { Sport } from '@/lib/slot-duration'

/**
 * Pure slot helpers: no Supabase client, no Next cache, so tests and client code can import them
 * (lib/live-availability.ts pulls in the service-role client through lib/cache.ts).
 */

/** Courts that are open and free at this very minute, per sport. */
export type LiveAvailability = Partial<Record<Sport, number>>

export interface LiveCourt {
  id: string
  orgId: string
  sport: Sport
  openTime: string
  closeTime: string
}

/**
 * How many courts per sport are open (club hours win over the court's own) and not under a
 * slot lock at `now` (venue time). A window that ends at or before its start runs past midnight.
 */
export function countFreeNow(
  courts: LiveCourt[],
  weeklyByOrg: Map<string, WeeklyHours | null>,
  lockedCourtIds: Set<string>,
  now: Date
): LiveAvailability {
  const today = venueDateString(now)
  const minute = minutesSinceVenueDayStart(now, today)
  const out: LiveAvailability = {}
  for (const court of courts) {
    if (lockedCourtIds.has(court.id)) continue
    const hours = effectiveHours(weeklyByOrg.get(court.orgId) ?? null, today, { open_time: court.openTime, close_time: court.closeTime })
    if (!hours) continue
    const from = timeToMinutes(hours.openTime)
    const to = timeToMinutes(hours.closeTime)
    if (minute >= from && minute < (to <= from ? to + 1440 : to)) out[court.sport] = (out[court.sport] ?? 0) + 1
  }
  return out
}
