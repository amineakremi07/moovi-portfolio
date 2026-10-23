import Image from 'next/image'

import { cn } from '@/lib/utils'

/**
 * A club's round logo avatar. Without a logo, the club's initial on Forest Depths. Decorative: it always
 * sits beside the club's name, which is what assistive tech reads. Size it with `className` (e.g. `size-6`)
 * and pass the matching `sizes`.
 */
export function ClubLogo({ url, name, sizes, className }: { url: string | null; name: string; sizes: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-black/[0.08]',
        // Logos are often transparent PNGs: a white disc keeps dark marks legible.
        url ? 'bg-white' : 'bg-forest-depths text-bone-linen',
        className
      )}
      data-testid="club-logo"
    >
      {url ? <Image src={url} alt="" fill unoptimized sizes={sizes} className="object-cover" /> : name.slice(0, 1).toUpperCase()}
    </span>
  )
}
