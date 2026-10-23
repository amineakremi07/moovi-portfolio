import type { SupabaseClient } from '@supabase/supabase-js'

import { addDays, minutesSinceVenueDayStart, timeToMinutes, venueDateString } from '@/lib/court-time'
import { generateCourtSlots } from '@/lib/court-slots'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { computePrice, type PriceBreakdown } from '@/lib/pricing'
import { byPriceThenName, slotIsBusy, slotTotal, type PricedCourt } from '@/lib/time-slots'
import { PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import type { Database } from '@/lib/types/database'

/** How far ahead a slot can be booked. */
export const MAX_DAYS_AHEAD = 60

export type SlotCheckError = {
  ok: false
  code: 'invalid_input' | 'unavailable' | 'invalid_slot' | 'slot_taken'
  message: string
}

export type SlotCheckOk = { ok: true; sport: Sport; price: PriceBreakdown }

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/**
 * Everything both booking paths (player drawer, staff walk-in) must agree on:
 * the court is active and belongs to the org, the org is approved, the start is
 * a real slot of that day's hours, the player count is legal, and the price.
 * All read from the database with the service-role client; nothing from the browser.
 */
export async function checkBookableSlot(
  admin: SupabaseClient<Database>,
  input: { orgId: string; courtId: string; date: string; startsAt: string; playerCount: number }
): Promise<SlotCheckOk | SlotCheckError> {
  // The court and the club do not depend on each other: read them together.
  const [{ data: court }, { data: org }] = await Promise.all([
    admin
      .from('courts')
      .select('id, org_id, sport, status, deleted_at, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
      .eq('id', input.courtId)
      .maybeSingle(),
    admin.from('organizations').select('status, deleted_at, weekly_hours').eq('id', input.orgId).maybeSingle(),
  ])

  if (!court || court.org_id !== input.orgId || court.status !== 'active' || court.deleted_at !== null || !isSport(court.sport)) {
    return { ok: false, code: 'unavailable', message: 'Ce terrain n\'est plus disponible à la réservation.' }
  }
  const sport = court.sport

  if (org?.status !== 'approved' || org.deleted_at !== null) {
    return { ok: false, code: 'unavailable', message: 'Ce club n\'accepte pas de réservations pour le moment.' }
  }

  const today = venueDateString()
  if (input.date < today || input.date > addDays(today, MAX_DAYS_AHEAD)) {
    return { ok: false, code: 'invalid_slot', message: 'Cette date n\'est pas ouverte à la réservation.' }
  }

  const hours = effectiveHours(parseWeeklyHours(org.weekly_hours), input.date, court)
  if (!hours) {
    return { ok: false, code: 'invalid_slot', message: 'Le club est fermé ce jour-là.' }
  }

  const startsAtMs = Date.parse(input.startsAt)
  const onGrid = generateCourtSlots({
    sport,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    dateStr: input.date,
    locks: [],
    now: new Date(0), // "past" is enforced by the database against the real clock
  }).some((slot) => Date.parse(slot.start) === startsAtMs)
  if (!onGrid) {
    return { ok: false, code: 'invalid_slot', message: 'Cet horaire n\'est pas disponible sur ce terrain. Veuillez choisir un créneau proposé.' }
  }

  if (!(PLAYER_COUNT_OPTIONS[sport] as readonly number[]).includes(input.playerCount)) {
    return { ok: false, code: 'invalid_input', message: 'Ce nombre de joueurs n\'est pas autorisé pour ce sport.' }
  }

  const price = computePrice({
    pricePerHour: Number(court.price_per_hour),
    nightSurchargePerHour: Number(court.night_surcharge_per_hour),
    nightStartsAtMinutes: timeToMinutes(court.night_starts_at),
    startMinutes: minutesSinceVenueDayStart(input.startsAt, input.date),
    durationMinutes: SPORT_DURATION_MIN[sport],
  })

  return { ok: true, sport, price }
}


export type SportCheckOk = {
  ok: true
  sport: Sport
  /** Free courts of the sport at that time, cheapest first: the order to try them in. */
  candidates: { courtId: string; courtName: string; price: number }[]
}

/**
 * Time-first booking (players never pick a court): the same checks as `checkBookableSlot`, for every
 * active court of the sport, and which of them are free at that time (cheapest first, ties by name).
 * Free is read from the slot locks now; the database stays the judge at insert time (GiST), so the
 * caller tries the next candidate when a court is taken in between.
 */
export async function checkBookableSport(
  admin: SupabaseClient<Database>,
  input: { orgId: string; sport: Sport; date: string; startsAt: string; playerCount: number }
): Promise<SportCheckOk | SlotCheckError> {
  const { sport } = input
  const [{ data: courts }, { data: org }] = await Promise.all([
    admin
      .from('courts')
      .select('id, name, sport, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
      .eq('org_id', input.orgId)
      .eq('sport', sport)
      .eq('status', 'active')
      .is('deleted_at', null),
    admin.from('organizations').select('status, deleted_at, weekly_hours').eq('id', input.orgId).maybeSingle(),
  ])

  if (org?.status !== 'approved' || org.deleted_at !== null) {
    return { ok: false, code: 'unavailable', message: "Ce club n'accepte pas de réservations pour le moment." }
  }
  if (!courts?.length) {
    return { ok: false, code: 'unavailable', message: "Ce club ne propose plus ce sport à la réservation." }
  }

  const today = venueDateString()
  if (input.date < today || input.date > addDays(today, MAX_DAYS_AHEAD)) {
    return { ok: false, code: 'invalid_slot', message: "Cette date n'est pas ouverte à la réservation." }
  }
  if (!(PLAYER_COUNT_OPTIONS[sport] as readonly number[]).includes(input.playerCount)) {
    return { ok: false, code: 'invalid_input', message: "Ce nombre de joueurs n'est pas autorisé pour ce sport." }
  }

  // Courts whose grid (club hours that day, else the court's own) has this exact start.
  const weekly = parseWeeklyHours(org.weekly_hours)
  const startsAtMs = Date.parse(input.startsAt)
  const onGrid = courts.filter((court) => {
    const hours = effectiveHours(weekly, input.date, court)
    if (!hours) return false
    return generateCourtSlots({ sport, openTime: hours.openTime, closeTime: hours.closeTime, dateStr: input.date, locks: [], now: new Date(0) }).some(
      (slot) => Date.parse(slot.start) === startsAtMs
    )
  })
  if (onGrid.length === 0) {
    return { ok: false, code: 'invalid_slot', message: "Cet horaire n'est pas proposé ce jour-là. Veuillez choisir un créneau affiché." }
  }

  const { data: locks } = await admin
    .from('court_slot_locks')
    .select('court_id, occupied_from, occupied_until')
    .in('court_id', onGrid.map((c) => c.id))
    .lt('occupied_from', new Date(startsAtMs + (SPORT_DURATION_MIN[sport] + 15) * 60_000).toISOString())
    .gt('occupied_until', input.startsAt)

  const candidates = onGrid
    .filter((court) =>
      !slotIsBusy(
        (locks ?? []).filter((l) => l.court_id === court.id).map((l) => ({ from: l.occupied_from, until: l.occupied_until })),
        input.startsAt,
        sport
      )
    )
    .map((court) => {
      const priced: PricedCourt = {
        id: court.id,
        name: court.name,
        sport,
        pricePerHour: Number(court.price_per_hour),
        nightSurchargePerHour: Number(court.night_surcharge_per_hour),
        nightStartsAt: court.night_starts_at,
      }
      return { court: priced, price: slotTotal(priced, input.startsAt, input.date) }
    })
    .sort(byPriceThenName)
    .map(({ court, price }) => ({ courtId: court.id, courtName: court.name, price }))

  if (candidates.length === 0) {
    return { ok: false, code: 'slot_taken', message: "Plus aucun terrain n'est libre à cette heure. Veuillez choisir un autre horaire." }
  }
  return { ok: true, sport, candidates }
}
