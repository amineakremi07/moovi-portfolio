import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { venueInstant } from '@/lib/court-time'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * One club's day for the bookings board: hours, courts, bookings and their bookers, payments and staff
 * notes. Cached 60 s per club and day (tag `schedule:<org>`), dropped by every booking write and by the
 * board's realtime feed (syncScheduleAction), so staff see their own changes at once.
 *
 * Service role inside the cache scope (cookies are not available there), so the CALLER must have
 * proved the user belongs to `orgId` (getOrgAccess) first. Every read is pinned to that club: bookings
 * and notes by org_id, courts by org_id, bookers and payments only for this club's booking ids, which
 * is what RLS lets the club's staff read. A failed read throws, so it is never cached.
 */
export function loadScheduleDay(orgId: string, day: string) {
  return unstable_cache(
    async () => {
      const admin = getSupabaseAdmin()
      const dayStart = venueInstant(day, 0).toISOString()
      const dayEnd = venueInstant(day, 1440).toISOString()

      const [orgRes, courtsRes, bookingsRes] = await Promise.all([
        admin.from('organizations').select('weekly_hours').eq('id', orgId).maybeSingle(),
        admin
          .from('courts')
          .select('id, name, sport, status, deleted_at, open_time, close_time, price_per_hour, night_surcharge_per_hour, night_starts_at')
          .eq('org_id', orgId)
          .order('name'),
        admin
          .from('bookings')
          .select('id, court_id, court_pending, sport, booker_profile_id, booker_anon_id, starts_at, ends_at, player_count, status, checked_in_at, source')
          .eq('org_id', orgId)
          .gte('starts_at', dayStart)
          .lt('starts_at', dayEnd)
          .order('starts_at'),
      ])
      if (orgRes.error || courtsRes.error || bookingsRes.error) {
        throw new Error(`schedule read failed: ${orgRes.error?.message ?? courtsRes.error?.message ?? bookingsRes.error?.message}`)
      }

      const rows = bookingsRes.data
      const anonIds = [...new Set(rows.map((b) => b.booker_anon_id).filter((v): v is string => Boolean(v)))]
      const profileIds = [...new Set(rows.map((b) => b.booker_profile_id).filter((v): v is string => Boolean(v)))]
      const bookingIds = rows.map((b) => b.id)

      const [anonRes, profileRes, payRes, notesRes] = await Promise.all([
        anonIds.length ? admin.from('anonymous_bookers').select('id, name, phone').in('id', anonIds) : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? admin.from('profiles').select('id, display_name, phone, trust_score, no_show_count').in('id', profileIds)
          : Promise.resolve({ data: [], error: null }),
        bookingIds.length
          ? admin.from('payment_records').select('booking_id, amount, status, provider').in('booking_id', bookingIds)
          : Promise.resolve({ data: [], error: null }),
        bookingIds.length
          ? admin.from('booking_notes').select('booking_id, note').eq('org_id', orgId).in('booking_id', bookingIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (anonRes.error || profileRes.error || payRes.error || notesRes.error) {
        throw new Error(
          `schedule details failed: ${anonRes.error?.message ?? profileRes.error?.message ?? payRes.error?.message ?? notesRes.error?.message}`
        )
      }

      return {
        weeklyHours: orgRes.data?.weekly_hours ?? null,
        courts: courtsRes.data,
        bookings: rows,
        anon: anonRes.data ?? [],
        profiles: profileRes.data ?? [],
        payments: payRes.data ?? [],
        notes: notesRes.data ?? [],
      }
    },
    ['schedule-day', orgId, day],
    { revalidate: CACHE_TTL.schedule, tags: [CACHE_TAGS.schedule(orgId)] }
  )()
}
