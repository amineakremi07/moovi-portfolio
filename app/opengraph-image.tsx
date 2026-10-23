import { ImageResponse } from 'next/og'

import { loadOgLogo, OG_SIZE, OgCard } from '@/components/seo/og-card'
import { BRAND_NAME } from '@/lib/brand'

/** The default share card for every page without its own (club pages draw theirs). */
export const alt = `${BRAND_NAME} - Réservez vos terrains de Padel, Tennis & Foot en Tunisie`
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    <OgCard logo={await loadOgLogo()} kicker="Padel · Tennis · Football" title="Réservez votre terrain en Tunisie" subtitle="Disponibilités en direct, prix en TND." />,
    size
  )
}
