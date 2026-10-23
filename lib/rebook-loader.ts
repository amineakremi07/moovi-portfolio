import { MAX_DAYS_AHEAD } from '@/lib/booking-core'
import { addDays, venueDateString, venueInstant } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { nextRebookSlot, rebookPatternKey } from '@/lib/rebook'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { slotTotal } from '@/lib/time-slots'
import { createPublicClient } from '@/lib/supabase/public'

/** What a past booking needs to be re-booked: the club page opens on this sport + time. */
export interface RebookSuggestion {
  orgId: string
  sport: Sport
  date: string
  startsAt: string
  endsAt: string
  playerCount: number
  /** The cheapest free court's price, which is what the booking will cost. */
  price: number
}

/** Distinct patterns resolved per page load (each one is a scan of the booking window). */
const DEFAULT_MAX_PATTERNS = 10

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/**
 * For a member's past bookings at their own club, the next free occurrence of each distinct pattern
 * (sport + weekday + time, any court), keyed by booking id: EVERY past booking of a resolved pattern
 * gets the suggestion. Reads are public (anon): active courts, the club's hours and slot locks. Any
 * failure returns an empty map: the button simply does not appear.
 */
export async function loadRebookSuggestions(
  orgId: string,
  /** Past bookings, most recent first. */
  history: { id: string; orgId: string; sport: string; startsAt: string; playerCount: number }[],
  maxPatterns = DEFAULT_MAX_PATTERNS
): Promise<Map<string, RebookSuggestion>> {
  const out = new Map<string, RebookSuggestion>()

  const patterns = new Map<string, (typeof history)[number]>()
  for (const b of history) {
    if (b.orgId !== orgId || !isSport(b.sport)) continue
    const key = rebookPatternKey(b.sport, b.startsAt)
    if (!patterns.has(key) && patterns.size < maxPatterns) patterns.set(key, b)
  }
  if (patterns.size === 0) return out

  const supabase = createPublicClient()
  const now = new Date()
  const today = venueDateString(now)
  const maxDate = addDays(today, MAX_DAYS_AHEAD)
  const sports = [...new Set([...patterns.values()].map((b) => b.sport as Sport))]

  const [{ data: org, error: orgError }, { data: courts, error: courtsError }] = await Promise.all([
    supabase.from('organizations').select('weekly_hours').eq('id', orgId).eq('status', 'approved').is('deleted_at', null).maybeSingle(),
    supabase
      .from('courts')
      .select('id, name, sport, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
      .eq('org_id', orgId)
      .in('sport', sports)
      .eq('status', 'active')
      .is('deleted_at', null),
  ])
  if (orgError || courtsError || !org || !courts?.length) {
    if (orgError || courtsError) console.error('loadRebookSuggestions failed:', orgError?.message ?? courtsError?.message)
    return out
  }
  const { data: locks, error: locksError } = await supabase
    .from('court_slot_locks')
    .select('court_id, occupied_from, occupied_until')
    .in('court_id', courts.map((c) => c.id))
    .gt('occupied_until', now.toISOString())
    .lt('occupied_from', venueInstant(maxDate, 2880).toISOString())
  if (locksError) {
    console.error('loadRebookSuggestions locks failed:', locksError.message)
    return out
  }

  const weekly = parseWeeklyHours(org.weekly_hours)
  const resolved = new Map<string, RebookSuggestion>()
  for (const [key, source] of patterns) {
    const sport = source.sport as Sport
    // A player count that is no longer allowed for the sport would be refused anyway.
    if (!(PLAYER_COUNT_OPTIONS[sport] as readonly number[]).includes(source.playerCount)) continue
    const sportCourts = courts.filter((c) => c.sport === sport)
    const slot = nextRebookSlot({
      sport,
      sourceStartsAt: source.startsAt,
      today,
      maxDate,
      courts: sportCourts.map((court) => ({
        id: court.id,
        hoursFor: (date: string) => effectiveHours(weekly, date, court),
        locks: (locks ?? []).filter((l) => l.court_id === court.id).map((l) => ({ from: l.occupied_from, until: l.occupied_until })),
      })),
      now,
    })
    if (!slot) continue

    const price = Math.min(
      ...sportCourts
        .filter((c) => slot.freeCourtIds.includes(c.id))
        .map((c) =>
          slotTotal(
            {
              id: c.id,
              name: c.name,
              sport,
              pricePerHour: Number(c.price_per_hour),
              nightSurchargePerHour: Number(c.night_surcharge_per_hour),
              nightStartsAt: c.night_starts_at,
            },
            slot.startsAt,
            slot.date
          )
        )
    )
    resolved.set(key, { orgId, sport, date: slot.date, startsAt: slot.startsAt, endsAt: slot.endsAt, playerCount: source.playerCount, price })
  }

  for (const b of history) {
    if (b.orgId !== orgId || !isSport(b.sport)) continue
    const s = resolved.get(rebookPatternKey(b.sport, b.startsAt))
    if (s) out.set(b.id, s)
  }
  return out
}
