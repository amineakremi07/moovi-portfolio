'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Building2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n/messages'
import { SPRING } from '@/components/ui/motion-button'
import { BOOKING_PATH } from '@/lib/auth-landing'

/* ==========================================================================
   Public landing hero: the two doors into Moovi.
   Forest Depths container (DESIGN.md "Hero / Dark Section") on the Bone Linen
   canvas, all text Bone Linen, left-aligned. The single Lime Pulse element is the
   player CTA ("Réserver un terrain" -> /courts, which asks a signed-out visitor
   to log in first); the club CTA is outlined. The figures under the CTAs are
   real (from the DB).
   ========================================================================== */

/** Faint padel-court linework — sport-specific texture, no fills. */
function CourtLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={className}>
      <rect x="20" y="20" width="360" height="560" rx="4" />
      <line x1="20" y1="300" x2="380" y2="300" />
      <line x1="200" y1="150" x2="200" y2="450" />
      <line x1="20" y1="150" x2="380" y2="150" />
      <line x1="20" y1="450" x2="380" y2="450" />
    </svg>
  )
}

export function HeroSection({ clubCount, courtCount }: { clubCount: number; courtCount: number }) {
  const reduce = useReducedMotion()

  return (
    <section
      id="home"
      aria-labelledby="hero-title"
      className="mx-auto w-full max-w-[1920px] scroll-mt-0 px-3 pb-16 pt-3 sm:px-5 md:pb-24 md:pt-5 xl:px-9"
    >
      <div className="relative isolate w-full overflow-clip rounded-3xl border border-black/5 bg-forest-depths text-bone-linen">
        {/* Atmosphere: a deep teal wash and court linework. Both decorative. */}
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[560px] rounded-full bg-peacock-teal/40 blur-3xl" />
        <CourtLines className="pointer-events-none absolute -bottom-24 -right-10 -z-10 hidden h-[560px] rotate-6 text-bone-linen/[0.07] lg:block" />

        <div className="relative flex flex-col items-start px-5 pb-16 pt-32 text-left md:px-10 md:pb-24 md:pt-44">
          <h1
            id="hero-title"
            className="max-w-[16ch] text-5xl font-semibold uppercase leading-[0.95] tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-[5.75rem]"
          >
            {t('hero.title')}
          </h1>

          <p className="mt-6 max-w-[58ch] text-base leading-relaxed text-oat-milk text-pretty md:text-lg">{t('hero.body')}</p>

          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild className="h-12 px-7 text-base">
              <motion.a
                href={BOOKING_PATH}
                whileHover={reduce ? undefined : { y: -1 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={SPRING}
                data-testid="cta-player"
              >
                {t('hero.ctaPlayer')}
                <ArrowRight aria-hidden />
              </motion.a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 border-bone-linen/40 bg-transparent px-7 text-base text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
            >
              <Link href="/espace-club" prefetch data-testid="cta-club">
                <Building2 aria-hidden />
                {t('hero.ctaClub')}
              </Link>
            </Button>
          </div>

          {/* Real numbers only; hidden when the club list could not be loaded. */}
          {clubCount > 0 && (
            <dl
              aria-label={t('hero.stats')}
              className="mt-12 flex flex-wrap gap-x-8 gap-y-2 border-t border-bone-linen/15 pt-6 text-sm"
            >
              <div>
                <dt className="sr-only">Clubs</dt>
                <dd className="font-semibold tabular-nums">
                  {t(clubCount === 1 ? 'hero.statClubs.one' : 'hero.statClubs.other', { n: clubCount })}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Terrains</dt>
                <dd className="font-semibold tabular-nums">
                  {t(courtCount === 1 ? 'hero.statCourts.one' : 'hero.statCourts.other', { n: courtCount })}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Sports</dt>
                <dd className="text-bone-linen/75">{t('hero.sports')}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </section>
  )
}

export default HeroSection
