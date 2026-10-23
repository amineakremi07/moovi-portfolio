import Link from 'next/link'
import { CalendarDays, Clock, MapPin, Navigation, Ticket, Users } from 'lucide-react'

import { AddToCalendar } from '@/components/booking/add-to-calendar'
import { AttendanceConfirm } from '@/components/booking/attendance-confirm'
import { PlayHero } from '@/components/player/play-hero'
import { ShareMatchButton } from '@/components/booking/share-match-button'
import { Button } from '@/components/ui/button'
import { bookingCalendarEvent } from '@/lib/calendar'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { formatTND } from '@/lib/payments'
import type { NextBooking } from '@/lib/player-home-loader'
import { cn } from '@/lib/utils'
import { matchShareLink } from '@/lib/whatsapp'

const SPORT: Record<NextBooking['sport'], string> = { padel: 'Padel', tennis: 'Tennis', football: 'Football' }

/** "Payé" / "À payer au club" / ... from the booking's payment record. */
function paymentBadge(b: NextBooking): { label: string; paid: boolean } | null {
  if (b.paymentStatus === 'paid') return { label: 'Payé', paid: true }
  if (b.paymentStatus === 'refunded') return { label: 'Remboursé', paid: false }
  if (b.paymentStatus === 'pending') {
    return { label: b.paymentProvider === 'cash' ? 'À payer au club' : 'Paiement en attente', paid: false }
  }
  return null
}

/**
 * The player's next match, on the high-contrast Forest Depths surface: where (with turn-by-turn
 * links), when (with "Ajouter à l'agenda"), which court ("Attribué", or "Attribution à l'arrivée" until the
 * club assigns one), the price and whether it is paid, and the check-in code for reception.
 */
export function NextBookingCard({
  booking,
  moreCount,
  failed,
  openCount = 0,
  justBooked = false,
}: {
  booking: NextBooking | null
  /** Upcoming bookings after this one. */
  moreCount: number
  failed: boolean
  /** Open matches with a free place (the empty state offers to join one). */
  openCount?: number
  /** This booking was just made (the club page sent the player here): say so on the ticket. */
  justBooked?: boolean
}) {
  if (failed) {
    return (
      <section aria-labelledby="next-heading" role="alert" className="rounded-xl border border-black/[0.08] bg-white p-5">
        <h2 id="next-heading" className="font-semibold">
          Prochain match
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Impossible de charger vos réservations. Actualisez la page dans un instant.</p>
      </section>
    )
  }

  if (!booking) return <PlayHero openCount={openCount} />

  const day = formatVenueDate(venueDateString(new Date(booking.startsAt)))
  const badge = paymentBadge(booking)
  const shareHref = matchShareLink({
    sport: booking.sport,
    clubName: booking.clubName,
    date: day,
    time: `${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)}`,
    address: booking.address,
    mapsUrl: booking.navigation?.google ?? null,
  })
  const event = bookingCalendarEvent({
    bookingId: booking.id,
    clubName: booking.clubName,
    courtName: booking.courtLabel,
    sport: SPORT[booking.sport],
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    address: booking.address,
    reference: booking.reference,
  })
  const darkOutline = 'border-bone-linen/40 bg-transparent text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen'

  return (
    <section
      id="prochain-match"
      aria-labelledby="next-heading"
      className={cn('scroll-mt-6 rounded-xl bg-forest-depths p-5 text-bone-linen md:p-6', justBooked && 'ring-2 ring-lime-pulse ring-offset-2 ring-offset-background')}
      data-testid="next-booking"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 id="next-heading" className="flex flex-wrap items-center gap-2 text-sm text-bone-linen/70">
            {justBooked ? 'Votre réservation' : 'Prochain match'}
            {justBooked && (
              <span className="rounded-sm bg-lime-pulse px-2 py-0.5 text-xs font-semibold text-forest-depths" data-testid="just-booked">
                Nouvelle réservation
              </span>
            )}
          </h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {SPORT[booking.sport]} · {booking.clubName}
          </p>
          <dl className="mt-3 grid gap-1.5 text-sm text-oat-milk">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Date</dt>
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              <dd>{day}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">Heure</dt>
              <Clock className="size-4 shrink-0" aria-hidden />
              <dd className="tabular-nums">
                {formatVenueTime(booking.startsAt)} – {formatVenueTime(booking.endsAt)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">Terrain</dt>
              <MapPin className="size-4 shrink-0" aria-hidden />
              <dd data-testid="next-court" className="flex flex-wrap items-center gap-2">
                {booking.courtPending ? 'Terrain' : booking.courtLabel}
                <span
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-xs font-medium',
                    booking.courtPending ? 'border border-bone-linen/40 text-bone-linen' : 'bg-bone-linen text-forest-depths'
                  )}
                >
                  {booking.courtPending ? "Attribution à l'arrivée" : 'Attribué'}
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="sr-only">Joueurs</dt>
              <Users className="size-4 shrink-0" aria-hidden />
              <dd>{booking.playerCount} joueurs</dd>
            </div>
          </dl>

          {(booking.price !== null || badge) && (
            <p className="mt-4 flex flex-wrap items-center gap-3" data-testid="next-payment">
              {booking.price !== null && <span className="text-xl font-semibold tabular-nums">{formatTND(booking.price)}</span>}
              {badge && (
                <span
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-xs font-medium',
                    badge.paid ? 'bg-bone-linen text-forest-depths' : 'border border-bone-linen/40 text-bone-linen'
                  )}
                >
                  {badge.label}
                </span>
              )}
            </p>
          )}
        </div>

        {booking.checkInCode && (
          <div className="rounded-xl border border-bone-linen/20 px-5 py-4">
            <p className="text-xs text-bone-linen/70">Code d&apos;arrivée</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums" data-testid="next-check-in-code">
              {booking.checkInCode}
            </p>
            <p className="mt-1 text-xs text-bone-linen/70">À présenter à l&apos;accueil</p>
          </div>
        )}
      </div>

      {booking.checkInStatus === 'awaiting_confirmation' && (
        <AttendanceConfirm bookingId={booking.id} startsAt={booking.startsAt} tone="dark" className="mt-6" />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {/* Outlined: the page's one Lime Pulse action is booking ("Réserver" on the home club). */}
        <Button asChild variant="outline" className={cn('h-11 px-5', darkOutline)}>
          <Link href={`/reservations/${booking.id}`}>
            <Ticket aria-hidden />
            Voir le pass
          </Link>
        </Button>
        {booking.navigation && (
          <Button asChild variant="outline" className={cn('h-11 px-5', darkOutline)}>
            <a href={booking.navigation.google} target="_blank" rel="noopener noreferrer" data-testid="next-gps">
              <Navigation aria-hidden />
              Itinéraire GPS
            </a>
          </Button>
        )}
        <ShareMatchButton href={shareHref} tone="dark" className="px-5" />
      </div>
      <div className="mt-3">
        <AddToCalendar event={event} clubName={booking.clubName} tone="dark" />
      </div>

      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-bone-linen/60">
        <span className="font-mono">Réf. {booking.reference}</span>
        {moreCount > 0 && (
          <Link href="/reservations" className="text-sm text-bone-linen/85 underline-offset-4 hover:underline">
            {moreCount === 1 ? '1 autre réservation à venir' : `${moreCount} autres réservations à venir`}
          </Link>
        )}
      </p>
    </section>
  )
}
