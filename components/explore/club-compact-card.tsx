'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Heart, LayoutGrid, Navigation } from 'lucide-react'

import { ClubLogo } from '@/components/club/club-logo'
import { SPORT_ICON } from '@/components/icons/sport-icons'
import { trackEvent } from '@/components/providers/posthog-provider'
import type { ClubStatus } from '@/lib/club-map'
import { SPORT_LABEL, formatDistance, formatTND, startingPrice, type Club, type SportFilter } from '@/lib/clubs'
import { t } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

const BADGE = 'inline-flex h-6 items-center gap-1 rounded-full bg-black/[0.05] px-2 text-[0.7rem] font-medium tabular-nums text-foreground/80'

export function statusText(status: ClubStatus): string {
  if (status.open) return t('disc.status.open', { time: status.until })
  return status.opensAt ? t('disc.status.opensAt', { time: status.opensAt }) : t('disc.status.closed')
}

/**
 * A club card: cover photo, name (with the club's round logo when it has one), place and sports, live status, then badges (courts, starting price,
 * distance), ending in "Voir les
 * créneaux". The whole card links to the club page; the heart beside the action pins the club to the top
 * of the list. Desktop: a small lift on hover and the action fills in.
 */
export function ClubCompactCard({
  club,
  sport,
  distanceKm,
  status,
  favorite,
  onToggleFavorite,
  eager = false,
  className,
}: {
  club: Club
  sport: SportFilter
  distanceKm: number | null
  /** Null until hydrated (it depends on the clock): the line keeps its height meanwhile. */
  status: ClubStatus | null
  favorite: boolean
  onToggleFavorite: (id: string) => void
  /** Load the photo immediately (the first visible card). */
  eager?: boolean
  className?: string
}) {
  const headingId = `club-${club.id}`
  const price = startingPrice(club, sport)
  // Courts of the chosen sport (every court for "Tous").
  const courts = sport === 'all' ? club.totalCourts : (club.sports.find((s) => s.sport === sport)?.courts ?? 0)

  return (
    <li
      className={cn(
        // `relative`: contains the sr-only text, which would otherwise escape the phone carousel and widen the page.
        'group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white',
        'transition-[translate,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none',
        'md:hover:border-black/15 md:hover:shadow-[0_10px_24px_-14px_rgb(29_48_35/0.35)] md:motion-safe:hover:-translate-y-0.5',
        favorite ? 'border-peacock-teal/40' : 'border-black/[0.08]',
        className
      )}
      data-testid="club-card"
      data-club-id={club.id}
      data-favorite={favorite || undefined}
    >
      <Link
        href={`/courts/${club.id}`}
        aria-labelledby={headingId}
        onClick={() => trackEvent('club.selected', { club_id: club.id, club_name: club.name })}
        className="flex min-w-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <div className="flex min-w-0 flex-1 gap-3 p-3">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-forest-depths">
            {club.coverUrl ? (
              <Image src={club.coverUrl} alt="" fill unoptimized sizes="5rem" loading={eager ? 'eager' : 'lazy'} className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xl font-semibold text-bone-linen/90" aria-hidden>
                {club.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-w-0 items-center gap-1.5">
              {club.logoUrl && <ClubLogo url={club.logoUrl} name={club.name} sizes="1.25rem" className="size-5" />}
              <h3 id={headingId} className="truncate text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em]">
                {club.name}
              </h3>
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{club.city ?? t('disc.card.tunisia')}</span>
              <span className="flex shrink-0 items-center gap-1 text-foreground/70" aria-label={t('disc.card.sports')} role="list">
                {club.sports.map((s) => {
                  const Icon = SPORT_ICON[s.sport]
                  return (
                    <span key={s.sport} role="listitem" title={SPORT_LABEL[s.sport]}>
                      <Icon className="size-3.5" />
                      <span className="sr-only">{SPORT_LABEL[s.sport]}</span>
                    </span>
                  )
                })}
              </span>
            </p>

            <p className="mt-1.5 flex min-h-4 items-center gap-1.5 text-xs font-medium tabular-nums" data-testid="club-status">
              {status ? (
                <>
                  <span
                    className={cn('size-1.5 shrink-0 rounded-full', status.open ? 'bg-peacock-teal motion-safe:animate-pulse' : 'bg-muted-foreground/60')}
                    aria-hidden
                  />
                  <span className={cn('truncate', status.open ? 'text-peacock-teal' : 'text-muted-foreground')}>{statusText(status)}</span>
                </>
              ) : (
                <span aria-hidden>&nbsp;</span>
              )}
            </p>

            {/* At a glance: how many courts, the cheapest slot, how far. */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2" data-testid="club-badges">
              <span className={BADGE}>
                <LayoutGrid className="size-3" aria-hidden />
                {courts} terrain{courts > 1 ? 's' : ''}
              </span>
              {price ? (
                <span className={cn(BADGE, 'bg-peacock-teal/10 text-peacock-teal')}>
                  {t('disc.card.fromShort')} <span className="font-semibold">{formatTND(price.price)}</span>
                </span>
              ) : (
                <span className={BADGE}>{t('disc.card.onRequest')}</span>
              )}
              {distanceKm !== null && (
                <span className={BADGE}>
                  <Navigation className="size-3" aria-hidden />
                  {formatDistance(distanceKm)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* The action: quiet at rest, filled the instant the card is hovered (desktop) or pressed. */}
        <span
          aria-hidden
          className="flex h-10 items-center gap-1.5 border-t border-black/[0.06] pl-3 pr-14 text-sm font-medium text-peacock-teal transition-colors duration-100 group-active:bg-peacock-teal group-active:text-white md:group-hover:bg-peacock-teal md:group-hover:text-white"
        >
          Voir les créneaux
          <ArrowRight className="size-4" />
        </span>
      </Link>

      <button
        type="button"
        onClick={() => onToggleFavorite(club.id)}
        aria-pressed={favorite}
        aria-label={favorite ? `Retirer ${club.name} des favoris` : `Ajouter ${club.name} aux favoris`}
        className={cn(
          'absolute bottom-0 right-0 flex h-10 w-12 items-center justify-center border-l border-black/[0.06] transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50',
          favorite ? 'text-peacock-teal' : 'text-muted-foreground hover:text-foreground',
          'md:group-hover:border-white/20 md:group-hover:text-white'
        )}
      >
        <Heart className={cn('size-4', favorite && 'fill-current')} aria-hidden />
      </button>
    </li>
  )
}
