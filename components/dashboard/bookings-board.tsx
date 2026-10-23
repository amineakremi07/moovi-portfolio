'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeftRight, Banknote, CalendarX2, CheckCircle2, LayoutGrid, Loader2, Phone, PhoneCall, Plus, ScanLine, User, UserRound, UserX, X } from 'lucide-react'
import { toast } from 'sonner'

import { CheckInDialog, postCheckIn } from '@/components/dashboard/check-in-dialog'
import { ManualBookingDialog, type ManualBookingPreset } from '@/components/dashboard/manual-booking-dialog'
import { DayPicker } from '@/components/courts/day-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useRealtimeBookings } from '@/hooks/use-realtime-bookings'
import { useVenueToday } from '@/hooks/use-venue-today'
import { cancelBookingAction } from '@/lib/actions/bookings'
import { syncScheduleAction } from '@/lib/actions/cache-sync'
import { assignCourtAction, markNoShowAction } from '@/lib/actions/org-bookings'
import { markCashPaidAction } from '@/lib/actions/payments'
import { formatVenueTime, minutesSinceVenueDayStart } from '@/lib/court-time'
import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import type { BookingSource, BookingStatus, PaymentProvider, PaymentStatus } from '@/lib/types/database'
import { useBoardView } from '@/lib/board-view'
import { cn } from '@/lib/utils'

export type BoardSlot = { start: string; end: string; past: boolean }

export type BoardCourt = {
  id: string
  name: string
  sport: Sport
  status: 'active' | 'maintenance'
  pricePerHour: number
  nightSurchargePerHour: number
  nightStartsAt: string
  /** Archived (soft deleted): shown only on days that still have bookings, read-only. */
  archived: boolean
  /** The club is closed that day. */
  closed: boolean
  slots: BoardSlot[]
}

export type BoardBooking = {
  id: string
  courtId: string | null
  /** Booked by time: the court is provisional until staff assign one ("Attribuer un terrain"). */
  courtPending: boolean
  startsAt: string
  endsAt: string
  status: BookingStatus
  playerCount: number
  bookerName: string
  bookerPhone: string | null
  isMember: boolean
  amount: number | null
  /** The payment record, when there is one. */
  paymentStatus: PaymentStatus | null
  paymentProvider: PaymentProvider | null
  reference: string
  /** When the player was checked in at reception (status completed). */
  checkedInAt: string | null
  /** Made online by the player, or by staff at the desk / on the phone. */
  source: BookingSource
  /** Staff-only note from a manual booking (never sent to the player). */
  note: string | null
  /** Members only: their no-show history, so staff see who is risky. */
  noShowCount: number | null
  trustScore: number | null
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'Confirmée',
  pending_payment: 'En attente',
  cancelled: 'Annulée',
  completed: 'Arrivée enregistrée',
  no_show: 'Absence',
}
const STATUS_VARIANT: Record<BookingStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  confirmed: 'success',
  pending_payment: 'warning',
  cancelled: 'destructive',
  completed: 'secondary',
  no_show: 'destructive',
}

const SPORT_FILTERS = ['all', 'padel', 'football', 'tennis'] as const
type SportFilter = (typeof SPORT_FILTERS)[number]

/** One slot of one court: what the alert links carry as `courtId` + `time` ("HH:MM", venue time). */
const slotKey = (courtId: string, startsAt: string) => `${courtId}|${formatVenueTime(startsAt)}`

/** Left bar + fill per status, so booked / pending / checked in / no-show read apart at a glance. */
const ROW_STYLE: Record<BookingStatus, string> = {
  confirmed: 'border-l-[#0e634f] bg-white',
  pending_payment: 'border-l-amber-500 bg-amber-50',
  completed: 'border-l-[#645757] bg-[#e4e0d9]',
  no_show: 'border-l-destructive bg-destructive/10',
  cancelled: 'border-l-destructive bg-destructive/5 opacity-70',
}

const tnd = (n: number) => `${n.toFixed(2)} TND`
const isOpen = (b: BoardBooking) => b.status === 'pending_payment' || b.status === 'confirmed'

/** Players may check in from an hour before the slot until it ends; a no-show can be recorded 15 min after it starts. */
const CHECK_IN_LEAD_MS = 60 * 60_000
const NO_SHOW_AFTER_MS = 15 * 60_000

export function BookingsBoard({
  orgId,
  dateStr,
  today,
  minDate,
  maxDate,
  courts,
  bookings,
}: {
  orgId: string
  dateStr: string
  today: string
  minDate: string
  maxDate: string
  courts: BoardCourt[]
  bookings: BoardBooking[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()
  const [manualOpen, setManualOpen] = React.useState(false)
  const [manualPreset, setManualPreset] = React.useState<ManualBookingPreset>(null)
  const [toCancel, setToCancel] = React.useState<BoardBooking | null>(null)
  const [toNoShow, setToNoShow] = React.useState<BoardBooking | null>(null)
  const [toAssign, setToAssign] = React.useState<BoardBooking | null>(null)
  const [checkInOpen, setCheckInOpen] = React.useState(false)
  const [sportFilter, setSportFilter] = React.useState<SportFilter>('all')
  // "Grille" (the day as a timeline) or "Détails" (every booking's details per court): chosen in Paramètres.
  const view = useBoardView()
  const [opened, setOpened] = React.useState<BoardBooking | null>(null)
  // A detail action opens its own dialog: close the detail first (one dialog at a time).
  const fromDetail = (act: (b: BoardBooking) => void) => (b: BoardBooking) => {
    setOpened(null)
    act(b)
  }
  const [highlightKey, setHighlightKey] = React.useState<string | null>(null)
  const searchParams = useSearchParams()
  const targetCourt = searchParams.get('courtId')
  const targetTime = searchParams.get('time')
  const handledTarget = React.useRef<string | null>(null)
  const highlightTimer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(highlightTimer.current), [])
  // The buttons that depend on "now" are re-evaluated every 30 s (the render itself stays pure).
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // The real date, kept current while the board stays open. When it moves past the server's `today`
  // (midnight, or a laptop waking up), the page is re-read so the default day and the bounds follow.
  const liveToday = useVenueToday(today)
  React.useEffect(() => {
    if (liveToday !== today) router.refresh()
  }, [liveToday, today, router])

  // Live: online bookings, other staff's walk-ins and cancellations refresh the day. The day is cached
  // server-side for up to a minute, so the cached copy is dropped first.
  useRealtimeBookings(orgId, dateStr, () => void syncScheduleAction().finally(() => router.refresh()))

  // Safety net in case realtime is blocked (corporate proxies, sleeping laptops).
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 120_000)
    return () => window.clearInterval(id)
  }, [router])

  // An alert link (?courtId=&time=): scroll that slot into view and pulse it for 3 s. The slot may not be
  // rendered yet (the day is still refreshing), so this re-runs as the data changes until it is found.
  React.useEffect(() => {
    if (!targetCourt || !targetTime) return
    const key = `${targetCourt}|${targetTime}`
    if (handledTarget.current === key) return
    const court = courts.find((c) => c.id === targetCourt)
    if (court && sportFilter !== 'all' && court.sport !== sportFilter) {
      // The slot is on a court the active filter hides: show every sport, then this effect runs again.
      window.requestAnimationFrame(() => setSportFilter('all'))
      return
    }
    const el = document.querySelector(`[data-slot-key="${CSS.escape(key)}"]`)
    if (!el) return
    handledTarget.current = key
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    window.requestAnimationFrame(() => setHighlightKey(key))
    window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlightKey(null), 3000)
    // Drop the params so clicking the same alert again navigates (and highlights) again.
    router.replace(`${pathname}?date=${dateStr}`, { scroll: false })
  }, [targetCourt, targetTime, courts, bookings, sportFilter, router, pathname, dateStr])

  const changeDate = (next: string) =>
    startTransition(() => router.push(`${pathname}?date=${next}`, { scroll: false }))

  const open = bookings.filter(isOpen)
  const cancelled = bookings.filter((b) => b.status === 'cancelled')
  // Checked-in and no-show bookings stay on the schedule (they still occupy their slot).
  const onSchedule = bookings.filter((b) => b.status !== 'cancelled')
  const revenue = open.reduce((sum, b) => sum + (b.amount ?? 0), 0)
  const shownCourts = courts.filter(
    (c) => (sportFilter === 'all' || c.sport === sportFilter) && (!c.archived || onSchedule.some((b) => b.courtId === c.id))
  )
  const shownCourtIds = new Set(shownCourts.map((c) => c.id))
  const shownCancelled = cancelled.filter((b) => sportFilter === 'all' || (b.courtId && shownCourtIds.has(b.courtId)))
  const courtName = (id: string | null) => courts.find((c) => c.id === id)?.name ?? 'Terrain supprimé'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Planning du jour</h2>
          <p className="text-sm text-[#645757]">Touchez un créneau libre, ou utilisez Ajouter une réservation manuelle, pour un client au guichet ou au téléphone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              setManualPreset(null)
              setManualOpen(true)
            }}
            className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90"
          >
            <PhoneCall aria-hidden /> Ajouter une réservation manuelle
          </Button>
          <Button variant="outline" onClick={() => setCheckInOpen(true)}>
            <ScanLine aria-hidden /> Enregistrer une arrivée
          </Button>
          <DayPicker dateStr={dateStr} today={liveToday} minDate={minDate} maxDate={maxDate} onChange={changeDate} pending={pending} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Confirmées" value={String(open.filter((b) => b.status === 'confirmed').length)} />
        <Stat label="En attente" value={String(open.filter((b) => b.status === 'pending_payment').length)} />
        <Stat label="Annulées" value={String(cancelled.length)} />
        <Stat label="Revenu attendu" value={tnd(revenue)} />
      </dl>

      <div className={cn('space-y-6 transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
        {courts.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="Aucun terrain pour le moment"
            description="Ajoutez des terrains dans Terrains pour commencer à recevoir des réservations."
          />
        ) : (
          <>
          <div role="group" aria-label="Filtrer les terrains par sport" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SPORT_FILTERS.map((sport) => {
              const count = sport === 'all' ? courts.length : courts.filter((c) => c.sport === sport).length
              const active = sportFilter === sport
              return (
                <button
                  key={sport}
                  type="button"
                  aria-pressed={active}
                  data-testid={`sport-filter-${sport}`}
                  onClick={() => setSportFilter(sport)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium capitalize outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                    active
                      ? 'border-[#1d3023] bg-[#1d3023] text-[#f7f5f2]'
                      : 'border-[#d7d2cc] bg-[#f7f5f2] text-[#2a1a1d] hover:border-[#1d3023]'
                  )}
                >
                  {sport === 'all' ? 'Tous' : sport}
                  <span className={cn('ml-1.5 text-xs tabular-nums', active ? 'text-[#f7f5f2]/70' : 'text-[#645757]')}>{count}</span>
                </button>
              )
            })}
          </div>
          {shownCourts.length === 0 && (
            <EmptyState compact icon={LayoutGrid} title={`Aucun terrain de ${sportFilter} dans ce club`} />
          )}
          {view === 'timeline' && shownCourts.length > 0 && (
            <DayTimeline
              courts={shownCourts}
              bookings={onSchedule}
              dateStr={dateStr}
              now={now}
              highlightKey={highlightKey}
              onWalkIn={(court, slot) => {
                setManualPreset({ courtId: court.id, startsAt: slot.start })
                setManualOpen(true)
              }}
              onOpen={setOpened}
            />
          )}
          {view === 'columns' && (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {shownCourts.map((court) => (
              <CourtColumn
                key={court.id}
                court={court}
                highlightKey={highlightKey}
                bookings={onSchedule.filter((b) => b.courtId === court.id)}
                now={now}
                onWalkIn={(slot) => {
                  setManualPreset({ courtId: court.id, startsAt: slot.start })
                  setManualOpen(true)
                }}
                onCancel={setToCancel}
                onNoShow={setToNoShow}
                onAssign={setToAssign}
              />
            ))}
          </div>
          )}
          </>
        )}

        {shownCancelled.length > 0 && (
          <section aria-labelledby="cancelled-heading" className="rounded-xl bg-[#eae6df] p-5">
            <h3 id="cancelled-heading" className="text-sm font-semibold">
              Annulées ({shownCancelled.length})
            </h3>
            <ul className="mt-3 divide-y divide-[#d7d2cc] text-sm">
              {shownCancelled.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[#645757]">
                  <span className="tabular-nums">
                    {formatVenueTime(b.startsAt)}–{formatVenueTime(b.endsAt)}
                  </span>
                  <span>{courtName(b.courtId)}</span>
                  <span>{b.bookerName}</span>
                  <span className="font-mono text-xs">{b.reference}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ManualBookingDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        preset={manualPreset}
        courts={courts}
        bookings={bookings}
        dateStr={dateStr}
        today={today}
        maxDate={maxDate}
        onDateChange={changeDate}
        datePending={pending}
        onBooked={() => router.refresh()}
      />

      <Dialog open={opened !== null} onOpenChange={(o) => !o && setOpened(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{opened ? `${courtName(opened.courtId)} · ${formatVenueTime(opened.startsAt)}` : 'Réservation'}</DialogTitle>
            <DialogDescription>Encaisser, enregistrer l&apos;arrivée, changer de terrain ou annuler.</DialogDescription>
          </DialogHeader>
          {opened && (
            <ul>
              <BookingRow
                // Re-read from the live list: the dialog follows refreshes (payment, check-in).
                booking={bookings.find((b) => b.id === opened.id) ?? opened}
                slotId={`detail-${opened.id}`}
                highlightKey={null}
                now={now}
                onCancel={fromDetail(setToCancel)}
                onNoShow={fromDetail(setToNoShow)}
                onAssign={fromDetail(setToAssign)}
              />
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <CancelDialog
        booking={toCancel}
        onClose={() => setToCancel(null)}
        onDone={() => {
          setToCancel(null)
          router.refresh()
        }}
      />

      <AssignCourtDialog
        booking={toAssign}
        courts={courts}
        bookings={bookings}
        onClose={() => setToAssign(null)}
        onDone={() => {
          setToAssign(null)
          router.refresh()
        }}
      />

      <NoShowDialog
        booking={toNoShow}
        onClose={() => setToNoShow(null)}
        onDone={() => {
          setToNoShow(null)
          router.refresh()
        }}
      />

      <CheckInDialog open={checkInOpen} onOpenChange={setCheckInOpen} />

      <span className="sr-only" aria-live="polite">
        {liveToday === dateStr ? 'Affichage d\'aujourd\'hui' : `Affichage du ${dateStr}`}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#eae6df] px-4 py-3.5 md:px-5 md:py-4">
      <dt className="text-xs text-[#645757]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</dd>
    </div>
  )
}

function CourtColumn({
  court,
  highlightKey,
  bookings,
  now,
  onWalkIn,
  onCancel,
  onNoShow,
  onAssign,
}: {
  court: BoardCourt
  highlightKey: string | null
  bookings: BoardBooking[]
  now: number
  onWalkIn: (slot: BoardSlot) => void
  onCancel: (b: BoardBooking) => void
  onNoShow: (b: BoardBooking) => void
  onAssign: (b: BoardBooking) => void
}) {
  const byStart = new Map(bookings.map((b) => [Date.parse(b.startsAt), b]))
  const slotStarts = new Set(court.slots.map((s) => Date.parse(s.start)))
  // A booking whose time is no longer on the grid (hours changed since) must stay visible.
  const offGrid = bookings.filter((b) => !slotStarts.has(Date.parse(b.startsAt)))

  return (
    <section className="rounded-xl bg-[#eae6df] p-4" aria-label={court.name}>
      {/* Sticky: the court's name stays in view while its slots scroll past. */}
      <header className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-start justify-between gap-2 rounded-t-xl border-b border-[#d7d2cc] bg-[#eae6df] px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{court.name}</h3>
          <p className="text-xs capitalize text-[#645757]">
            {court.sport} · {SPORT_DURATION_MIN[court.sport]} min
          </p>
        </div>
        {court.archived && <Badge variant="secondary">Archivé</Badge>}
        {!court.archived && court.status === 'maintenance' && <Badge variant="warning">Maintenance</Badge>}
      </header>

      {court.closed ? (
        <p className="rounded-lg bg-[#f7f5f2] px-3 py-4 text-center text-sm text-[#645757]">Club fermé ce jour-là</p>
      ) : (
        <ul className="space-y-2">
          {offGrid.map((b) => (
            <BookingRow key={b.id} booking={b} slotId={slotKey(court.id, b.startsAt)} highlightKey={highlightKey} now={now} onCancel={onCancel} onNoShow={onNoShow} onAssign={onAssign} />
          ))}
          {court.slots.map((slot) => {
            const booking = byStart.get(Date.parse(slot.start))
            const id = slotKey(court.id, slot.start)
            if (booking) return <BookingRow key={slot.start} booking={booking} slotId={id} highlightKey={highlightKey} now={now} onCancel={onCancel} onNoShow={onNoShow} onAssign={onAssign} />
            const blocked = slot.past || court.status !== 'active' || court.archived
            return (
              <li key={slot.start} data-slot-key={id} className={cn('rounded-lg', highlightKey === id && 'sg-slot-highlight')}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onWalkIn(slot)}
                  className="flex w-full items-center justify-between rounded-lg border border-dashed border-[#d7d2cc] bg-[#f7f5f2] px-3 py-2.5 text-left text-sm transition-colors enabled:hover:border-[#1d3023] disabled:opacity-50"
                >
                  <span className="tabular-nums">
                    {formatVenueTime(slot.start)}–{formatVenueTime(slot.end)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#645757]">
                    {slot.past ? 'Passé' : court.status !== 'active' ? 'Indisponible' : (
                      <>
                        <Plus className="size-3.5" aria-hidden /> Guichet
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {court.slots.length === 0 && offGrid.length === 0 && (
            <li className="text-sm text-[#645757]">Aucun créneau ce jour-là.</li>
          )}
        </ul>
      )}
    </section>
  )
}

/** Vertical scale of the timeline: pixels per minute (a 90 min slot is about 100 px tall). */
const PX_PER_MIN = 1.15

/** Block colours per status, matching the legend. */
const BLOCK_STYLE: Record<BookingStatus, string> = {
  confirmed: 'border-[#0e634f] bg-[#0e634f] text-white',
  pending_payment: 'border-amber-500 bg-amber-100 text-amber-950',
  completed: 'border-[#645757] bg-[#d7d2cc] text-[#2a1a1d]',
  no_show: 'border-destructive bg-destructive/15 text-destructive',
  cancelled: 'border-destructive bg-destructive/5 text-destructive',
}

const LEGEND: { label: string; swatch: string }[] = [
  { label: 'Confirmée', swatch: 'bg-[#0e634f]' },
  { label: 'À encaisser / en attente', swatch: 'bg-amber-200 ring-1 ring-amber-500' },
  { label: 'Arrivé', swatch: 'bg-[#d7d2cc] ring-1 ring-[#645757]' },
  { label: 'Absence', swatch: 'bg-destructive/20 ring-1 ring-destructive' },
  { label: 'Libre (touchez pour réserver)', swatch: 'border border-dashed border-[#645757] bg-[#f7f5f2]' },
]

/**
 * The day at a glance: hours down the side, one column per court, each booking a coloured block sized to its
 * length. A free slot is one tap from a walk-in booking; a booking opens its details and actions (cash,
 * check-in, court change, cancel). Scrolls inside its own frame so the court names and hours stay in view.
 */
function DayTimeline({
  courts,
  bookings,
  dateStr,
  now,
  highlightKey,
  onWalkIn,
  onOpen,
}: {
  courts: BoardCourt[]
  bookings: BoardBooking[]
  dateStr: string
  now: number
  highlightKey: string | null
  onWalkIn: (court: BoardCourt, slot: BoardSlot) => void
  onOpen: (b: BoardBooking) => void
}) {
  const minutes = (iso: string) => minutesSinceVenueDayStart(iso, dateStr)
  const marks = [
    ...courts.flatMap((c) => c.slots.flatMap((sl) => [minutes(sl.start), minutes(sl.end)])),
    ...bookings.filter((b) => courts.some((c) => c.id === b.courtId)).flatMap((b) => [minutes(b.startsAt), minutes(b.endsAt)]),
  ]
  if (marks.length === 0) {
    return <EmptyState compact icon={CalendarX2} title="Aucun créneau ce jour-là" description="Le club est fermé ou aucun terrain n'a d'horaire ce jour-là." />
  }
  const from = Math.floor(Math.min(...marks) / 60) * 60
  const to = Math.ceil(Math.max(...marks) / 60) * 60
  const height = (to - from) * PX_PER_MIN
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)
  const nowMin = minutesSinceVenueDayStart(new Date(now), dateStr)
  const showNow = nowMin > from && nowMin < to
  const top = (m: number) => (m - from) * PX_PER_MIN

  return (
    <div className="space-y-3" data-testid="day-timeline">
      <ul aria-label="Légende" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#645757]">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded-sm', l.swatch)} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>

      <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#d7d2cc] bg-[#eae6df]">
        <div className="grid min-w-max" style={{ gridTemplateColumns: `3.5rem repeat(${courts.length}, minmax(9.5rem, 1fr))` }}>
          {/* header row */}
          <div className="sticky left-0 top-0 z-30 border-b border-r border-[#d7d2cc] bg-[#eae6df]" />
          {courts.map((court) => (
            <div key={court.id} className="sticky top-0 z-20 border-b border-[#d7d2cc] bg-[#eae6df] px-2.5 py-2">
              <p className="truncate text-sm font-semibold">{court.name}</p>
              <p className="flex items-center gap-1.5 text-xs capitalize text-[#645757]">
                {court.sport} · {SPORT_DURATION_MIN[court.sport]} min
                {court.archived && <span className="rounded-sm bg-[#d7d2cc] px-1 normal-case">Archivé</span>}
                {!court.archived && court.status === 'maintenance' && <span className="rounded-sm bg-amber-100 px-1 normal-case text-amber-900">Maintenance</span>}
              </p>
            </div>
          ))}

          {/* hours gutter */}
          <div className="sticky left-0 z-10 border-r border-[#d7d2cc] bg-[#eae6df]" style={{ height }}>
            {hours.map((h) => (
              <span
                key={h}
                className={cn('absolute right-1.5 text-[0.7rem] tabular-nums text-[#645757]', h === from ? 'translate-y-0.5' : '-translate-y-1/2')}
                style={{ top: top(h) }}
              >
                {String(Math.floor(h / 60) % 24).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {courts.map((court) => {
            const courtBookings = bookings.filter((b) => b.courtId === court.id)
            // A free slot is hidden under any booking it overlaps (also one off the grid after an hours change).
            const overlapsBooking = (sl: BoardSlot) =>
              courtBookings.some((b) => Date.parse(b.startsAt) < Date.parse(sl.end) && Date.parse(sl.start) < Date.parse(b.endsAt))
            return (
              <div
                key={court.id}
                className="relative border-r border-[#d7d2cc]/70 last:border-r-0"
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, rgb(215 210 204 / 0.9) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
                }}
                aria-label={court.name}
                role="group"
              >
                {court.closed ? (
                  <p className="absolute inset-x-2 top-3 rounded-md bg-[#f7f5f2] px-2 py-2 text-center text-xs text-[#645757]">Club fermé ce jour-là</p>
                ) : (
                  court.slots
                    .filter((sl) => !overlapsBooking(sl))
                    .map((sl) => {
                      const blocked = sl.past || court.status !== 'active' || court.archived
                      const id = slotKey(court.id, sl.start)
                      return (
                        <button
                          key={sl.start}
                          type="button"
                          data-slot-key={id}
                          disabled={blocked}
                          onClick={() => onWalkIn(court, sl)}
                          aria-label={`${court.name}, ${formatVenueTime(sl.start)}–${formatVenueTime(sl.end)} : ${blocked ? 'indisponible' : 'libre, ajouter une réservation au guichet'}`}
                          className={cn(
                            'group absolute inset-x-1 flex items-start justify-between rounded-md border border-dashed px-2 py-1 text-left text-[0.7rem] transition-colors',
                            blocked ? 'border-transparent text-[#645757]/50' : 'border-[#645757]/40 bg-[#f7f5f2]/70 text-[#645757] hover:border-[#1d3023] hover:bg-[#f7f5f2]',
                            highlightKey === id && 'sg-slot-highlight'
                          )}
                          style={{ top: top(minutes(sl.start)) + 1, height: (minutes(sl.end) - minutes(sl.start)) * PX_PER_MIN - 2 }}
                        >
                          <span className="tabular-nums">{formatVenueTime(sl.start)}</span>
                          {!blocked && (
                            <span className="inline-flex items-center gap-0.5 font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                              <Plus className="size-3" aria-hidden /> Guichet
                            </span>
                          )}
                        </button>
                      )
                    })
                )}

                {courtBookings.map((b) => {
                  const id = slotKey(court.id, b.startsAt)
                  const payment = paymentLabel(b)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-slot-key={id}
                      data-status={b.status}
                      onClick={() => onOpen(b)}
                      className={cn(
                        'absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        BLOCK_STYLE[b.status],
                        highlightKey === id && 'sg-slot-highlight'
                      )}
                      style={{ top: top(minutes(b.startsAt)) + 1, height: Math.max(28, (minutes(b.endsAt) - minutes(b.startsAt)) * PX_PER_MIN - 2) }}
                      aria-label={`${b.bookerName}, ${formatVenueTime(b.startsAt)}–${formatVenueTime(b.endsAt)}, ${STATUS_LABEL[b.status]}. Ouvrir les actions.`}
                    >
                      <span className="flex items-center justify-between gap-1 font-semibold tabular-nums">
                        {formatVenueTime(b.startsAt)}–{formatVenueTime(b.endsAt)}
                        {b.source !== 'online' && <PhoneCall className="size-3 shrink-0 opacity-80" aria-hidden />}
                      </span>
                      <span className="block truncate font-medium">{b.bookerName}</span>
                      <span className="block truncate opacity-80">
                        {b.courtPending && isOpen(b) ? 'Terrain à attribuer · ' : ''}
                        {payment ? payment.text : `${b.playerCount} joueurs`}
                      </span>
                    </button>
                  )
                })}

                {showNow && <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive" style={{ top: top(nowMin) }} aria-hidden />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function paymentLabel(b: BoardBooking): { text: string; paid: boolean } | null {
  if (b.paymentStatus === 'paid') return { text: b.paymentProvider === 'cash' ? 'Payé en espèces' : 'Payé en ligne', paid: true }
  if (b.paymentStatus === 'refunded') return { text: 'Remboursé', paid: false }
  if (b.paymentStatus === 'pending') {
    return { text: b.paymentProvider === 'cash' ? 'Espèces à encaisser' : 'Parts en attente', paid: false }
  }
  return null
}

function BookingRow({
  booking,
  slotId,
  highlightKey,
  now,
  onCancel,
  onNoShow,
  onAssign,
}: {
  booking: BoardBooking
  slotId: string
  highlightKey: string | null
  now: number
  onCancel: (b: BoardBooking) => void
  onNoShow: (b: BoardBooking) => void
  onAssign: (b: BoardBooking) => void
}) {
  const router = useRouter()
  const [collecting, setCollecting] = React.useState(false)
  const [checkingIn, setCheckingIn] = React.useState(false)
  const start = Date.parse(booking.startsAt)
  const end = Date.parse(booking.endsAt)
  const canCheckIn = isOpen(booking) && now >= start - CHECK_IN_LEAD_MS && now <= end
  const canNoShow = isOpen(booking) && now >= start + NO_SHOW_AFTER_MS

  const checkIn = async () => {
    setCheckingIn(true)
    const result = await postCheckIn(booking.id)
    setCheckingIn(false)
    if (!result.ok) toast.error(result.message)
    else toast.success(`${result.booker} est enregistré.${result.cashDue > 0 ? ` Encaissez ${result.cashDue.toFixed(2)} TND.` : ''}`)
    router.refresh()
  }
  const payment = paymentLabel(booking)
  // Only cash is collected here; online and split payments settle themselves.
  // Cash can still be collected after check-in (the booking is then 'completed').
  const canCollect = (isOpen(booking) || booking.status === 'completed') && booking.paymentStatus === 'pending' && booking.paymentProvider === 'cash'

  const collect = async () => {
    setCollecting(true)
    const result = await markCashPaidAction(booking.id)
    setCollecting(false)
    if (!result.ok) {
      toast.error(result.message)
      router.refresh()
      return
    }
    toast.success('Paiement enregistré. La réservation est confirmée.')
    router.refresh()
  }

  return (
    <li
      data-slot-key={slotId}
      data-status={booking.status}
      className={cn(
        'rounded-lg border-l-4 px-3 py-2.5 text-sm shadow-[inset_0_0_0_1px_rgb(215_210_204)]',
        ROW_STYLE[booking.status],
        booking.source !== 'online' && 'shadow-[inset_0_0_0_1px_#1d3023]',
        highlightKey === slotId && 'sg-slot-highlight'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">
          {formatVenueTime(booking.startsAt)}–{formatVenueTime(booking.endsAt)}
        </span>
        <span className="inline-flex flex-wrap items-center justify-end gap-1">
          {booking.courtPending && isOpen(booking) && (
            <Badge variant="warning" data-testid="court-pending">
              Terrain à attribuer
            </Badge>
          )}
          <Badge variant={STATUS_VARIANT[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5">
        {booking.isMember ? <User className="size-4 shrink-0" aria-hidden /> : <UserRound className="size-4 shrink-0" aria-hidden />}
        <span className="truncate text-base font-semibold" data-testid="booking-player-name">{booking.bookerName}</span>
        <span className="shrink-0 text-xs text-[#645757]">· {booking.playerCount} joueurs</span>
      </p>
      {booking.note && <p className="mt-1 truncate text-xs italic text-[#645757]" title={booking.note}>“{booking.note}”</p>}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#645757]">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {booking.bookerPhone && (
            <>
              <Phone className="size-3" aria-hidden />
              {booking.bookerPhone}
            </>
          )}
          <span className="font-mono">{booking.reference}</span>
          {booking.source !== 'online' && (
            <span className="rounded-sm bg-[#1d3023] px-1.5 font-medium text-[#f7f5f2]">{booking.source === 'phone' ? 'Téléphone' : 'Guichet'}</span>
          )}
          {booking.checkedInAt && <span className="font-medium text-[#0e634f]">· arrivé à {formatVenueTime(booking.checkedInAt)}</span>}
          {booking.noShowCount !== null && booking.noShowCount > 0 && (
            <span className="rounded-sm bg-destructive/10 px-1 font-medium text-destructive" title="Score de confiance et absences du membre">
              Confiance {booking.trustScore} · {booking.noShowCount} absence{booking.noShowCount === 1 ? '' : 's'}
            </span>
          )}
          {booking.amount !== null && <span>· {tnd(booking.amount)}</span>}
          {payment && (
            <span className={cn('rounded-sm px-1 font-medium', payment.paid ? 'bg-success/10 text-success' : 'bg-[#eae6df]')}>
              {payment.text}
            </span>
          )}
        </span>
        <span className="inline-flex flex-wrap gap-1.5">
          {isOpen(booking) && end > now && (
            <Button variant={booking.courtPending ? 'default' : 'outline'} size="xs" onClick={() => onAssign(booking)}>
              <ArrowLeftRight aria-hidden /> {booking.courtPending ? 'Attribuer un terrain' : 'Changer de terrain'}
            </Button>
          )}
          {canCollect && (
            <Button variant="outline" size="xs" onClick={collect} disabled={collecting}>
              {collecting ? <Loader2 className="animate-spin" aria-hidden /> : <Banknote aria-hidden />} Marquer payé
            </Button>
          )}
          {canCheckIn && (
            <Button variant="outline" size="xs" onClick={checkIn} disabled={checkingIn}>
              {checkingIn ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Enregistrer l&apos;arrivée
            </Button>
          )}
          {canNoShow && (
            <Button variant="outline" size="xs" onClick={() => onNoShow(booking)}>
              <UserX aria-hidden /> Absence
            </Button>
          )}
          {isOpen(booking) && (
            <Button variant="destructive" size="xs" onClick={() => onCancel(booking)}>
              <X aria-hidden /> Annuler
            </Button>
          )}
        </span>
      </div>
    </li>
  )
}

function CancelDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: BoardBooking | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [reason, setReason] = React.useState('')

  const confirm = async () => {
    if (!booking) return
    setBusy(true)
    const result = await cancelBookingAction({ bookingId: booking.id, reason })
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      onDone() // the booking may already be gone; show the real state
      return
    }
    toast.success('Réservation annulée. Le créneau est de nouveau libre.')
    setReason('')
    onDone()
  }

  return (
    <Dialog open={booking !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Annuler cette réservation ?</DialogTitle>
          <DialogDescription>
            {booking &&
              `${booking.bookerName} · ${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)} · ${booking.reference}. Le créneau redevient réservable immédiatement.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="cancel-reason">Motif (facultatif)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="ex. : le client a appelé pour annuler"
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Conserver la réservation
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Annuler la réservation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Assign (or confirm, or change) the court of a booking: courts of the same sport that are active and
 * free at that time on this board (the database re-checks and refuses a busy court).
 */
function AssignCourtDialog({
  booking,
  courts,
  bookings,
  onClose,
  onDone,
}: {
  booking: BoardBooking | null
  courts: BoardCourt[]
  bookings: BoardBooking[]
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const sport = booking ? courts.find((c) => c.id === booking.courtId)?.sport : undefined
  const from = booking ? Date.parse(booking.startsAt) : 0
  const until = booking ? Date.parse(booking.endsAt) + BUFFER_MIN * 60_000 : 0
  const options = booking
    ? courts
        .filter((c) => c.sport === sport && c.status === 'active' && !c.archived)
        .map((c) => {
          const clash = bookings.some(
            (b) =>
              b.id !== booking.id &&
              b.courtId === c.id &&
              isOpen(b) &&
              Date.parse(b.startsAt) < until &&
              Date.parse(b.endsAt) + BUFFER_MIN * 60_000 > from
          )
          return { court: c, current: c.id === booking.courtId, free: !clash }
        })
        .sort((a, b) => Number(b.current) - Number(a.current))
    : []

  const assign = async (courtId: string) => {
    if (!booking) return
    setBusy(courtId)
    const result = await assignCourtAction({ bookingId: booking.id, courtId })
    setBusy(null)
    if (!result.success) toast.error(result.error)
    else toast.success(result.data.message)
    onDone()
  }

  return (
    <Dialog open={booking !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{booking?.courtPending ? 'Attribuer un terrain' : 'Changer de terrain'}</DialogTitle>
          <DialogDescription>
            {booking && `${booking.bookerName} · ${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)} · ${booking.reference}. `}
            Le joueur a réservé un horaire ; le terrain choisi ici s&apos;affiche ensuite sur son pass.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {options.map(({ court, current, free }) => (
            <li key={court.id}>
              <Button
                variant={current ? 'default' : 'outline'}
                className="h-11 w-full justify-between"
                disabled={!free || busy !== null}
                onClick={() => assign(court.id)}
              >
                <span>{court.name}</span>
                <span className="text-xs font-normal">
                  {busy === court.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : current ? (
                    booking?.courtPending ? 'Confirmer ce terrain' : 'Terrain actuel'
                  ) : free ? (
                    'Libre'
                  ) : (
                    'Occupé'
                  )}
                </span>
              </Button>
            </li>
          ))}
          {options.length === 0 && <li className="text-sm text-[#645757]">Aucun terrain de ce sport n&apos;est disponible.</li>}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoShowDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: BoardBooking | null
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    if (!booking) return
    setBusy(true)
    const result = await markNoShowAction(booking.id)
    setBusy(false)
    if (!result.success) toast.error(result.error)
    else toast.success(result.data.message)
    onDone()
  }

  return (
    <Dialog open={booking !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#eae6df] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Marquer comme absence ?</DialogTitle>
          <DialogDescription>
            {booking &&
              `${booking.bookerName} · ${formatVenueTime(booking.startsAt)}–${formatVenueTime(booking.endsAt)} · ${booking.reference}. `}
            {booking?.isMember
              ? 'Le joueur perd 30 points de confiance et une absence est inscrite à son dossier. Une troisième absence suspend ses réservations pendant 30 jours. Cette action ne peut pas être annulée ici.'
              : 'Cet invité n\'a pas de compte : seule la réservation est marquée.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Conserver la réservation
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Marquer comme absence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
