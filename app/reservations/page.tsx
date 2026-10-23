import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ReservationCard, type Reservation } from '@/components/booking/reservation-card'
import { TrustBanner } from '@/components/booking/trust-banner'
import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { navigationLinks } from '@/lib/club-profile'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { loadRebookSuggestions } from '@/lib/rebook-loader'
import { playerCourtLabel } from '@/lib/time-slots'
import { sessionUserHint } from '@/lib/session-hint'
import { createClient } from '@/lib/supabase/server'
import type { Sport } from '@/lib/types/database'
import { matchShareLink } from '@/lib/whatsapp'

/** Personal and live: never prerendered or cached. */
export const dynamic = 'force-dynamic'

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => Date.now()

export const metadata = { title: 'Mes réservations' }

/** "Partager le match" on WhatsApp: sport, club, when, address and Google Maps directions. */
function shareLinkFor(
  b: { sport: string; starts_at: string; ends_at: string },
  org: { name: string; address: string | null; city: string | null; latitude: number | null; longitude: number | null } | null
): string {
  const address = [org?.address, org?.city].filter(Boolean).join(', ') || null
  return matchShareLink({
    sport: b.sport as Sport,
    clubName: org?.name ?? 'le club',
    date: formatVenueDate(venueDateString(new Date(b.starts_at))),
    time: `${formatVenueTime(b.starts_at)}–${formatVenueTime(b.ends_at)}`,
    address,
    mapsUrl: navigationLinks({ latitude: org?.latitude ?? null, longitude: org?.longitude ?? null, address })?.google ?? null,
  })
}

const OPEN_STATUSES = ['pending_payment', 'confirmed'] as const
/** Each list is capped on its own: the newest past matches, and every upcoming one a player could hold. */
const LIST_LIMIT = 50

/**
 * The profile and both lists (each booking with its own club and court embedded) in ONE round trip. Upcoming
 * and past are separate queries, both on the (booker_profile_id, starts_at desc) index, and only the upcoming
 * one pays for the club address (its WhatsApp share link). Players book at any club: the club comes from each
 * booking. RLS: a player sees their own bookings, and the clubs and courts of those bookings, everywhere.
 */
function readReservations(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, now: number) {
  const nowIso = new Date(now).toISOString()
  return Promise.all([
    supabase.from('profiles').select('role, last_visited_club_id, no_show_count, trust_score, is_suspended, suspended_until').eq('id', userId).maybeSingle(),
    supabase
      .from('bookings')
      .select(
        'id, org_id, court_pending, sport, starts_at, ends_at, player_count, status, cancellation_deadline, cancellation_reason, organizations(name, address, city, latitude, longitude), courts(name)'
      )
      .eq('booker_profile_id', userId)
      .in('status', OPEN_STATUSES)
      .gt('ends_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(LIST_LIMIT),
    supabase
      .from('bookings')
      .select('id, org_id, court_pending, sport, starts_at, ends_at, player_count, status, cancellation_deadline, cancellation_reason, organizations(name), courts(name)')
      .eq('booker_profile_id', userId)
      .or(`status.not.in.(${OPEN_STATUSES.join(',')}),ends_at.lte."${nowIso}"`)
      .order('starts_at', { ascending: false })
      .limit(LIST_LIMIT),
  ])
}

type ReservationRow = {
  id: string
  court_pending: boolean
  sport: string
  starts_at: string
  ends_at: string
  player_count: number
  status: Reservation['status']
  cancellation_deadline: string
  cancellation_reason: string | null
  organizations: { name: string } | null
  courts: { name: string } | null
}

/** `upcoming`: the row came from the upcoming query (open, not over yet). */
function toReservation(b: ReservationRow, now: number, upcoming: boolean, shareUrl: string | null): Reservation {
  return {
    id: b.id,
    clubName: b.organizations?.name ?? 'Club',
    courtName: playerCourtLabel(b.courts?.name, b.court_pending),
    sport: b.sport as Sport,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    playerCount: b.player_count,
    status: b.status,
    reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    upcoming,
    canCancel: upcoming && now < Date.parse(b.cancellation_deadline),
    cancelDeadline: b.cancellation_deadline,
    cancellationReason: b.cancellation_reason,
    shareUrl,
  }
}

export default async function ReservationsPage() {
  const supabase = await createClient()
  const now = readClock()
  // The reads start on the proxy's verified id while getUser() runs (lib/session-hint.ts); they are kept only
  // if getUser() confirms that id.
  const hint = await sessionUserHint()
  const userP = supabase.auth.getUser().then((res) => res.data.user)
  const early = hint ? readReservations(supabase, hint, now) : null
  void early?.catch(() => null)

  const user = await userP
  if (!user) redirect('/register?role=player&next=/reservations')

  const [profileRes, upcomingRes, historyRes] = early && hint === user.id ? await early : await readReservations(supabase, user.id, now)
  const profile = profileRes.data
  if (profile?.role === 'org_admin' || profile?.role === 'staff') redirect('/dashboard/org/bookings')
  if (profile?.role === 'platform_admin') redirect('/admin/verification')

  const failed = upcomingRes.error ?? historyRes.error
  if (failed) {
    console.error('Failed to load reservations:', { code: failed.code, message: failed.message })
    return (
      <Shell>
        <div role="alert" className="rounded-xl bg-card px-6 py-10 text-center text-sm">
          Impossible de charger vos réservations. Veuillez actualiser la page dans un instant.
        </div>
      </Shell>
    )
  }

  const upcoming = (upcomingRes.data ?? []).map((b) => toReservation(b, now, true, shareLinkFor(b, b.organizations ?? null)))
  const history = (historyRes.data ?? []).map((b) => toReservation(b, now, false, null))
  const orgOf = new Map((historyRes.data ?? []).map((b) => [b.id, b.org_id]))
  const bookAgainHref = profile?.last_visited_club_id ? `/courts/${profile.last_visited_club_id}` : '/explore'

  return (
    <Shell>
      <TrustBanner
        noShowCount={profile?.no_show_count ?? 0}
        trustScore={profile?.trust_score ?? 100}
        suspendedUntil={profile?.is_suspended ? (profile.suspended_until ?? null) : null}
        now={now}
      />
      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          À venir
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl bg-card px-6 py-10 text-center">
            <p className="font-medium">Aucune réservation à venir</p>
            <Link href={bookAgainHref} className="mt-2 inline-block text-sm underline-offset-4 hover:underline">
              Réserver un terrain
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="mt-10 space-y-3">
          <h2 id="history-heading" className="text-lg font-semibold">
            Passées et annulées
          </h2>
          {profile?.role === 'player' ? (
            // The re-book search scans each club's free slots: the list shows at once, its buttons stream in.
            <Suspense fallback={<ReservationList items={history} />}>
              <HistoryWithRebook items={history} orgOf={orgOf} />
            </Suspense>
          ) : (
            <ReservationList items={history} />
          )}
        </section>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Profil, rappels et suppression du compte : <Link href="/settings" className="underline underline-offset-4">Paramètres</Link>.
      </p>
    </Shell>
  )
}

function ReservationList({ items }: { items: Reservation[] }) {
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <ReservationCard key={r.id} reservation={r} />
      ))}
    </ul>
  )
}

/**
 * "Réserver à nouveau" on past matches (not cancelled ones), at whichever club they were played: every past
 * match whose sport + weekday + time has a free date gets the button. Up to 3 clubs, most recent first.
 * Any failure renders the list without buttons.
 */
async function HistoryWithRebook({ items, orgOf }: { items: Reservation[]; orgOf: Map<string, string> }) {
  const played = items.filter((r) => r.status !== 'cancelled')
  const clubs = [...new Set(played.map((r) => orgOf.get(r.id)).filter((id): id is string => Boolean(id)))].slice(0, 3)
  const source = played.map((r) => ({ id: r.id, orgId: orgOf.get(r.id) ?? '', sport: r.sport, startsAt: r.startsAt, playerCount: r.playerCount }))
  const perClub = await Promise.all(clubs.map((orgId) => loadRebookSuggestions(orgId, source))).catch((error: unknown) => {
    console.error('Re-book suggestions failed:', error instanceof Error ? error.message : error)
    return []
  })
  const withRebook = items.map((r) =>
    r.status === 'cancelled' ? r : { ...r, rebook: perClub.map((m) => m.get(r.id)).find(Boolean) ?? null }
  )
  return <ReservationList items={withRebook} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[1920px] px-4 pb-28 pt-8 sm:px-6 md:pt-24 lg:px-8 xl:px-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-8 text-3xl font-semibold tracking-tight">Mes réservations</h1>
          {children}
        </div>
      </main>
      <PlayerTabBar current="reservations" />
    </>
  )
}
