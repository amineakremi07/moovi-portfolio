'use client'

import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { useAnimate, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SPRING } from '@/components/ui/motion-button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { GoogleButton } from '@/components/auth/google-button'
import { CheckoutConfirmation, OPTION_META, PaymentOptions, payNow } from '@/components/booking/checkout'
import { trackEvent } from '@/components/providers/posthog-provider'
import { createBooking, type BookingResult } from '@/lib/actions/booking'
import { SPORT_LABEL } from '@/lib/clubs'
import { canSplit, formatTND, type OnlineMode, type PaymentChoice } from '@/lib/payments'
import { formatVenueDate, formatVenueTime, minutesSinceVenueDayStart, timeSlotLabel, timeToMinutes } from '@/lib/court-time'
import { computePrice, slotHoursLabel, slotPrice } from '@/lib/pricing'
import { BUFFER_MIN, PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { guestBookingFormSchema } from '@/lib/validations/booking'
import { ConsentCheckbox, LegalLinks } from '@/components/legal/consent-checkbox'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Booking drawer (Milestone 4).
   Right-hand sheet on desktop, bottom sheet on mobile. Same three steps on
   every screen size: details and price · payment · recap, account and Terms,
   with Back / Continue (then confirm) pinned to the bottom of the sheet and a
   step indicator whose done steps lead back. Booking needs an account: a member
   of this club confirms in one tap; a signed-in player of another club gives a
   name + Tunisian mobile (membership is per club). Signed out: no form, only
   the way to sign in.
   The price shown here comes from the same `computePrice` the server action
   uses, and the server recomputes it from the database before charging.
   ========================================================================== */

export interface BookingDrawerSelection {
  /** Null for a time-first booking: the server takes the cheapest free court of the sport. */
  courtId: string | null
  /** The court's name, or the "assigned at the club" label for a time-first booking. */
  courtName: string
  sport: Sport
  /** Venue calendar day the slot belongs to, YYYY-MM-DD. */
  date: string
  /** ISO instants for start and end of play. */
  startsAt: string
  endsAt: string
  pricePerHour: number
  nightSurchargePerHour: number
  /** Postgres TIME, e.g. "18:00:00". */
  nightStartsAt: string
}

export interface BookingDrawerMember {
  displayName: string
  email: string | null
  phone: string | null
  /** The account's role, e.g. "player" or "staff". */
  role: string
  /** True for any player account: players book as members at every club (no home club). */
  isMember: boolean
}

export interface BookingDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  orgName: string
  /** Venue address and WhatsApp number, for the confirmation's calendar and contact buttons. */
  orgAddress?: string | null
  orgWhatsapp?: string | null
  selection: BookingDrawerSelection | null
  /** null when nobody is signed in. */
  member: BookingDrawerMember | null
  /** Opens the sign-in / sign-up dialog. */
  onRequestSignIn: () => void
  /**
   * A booking was created. Return true when the page takes over (it navigates away and shows its own
   * toast): the drawer then skips its confirmation screen.
   */
  onBooked?: (result: Extract<BookingResult, { ok: true }>, mode: 'member' | 'guest') => boolean | void
  /** The slot turned out to be unavailable: refresh availability. */
  onSlotUnavailable?: () => void
  /** Whether online / split payment can be taken (decided on the server). */
  onlineMode?: OnlineMode
}

/** The booking wizard's steps, in order. */
const WIZARD_STEPS = ['Détails', 'Paiement', 'Confirmation'] as const
type WizardStep = 1 | 2 | 3

/**
 * Step bars + labels; the current step is announced, done steps show a check and are buttons back to
 * that step (steps ahead stay plain text: they are reached with "Continuer", which validates).
 */
function WizardProgress({ step, onBack, disabled }: { step: WizardStep; onBack: (step: WizardStep) => void; disabled?: boolean }) {
  return (
    <ol aria-label="Étapes de la réservation" className="grid grid-cols-3 gap-2" data-testid="booking-steps">
      {WIZARD_STEPS.map((label, i) => {
        const n = (i + 1) as WizardStep
        const done = n < step
        const current = n === step
        const content = (
          <>
            <span
              className={cn(
                'block h-1 rounded-full bg-black/[0.08] transition-colors duration-200',
                (done || current) && 'bg-forest-depths'
              )}
              aria-hidden
            />
            <span
              className={cn(
                'mt-1.5 flex items-center gap-1 truncate text-xs',
                current ? 'font-semibold text-foreground' : 'text-muted-foreground'
              )}
            >
              {done ? <Check className="size-3 shrink-0" aria-hidden /> : <span className="tabular-nums">{n}.</span>}
              {label}
              {done && <span className="sr-only"> (terminé, revenir à cette étape)</span>}
            </span>
          </>
        )
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="min-w-0">
            {done ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onBack(n)}
                className="block w-full rounded-sm py-1 text-left hover:[&>span:last-child]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {content}
              </button>
            ) : (
              <div className="py-1">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Bottom sheet on phones, right-hand sheet from the `md` breakpoint up. */
export function useIsDesktop() {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia('(min-width: 768px)')
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => false
  )
}

type GuestFormInput = z.input<typeof guestBookingFormSchema>
type GuestFormOutput = z.output<typeof guestBookingFormSchema>

/* ------------------------------ price summary ----------------------------- */

export function PriceSummary({ selection, className }: { selection: BookingDrawerSelection; className?: string }) {
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })

  return (
    <section
      aria-label="Récapitulatif du prix"
      className={cn('rounded-lg bg-card p-4 text-card-foreground', className)}
    >
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">
            Tarif du terrain
            <span className="block text-xs tabular-nums">
              Créneau de {slotHoursLabel(price.durationMinutes)} · {formatTND(slotPrice(selection.pricePerHour, price.durationMinutes))}
            </span>
          </dt>
          <dd className="font-medium tabular-nums">{formatTND(price.base)}</dd>
        </div>

        {price.surcharge > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">
              Supplément d&apos;éclairage de nuit
              <span className="block text-xs tabular-nums">
                Forfait pour les créneaux à partir de {selection.nightStartsAt.slice(0, 5)}
              </span>
            </dt>
            <dd className="font-medium tabular-nums">{formatTND(price.surcharge)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <span className="text-sm font-medium">Total</span>
        <span className="text-2xl font-bold tabular-nums tracking-tight">
          {formatTND(price.total)}
        </span>
      </div>
    </section>
  )
}

/* ------------------------------ wizard recap ------------------------------ */

/** Wizard, last step: everything chosen so far on one card, each part one tap from its step. */
function WizardRecap({
  orgName,
  selection,
  sportLabel,
  SportIcon,
  choice,
  total,
  dueNow,
  playerCount,
  onEdit,
}: {
  orgName: string
  selection: BookingDrawerSelection
  sportLabel: string
  SportIcon: (typeof SPORT_ICON)[Sport]
  choice: PaymentChoice
  total: number
  dueNow: number
  playerCount: number
  onEdit: (step: WizardStep) => void
}) {
  const PayIcon = OPTION_META[choice].icon
  return (
    <section aria-label="Récapitulatif de la réservation" className="rounded-lg bg-card p-4 text-sm" data-testid="booking-recap">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <SportIcon className="size-4 shrink-0" />
            <span className="truncate">
              {sportLabel} · {selection.courtId ? selection.courtName : 'terrain attribué au club'}
            </span>
          </p>
          <p className="mt-0.5 truncate text-muted-foreground">{orgName}</p>
          <p className="mt-1 tabular-nums">
            {formatVenueDate(selection.date)}, {formatVenueTime(selection.startsAt)} – {formatVenueTime(selection.endsAt)}
          </p>
          <p className="text-muted-foreground">
            {SPORT_DURATION_MIN[selection.sport]} min · {playerCount} joueurs
          </p>
        </div>
        <Button type="button" variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={() => onEdit(1)}>
          Modifier
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="flex min-w-0 items-center gap-1.5">
          <PayIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{OPTION_META[choice].title}</span>
        </p>
        <Button type="button" variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={() => onEdit(2)}>
          Modifier
        </Button>
      </div>

      <dl className="mt-3 space-y-1 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-lg font-bold tabular-nums">{formatTND(total)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{choice === 'cash' ? 'À payer au club' : 'À payer maintenant'}</dt>
          <dd className="font-medium tabular-nums">{formatTND(choice === 'cash' ? total : dueNow)}</dd>
        </div>
      </dl>
    </section>
  )
}

/* --------------------------------- body ---------------------------------- */

export function DrawerBody({
  orgId,
  orgName,
  orgAddress = null,
  orgWhatsapp = null,
  selection,
  member,
  onRequestSignIn,
  onClose,
  onBooked,
  onSlotUnavailable,
  onBusyChange,
  onlineMode = 'disabled',
}: Omit<BookingDrawerProps, 'open' | 'onOpenChange' | 'selection'> & {
  selection: BookingDrawerSelection
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const reduce = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const [step, setStep] = React.useState<WizardStep>(1)
  // +1 forward, -1 back: the next step slides in from the side it is "coming from".
  const [direction, setDirection] = React.useState<1 | -1>(1)
  const stepHeadingRef = React.useRef<HTMLHeadingElement>(null)
  const movedRef = React.useRef(false)
  const playerOptions = PLAYER_COUNT_OPTIONS[selection.sport] as readonly number[]
  const [playerCount, setPlayerCount] = React.useState<number>(playerOptions[0])
  const [payment, setPayment] = React.useState<PaymentChoice>('cash')
  const [submitting, setSubmitting] = React.useState(false)
  // Honeypot value (hidden field): stays empty for people.
  const [honeypot, setHoneypot] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  // Split only: where to email each other player's payment link (all optional).
  const [inviteEmails, setInviteEmails] = React.useState<string[]>([])
  const [sentTo, setSentTo] = React.useState<{ email: string | null; invites: number }>({ email: null, invites: 0 })
  const [result, setResult] = React.useState<Extract<BookingResult, { ok: true }> | null>(null)
  // Optimistic UI: the slot reads as held for the player the moment they confirm. React drops the
  // optimistic value by itself when the request settles: on success the confirmation (or the page
  // the parent navigates to) replaces it, on failure the form comes back with the reason.
  const [held, showHeld] = React.useOptimistic(false, (_: boolean, next: boolean) => next)
  // The parent took over with the result (navigation in flight): keep the held view until it lands.
  const [handedOff, setHandedOff] = React.useState(false)

  const form = useForm<GuestFormInput, unknown, GuestFormOutput>({
    resolver: zodResolver(guestBookingFormSchema),
    defaultValues: { fullName: '', phone: '', email: '', consent: false },
    mode: 'onTouched',
  })

  // A split needs 2 to 4 players; if the player count changes under it, fall back to cash.
  const choice: PaymentChoice = payment === 'split' && !canSplit(playerCount) ? 'cash' : payment
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })
  const dueNow = payNow(choice, price.total, playerCount)
  const reserveLabel = choice === 'cash' ? 'Confirmer la réservation' : `Payer ${formatTND(dueNow)} et confirmer`

  const sportLabel = SPORT_LABEL[selection.sport]
  const SportIcon = SPORT_ICON[selection.sport]
  const duration = SPORT_DURATION_MIN[selection.sport]

  // After a step change: back to the top of the sheet, focus on the new step's title, and the content
  // slides in from the side it comes from (a cross-fade only, with reduced motion).
  React.useEffect(() => {
    if (!movedRef.current) return
    stepHeadingRef.current?.scrollIntoView({ block: 'nearest' })
    stepHeadingRef.current?.focus({ preventScroll: true })
    if (scope.current) {
      void animate(scope.current, reduce ? { opacity: [0, 1] } : { opacity: [0, 1], x: [direction * 24, 0] }, reduce ? { duration: 0.15 } : SPRING)
    }
  }, [step, direction, reduce, animate, scope])

  // Split only: one entry per other player (the state array can have holes if a box was skipped).
  const typedInvites = () =>
    choice === 'split' ? Array.from({ length: playerCount - 1 }, (_, i) => (inviteEmails[i] ?? '').trim()) : []
  // A typo is caught before booking, not silently dropped by the server.
  const badInvite = () => typedInvites().find((e) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  const badInviteMessage = (bad: string) => `« ${bad} » ne ressemble pas à une adresse e-mail. Corrigez-la ou laissez le champ vide.`

  const goTo = (next: WizardStep) => {
    if (next > step && step === 2) {
      const bad = badInvite()
      if (bad) return void setError(badInviteMessage(bad))
    }
    setError(null)
    setDirection(next > step ? 1 : -1)
    movedRef.current = true
    setStep(next)
  }

  // A member has no form to fill in, but still accepts the Terms.
  const confirmAsMember = () => {
    if (!form.getValues('consent')) {
      form.setError('consent', { type: 'custom', message: 'Veuillez accepter les conditions d\'utilisation et la politique de confidentialité pour réserver' })
      return
    }
    submit({ mode: 'member' })
  }
  const submit = (
    who: { mode: 'member' } | { mode: 'guest'; guest: GuestFormOutput }
  ) => {
    const invites = typedInvites()
    const bad = badInvite()
    if (bad) {
      setError(badInviteMessage(bad))
      return
    }

    setSubmitting(true)
    onBusyChange(true)
    setError(null)
    React.startTransition(async () => {
      showHeld(true)
      await book(who, invites)
    })
  }

  const book = async (
    who: { mode: 'member' } | { mode: 'guest'; guest: GuestFormOutput },
    invites: string[]
  ) => {
    const base = {
      orgId,
      // Exactly one of the two: a court, or (time-first) the sport.
      ...(selection.courtId ? { courtId: selection.courtId } : { sport: selection.sport }),
      date: selection.date,
      startsAt: selection.startsAt,
      playerCount,
      payment: choice,
      ...(invites.some(Boolean) ? { inviteEmails: invites } : {}),
      ...(honeypot ? { website: honeypot } : {}),
    }

    // Set when the page navigates away with the result: the button stays busy until it does.
    let leaving = false
    try {
      const outcome = await createBooking(
        who.mode === 'member' ? { mode: 'member', ...base } : {
            mode: 'guest',
            ...base,
            guest: { fullName: who.guest.fullName, phone: who.guest.phone, email: who.guest.email },
            consent: who.guest.consent,
          }
      )

      if (outcome.ok) {
        trackEvent('booking.created', {
          booking_id: outcome.bookingId,
          club_id: orgId,
          court_id: selection.courtId,
          sport: selection.sport,
          date: selection.date,
          time_slot: timeSlotLabel(selection.startsAt, selection.endsAt),
          amount: outcome.amount,
          price: outcome.amount,
          payment: outcome.payment,
          status: outcome.status,
          actor: who.mode,
        })
        // The page may take over (a member's booking: straight to their home and its match ticket).
        if (onBooked?.(outcome, who.mode) === true) {
          leaving = true
          setHandedOff(true)
          return
        }
        setSentTo({
          email: who.mode === 'guest' ? (who.guest.email ?? null) : (member?.email ?? null),
          invites: invites.filter(Boolean).length,
        })
        setResult(outcome)
        toast.success('Créneau réservé', { description: `Référence ${outcome.reference}` })
        return
      }

      setError(outcome.message)
      // A clean, specific toast; the race-condition case is the important one.
      toast.error(outcome.message)
      if (['slot_taken', 'slot_in_past', 'unavailable', 'invalid_slot'].includes(outcome.code)) {
        onSlotUnavailable?.()
      }
    } catch {
      const message = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
      setError(message)
      toast.error(message)
    } finally {
      if (!leaving) {
        setSubmitting(false)
        onBusyChange(false)
      }
    }
  }

  if (result) {
    return (
      <div className="px-4 pb-6">
        <CheckoutConfirmation
          courtName={selection.courtName}
          date={selection.date}
          result={result}
          orgName={orgName}
          orgAddress={orgAddress}
          orgWhatsapp={orgWhatsapp}
          sport={selection.sport}
          emailedTo={result.emailsEnabled ? sentTo.email : null}
          invitesEmailed={result.emailsEnabled ? sentTo.invites : 0}
          onDone={onClose}
        />
      </div>
    )
  }

  const online = onlineMode !== 'disabled'
  const isMember = Boolean(member?.isMember)
  const errors = form.formState.errors

  // Every step stays mounted (form values survive Back), only the current one is shown.
  const offStep = (n: WizardStep) => step !== n && 'hidden'

  // One form for both paths, so Enter confirms and the button is always the same one at the bottom.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Enter before the last step means "Continue".
    if (step < 3) return goTo((step + 1) as WizardStep)
    if (!member) return // booking needs an account (the button is not even shown)
    if (isMember) {
      confirmAsMember()
      return
    }
    void form.handleSubmit(
      (guest) => submit({ mode: 'guest', guest }),
      // react-hook-form focuses the first wrong field; this line says why nothing happened.
      () => setError('Certaines informations manquent ou sont incorrectes. Corrigez les champs signalés en rouge.')
    )(event)
  }

  const showHeldView = held || handedOff

  return (
    <form noValidate onSubmit={onSubmit} className="flex min-h-full flex-col" aria-busy={submitting}>
      {showHeldView && (
        <HeldSlot
          orgName={orgName}
          sportLabel={sportLabel}
          date={selection.date}
          startsAt={selection.startsAt}
          endsAt={selection.endsAt}
          total={price.total}
        />
      )}
      {/* Kept mounted while the slot is held, so a failed request returns to the filled-in form. */}
      <div className={cn('space-y-3 px-4 pb-4', showHeldView && 'hidden')}>
        <WizardProgress step={step} onBack={goTo} disabled={submitting} />
        <h3 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold outline-none">
          {['Votre créneau', 'Mode de paiement', 'Vérifiez et confirmez'][step - 1]}
        </h3>
      </div>
      <div ref={scope} className={cn('space-y-5 px-4 pb-4', showHeldView && 'hidden')}>
        {/* ---- the court and slot ---- */}
        <section aria-label="Créneau sélectionné" className={cn('space-y-3', offStep(1))}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{orgName}</span>
              </p>
              <p className="mt-0.5 text-lg font-semibold leading-tight">{selection.courtId ? selection.courtName : sportLabel}</p>
              {!selection.courtId && (
                <p className="mt-0.5 text-sm text-muted-foreground" data-testid="court-assigned-note">
                  Terrain : {selection.courtName.toLowerCase()}, le club vous l&apos;indique à l&apos;accueil.
                </p>
              )}
            </div>
            <Badge variant="secondary" className="shrink-0 gap-1">
              <SportIcon />
              {sportLabel}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Date</dt>
              <dd className="mt-0.5 font-medium">{formatVenueDate(selection.date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Heure</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium tabular-nums">
                {formatVenueTime(selection.startsAt)} – {formatVenueTime(selection.endsAt)}
                <Badge variant="outline" className="gap-1">
                  <Clock aria-hidden />
                  {duration} min
                </Badge>
                <InfoTip label="À propos du battement">
                  Un battement de {BUFFER_MIN} min est laissé libre avant la réservation suivante : les créneaux commencent donc
                  toutes les {duration + BUFFER_MIN} min.
                </InfoTip>
              </dd>
            </div>
          </dl>

          {playerOptions.length > 1 && (
            <div role="group" aria-label="Nombre de joueurs" className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="size-3.5" aria-hidden />
                Joueurs
              </span>
              {playerOptions.map((count) => (
                <Button
                  key={count}
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={playerCount === count}
                  disabled={submitting}
                  onClick={() => setPlayerCount(count)}
                  className={cn(
                    'max-md:h-12 max-md:min-w-12',
                    playerCount === count &&
                      'border-forest-depths bg-forest-depths text-bone-linen hover:bg-forest-depths/90 hover:text-bone-linen'
                  )}
                >
                  {count}
                </Button>
              ))}
            </div>
          )}
        </section>

        <PriceSummary selection={selection} className={offStep(1) || undefined} />

        {/* ---- how to pay: the three methods, online ones marked unavailable when the club has none ---- */}
        <div className={cn('space-y-5', offStep(2))}>
          <PaymentOptions
            value={choice}
            onChange={setPayment}
            total={price.total}
            playerCount={playerCount}
            onlineMode={onlineMode}
            disabled={submitting}
          />

          {choice === 'split' && (
            <fieldset className="space-y-2" disabled={submitting}>
              <legend className="flex items-center gap-1 text-sm font-medium">
                Envoyer les invitations par e-mail (facultatif)
                <InfoTip label="À propos des e-mails d'invitation">
                  Nous pouvons envoyer à chaque joueur son lien de paiement par e-mail. Vous recevez aussi les liens après la réservation.
                </InfoTip>
              </legend>
              {Array.from({ length: playerCount - 1 }, (_, i) => (
                <Input
                  key={i}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder={`E-mail du joueur ${i + 2}`}
                  aria-label={`E-mail du joueur ${i + 2}`}
                  className="max-md:h-12"
                  value={inviteEmails[i] ?? ''}
                  onChange={(e) =>
                    setInviteEmails((prev) => {
                      const next = [...prev]
                      next[i] = e.target.value
                      return next
                    })
                  }
                />
              ))}
            </fieldset>
          )}

          {!online && (
            <p className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm" data-testid="pay-at-club">
              <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                Paiement <strong>au club</strong>, sur place. Rien à payer maintenant.
              </span>
            </p>
          )}
        </div>

        {step === 3 && (
          <WizardRecap
            orgName={orgName}
            selection={selection}
            sportLabel={sportLabel}
            SportIcon={SportIcon}
            choice={choice}
            total={price.total}
            dueNow={dueNow}
            playerCount={playerCount}
            onEdit={goTo}
          />
        )}

        {/* ---- who is booking ---- */}
        {isMember && member ? (
          <div className={cn('flex items-center gap-3 rounded-lg border border-border p-3', offStep(3))}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold" aria-hidden>
              {member.displayName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{member.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{[member.email, member.phone].filter(Boolean).join(' · ')}</p>
            </div>
            <Badge variant="success" className="shrink-0 gap-1" title="Compte joueur Moovi">
              <ShieldCheck aria-hidden />
              Compte joueur
            </Badge>
          </div>
        ) : !member ? (
          // Booking needs an account. The club page opens the sign-in dialog before the drawer, so this
          // shows only for the moment between signing in and the new session reaching the page.
          <section
            aria-labelledby="signin-heading"
            className={cn('space-y-3 rounded-lg border border-border p-4', offStep(3))}
            data-testid="signin-required"
          >
            <h3 id="signin-heading" className="text-sm font-semibold">
              Connexion requise pour réserver
            </h3>
            <p className="text-sm text-muted-foreground">Connectez-vous ou créez votre compte joueur, puis confirmez ce créneau.</p>
            <Button type="button" className="h-12 w-full text-base" onClick={onRequestSignIn}>
              Se connecter ou créer un compte
            </Button>
            <GoogleButton
              orgId={orgId}
              next={typeof window === 'undefined' ? undefined : window.location.pathname + window.location.search}
            />
          </section>
        ) : (
          // A signed-in account that is not a member of THIS club (membership is per club) books with
          // its name and number, like a desk customer.
          // ph-no-capture: name/phone/email never appear in session recordings (inputs are masked anyway).
          <section aria-labelledby="guest-heading" className={cn('ph-no-capture space-y-4', offStep(3))}>
            <h3 id="guest-heading" className="text-sm font-semibold">
              Vos coordonnées
            </h3>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="min-w-0">
                Connecté avec un compte de club (<strong>{member.displayName}</strong>) : indiquez le nom et le numéro du joueur
                pour cette réservation.
              </span>
              <InfoTip label="Pourquoi saisir un nom ?">
                Les comptes de club (gérant, personnel) ne réservent pas en leur nom propre. Un joueur réserve avec son propre compte
                joueur, dans n&apos;importe quel club.
              </InfoTip>
            </p>

            {/* Honeypot: off-screen, unreachable by keyboard and screen readers; only bots fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="guest-website">Site web</label>
              <input
                id="guest-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <FieldError id="guest-name-error" message={errors.fullName?.message}>
              <Label htmlFor="guest-name">Nom complet</Label>
              <Input
                id="guest-name"
                autoComplete="name"
                placeholder="Ali Ben Salah"
                className="max-md:h-12"
                aria-invalid={!!errors.fullName}
                aria-describedby={errors.fullName ? 'guest-name-error' : undefined}
                {...form.register('fullName')}
              />
            </FieldError>

            <FieldError id="guest-phone-error" message={errors.phone?.message}>
              <Label htmlFor="guest-phone" className="flex items-center gap-1">
                Numéro de mobile
                <InfoTip label="À propos du numéro de mobile">
                  8 chiffres commençant par 2, 4, 5 ou 9. Le club l&apos;utilise pour vous joindre au sujet de cette réservation.
                </InfoTip>
              </Label>
              <div className="flex">
                <span
                  className={cn(
                    'flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground',
                    errors.phone && 'border-destructive'
                  )}
                >
                  +216
                </span>
                <Input
                  id="guest-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98 123 456"
                  className="rounded-l-none max-md:h-12"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'guest-phone-error' : undefined}
                  {...form.register('phone')}
                />
              </div>
            </FieldError>

            <FieldError id="guest-email-error" message={errors.email?.message}>
              <Label htmlFor="guest-email" className="flex items-center gap-1">
                E-mail <span className="font-normal text-muted-foreground">(facultatif)</span>
                <InfoTip label="À propos de l'e-mail">
                  Pour votre confirmation, un rappel deux heures avant et un avis d&apos;annulation. Non partagé.
                </InfoTip>
              </Label>
              <Input
                id="guest-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                className="max-md:h-12"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'guest-email-error' : undefined}
                {...form.register('email')}
              />
            </FieldError>
          </section>
        )}

        {member && (
          <Controller
            name="consent"
            control={form.control}
            render={({ field }) => (
              <ConsentCheckbox
                id="guest-consent"
                checked={!!field.value}
                onChange={field.onChange}
                error={errors.consent?.message}
                className={offStep(3) || undefined}
              >
                J&apos;accepte les <LegalLinks />. J&apos;accepte que Moovi et ce club utilisent mon nom et mon numéro de
                téléphone pour gérer cette réservation et me contacter à ce sujet, y compris par e-mail (confirmation, rappel, avis
                d&apos;annulation) si j&apos;en ai indiqué un, et par SMS ou appel téléphonique si nécessaire. Je peux demander à
                tout moment l&apos;arrêt de ces contacts.
              </ConsentCheckbox>
            )}
          />
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* Pinned to the bottom of the sheet: the confirm button never scrolls out of thumb reach. */}
      {(member || step < 3) && !showHeldView && (
        <div
          className="sticky bottom-0 mt-auto flex gap-2 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              className="h-12 shrink-0 px-4"
              disabled={submitting}
              onClick={() => goTo((step - 1) as WizardStep)}
            >
              <ArrowLeft aria-hidden />
              Retour
            </Button>
          )}
          {/* Distinct keys: otherwise React turns the tapped "Continuer" node into the submit button during the
              click, and the browser then submits the form (the Terms error shows before anyone confirmed). */}
          {step < 3 ? (
            <Button
              key="next"
              type="button"
              className="h-12 flex-1 text-base"
              onClick={() => goTo((step + 1) as WizardStep)}
              data-testid="wizard-next"
            >
              Continuer
            </Button>
          ) : (
            <Button key="confirm" type="submit" className="h-12 flex-1 text-base" disabled={submitting} data-testid="confirm-booking">
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              {submitting ? 'Réservation en cours…' : reserveLabel}
            </Button>
          )}
        </div>
      )}
    </form>
  )
}

/** The optimistic "held" view: what the player just confirmed, while the server writes it. */
function HeldSlot({
  orgName,
  sportLabel,
  date,
  startsAt,
  endsAt,
  total,
}: {
  orgName: string
  sportLabel: string
  date: string
  startsAt: string
  endsAt: string
  total: number
}) {
  return (
    <section role="status" aria-live="polite" className="space-y-5 px-4 pb-6 pt-2" data-testid="booking-held">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <div>
          <h3 className="text-xl font-semibold">Créneau retenu pour vous</h3>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Confirmation en cours…
          </p>
        </div>
      </div>
      <dl className="space-y-2 rounded-lg bg-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Club</dt>
          <dd className="truncate font-medium">{orgName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Sport</dt>
          <dd className="font-medium">{sportLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Créneau</dt>
          <dd className="font-medium tabular-nums">
            {formatVenueDate(date)}, {timeSlotLabel(startsAt, endsAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-medium tabular-nums">{formatTND(total)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** A label + control with its error underneath, linked by id for screen readers. */
function FieldError({ id, message, children }: { id: string; message?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {children}
      {message && (
        <p id={id} className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}

/* --------------------------------- drawer -------------------------------- */

export function BookingDrawer({
  open,
  onOpenChange,
  selection,
  ...rest
}: BookingDrawerProps) {
  const isDesktop = useIsDesktop()
  const [busy, setBusy] = React.useState(false)

  return (
    <Sheet
      open={open}
      // Ignore dismissal while a booking request is in flight.
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={cn(
          'overflow-y-auto',
          isDesktop ? 'w-full sm:max-w-md' : 'max-h-[92dvh] rounded-t-xl'
        )}
      >
        <SheetHeader>
          <SheetTitle>Réservez votre créneau</SheetTitle>
          <SheetDescription className="sr-only">
            Vérifiez les détails, puis confirmez. Votre créneau est retenu dès la réservation.
          </SheetDescription>
        </SheetHeader>

        {selection && (
          <DrawerBody
            // A new slot starts from a clean form and state.
            key={`${selection.courtId}-${selection.startsAt}`}
            selection={selection}
            onClose={() => onOpenChange(false)}
            onBusyChange={setBusy}
            {...rest}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

export default BookingDrawer
