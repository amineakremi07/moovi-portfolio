import { ImageResponse } from 'next/og'

import { loadOgLogo, OG_SIZE, OgCard } from '@/components/seo/og-card'
import { BRAND_NAME } from '@/lib/brand'
import { loadClubCourts, loadClubProfile } from '@/lib/club-page-loader'
import { buildClubs } from '@/lib/clubs'
import { sportList } from '@/lib/seo'

/** A club's share card: its name, city, sports and starting price (public data, cached loaders). */
export const alt = `Réserver un terrain sur ${BRAND_NAME}`
export const size = OG_SIZE
export const contentType = 'image/png'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Image({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const logo = await loadOgLogo()
  const org = UUID.test(orgId) ? await loadClubProfile(orgId).catch(() => null) : null
  if (!org) {
    return new ImageResponse(<OgCard logo={logo} kicker="Tunisie" title="Réservez votre terrain" subtitle="Padel, tennis et football." />, size)
  }

  const courts = await loadClubCourts(orgId).catch(() => [])
  const club = buildClubs(
    [org],
    courts.map((c) => ({ ...c, org_id: org.id, price_per_hour: Number(c.price_per_hour) }))
  )[0]
  const prices = (club?.sports ?? []).map((s) => s.startingPrice).filter((p): p is number => p !== null)
  const sports = club?.sports.length ? sportList(club.sports) : 'Terrains de sport'

  return new ImageResponse(
    <OgCard
      logo={logo}
      kicker={org.city ? `${org.city} · Tunisie` : 'Tunisie'}
      title={org.name}
      subtitle={`${sports}${prices.length ? ` · dès ${Math.min(...prices)} TND` : ''} · Réservez en ligne`}
    />,
    size
  )
}
