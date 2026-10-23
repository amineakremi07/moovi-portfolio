import Link from 'next/link'
import { RotateCcw } from 'lucide-react'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { LastClubCard } from '@/components/player/last-club-card'
import { formatVenueDate, formatVenueTime } from '@/lib/court-time'
import { SPORT_LABEL } from '@/lib/clubs'
import { formatTND } from '@/lib/payments'
import type { LastClub, RebookItem } from '@/lib/player-home-loader'
import { rebookHref } from '@/lib/rebook'

/** "mar. 21 oct." from the long venue date. */
const shortDate = (date: string) => formatVenueDate(date).split(' ').slice(0, 3).join(' ')

/**
 * "Réserver vite": the player's most recent usual slot (same sport, weekday and time) at its next free
 * date with a one-tap "Réserver à nouveau" to a pre-filled checkout, their other habits as chips, and
 * the last visited club. Nothing is shown with neither.
 */
export function QuickBookCard({ items, lastClub }: { items: RebookItem[]; lastClub: LastClub | null }) {
  const [main, ...others] = items
  if (!main && !lastClub) return null

  return (
    <section aria-labelledby="quick-book-title" className="rounded-xl border border-black/[0.08] bg-white" data-testid="quick-action">
      <h2 id="quick-book-title" className="px-4 pt-4 text-sm font-semibold">
        Réserver vite
      </h2>

      {main && <MainSlot item={main} />}

      {others.length > 0 && (
        <ul
          aria-label="Autres créneaux habituels"
          className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 pb-4 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          {others.map((item) => {
            const Icon = SPORT_ICON[item.sport]
            return (
              <li key={item.sourceBookingId} className="shrink-0 snap-start">
                <Link
                  href={rebookHref(item)}
                  data-testid="quick-rebook"
                  className="flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] px-3 text-xs font-medium tabular-nums transition-colors duration-100 hover:border-black/20 active:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-3.5 text-peacock-teal" aria-hidden />
                  {SPORT_LABEL[item.sport]} · {formatVenueTime(item.startsAt)} · {shortDate(item.date)}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {lastClub && (
        <div className={main ? 'border-t border-black/[0.06] p-1.5' : 'p-1.5 pt-2'}>
          <LastClubCard lastClub={lastClub} />
        </div>
      )}
    </section>
  )
}

function MainSlot({ item }: { item: RebookItem }) {
  const Icon = SPORT_ICON[item.sport]
  const when = `${formatVenueTime(item.startsAt)} · ${shortDate(item.date)}`
  return (
    <div className="p-4 pt-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-peacock-teal/10 text-peacock-teal" aria-hidden>
          <Icon className="size-[1.125rem]" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Votre créneau habituel</p>
          <p className="truncate text-sm font-semibold tabular-nums">
            {SPORT_LABEL[item.sport]} · {when}
          </p>
        </div>
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{formatTND(item.price)}</span>
      </div>
      <Link
        href={rebookHref(item)}
        data-testid="quick-rebook"
        aria-label={`Réserver à nouveau : ${SPORT_LABEL[item.sport]}, ${shortDate(item.date)} à ${formatVenueTime(item.startsAt)}`}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-peacock-teal text-sm font-semibold text-white transition-colors duration-100 hover:bg-peacock-teal/90 active:bg-forest-depths focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-peacock-teal/30"
      >
        <RotateCcw className="size-4" aria-hidden />
        Réserver à nouveau
      </Link>
    </div>
  )
}
