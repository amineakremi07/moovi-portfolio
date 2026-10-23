'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, Map as MapIcon, MapPin, Navigation } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants } from '@/components/ui/button'
import { directionsLink } from '@/lib/club-profile'
import { cn } from '@/lib/utils'

// Leaflet needs `window`: the map is loaded in the browser only.
const ClubMap = dynamic(() => import('@/components/club/club-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
})

/**
 * The club's address, one button for Google Maps directions, and its exact pin on an interactive map,
 * folded away by default so it never crowds out the booking times. Leaflet loads only once it is opened.
 */
export function ClubLocation({
  name,
  address,
  latitude,
  longitude,
}: {
  name: string
  address: string | null
  latitude: number
  longitude: number
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <section aria-labelledby="club-map-heading" className="space-y-3">
      <h2 id="club-map-heading" className="text-sm font-semibold">
        Nous trouver
      </h2>
      {address && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {address}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={directionsLink(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 flex-1 gap-2 px-4')}
        >
          <Navigation className="size-4" aria-hidden /> Itinéraire
        </a>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="club-map-panel"
          onClick={() => setOpen((v) => !v)}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 flex-1 gap-2 px-4')}
        >
          <MapIcon className="size-4" aria-hidden />
          {open ? 'Masquer la carte' : 'Voir la carte'}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <div
          id="club-map-panel"
          // `relative z-0 isolate`: Leaflet's panes/controls use z-index up to 1000; this contains them in one
          // stacking context below the dialogs, drawers and toasts (z-50+).
          className="sg-light-map relative isolate z-0 h-56 overflow-hidden rounded-xl border border-border"
          role="region"
          aria-label={`Carte indiquant l'emplacement de ${name}`}
          data-testid="club-map"
        >
          <ClubMap latitude={latitude} longitude={longitude} name={name} />
        </div>
      )}
    </section>
  )
}
