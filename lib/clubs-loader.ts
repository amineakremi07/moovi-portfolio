import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import { buildClubs, type Club } from '@/lib/clubs'
import { ownGalleryUrls, ownLogoUrl } from '@/lib/club-profile'
import { createPublicClient } from '@/lib/supabase/public'

/** Generous caps; add pagination before a network grows past them. */
const MAX_CLUBS = 200
const MAX_COURTS = 2000

/**
 * Cached for an hour (tag `clubs`): names, photos, hours and courts change only when an owner saves
 * them, and those saves invalidate the tag. Throws on a failed read so a failure is never cached.
 */
const cachedClubs = unstable_cache(
  async (): Promise<Club[]> => {
    const supabase = createPublicClient()

    const [orgs, courts] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, address, city, latitude, longitude, gallery_urls, logo_url, weekly_hours')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('name')
        .limit(MAX_CLUBS),
      supabase
        .from('courts')
        .select('id, org_id, name, sport, price_per_hour, open_time, close_time')
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(MAX_COURTS),
    ])

    if (orgs.error || courts.error) {
      // Log plain strings: a Supabase error object can print as `{}`, which hides
      // the cause (e.g. "TypeError: fetch failed" when the URL is unreachable).
      console.error('Failed to load clubs:', {
        organizations: orgs.error?.message,
        organizationsDetails: orgs.error?.details,
        courts: courts.error?.message,
        courtsDetails: courts.error?.details,
      })
      throw new Error('clubs read failed')
    }
    // The cover is the first gallery photo, and the logo is shown, only if they really live in the club's own storage folder.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const rows = orgs.data.map(({ gallery_urls, logo_url, ...org }) => ({
      ...org,
      cover_url: ownGalleryUrls(gallery_urls, org.id, supabaseUrl)[0] ?? null,
      logo_url: ownLogoUrl(logo_url, org.id, supabaseUrl),
    }))
    return buildClubs(rows, courts.data)
  },
  ['clubs-directory'],
  { revalidate: CACHE_TTL.clubs, tags: [CACHE_TAGS.clubs] }
)

/**
 * Approved clubs with their active courts, aggregated for the club finder (`/courts`) and the
 * landing page's counts. Public data (anon client): RLS + column grants expose only approved,
 * non-archived organizations, their active courts and non-sensitive columns.
 */
export async function loadClubs(): Promise<{ clubs: Club[]; failed: boolean }> {
  try {
    return { clubs: await cachedClubs(), failed: false }
  } catch {
    return { clubs: [], failed: true }
  }
}
