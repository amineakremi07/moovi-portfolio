'use server'

import { z } from 'zod'

import { invalidateClubSlots, invalidateSchedule } from '@/lib/cache'
import { requireOrgAction } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'

/*
 * Realtime → cache. Every write the app makes already drops the cached data it touches (lib/cache.ts);
 * these cover the rest (a hold released by the database, a correction in the Supabase dashboard): the
 * page's realtime feed saw a change, so the cached copy is dropped before the page refreshes. They only
 * expire cache entries, never read or return data. Throttled: past the limit the page simply refreshes
 * on whatever the cache holds, at most 15 s (slots) or 60 s (schedule) old.
 */

const slotsSchema = z.object({ orgId: z.string().uuid() }).strict()

/** A club page saw a slot change. Public: anyone can watch a club's availability. */
export async function syncClubSlotsAction(input: { orgId: string }): Promise<void> {
  const parsed = slotsSchema.safeParse(input)
  if (!parsed.success) return
  if (await actionRateLimit('lookup', null, `slots:${parsed.data.orgId}`)) return
  invalidateClubSlots(parsed.data.orgId)
}

/** The bookings board saw a change. The club comes from the session, never from input. */
export async function syncScheduleAction(): Promise<void> {
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return
  if (await actionRateLimit('lookup', auth.ctx.userId, 'schedule')) return
  invalidateSchedule(auth.ctx.orgId)
}
