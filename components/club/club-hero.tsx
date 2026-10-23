'use client'

import * as React from 'react'
import Image from 'next/image'
import { Images } from 'lucide-react'

import { ClubGallery } from '@/components/club/club-gallery'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * The club page's photo hero. Phones: a full-bleed row to swipe, with a counter. From `md`: a bento mosaic
 * (the first photo large on the left, 60%; one, two or four on the right, 40%). Any photo, or the
 * "Voir toutes les photos" pill, opens the full gallery.
 */
export function ClubHero({ urls, name }: { urls: string[]; name: string }) {
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const strip = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(0)
  const count = urls.length
  if (count === 0) return null

  const openAt = (i: number) => {
    setIndex(i)
    setOpen(true)
  }
  // Desktop tiles beside the featured photo: 4 when there are enough for a full 2×2, else up to 2 stacked
  // (a lone third photo would break the grid; the gallery still shows it).
  const side = urls.slice(1, count >= 5 ? 5 : 3)

  return (
    <>
      {/* Phones and small tablets */}
      <div className="relative -mx-4 md:hidden" data-testid="club-gallery">
        <div
          ref={strip}
          onScroll={() => {
            const el = strip.current
            if (el && el.clientWidth) setShown(Math.round(el.scrollLeft / el.clientWidth))
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`Photos de ${name}`}
        >
          {urls.map((url, i) => (
            <button key={url} type="button" onClick={() => openAt(i)} className="relative aspect-[2/1] w-full shrink-0 snap-center" aria-label={`Agrandir la photo ${i + 1} sur ${count}`}>
              <Image src={url} alt={`${name}, photo ${i + 1}`} fill unoptimized priority={i === 0} sizes="100vw" className="object-cover" />
            </button>
          ))}
        </div>
        {count > 1 && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-forest-depths/80 px-2.5 py-0.5 text-xs font-medium tabular-nums text-bone-linen" aria-hidden>
            {shown + 1} / {count}
          </span>
        )}
      </div>

      {/* From md: the bento mosaic. Featured photo on the left (3 of 5 columns, 60%), the rest stacked on the
          right (40%): one tall tile, two stacked, or a 2×2 of four. */}
      <div
        className={cn(
          'relative hidden h-[22rem] gap-2 overflow-hidden rounded-3xl md:grid lg:h-[26rem]',
          side.length === 0 ? 'grid-cols-1' : 'grid-cols-5 grid-rows-2'
        )}
        data-testid="club-gallery-mosaic"
      >
        <MosaicTile
          url={urls[0]}
          alt={`${name}, photo 1`}
          label={`Agrandir la photo 1 sur ${count}`}
          onOpen={() => openAt(0)}
          sizes={side.length === 0 ? '(min-width: 1280px) 80rem, 100vw' : '60vw'}
          priority
          className={cn(side.length > 0 && 'col-span-3 row-span-2')}
        />
        {side.map((url, i) => (
          <MosaicTile
            key={url}
            url={url}
            alt={`${name}, photo ${i + 2}`}
            label={`Agrandir la photo ${i + 2} sur ${count}`}
            onOpen={() => openAt(i + 1)}
            sizes={side.length === 4 ? '20vw' : '40vw'}
            className={cn(side.length === 1 && 'col-span-2 row-span-2', side.length === 2 && 'col-span-2')}
          />
        ))}
        {count > 1 && (
          <button
            type="button"
            onClick={() => openAt(0)}
            className="absolute bottom-4 right-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-forest-depths/10 bg-bone-linen/90 px-4 text-sm font-medium text-forest-depths backdrop-blur-md transition-[background-color,scale] duration-150 hover:bg-bone-linen active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            <Images className="size-4" aria-hidden />
            Voir toutes les photos
            <span className="tabular-nums text-forest-depths/60">({count})</span>
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription className="sr-only">Galerie photo du club</DialogDescription>
          </DialogHeader>
          {/* Remounted per photo so it opens on the one that was tapped. */}
          <ClubGalleryAt key={index} urls={urls} name={name} start={index} />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** One mosaic photo: a slow zoom and a light veil on hover (both off with reduced motion). */
function MosaicTile({
  url,
  alt,
  label,
  onOpen,
  sizes,
  priority = false,
  className,
}: {
  url: string
  alt: string
  label: string
  onOpen: () => void
  sizes: string
  priority?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('group relative overflow-hidden bg-forest-depths focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50', className)}
      aria-label={label}
    >
      <Image
        src={url}
        alt={alt}
        fill
        unoptimized
        priority={priority}
        sizes={sizes}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-forest-depths/0 transition-colors duration-300 group-hover:bg-forest-depths/15 motion-reduce:transition-none" />
    </button>
  )
}

/** The full gallery, scrolled to `start` once mounted. */
function ClubGalleryAt({ urls, name, start }: { urls: string[]; name: string; start: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const track = ref.current?.querySelector<HTMLElement>('[aria-roledescription="carousel"] > div')
    if (track && start > 0) track.scrollLeft = start * track.clientWidth
  }, [start])
  return (
    <div ref={ref}>
      <ClubGallery urls={urls} name={name} />
    </div>
  )
}
