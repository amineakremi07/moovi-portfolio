import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { demandProfileFromCounts, DEMAND_WINDOW_WEEKS, type DemandProfile } from '@/lib/demand'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Server-side data for the slot hints (demand badges, "Recommended for you"). Only aggregates and the
 * caller's own start times leave this file: no names, contacts or other players' bookings.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Demand of the club over the last weeks, or null when it could not be read (the badges then use the
 * fixed rule). Weeks of history barely move in an hour: cached 1 h per club (tag `club:<org>`).
 */
export async function loadClubDemand(orgId: string, courtCount: number): Promise<DemandProfile | null> {
  try {
    return await unstable_cache(
      async () => {
        const now = new Date()
        const since = new Date(now.getTime() - DEMAND_WINDOW_WEEKS * 7 * DAY_MS).toISOString()
        // Grouped in the database (at most 7 x 24 rows come back), not counted from raw booking rows.
        const { data, error } = await getSupabaseAdmin().rpc('club_demand_counts', {
          p_org_id: orgId,
          p_since: since,
          p_until: now.toISOString(),
        })
        if (error || !data) throw new Error(error?.message ?? 'no demand data')
        const firstStart = data[0]?.first_start
        const first = firstStart ? Date.parse(firstStart) : now.getTime()
        const weeks = Math.min(DEMAND_WINDOW_WEEKS, Math.max(1, Math.ceil((now.getTime() - first) / (7 * DAY_MS))))
        return demandProfileFromCounts(data, courtCount, weeks)
      },
      ['club-demand', orgId, String(courtCount)],
      { revalidate: CACHE_TTL.clubs, tags: [CACHE_TAGS.club(orgId)] }
    )()
  } catch {
    return null
  }
}

/** Start times of this player's own past bookings at this club (recent first, capped). */
export async function loadMemberHistory(userId: string, orgId: string, now = new Date()): Promise<string[]> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('bookings')
      .select('starts_at')
      .eq('booker_profile_id', userId)
      .eq('org_id', orgId)
      .in('status', ['confirmed', 'completed', 'pending_payment'])
      .lte('starts_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(40)
    return (data ?? []).map((b) => b.starts_at)
  } catch {
    return []
  }
}
