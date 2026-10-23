import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { computeAnalytics, resolveRange, yearStart, type Analytics, type BookingInput, type DateRange } from '@/lib/analytics'
import { addDays, venueDateString, venueInstant } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours } from '@/lib/operating-hours'
import { getOrgAccess } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

const PAGE = 1000
/** Safety valve: ~30k bookings in a year is far beyond one club. */
const MAX_PAGES = 30

export type AnalyticsResult =
  | { ok: true; orgName: string; data: Analytics; truncated: boolean }
  | { ok: false; reason: 'forbidden' | 'error' }

/**
 * Load a club's analytics for the URL params.
 *
 * Authorization is decided here, not by the caller: the club is the signed-in
 * owner's own (profiles.org_id via getOrgAccess), never taken from input, and
 * only `org_admin` gets numbers: staff and players are refused before any query
 * runs. The aggregation itself is cached (see computeOrgAnalytics).
 */
export async function loadOrgAnalytics(params: { range?: string; from?: string; to?: string }): Promise<AnalyticsResult> {
  const access = await getOrgAccess()
  if (access.kind !== 'ok' || access.ctx.role !== 'org_admin' || access.ctx.orgStatus !== 'approved') {
    return { ok: false, reason: 'forbidden' }
  }
  const { orgId, orgName } = access.ctx

  const today = venueDateString()
  const range: DateRange = resolveRange(params, today)
  try {
    const { data, truncated } = await computeOrgAnalytics(orgId, range, today)
    return { ok: true, orgName, data, truncated }
  } catch (error) {
    console.error('Analytics query failed:', error instanceof Error ? error.message : error)
    return { ok: false, reason: 'error' }
  }
}

/**
 * The heavy part: up to a year of bookings with their payments, aggregated. Cached 15 min per club,
 * range and day (tags `owner-analytics`, `owner-analytics:<org>`); a booking or payment change marks it
 * stale, and the next visit gets the previous numbers while they recompute. Service role inside the
 * cache scope (no cookies there), with every query pinned to `orgId`, which loadOrgAnalytics took from
 * the owner's session. A failed read throws, so it is never cached.
 */
function computeOrgAnalytics(orgId: string, range: DateRange, today: string): Promise<{ data: Analytics; truncated: boolean }> {
  return unstable_cache(
    async () => {
      // The headline cards need the year to date regardless of the chosen range.
      const fetchFrom = range.from < yearStart(today) ? range.from : yearStart(today)
      const fromIso = venueInstant(fetchFrom, 0).toISOString()
      const toIso = venueInstant(addDays(today, 1), 0).toISOString()

      const admin = getSupabaseAdmin()

      // Started now so they run alongside the (paged) bookings query.
      const sideReads = Promise.all([
        admin.from('courts').select('id, name, sport, status, deleted_at, open_time, close_time').eq('org_id', orgId),
        admin.from('organizations').select('weekly_hours').eq('id', orgId).maybeSingle(),
      ])

      const bookings: BookingInput[] = []
      let truncated = false
      for (let page = 0; ; page++) {
        if (page >= MAX_PAGES) {
          truncated = true
          break
        }
        const { data, error } = await admin
          .from('bookings')
          .select(
            'id, court_id, starts_at, ends_at, status, booker_profile_id, booker_anon_id, payment_records(amount, status, provider)'
          )
          .eq('org_id', orgId)
          .gte('starts_at', fromIso)
          .lt('starts_at', toIso)
          .order('starts_at')
          .order('id')
          .range(page * PAGE, page * PAGE + PAGE - 1)
        if (error) throw new Error(`bookings: ${error.message}`)
        for (const row of data ?? []) {
          bookings.push({
            id: row.id,
            court_id: row.court_id,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            status: row.status,
            booker_profile_id: row.booker_profile_id,
            booker_anon_id: row.booker_anon_id,
            payments: (row.payment_records ?? []).map((p) => ({
              amount: Number(p.amount),
              status: p.status,
              provider: p.provider,
            })),
          })
        }
        if ((data?.length ?? 0) < PAGE) break
      }

      const [courtsRes, orgRes] = await sideReads
      if (courtsRes.error || orgRes.error) throw new Error(`courts/org: ${courtsRes.error?.message ?? orgRes.error?.message}`)
      const weekly = parseWeeklyHours(orgRes.data?.weekly_hours ?? null)

      const data = computeAnalytics({
        range,
        today,
        bookings,
        // An archived court keeps its past revenue but counts for no capacity: it reads as 'archived', not 'active'.
        courts: (courtsRes.data ?? []).map((c) => ({ ...c, status: c.deleted_at ? 'archived' : c.status })),
        hoursFor: (date, court) => effectiveHours(weekly, date, court),
      })
      return { data, truncated }
    },
    ['owner-analytics', orgId, today, range.preset, range.from, range.to],
    { revalidate: CACHE_TTL.analytics, tags: [CACHE_TAGS.ownerAnalytics, CACHE_TAGS.orgAnalytics(orgId)] }
  )()
}
