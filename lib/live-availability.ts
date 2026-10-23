import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { parseWeeklyHours } from '@/lib/operating-hours'
import type { Sport } from '@/lib/slot-duration'
import { createPublicClient } from '@/lib/supabase/public'
import { countFreeNow, type LiveAvailability, type LiveCourt } from '@/lib/utils/slot-helpers'

export type { LiveAvailability, LiveCourt }

const SPORTS: readonly string[] = ['padel', 'tennis', 'football']
const MAX_COURTS = 2000

/**
 * Public reads (anon): active courts of approved clubs and the locks covering this instant. Cached for
 * 15 s across visitors (tag `slots`, dropped by every booking change); a failed read throws, so it is
 * not cached.
 */
const cachedLiveAvailability = unstable_cache(
  async (): Promise<LiveAvailability> => {
    const now = new Date()
    const supabase = createPublicClient()
    const nowIso = now.toISOString()
    const [orgs, courts, locks] = await Promise.all([
      supabase.from('organizations').select('id, weekly_hours').eq('status', 'approved').is('deleted_at', null).limit(200),
      supabase
        .from('courts')
        .select('id, org_id, sport, open_time, close_time')
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(MAX_COURTS),
      supabase.from('court_slot_locks').select('court_id').lte('occupied_from', nowIso).gt('occupied_until', nowIso).limit(MAX_COURTS),
    ])
    if (orgs.error || courts.error || locks.error) {
      throw new Error(orgs.error?.message ?? courts.error?.message ?? locks.error?.message)
    }
    const weeklyByOrg = new Map(orgs.data.map((o) => [o.id, parseWeeklyHours(o.weekly_hours)]))
    const approved = courts.data
      .filter((c) => weeklyByOrg.has(c.org_id) && SPORTS.includes(c.sport))
      .map((c) => ({ id: c.id, orgId: c.org_id, sport: c.sport as Sport, openTime: c.open_time, closeTime: c.close_time }))
    return countFreeNow(approved, weeklyByOrg, new Set(locks.data.map((l) => l.court_id)), now)
  },
  ['live-availability'],
  { revalidate: CACHE_TTL.slots, tags: [CACHE_TAGS.slots, CACHE_TAGS.clubs] }
)

/** Courts free right now, per sport (at most 15 s old). A failure returns {}: no badge. */
export async function loadLiveAvailability(): Promise<LiveAvailability> {
  try {
    return await cachedLiveAvailability()
  } catch (error) {
    console.error('loadLiveAvailability failed:', error instanceof Error ? error.message : error)
    return {}
  }
}
