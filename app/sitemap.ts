import type { MetadataRoute } from 'next'

import { resolveAppUrl } from '@/lib/app-url'
import { loadClubs } from '@/lib/clubs-loader'

/** Regenerated at most hourly; a club's approval also lands within the clubs cache window. */
export const revalidate = 3600

/** The public pages plus one entry per approved club (the pages engines should index and cite). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = resolveAppUrl()
  const { clubs } = await loadClubs()

  return [
    { url: `${appUrl}/`, changeFrequency: 'daily', priority: 1 },
    ...clubs.map((club) => ({ url: `${appUrl}/courts/${club.id}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    { url: `${appUrl}/espace-club`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${appUrl}/register`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${appUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${appUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
