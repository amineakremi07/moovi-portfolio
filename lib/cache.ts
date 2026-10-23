import { revalidateTag } from 'next/cache'

import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Next.js Data Cache: tags, lifetimes and the invalidation helpers every write path calls.
 *
 * What is cached (`unstable_cache`, server-side, shared by every instance):
 *  - the public club directory and each club's profile + courts: 1 h (`clubs`, `club:<org>`)
 *  - each club's slot locks and the "free right now" counts: 15 s (`slots`, `slots:<org>`)
 *  - a club's demand profile (slot badges): 1 h (`club:<org>`)
 *  - a player's played-match history (level, stats, re-book): 10 min (`player:<user>`)
 *  - the owner's day schedule: 60 s (`schedule:<org>`)
 *  - the owner's analytics: 15 min (`owner-analytics`, `owner-analytics:<org>`)
 *
 * Never cached: a failed read (the loaders throw inside the cache scope, so nothing is stored),
 * anything read with the visitor's cookies, and the booking itself. `create_booking()` is the only
 * authority on whether a slot is free; a cached grid can at worst show a slot that the database then
 * refuses, and that refusal invalidates the club's slots (see createBooking).
 *
 * Invalidation expires the tag (`{ expire: 0 }`): the next read waits for fresh data, so whoever made
 * the change sees it. Analytics are the exception: they serve the stale numbers once while they
 * recompute in the background ('max'), the 15 min lag the owner screen allows anyway.
 */

export const CACHE_TTL = {
  clubs: 60 * 60,
  slots: 15,
  player: 10 * 60,
  schedule: 60,
  analytics: 15 * 60,
} as const

export const CACHE_TAGS = {
  clubs: 'clubs',
  club: (orgId: string) => `club:${orgId}`,
  /** Every club's locks: the live "free now" counts on /explore. */
  slots: 'slots',
  clubSlots: (orgId: string) => `slots:${orgId}`,
  player: (userId: string) => `player:${userId}`,
  schedule: (orgId: string) => `schedule:${orgId}`,
  ownerAnalytics: 'owner-analytics',
  orgAnalytics: (orgId: string) => `owner-analytics:${orgId}`,
} as const

const NOW = { expire: 0 } as const

/**
 * A booking was created, cancelled, paid, checked in, marked absent or moved to another court. Its
 * club's slots, schedule and analytics change, and so does the booker's history. Pass `bookerId`
 * when known (null for a guest); otherwise it is read from the booking.
 */
export async function invalidateBooking(input: { orgId: string; bookingId?: string; bookerId?: string | null }): Promise<void> {
  revalidateTag(CACHE_TAGS.clubSlots(input.orgId), NOW)
  revalidateTag(CACHE_TAGS.slots, NOW)
  revalidateTag(CACHE_TAGS.schedule(input.orgId), NOW)
  revalidateTag(CACHE_TAGS.orgAnalytics(input.orgId), 'max')

  let bookerId = input.bookerId
  if (bookerId === undefined && input.bookingId) {
    const { data } = await getSupabaseAdmin().from('bookings').select('booker_profile_id').eq('id', input.bookingId).maybeSingle()
    bookerId = data?.booker_profile_id ?? null
  }
  if (bookerId) revalidateTag(CACHE_TAGS.player(bookerId), NOW)
}

/**
 * The club itself changed: profile, hours, photos, courts (added, edited, archived, restored) or its
 * approval. Its card in the directory, its page, its slot grid and the owner's schedule all follow.
 */
export function invalidateClub(orgId: string): void {
  revalidateTag(CACHE_TAGS.clubs, NOW)
  revalidateTag(CACHE_TAGS.club(orgId), NOW)
  revalidateTag(CACHE_TAGS.clubSlots(orgId), NOW)
  revalidateTag(CACHE_TAGS.slots, NOW)
  revalidateTag(CACHE_TAGS.schedule(orgId), NOW)
  revalidateTag(CACHE_TAGS.orgAnalytics(orgId), 'max')
}

/** Realtime saw a change on this club's slots: drop the cached grid before the page refreshes. */
export function invalidateClubSlots(orgId: string): void {
  revalidateTag(CACHE_TAGS.clubSlots(orgId), NOW)
  revalidateTag(CACHE_TAGS.slots, NOW)
}

/** Realtime saw a change on this club's bookings: drop the owner's cached schedule before it refreshes. */
export function invalidateSchedule(orgId: string): void {
  revalidateTag(CACHE_TAGS.schedule(orgId), NOW)
}
