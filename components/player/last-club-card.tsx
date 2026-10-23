import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { formatVenueDate, venueDateString } from '@/lib/court-time'
import type { LastClub } from '@/lib/player-home-loader'

/**
 * "Dernier club visité" as one slim row (inside the "Réserver vite" card): thumbnail, name, when the
 * player last booked there, and a link to its page. A player with no booking yet sees a featured club instead.
 */
export function LastClubCard({ lastClub }: { lastClub: LastClub | null }) {
  if (!lastClub) return null
  const { club, kind, lastPlayedAt } = lastClub
  const label = kind === 'visited' ? 'Dernier club visité' : 'À découvrir'
  const detail =
    kind === 'visited' && lastPlayedAt ? formatVenueDate(venueDateString(new Date(lastPlayedAt))) : (club.city ?? null)

  return (
    <Link
      href={`/courts/${club.id}`}
      data-testid="last-club"
      aria-label={`${label} : ${club.name}`}
      className="flex min-w-0 items-center gap-3 rounded-lg p-2.5 transition-colors duration-100 hover:bg-black/[0.03] active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-forest-depths">
        {club.coverUrl ? (
          <Image src={club.coverUrl} alt="" fill unoptimized sizes="2.5rem" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm font-semibold text-bone-linen/90" aria-hidden>
            {club.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-semibold">
          {club.name}
          {detail && <span className="font-normal text-muted-foreground"> · {detail}</span>}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
