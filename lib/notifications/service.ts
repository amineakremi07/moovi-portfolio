import QRCode from 'qrcode'

import { playerCourtLabel } from '@/lib/time-slots'
import { bookingCalendarEvent } from '@/lib/calendar'
import { bookingWhatsappLink } from '@/lib/whatsapp'
import { checkInQrPayload } from '@/lib/check-in-input'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { deliver, emailEnabled, type DeliverResult } from '@/lib/notifications/mailer'
import { bookingPassUrl, guestCancelUrl } from '@/lib/notifications/urls'
import {
  CHECK_IN_QR_CID,
  attendanceRequestEmail,
  autoReleaseEmail,
  cancellationEmail,
  confirmationEmail,
  matchCancelledEmail,
  matchFoundEmail,
  matchJoinedEmail,
  reminderEmail,
  tournamentRegistrationEmail,
  splitInviteEmail,
  type BookingFacts,
  type CancellationProps,
  type PaymentState,
  type ReminderProps,
  type Rendered,
} from '@/lib/notifications/templates'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import type { Json, NotificationKind } from '@/lib/types/database'

/**
 * Sends the app's emails and keeps the outbox (`notifications`).
 *
 * Rules every function here follows:
 *  - It NEVER throws: a failed email must not fail the booking, cancellation or
 *    cron run that triggered it. Errors are logged and recorded on the outbox row.
 *  - It is meant to run AFTER the response (Next's `after()`), so the player never
 *    waits for the email provider.
 *  - A row is written before sending and finished after, so outcomes are visible.
 *    `dedupe_key` makes "once per booking" (reminder, cancellation) a database fact.
 *  - Links with a secret (guest pass/cancel link, split invite link) are built from
 *    memory at send time and never stored; retryable kinds store only non-secret data.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>

const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000
/** Do not bother reminding about a game that is about to start. */
const REMINDER_MIN_LEAD_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
const PENDING_STALE_MS = 10 * 60 * 1000

export type BookingContext = {
  bookingId: string
  status: string
  startsAt: string
  cancellationReason: string | null
  /** 6-digit arrival code (never stored in the outbox: read at send time). */
  checkInCode: string | null
  facts: BookingFacts
  state: PaymentState
  paymentStatus: string | null
  paymentProvider: string | null
  shares: { count: number; pending: number; refundedAmount: number }
  booker: { name: string; email: string | null; isMember: boolean; anonId: string | null; remindByEmail: boolean }
}

/** Everything the templates need about a booking, read with the service role. */
export async function loadBookingContext(admin: Admin, bookingId: string): Promise<BookingContext | null> {
  const { data: b } = await admin
    .from('bookings')
    .select('id, org_id, court_id, sport, starts_at, ends_at, status, player_count, booker_profile_id, booker_anon_id, cancellation_reason, check_in_code, court_pending')
    .eq('id', bookingId)
    .maybeSingle()
  if (!b) return null

  const [org, court, payment, shares, profile, guest] = await Promise.all([
    admin.from('organizations').select('name, address, city, whatsapp_number').eq('id', b.org_id).maybeSingle(),
    b.court_id ? admin.from('courts').select('name').eq('id', b.court_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('payment_records').select('amount, status, provider').eq('booking_id', b.id).maybeSingle(),
    admin.from('booking_shares').select('amount, status').eq('booking_id', b.id),
    b.booker_profile_id ? admin.from('profiles').select('display_name, remind_by_email').eq('id', b.booker_profile_id).maybeSingle() : Promise.resolve({ data: null }),
    b.booker_anon_id ? admin.from('anonymous_bookers').select('name, email').eq('id', b.booker_anon_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  let email: string | null = guest.data?.email ?? null
  if (b.booker_profile_id) {
    const { data } = await admin.auth.admin.getUserById(b.booker_profile_id)
    email = data.user?.email ?? null
  }

  const clubName = org.data?.name ?? 'the club'
  const courtName = playerCourtLabel(court.data?.name, b.court_pending)
  const date = formatVenueDate(venueDateString(new Date(b.starts_at)))
  const time = `${formatVenueTime(b.starts_at)} – ${formatVenueTime(b.ends_at)}`
  const reference = b.id.replace(/-/g, '').slice(0, 8).toUpperCase()
  const facts: BookingFacts = {
    clubName,
    courtName,
    sport: b.sport,
    date,
    time,
    reference,
    amount: Number(payment.data?.amount ?? 0),
    playerCount: b.player_count,
    // The slot's club number, else the platform support number (null hides the button).
    whatsappUrl: bookingWhatsappLink(org.data?.whatsapp_number, { clubName, date, time, courtName, reference }),
    calendar: bookingCalendarEvent({
      bookingId: b.id,
      clubName,
      courtName,
      sport: b.sport,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      address: [org.data?.address, org.data?.city].filter(Boolean).join(', ') || null,
      reference,
    }),
  }

  const shareRows = shares.data ?? []
  const state: PaymentState = b.status === 'confirmed' ? 'confirmed' : shareRows.length ? 'awaiting_shares' : 'pay_at_club'

  return {
    bookingId: b.id,
    status: b.status,
    startsAt: b.starts_at,
    cancellationReason: b.cancellation_reason,
    checkInCode: b.check_in_code,
    facts,
    state,
    paymentStatus: payment.data?.status ?? null,
    paymentProvider: payment.data?.provider ?? null,
    shares: {
      count: shareRows.length,
      pending: shareRows.filter((s) => s.status === 'pending').length,
      refundedAmount: shareRows.filter((s) => s.status === 'refunded').reduce((t, s) => t + Number(s.amount), 0),
    },
    booker: {
      name: profile.data?.display_name ?? guest.data?.name ?? 'there',
      email,
      isMember: Boolean(b.booker_profile_id),
      anonId: b.booker_anon_id,
      /** Members can turn reminder emails off in /settings (confirmations and cancellations still go out). */
      remindByEmail: profile.data?.remind_by_email ?? true,
    },
  }
}

/* ------------------------------- the outbox ------------------------------- */

type Draft = {
  kind: NotificationKind
  bookingId: string | null
  to: string
  rendered: Rendered
  dedupeKey?: string
  /** Template data to re-render a retry. Only for kinds with no secret link. */
  payload?: Json
}

/** Write the row, send, record the outcome. Returns null if this was already handled. */
async function sendRecorded(admin: Admin, draft: Draft): Promise<DeliverResult | null> {
  const { data: row, error } = await admin
    .from('notifications')
    .insert({
      kind: draft.kind,
      booking_id: draft.bookingId,
      recipient: draft.to,
      subject: draft.rendered.subject,
      payload: draft.payload ?? null,
      dedupe_key: draft.dedupeKey ?? null,
    })
    .select('id')
    .single()

  if (error?.code === '23505') return null // the same notification was already recorded
  if (error) console.error('notification outbox insert failed', { kind: draft.kind, message: error.message })

  const result = await deliver({ to: draft.to, type: draft.kind, ...draft.rendered })
  if (row) await finish(admin, row.id, 0, result)
  if (result.status === 'failed') console.error('email failed', { kind: draft.kind, error: result.error })
  return result
}

async function finish(admin: Admin, id: string, previousAttempts: number, result: DeliverResult) {
  const { error } = await admin
    .from('notifications')
    .update({
      status: result.status,
      attempts: previousAttempts + 1,
      last_error: result.error ?? null,
      provider_id: result.id ?? null,
      sent_at: result.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) console.error('notification outbox update failed', error.message)
}

/** Run a notification job without ever letting it throw into the caller. */
async function guarded<T>(label: string, fallback: T, job: () => Promise<T>): Promise<T> {
  try {
    return await job()
  } catch (e) {
    console.error(`${label} failed`, e instanceof Error ? e.message : e)
    return fallback
  }
}

/* ---------------------- booking created: confirmation + invites ------------- */

export type BookingCreatedInput = {
  bookingId: string
  origin: string
  /** A guest's secret (their cancel token); null for members. */
  guestToken: string | null
  /** The token in the pass link: a member's read-only pass token, or the guest's own token. */
  passToken?: string | null
  /** An address the guest typed in this booking, if any. */
  guestEmail?: string | null
  paidNow: number
  /** Split only: one per other player, with their secret link and the address to send it to. */
  invites: { amount: number; path: string; email: string | null }[]
}

export async function notifyBookingCreated(input: BookingCreatedInput): Promise<{ confirmation: DeliverResult | null; invites: DeliverResult[] }> {
  return guarded('notifyBookingCreated', { confirmation: null, invites: [] }, async () => {
    const admin = getSupabaseAdmin()
    const ctx = await loadBookingContext(admin, input.bookingId)
    if (!ctx) return { confirmation: null, invites: [] }

    // Remember the guest's address: reminders and the cancellation notice need it later.
    if (input.guestEmail && ctx.booker.anonId) {
      await admin.from('anonymous_bookers').update({ email: input.guestEmail }).eq('id', ctx.booker.anonId)
      ctx.booker.email = input.guestEmail
    }

    // Invitations first, so the confirmation can say how many went out.
    const invites: DeliverResult[] = []
    for (const [i, invite] of input.invites.entries()) {
      if (!invite.email) continue
      const rendered = splitInviteEmail({
        ...ctx.facts,
        organizerName: ctx.booker.name,
        share: invite.amount,
        joinUrl: `${input.origin}${invite.path}`,
      })
      const sent = await sendRecorded(admin, {
        kind: 'split_invite',
        bookingId: ctx.bookingId,
        to: invite.email,
        rendered,
        dedupeKey: `split_invite:${ctx.bookingId}:${i + 2}`,
      })
      if (sent) invites.push(sent)
    }

    let confirmation: DeliverResult | null = null
    if (ctx.booker.email) {
      // The button always carries a token, so the pass opens without signing in (a member's is read-only).
      const passUrl = bookingPassUrl(input.origin, ctx.bookingId, input.passToken ?? input.guestToken)
      // The arrival code and its QR (an inline image) go in the confirmation of every open booking.
      const checkInCode = ctx.status === 'cancelled' ? null : ctx.checkInCode
      const rendered = confirmationEmail({
        ...ctx.facts,
        recipientName: ctx.booker.name,
        state: ctx.state,
        paidNow: input.paidNow,
        passUrl,
        cancelUrl: input.guestToken ? guestCancelUrl(input.origin, input.guestToken) : null,
        invitesEmailed: invites.filter((r) => r.status === 'sent').length,
        checkInCode,
      })
      if (checkInCode) {
        const png = await QRCode.toBuffer(checkInQrPayload(checkInCode), { type: 'png', margin: 1, width: 320 })
        rendered.attachments = [{ filename: 'check-in-qr.png', content: png, cid: CHECK_IN_QR_CID, contentType: 'image/png' }]
      }
      confirmation = await sendRecorded(admin, {
        kind: 'booking_confirmation',
        bookingId: ctx.bookingId,
        to: ctx.booker.email,
        dedupeKey: `booking_confirmation:${ctx.bookingId}`,
        rendered,
      })
    }
    return { confirmation, invites }
  })
}

/* ----------------------------- cancellation notice -------------------------- */

export async function notifyCancellation(input: { bookingId: string; by: 'you' | 'club' }): Promise<DeliverResult | null> {
  return guarded('notifyCancellation', null, async () => {
    const admin = getSupabaseAdmin()
    const ctx = await loadBookingContext(admin, input.bookingId)
    if (!ctx || ctx.status !== 'cancelled' || !ctx.booker.email) return null

    // The cancellation trigger has already marked what was paid as refunded.
    const refundAmount = ctx.paymentStatus === 'refunded' ? ctx.facts.amount : ctx.shares.refundedAmount
    const props: CancellationProps = {
      ...ctx.facts,
      recipientName: ctx.booker.name,
      reason: ctx.cancellationReason,
      refundAmount,
      cancelledBy: input.by,
    }
    return sendRecorded(admin, {
      kind: 'cancellation',
      bookingId: ctx.bookingId,
      to: ctx.booker.email,
      rendered: cancellationEmail(props),
      dedupeKey: `cancellation:${ctx.bookingId}`,
      payload: props as unknown as Json,
    })
  })
}

/* -------------------------------- reminders -------------------------------- */

export type BatchResult = { considered: number; sent: number; skipped: number; failed: number; noEmail: number; optedOut: number }
const emptyBatch = (): BatchResult => ({ considered: 0, sent: 0, skipped: 0, failed: 0, noEmail: 0, optedOut: 0 })

function tally(batch: BatchResult, result: DeliverResult | null) {
  if (result) batch[result.status] += 1
}

/**
 * Two-hour reminders. A booking is reminded once, as soon as it is within two hours
 * of starting (the cron runs every few minutes, so "about two hours"), unless it was
 * only made inside that window (a reminder would be noise) or starts in under 15
 * minutes. Safe to run as often as you like: `dedupe_key` stops a second send.
 */
export async function sendDueReminders(now: Date, origin: string): Promise<BatchResult> {
  const batch = emptyBatch()
  return guarded('sendDueReminders', batch, async () => {
    const admin = getSupabaseAdmin()
    const from = new Date(now.getTime() + REMINDER_MIN_LEAD_MS).toISOString()
    const to = new Date(now.getTime() + REMINDER_LEAD_MS).toISOString()

    const { data: due, error } = await admin
      .from('bookings')
      .select('id, starts_at, created_at')
      .in('status', ['pending_payment', 'confirmed'])
      .gte('starts_at', from)
      .lte('starts_at', to)
      .limit(200)
    if (error) throw new Error(error.message)

    for (const b of due ?? []) {
      // Booked inside the two-hour window: they know.
      if (Date.parse(b.created_at) > Date.parse(b.starts_at) - REMINDER_LEAD_MS) continue
      batch.considered += 1

      const ctx = await loadBookingContext(admin, b.id)
      if (!ctx?.booker.email) {
        batch.noEmail += 1
        continue
      }
      if (!ctx.booker.remindByEmail) {
        batch.optedOut += 1
        continue
      }
      const props: ReminderProps = {
        ...ctx.facts,
        recipientName: ctx.booker.name,
        state: ctx.state,
        dueAtClub: ctx.paymentStatus === 'pending' && ctx.paymentProvider === 'cash' ? ctx.facts.amount : 0,
        unpaidShares: ctx.shares.pending,
        // A guest's pass link needs their secret, which is not stored. Members sign in.
        passUrl: ctx.booker.isMember ? bookingPassUrl(origin, ctx.bookingId) : null,
      }
      tally(
        batch,
        await sendRecorded(admin, {
          kind: 'reminder_2h',
          bookingId: ctx.bookingId,
          to: ctx.booker.email,
          rendered: reminderEmail(props),
          dedupeKey: `reminder_2h:${ctx.bookingId}`,
          payload: props as unknown as Json,
        })
      )
    }
    return batch
  })
}

/* ---------------------------------- retries -------------------------------- */

/**
 * Retry emails that failed (or were left half-way) and carry no secret, so can be
 * re-rendered from their stored data. Confirmation and invite emails are not retried:
 * their links exist only in the request that created them.
 */
export async function retryFailedNotifications(now: Date): Promise<BatchResult> {
  const batch = emptyBatch()
  return guarded('retryFailedNotifications', batch, async () => {
    const admin = getSupabaseAdmin()
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const staleBefore = new Date(now.getTime() - PENDING_STALE_MS).toISOString()

    const { data: rows, error } = await admin
      .from('notifications')
      .select('id, kind, recipient, attempts, payload, status, created_at')
      .in('kind', ['cancellation', 'reminder_2h'])
      .in('status', ['failed', 'pending'])
      .lt('attempts', MAX_ATTEMPTS)
      .gte('created_at', since)
      .not('payload', 'is', null)
      .limit(100)
    if (error) throw new Error(error.message)

    for (const row of rows ?? []) {
      if (row.status === 'pending' && row.created_at > staleBefore) continue // still being sent
      batch.considered += 1
      const rendered =
        row.kind === 'cancellation'
          ? cancellationEmail(row.payload as unknown as CancellationProps)
          : reminderEmail(row.payload as unknown as ReminderProps)
      const result = await deliver({ to: row.recipient, type: row.kind, ...rendered })
      await finish(admin, row.id, row.attempts, result)
      tally(batch, result)
    }
    return batch
  })
}

/* ------------------------------ open matches ------------------------------- */

async function emailOf(admin: Admin, profileId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(profileId)
  return data.user?.email ?? null
}

const firstNameOf = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'Un joueur'

/** To the organiser: a player joined their open match. */
export async function notifyMatchJoined(input: { bookingId: string; joinerId: string; origin: string }): Promise<DeliverResult | null> {
  return guarded('notifyMatchJoined', null, async () => {
    const admin = getSupabaseAdmin()
    const [ctx, joiner, booking] = await Promise.all([
      loadBookingContext(admin, input.bookingId),
      admin.from('profiles').select('display_name').eq('id', input.joinerId).maybeSingle(),
      admin.from('bookings').select('open_spots').eq('id', input.bookingId).maybeSingle(),
    ])
    if (!ctx || !ctx.booker.isMember || !ctx.booker.email) return null
    return sendRecorded(admin, {
      kind: 'match_joined',
      bookingId: ctx.bookingId,
      to: ctx.booker.email,
      rendered: matchJoinedEmail({
        ...ctx.facts,
        recipientName: ctx.booker.name,
        joinerName: firstNameOf(joiner.data?.display_name),
        spotsLeft: booking.data?.open_spots ?? 0,
        passUrl: bookingPassUrl(input.origin, ctx.bookingId),
      }),
      dedupeKey: `match_joined:${ctx.bookingId}:${input.joinerId}:${Date.now()}`,
    })
  })
}

/** To every player still in a match that was just cancelled. */
export async function notifyMatchCancelled(input: { bookingId: string; origin: string }): Promise<number> {
  return guarded('notifyMatchCancelled', 0, async () => {
    const admin = getSupabaseAdmin()
    const ctx = await loadBookingContext(admin, input.bookingId)
    if (!ctx || ctx.status !== 'cancelled') return 0
    const { data: players, error } = await admin
      .from('match_players')
      .select('profile_id, profiles(display_name)')
      .eq('booking_id', input.bookingId)
      .is('left_at', null)
    if (error) throw new Error(error.message)

    let sent = 0
    for (const p of players ?? []) {
      const to = await emailOf(admin, p.profile_id)
      if (!to) continue
      const result = await sendRecorded(admin, {
        kind: 'match_cancelled',
        bookingId: ctx.bookingId,
        to,
        rendered: matchCancelledEmail({
          recipientName: firstNameOf(p.profiles?.display_name),
          clubName: ctx.facts.clubName,
          sport: ctx.facts.sport,
          date: ctx.facts.date,
          time: ctx.facts.time,
          exploreUrl: `${input.origin}/explore`,
        }),
        dedupeKey: `match_cancelled:${ctx.bookingId}:${p.profile_id}`,
      })
      if (result?.status === 'sent') sent += 1
    }
    return sent
  })
}

/* -------------------------------- tournaments ------------------------------- */

export async function notifyTournamentRegistration(input: { registrationId: string; origin: string }): Promise<DeliverResult | null> {
  return guarded('notifyTournamentRegistration', null, async () => {
    const admin = getSupabaseAdmin()
    const { data: reg } = await admin
      .from('tournament_registrations')
      .select('id, profile_id, team_name, tournaments(title, sport, starts_at, entry_fee, organizations(name)), profiles(display_name)')
      .eq('id', input.registrationId)
      .maybeSingle()
    const t = reg?.tournaments
    if (!reg || !t) return null
    const to = await emailOf(admin, reg.profile_id)
    if (!to) return null
    return sendRecorded(admin, {
      kind: 'tournament_registration',
      bookingId: null,
      to,
      rendered: tournamentRegistrationEmail({
        recipientName: firstNameOf(reg.profiles?.display_name),
        title: t.title,
        clubName: t.organizations?.name ?? 'Votre club',
        sport: t.sport,
        date: formatVenueDate(venueDateString(new Date(t.starts_at))),
        time: formatVenueTime(t.starts_at),
        entryFee: Number(t.entry_fee),
        teamName: reg.team_name,
        exploreUrl: `${input.origin}/explore#tournois`,
      }),
      dedupeKey: `tournament_registration:${reg.id}`,
    })
  })
}

export { emailEnabled }

/* ------------------------ queued by the autonomous agents ------------------- */

/** Kinds the agents queue (status 'queued', see supabase/functions/autonomous-agents). */
const AGENT_KINDS = ['attendance_request', 'auto_release', 'match_found', 'match_joined'] as const
const ATTENDANCE_DEADLINE_MS = 4 * 60 * 60 * 1000

type QueuedRow = { id: string; kind: NotificationKind; booking_id: string | null; recipient: string; attempts: number; payload: Json | null }
type QueuedPayload = { profile_id?: string; joiner_id?: string; spots_left?: number; request_id?: string }

/**
 * Render a queued row against the booking as it is NOW: an attendance request for a booking that was
 * since confirmed, paid or cancelled is skipped, as is a "partie trouvée" for a player who already left.
 * Null = nothing to send.
 */
async function renderQueued(admin: Admin, row: QueuedRow, origin: string): Promise<Rendered | null> {
  if (!row.booking_id) return null
  const payload = (row.payload ?? {}) as QueuedPayload
  const ctx = await loadBookingContext(admin, row.booking_id)
  if (!ctx) return null

  switch (row.kind) {
    case 'attendance_request': {
      const { data } = await admin.from('bookings').select('attendance_confirmed_at').eq('id', row.booking_id).maybeSingle()
      if (ctx.status !== 'pending_payment' || data?.attendance_confirmed_at || Date.parse(ctx.startsAt) <= Date.now()) return null
      return attendanceRequestEmail({
        ...ctx.facts,
        recipientName: firstNameOf(ctx.booker.name),
        deadline: formatVenueTime(new Date(Date.parse(ctx.startsAt) - ATTENDANCE_DEADLINE_MS).toISOString()),
        confirmUrl: bookingPassUrl(origin, ctx.bookingId),
      })
    }
    case 'auto_release':
      if (ctx.status !== 'cancelled') return null
      return autoReleaseEmail({ ...ctx.facts, recipientName: firstNameOf(ctx.booker.name), exploreUrl: `${origin}/explore` })
    case 'match_found': {
      if (!payload.profile_id || ctx.status === 'cancelled') return null
      const [seat, booking, profile] = await Promise.all([
        admin.from('match_players').select('seats').eq('booking_id', ctx.bookingId).eq('profile_id', payload.profile_id).is('left_at', null).maybeSingle(),
        admin.from('bookings').select('open_spots, player_count').eq('id', ctx.bookingId).maybeSingle(),
        admin.from('profiles').select('display_name').eq('id', payload.profile_id).maybeSingle(),
      ])
      if (!seat.data || !booking.data) return null
      return matchFoundEmail({
        recipientName: firstNameOf(profile.data?.display_name),
        clubName: ctx.facts.clubName,
        sport: ctx.facts.sport,
        date: ctx.facts.date,
        time: ctx.facts.time,
        seats: seat.data.seats,
        roster: `${booking.data.player_count - booking.data.open_spots}/${booking.data.player_count} joueurs`,
        exploreUrl: `${origin}/explore#parties-ouvertes`,
      })
    }
    case 'match_joined': {
      if (!payload.joiner_id || ctx.status === 'cancelled') return null
      const { data: joiner } = await admin.from('profiles').select('display_name').eq('id', payload.joiner_id).maybeSingle()
      return matchJoinedEmail({
        ...ctx.facts,
        recipientName: firstNameOf(ctx.booker.name),
        joinerName: firstNameOf(joiner?.display_name),
        spotsLeft: payload.spots_left ?? 0,
        passUrl: bookingPassUrl(origin, ctx.bookingId),
      })
    }
    default:
      return null
  }
}

/**
 * Deliver what the agents queued (and retry their failures, up to MAX_ATTEMPTS, for 24 h). Each row is
 * claimed first (queued/failed -> pending, conditional on its status), so two overlapping cron runs never
 * send the same email. Queued rows hold no secret: links are built here, from the booking id.
 */
export async function dispatchQueuedNotifications(now: Date, origin: string): Promise<BatchResult> {
  const batch = emptyBatch()
  return guarded('dispatchQueuedNotifications', batch, async () => {
    const admin = getSupabaseAdmin()
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: rows, error } = await admin
      .from('notifications')
      .select('id, kind, booking_id, recipient, attempts, payload, status')
      .in('kind', [...AGENT_KINDS])
      .or(`status.eq.queued,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
      .not('payload', 'is', null)
      .gte('created_at', since)
      .order('created_at')
      .limit(100)
    if (error) throw new Error(error.message)

    for (const row of rows ?? []) {
      const { data: claimed } = await admin
        .from('notifications')
        .update({ status: 'pending' })
        .eq('id', row.id)
        .eq('status', row.status)
        .select('id')
        .maybeSingle()
      if (!claimed) continue // another run took it
      batch.considered += 1

      const rendered = await renderQueued(admin, row, origin)
      const result: DeliverResult = rendered
        ? await deliver({ to: row.recipient, type: row.kind, ...rendered })
        : { status: 'skipped', error: 'no longer relevant' }
      await finish(admin, row.id, row.attempts, result)
      tally(batch, result)
    }
    return batch
  })
}
