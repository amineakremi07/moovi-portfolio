'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, MapPin, Plus, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { joinOpenMatch, leaveOpenMatch } from '@/lib/actions/community'
import { SPORT_LABEL } from '@/lib/clubs'
import { filledSpots, levelRangeLabel, matchSpotsLabel, type OpenMatch } from '@/lib/community'
import { formatVenueDayMonth, formatVenueTime, venueDateString } from '@/lib/court-time'
import { formatTND } from '@/lib/payments'
import { cn } from '@/lib/utils'

/** Circles drawn before the rest collapses into "+N" (football has 12-14 players). */
const MAX_SLOTS = 8

/**
 * "Parties ouvertes": other players' upcoming matches with free places. Phones and tablets: a swipeable
 * row, the next card peeking at the edge. From `lg`: a two-column grid. `preview` caps the list (the home
 * shows a few above the clubs; the "Parties ouvertes" filter shows them all).
 */
export function OpenMatches({
  matches,
  failed = false,
  preview = false,
  onShowAll,
}: {
  /** Already filtered by the sport chips; joined matches first. */
  matches: OpenMatch[]
  failed?: boolean
  preview?: boolean
  onShowAll?: () => void
}) {
  const shown = preview ? matches.slice(0, 4) : matches
  const hidden = matches.length - shown.length

  return (
    <section id="parties-ouvertes" aria-labelledby="open-matches-heading" className="scroll-mt-6 space-y-3 md:scroll-mt-20">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="open-matches-heading" className="text-lg font-semibold tracking-tight">
            Parties ouvertes
          </h2>
          <p className="text-xs text-muted-foreground">Des joueurs cherchent des partenaires. Votre part se règle au club.</p>
        </div>
        {preview && hidden > 0 && onShowAll && (
          <Button variant="ghost" size="sm" onClick={onShowAll} className="shrink-0">
            Tout voir ({matches.length})
          </Button>
        )}
      </div>

      {failed ? (
        <p role="alert" className="rounded-xl border border-black/[0.08] bg-white p-4 text-sm text-muted-foreground">
          Impossible de charger les parties ouvertes. Actualisez la page dans un instant.
        </p>
      ) : shown.length === 0 ? (
        <EmptyState
          variant="outline"
          compact
          icon={Users}
          title="Aucune partie ouverte pour le moment"
          description="Réservez un terrain, puis proposez les places libres depuis votre pass : « Chercher des joueurs »."
          className="bg-white"
          data-testid="open-matches-empty"
        />
      ) : (
        <ul
          aria-label="Parties ouvertes"
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:scroll-px-6 md:px-6 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-2 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((m) => (
            <OpenMatchCard key={m.bookingId} match={m} className="w-[85%] max-w-[22rem] shrink-0 snap-start sm:w-[22rem] lg:w-auto lg:max-w-none" />
          ))}
        </ul>
      )}
    </section>
  )
}

function OpenMatchCard({ match, className }: { match: OpenMatch; className?: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const Icon = SPORT_ICON[match.sport]
  const day = formatVenueDayMonth(venueDateString(new Date(match.startsAt)))

  const join = async () => {
    setBusy(true)
    const result = await joinOpenMatch({ bookingId: match.bookingId })
    setBusy(false)
    setConfirming(false)
    if (!result.success) {
      toast.error(result.error)
      router.refresh()
      return
    }
    toast.success(`C'est noté : vous jouez ${day} à ${formatVenueTime(match.startsAt)} à ${match.clubName}.`)
    router.refresh()
  }

  const leave = async () => {
    setBusy(true)
    const result = await leaveOpenMatch({ bookingId: match.bookingId })
    setBusy(false)
    if (!result.success) return void toast.error(result.error)
    toast.success('Vous avez quitté la partie. Votre place est de nouveau proposée.')
    router.refresh()
  }

  return (
    <li className={cn('flex flex-col rounded-xl border border-black/[0.08] bg-white p-4', className)} data-testid="open-match">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-peacock-teal">
            <Icon className="size-4" aria-hidden />
            {SPORT_LABEL[match.sport]}
            {match.level && <span className="text-muted-foreground">· {levelRangeLabel(match.level)}</span>}
          </p>
          <h3 className="mt-1 truncate font-semibold">{match.clubName}</h3>
        </div>
        {match.joined && (
          <span className="shrink-0 rounded-sm bg-forest-depths px-2 py-0.5 text-xs font-medium text-bone-linen">Vous participez</span>
        )}
      </div>

      <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Date</dt>
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <dd>
            {day} · <span className="tabular-nums">{formatVenueTime(match.startsAt)}–{formatVenueTime(match.endsAt)}</span>
          </dd>
        </div>
        {match.city && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Ville</dt>
            <MapPin className="size-4 shrink-0" aria-hidden />
            <dd className="truncate">{match.city}</dd>
          </div>
        )}
        {match.organizer && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Organisateur</dt>
            <UserRound className="size-4 shrink-0" aria-hidden />
            <dd className="truncate">Organisée par {match.organizer}</dd>
          </div>
        )}
      </dl>

      {match.note && <p className="mt-2 line-clamp-2 text-sm">« {match.note} »</p>}

      <div className="mt-3">
        <PlayerSlots total={match.playerCount} filled={filledSpots(match)} />
        <p className="mt-1.5 text-xs font-medium tabular-nums" data-testid="open-match-spots">
          {matchSpotsLabel(match)}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-sm">
          {match.pricePerPlayer !== null ? (
            <>
              <span className="font-semibold tabular-nums">{formatTND(match.pricePerPlayer)}</span>
              <span className="text-muted-foreground"> / joueur</span>
            </>
          ) : (
            <span className="text-muted-foreground">Part à régler au club</span>
          )}
        </span>
        {match.joined ? (
          <Button variant="outline" className="h-10 px-4" onClick={leave} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Quitter
          </Button>
        ) : (
          <Button className="h-10 px-4" onClick={() => setConfirming(true)} disabled={busy || match.openSpots <= 0}>
            <Plus aria-hidden />
            Rejoindre
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rejoindre cette partie ?</DialogTitle>
            <DialogDescription>
              {SPORT_LABEL[match.sport]} à {match.clubName}, {day} à {formatVenueTime(match.startsAt)}.{' '}
              {match.pricePerPlayer !== null
                ? `Votre part (${formatTND(match.pricePerPlayer)}) se règle au club.`
                : 'Votre part se règle au club.'}{' '}
              {match.organizer ? `${match.organizer} sera prévenu par e-mail.` : "L'organisateur sera prévenu par e-mail."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={join} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Confirmer ma place
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** One circle per player: filled (taken) or dashed (free). Long rosters end in "+N". */
export function PlayerSlots({ total, filled }: { total: number; filled: number }) {
  const drawn = Math.min(total, MAX_SLOTS)
  const extra = total - drawn
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${filled} joueurs sur ${total}`}>
      {Array.from({ length: drawn }, (_, i) =>
        i < filled ? (
          <span key={i} className="flex size-7 items-center justify-center rounded-full bg-forest-depths text-bone-linen">
            <Users className="size-3.5" aria-hidden />
          </span>
        ) : (
          <span key={i} className="flex size-7 items-center justify-center rounded-full border border-dashed border-peacock-teal/60 text-peacock-teal">
            <Plus className="size-3.5" aria-hidden />
          </span>
        )
      )}
      {extra > 0 && <span className="ml-1 text-xs font-medium text-muted-foreground tabular-nums">+{extra}</span>}
    </div>
  )
}
