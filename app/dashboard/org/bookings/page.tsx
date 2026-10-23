import { redirect } from 'next/navigation'

import { BookingsBoard, type BoardBooking, type BoardCourt } from '@/components/dashboard/bookings-board'
import { generateCourtSlots } from '@/lib/court-slots'
import { addDays, venueDateString } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { getOrgAccess } from '@/lib/org-access'
import { MAX_DAYS_AHEAD } from '@/lib/booking-core'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { loadScheduleDay } from '@/lib/schedule-loader'

export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Staff can look back this far (reconciling last month's cash, say). */
const DAYS_BACK = 60

export default async function OrgBookingsPage({ searchParams }: { searchParams?: Promise<{ date?: string }> }) {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  const { ctx } = access

  const today = venueDateString()
  const minDate = addDays(today, -DAYS_BACK)
  const maxDate = addDays(today, MAX_DAYS_AHEAD)
  const requested = (await searchParams)?.date
  const asked = requested && DATE.test(requested) ? requested : today
  const day = asked < minDate ? minDate : asked > maxDate ? maxDate : asked

  // Cached per club and day (lib/schedule-loader.ts). The club is the session's, proved above.
  let schedule: Awaited<ReturnType<typeof loadScheduleDay>>
  try {
    schedule = await loadScheduleDay(ctx.orgId, day)
  } catch (error) {
    console.error('Failed to load bookings board:', error instanceof Error ? error.message : error)
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        Impossible de charger le planning. Veuillez actualiser la page dans un instant.
      </div>
    )
  }

  const rows = schedule.bookings
  const anon = new Map(schedule.anon.map((a) => [a.id, a]))
  const profiles = new Map(schedule.profiles.map((p) => [p.id, p]))
  const payments = new Map(schedule.payments.map((p) => [p.booking_id, p]))
  const notes = new Map(schedule.notes.map((n) => [n.booking_id, n.note]))

  const bookings: BoardBooking[] = rows.map((b) => {
    const guest = b.booker_anon_id ? anon.get(b.booker_anon_id) : undefined
    const member = b.booker_profile_id ? profiles.get(b.booker_profile_id) : undefined
    return {
      id: b.id,
      courtId: b.court_id,
      courtPending: b.court_pending,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      status: b.status,
      playerCount: b.player_count,
      bookerName: guest?.name ?? member?.display_name ?? 'Inconnu',
      bookerPhone: guest?.phone ?? member?.phone ?? null,
      isMember: Boolean(member),
      amount: payments.get(b.id) ? Number(payments.get(b.id)!.amount) : null,
      paymentStatus: payments.get(b.id)?.status ?? null,
      paymentProvider: payments.get(b.id)?.provider ?? null,
      reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      checkedInAt: b.checked_in_at,
      source: b.source,
      note: notes.get(b.id) ?? null,
      noShowCount: member ? member.no_show_count : null,
      trustScore: member ? member.trust_score : null,
    }
  })

  const weekly = parseWeeklyHours(schedule.weeklyHours)
  const now = new Date()
  const courts: BoardCourt[] = schedule.courts.flatMap((c) => {
    if (!(c.sport in SPORT_DURATION_MIN)) return []
    const hours = effectiveHours(weekly, day, c)
    return [
      {
        id: c.id,
        name: c.name,
        sport: c.sport as Sport,
        status: c.status,
        pricePerHour: Number(c.price_per_hour),
        nightSurchargePerHour: Number(c.night_surcharge_per_hour),
        nightStartsAt: c.night_starts_at,
        archived: c.deleted_at !== null,
        closed: !hours,
        // An archived court takes no new bookings: only the bookings it already has are shown.
        slots: hours && c.deleted_at === null
          ? generateCourtSlots({
              sport: c.sport as Sport,
              openTime: hours.openTime,
              closeTime: hours.closeTime,
              dateStr: day,
              locks: [],
              now,
            }).map((s) => ({ start: s.start, end: s.end, past: s.state === 'past' }))
          : [],
      },
    ]
  })

  return <BookingsBoard orgId={ctx.orgId} dateStr={day} today={today} minDate={minDate} maxDate={maxDate} courts={courts} bookings={bookings} />
}
