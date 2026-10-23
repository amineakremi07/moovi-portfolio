'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { BookingDrawer, useIsDesktop, type BookingDrawerMember, type BookingDrawerSelection } from '@/components/booking/booking-drawer'
import { PlayerAuthModal } from '@/components/booking/player-auth-modal'
import { SlotPicker } from '@/components/booking/slot-picker'
import type { MatrixCourt } from '@/components/courts/court-slot-matrix'
import { SPORTS, toPricedCourts, useTimeSlots, type PlayerTimeSlot } from '@/components/courts/time-slot-grid'
import { trackEvent } from '@/components/providers/posthog-provider'
import { Button } from '@/components/ui/button'
import { syncClubSlotsAction } from '@/lib/actions/cache-sync'
import { formatVenueDate, formatVenueTime, minutesSinceVenueDayStart, timeSlotLabel, timeToMinutes } from '@/lib/court-time'
import { computePrice } from '@/lib/pricing'
import { formatTND, type OnlineMode } from '@/lib/payments'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { aggregateTimeSlots, COURT_PENDING_LABEL } from '@/lib/time-slots'

/**
 * A club's booking experience, time-first: pick a day, a sport and a TIME, then book in the drawer.
 * The player never picks a court: the server takes the cheapest free court of the sport and club
 * staff assign the final one. Booking needs a player account: a signed-out visitor who picks a time
 * gets the sign-in / sign-up dialog first, and lands in the drawer with that time once in.
 * Availability is loaded on the server for the day in the URL (`?date=`); changing the day
 * navigates, and after any booking the server data is refreshed so the time shows as taken.
 */
export function ClubBookingView({
  orgId,
  orgName,
  orgAddress = null,
  orgWhatsapp = null,
  dateStr,
  minDate,
  maxDate,
  courts,
  member,
  closedNotice = null,
  onlineMode = 'disabled',
  preselect = null,
}: {
  orgId: string
  orgName: string
  /** Venue address for the calendar event. */
  orgAddress?: string | null
  /** The club's WhatsApp number (digits), if it set one. */
  orgWhatsapp?: string | null
  dateStr: string
  minDate: string
  maxDate: string
  courts: MatrixCourt[]
  member: BookingDrawerMember | null
  /** Shown above the grid when the club is closed on the chosen day. */
  closedNotice?: string | null
  /** Online / split payment availability, decided on the server. */
  onlineMode?: OnlineMode
  /** A time to open straight in the checkout ("Réserver à nouveau"): `?sport=&start=`. */
  preselect?: { sport: Sport; startsAt: string } | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()
  const isDesktop = useIsDesktop()

  // One sport on screen at a time: the pre-selected one, else the club's first (padel, tennis, football).
  const [sport, setSport] = React.useState<Sport>(
    () => preselect?.sport ?? SPORTS.find((s) => courts.some((c) => c.sport === s.value))?.value ?? 'padel'
  )
  const slots = useTimeSlots(courts, sport, dateStr)

  // A pre-selected time (from "Réserver à nouveau") opens the checkout at once, if it is still free.
  const [preselected] = React.useState(() => {
    if (!preselect) return null
    const slot = aggregateTimeSlots(toPricedCourts(courts), preselect.sport, dateStr).find(
      (sl) => sl.start === preselect.startsAt && sl.state === 'available'
    )
    return slot ? selectionFor(slot, preselect.sport, dateStr) : null
  })
  const [selection, setSelection] = React.useState<BookingDrawerSelection | null>(preselected)
  // The highlighted time in the grid. Cleared on its own: the selection is kept so the drawer's
  // content does not vanish mid slide-out.
  const [selectedStart, setSelectedStart] = React.useState<string | null>(preselected?.startsAt ?? null)
  // Phones: picking a time shows the sticky "Réserver" bar; the drawer opens from it.
  const [barOpen, setBarOpen] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(Boolean(preselected && member))
  const [authOpen, setAuthOpen] = React.useState(Boolean(preselected && !member))
  // Set by a successful sign-in so the dialog's own close does not clear the time it was opened for.
  const authSucceeded = React.useRef(false)
  // The player just booked this time themselves: it may read as full after the refresh, and that
  // must not be mistaken for someone else getting there first.
  const [justBooked, setJustBooked] = React.useState(false)

  // A live update can fill the time the player is looking at (every court taken). Close the drawer
  // rather than let them confirm a time that is gone. (State adjusted during render, the
  // React-recommended way to derive it from props.)
  const selectedSlotTaken = React.useMemo(() => {
    if (!selection || justBooked || selection.sport !== sport) return false
    const slot = slots.find((s) => s.start === selection.startsAt)
    return Boolean(slot && slot.state !== 'available')
  }, [slots, selection, sport, justBooked])
  if (drawerOpen && selectedSlotTaken) {
    setDrawerOpen(false)
    setSelectedStart(null)
  }
  React.useEffect(() => {
    if (selectedSlotTaken) toast.error("Plus aucun terrain n'est libre à cette heure. Veuillez choisir un autre horaire.")
  }, [selectedSlotTaken])

  // The pre-selection is used once: drop it from the URL (a refresh must not reopen the checkout),
  // and say so when that time was taken in the meantime.
  const preselectHandled = React.useRef(false)
  React.useEffect(() => {
    if (!preselect || preselectHandled.current) return
    preselectHandled.current = true
    router.replace(`${pathname}?date=${dateStr}`, { scroll: false })
    if (!preselected) toast.error("Cet horaire n'est plus libre. Choisissez-en un autre ci-dessous.")
    else trackEvent('rebook.opened', { club_id: orgId, sport: preselected.sport, date: preselected.date })
  }, [preselect, preselected, router, pathname, dateStr, orgId])

  const clearPick = () => {
    setDrawerOpen(false)
    setBarOpen(false)
    setSelectedStart(null)
  }

  const changeSport = (next: Sport) => {
    if (next === sport) return
    // The picked time belongs to the sport being left: drop it with the rest of that sport's view.
    clearPick()
    setJustBooked(false)
    setSport(next)
    trackEvent('sport.selected', { club_id: orgId, sport: next, date: dateStr })
  }

  const changeDate = (next: string) => {
    clearPick()
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))
  }

  const handleSlotSelect = (picked: PlayerTimeSlot | null, pickedSport: Sport) => {
    if (!picked) {
      clearPick()
      return
    }
    trackEvent('time_slot.selected', {
      time_slot: timeSlotLabel(picked.start, picked.end),
      date: dateStr,
      club_id: orgId,
      sport: pickedSport,
    })
    // Every sport has its own timeline: the time picked decides the sport.
    setSport(pickedSport)
    setJustBooked(false)
    setSelection(selectionFor(picked, pickedSport, dateStr))
    setSelectedStart(picked.start)
    if (!member) {
      // Signed out: sign in (or create the account) first, then straight to checkout.
      setDrawerOpen(false)
      setBarOpen(false)
      setAuthOpen(true)
      return
    }
    if (isDesktop) setDrawerOpen(true)
    else setBarOpen(true)
  }

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open)
    if (!open) {
      setBarOpen(false)
      setSelectedStart(null)
      setJustBooked(false)
    }
  }

  // Two modal layers at once are fragile, so hand over: drawer closes, sign-in
  // opens, and the drawer comes back with the same time when sign-in finishes.
  const requestSignIn = () => {
    setDrawerOpen(false)
    setAuthOpen(true)
  }
  const handleAuthOpenChange = (open: boolean) => {
    setAuthOpen(open)
    if (open) return
    // Closed: after a successful sign-in `onSuccess` has already opened the drawer; a dismissal
    // without signing in just clears the highlighted time (there is no booking without an account).
    if (authSucceeded.current) {
      authSucceeded.current = false
      return
    }
    setSelectedStart(null)
  }

  return (
    <div className="space-y-6">
      <SlotPicker
        orgId={orgId}
        dateStr={dateStr}
        minDate={minDate}
        maxDate={maxDate}
        courts={courts}
        onDateChange={changeDate}
        sport={sport}
        onSportChange={changeSport}
        selectedSport={selectedStart ? sport : null}
        selectedStart={selectedStart}
        onSelect={handleSlotSelect}
        // The grid is cached for a few seconds server-side: drop it first, then refresh.
        onRealtimeChange={() => void syncClubSlotsAction({ orgId }).finally(() => router.refresh())}
        pending={pending}
        closedNotice={closedNotice}
      />

      <BookingDrawer
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        orgId={orgId}
        orgName={orgName}
        orgAddress={orgAddress}
        orgWhatsapp={orgWhatsapp}
        selection={selection}
        member={member}
        onlineMode={onlineMode}
        onRequestSignIn={requestSignIn}
        onBooked={(result, mode) => {
          setJustBooked(true)
          // A player's booking with nothing left to hand out (no split invite links, which exist only on the
          // confirmation screen, and no deposit warning): straight to their home, where the new match ticket
          // and its arrival code lead the page.
          if (mode === 'member' && result.invites.length === 0 && !result.highRisk) {
            toast.success('Réservation confirmée', {
              description: `${orgName}, ${formatVenueDate(dateStr)} à ${formatVenueTime(result.startsAt)}. Votre code d'arrivée est sur votre ticket.`,
            })
            router.push(`/explore?reservation=${result.bookingId}#prochain-match`)
            return true
          }
          router.refresh()
        }}
        onSlotUnavailable={() => router.refresh()}
      />

      {barOpen && selection && !drawerOpen && !authOpen && (
        <StickyBookingBar
          selection={selection}
          onBook={() => {
            setBarOpen(false)
            setDrawerOpen(true)
          }}
          onClear={clearPick}
        />
      )}

      <PlayerAuthModal
        orgId={orgId}
        open={authOpen}
        onOpenChange={handleAuthOpenChange}
        defaultMode="signin"
        onSuccess={() => {
          // Pull the new session's profile into the drawer.
          authSucceeded.current = true
          router.refresh()
          setAuthOpen(false)
          if (selection) setDrawerOpen(true)
        }}
      />
    </div>
  )
}

const SPORT_LABEL: Record<Sport, string> = { padel: 'Padel', tennis: 'Tennis', football: 'Football' }

/**
 * What the drawer needs to know about a picked time. No court: the server takes the cheapest free
 * one, whose price (shown here) is the price charged.
 */
function selectionFor(slot: PlayerTimeSlot, sport: Sport, dateStr: string): BookingDrawerSelection {
  const court = slot.court
  return {
    courtId: null,
    courtName: COURT_PENDING_LABEL,
    sport,
    date: dateStr,
    startsAt: slot.start,
    endsAt: slot.end,
    pricePerHour: court?.pricePerHour ?? 0,
    nightSurchargePerHour: court?.nightSurchargePerHour ?? 0,
    nightStartsAt: court?.nightStartsAt ?? '18:00:00',
  }
}

/** Phones only: a thumb-reach action bar pinned to the bottom once a time is picked. */
function StickyBookingBar({
  selection,
  onBook,
  onClear,
}: {
  selection: BookingDrawerSelection
  onBook: () => void
  onClear: () => void
}) {
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })
  return (
    <div
      role="region"
      aria-label="Votre sélection"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 shadow-none backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{SPORT_LABEL[selection.sport]}</p>
          <p className="truncate tabular-nums text-muted-foreground">
            {formatVenueDate(selection.date)} · {timeSlotLabel(selection.startsAt, selection.endsAt)} · {formatTND(price.total)}
          </p>
        </div>
        <Button type="button" variant="ghost" className="h-12 min-w-12" aria-label="Effacer la sélection" onClick={onClear}>
          ✕
        </Button>
        <Button type="button" className="h-12 px-5 text-base" onClick={onBook}>
          Réserver
        </Button>
      </div>
    </div>
  )
}
