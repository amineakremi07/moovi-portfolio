import Image from 'next/image'
import Link from 'next/link'

import { BRAND_NAME } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Pixel size of public/brand/logo-*.png (cropped to the ink by `npm run brand:assets`). */
export const LOGO_SIZE = { width: 736, height: 319 }

/**
 * The Moovi logo, linking home (or wherever `href` says).
 *
 * Two transparent files share the same artwork and differ in the wordmark and bolt colours:
 *  - `light` (/brand/logo-light.png): Bone Linen wordmark, for the Forest Depths hero and nav;
 *  - `dark`  (/brand/logo-dark.png): Obsidian Plum wordmark, for the light surfaces (login, footer).
 * The court cells are Lime Pulse in both.
 *
 * The files are cropped to the artwork, so the class sets the height and the width follows from the
 * intrinsic size: the box is reserved before the image loads (no layout shift) and nothing is clipped.
 */
export function BrandMark({
  className,
  imageClassName = 'h-9 sm:h-10',
  href = '/',
  tone = 'light',
  asStatic = false,
}: {
  className?: string
  /** Sets the logo height (the width follows from the ratio). */
  imageClassName?: string
  href?: string
  tone?: 'light' | 'dark'
  /** Render the logo without its own link, for placing inside another link. */
  asStatic?: boolean
}) {
  const Wrapper = asStatic ? 'span' : Link
  const wrapperProps = asStatic ? {} : { href, prefetch: true }
  return (
    <Wrapper {...(wrapperProps as { href: string })} className={cn('inline-flex items-center', className)}>
      <Image
        src={tone === 'dark' ? '/brand/logo-dark.png' : '/brand/logo-light.png'}
        alt={BRAND_NAME}
        {...LOGO_SIZE}
        priority
        sizes="140px"
        className={cn('block w-auto max-w-none', imageClassName)}
      />
    </Wrapper>
  )
}
