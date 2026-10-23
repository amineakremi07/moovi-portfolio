import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { venueInstant } from '@/lib/court-time'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Cached public reads for a club page (`/courts/[orgId]`), all as `anon`: RLS exposes only approved
 * clubs, their active courts and the lock ranges. A failed read throws inside the cache scope, so it
 * is never stored; the callers turn it into their usual "could not load" state.
 */

const listingCache = (orgId: string) => ({ revalidate: CACHE_TTL.clubs, tags: [CACHE_TAGS.clubs, CACHE_TAGS.club(orgId)] })

/** The club (null when it is not approved or does not exist): 1 h, dropped when the owner saves it. */
export function loadClubProfile(orgId: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await createPublicClient()
        .from('organizations')
        .select('id, name, address, city, whatsapp_number, weekly_hours, description, latitude, longitude, gallery_urls, logo_url')
        .eq('id', orgId)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    ['club-profile', orgId],
    listingCache(orgId)
  )()
}

/** The club's active courts: 1 h, dropped when the owner adds, edits, archives or restores one. */
export function loadClubCourts(orgId: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await createPublicClient()
        .from('courts')
        .select('id, name, sport, price_per_hour, open_time, close_time, night_surcharge_per_hour, night_starts_at')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('name')
      if (error) throw new Error(error.message)
      return data
    },
    ['club-courts', orgId],
    listingCache(orgId)
  )()
}

/**
 * Locks overlapping a venue day (through 24:00 + 24 h so late-night slots are covered): 15 s, dropped
 * by every booking change at the club and by the page's own realtime feed.
 */
export function loadClubLocks(orgId: string, courtIds: string[], day: string) {
  return unstable_cache(
    async () => {
      const { data, error } = await createPublicClient()
        .from('court_slot_locks')
        .select('court_id, occupied_from, occupied_until')
        .in('court_id', courtIds)
        .lt('occupied_from', venueInstant(day, 2880).toISOString())
        .gt('occupied_until', venueInstant(day, 0).toISOString())
      if (error) throw new Error(error.message)
      return data
    },
    ['club-locks', orgId, day, [...courtIds].sort().join(',')],
    { revalidate: CACHE_TTL.slots, tags: [CACHE_TAGS.slots, CACHE_TAGS.clubSlots(orgId)] }
  )()
}
