import Link from 'next/link'
import {
  BarChart3,
  CalendarRange,
  Clock3,
  Image as ImageIcon,
  QrCode,
  RotateCcw,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BOOKING_PATH } from '@/lib/auth-landing'
import { t, type MessageKey } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

/* ==========================================================================
   "Une plateforme, deux usages": what a player gets and what a club gets,
   side by side. The club column sits on Forest Depths, the same surface as the
   hero, so the B2B side reads as its own space; each column ends on its door.
   ========================================================================== */

type Feature = { icon: LucideIcon; key: string }

const PLAYERS: Feature[] = [
  { icon: Clock3, key: 'aud.players.f1' },
  { icon: UserRound, key: 'aud.players.f2' },
  { icon: RotateCcw, key: 'aud.players.f3' },
  { icon: XCircle, key: 'aud.players.f4' },
]

const CLUBS: Feature[] = [
  { icon: CalendarRange, key: 'aud.clubs.f1' },
  { icon: QrCode, key: 'aud.clubs.f2' },
  { icon: BarChart3, key: 'aud.clubs.f3' },
  { icon: ImageIcon, key: 'aud.clubs.f4' },
]

function FeatureList({ items, dark }: { items: Feature[]; dark?: boolean }) {
  return (
    <ul className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
      {items.map(({ icon: Icon, key }) => (
        <li key={key} className="flex gap-3">
          <Icon className={cn('mt-0.5 size-5 shrink-0', dark ? 'text-bone-linen/70' : 'text-peacock-teal')} aria-hidden />
          <div>
            <h4 className="font-semibold leading-snug">{t(`${key}.title` as MessageKey)}</h4>
            <p className={cn('mt-1 text-sm leading-relaxed', dark ? 'text-bone-linen/75' : 'text-muted-foreground')}>
              {t(`${key}.body` as MessageKey)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Audiences() {
  return (
    <section id="audiences" aria-labelledby="aud-title" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-[1920px] px-4 pb-24 sm:px-6 md:pb-32 lg:px-8 xl:px-12">
        <h2 id="aud-title" className="max-w-[22ch] text-3xl font-semibold leading-[1.1] tracking-tight text-balance md:text-5xl">
          {t('aud.title')}
        </h2>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <article aria-labelledby="aud-players" className="flex flex-col rounded-2xl bg-card p-6 md:p-10">
            <h3 id="aud-players" className="text-2xl font-semibold tracking-tight">
              {t('aud.players.title')}
            </h3>
            <FeatureList items={PLAYERS} />
            <div className="mt-auto pt-10">
              <Button asChild className="h-12 px-6 text-base">
                <Link href={BOOKING_PATH}>{t('aud.players.cta')}</Link>
              </Button>
            </div>
          </article>

          <article aria-labelledby="aud-clubs" className="flex flex-col rounded-2xl bg-forest-depths p-6 text-bone-linen md:p-10">
            <h3 id="aud-clubs" className="text-2xl font-semibold tracking-tight">
              {t('aud.clubs.title')}
            </h3>
            <FeatureList items={CLUBS} dark />
            <div className="mt-auto pt-10">
              <Button
                asChild
                variant="outline"
                className="h-12 border-bone-linen/40 bg-transparent px-6 text-base text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
              >
                <Link href="/espace-club" prefetch>
                  {t('aud.clubs.cta')}
                </Link>
              </Button>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
