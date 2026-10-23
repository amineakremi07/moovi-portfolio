import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache'
import type { Club } from '@/lib/clubs'
import { loadClubs } from '@/lib/clubs-loader'
import { navigationLinks } from '@/lib/club-profile'
import { loadLiveAvailability, type LiveAvailability } from '@/lib/live-availability'
import { levelFor, type LevelProgress } from '@/lib/player-level'
import { computePlayerStats, type PlayerStats } from '@/lib/player-stats'
import { loadRebookSuggestions, type RebookSuggestion } from '@/lib/rebook-loader'
import { loadWeather } from '@/lib/weather'
import type { WeatherAdvice } from '@/lib/weather-advice'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { playerCourtLabel } from '@/lib/time-slots'
import type { BookingStatus, CheckInStatus, Database, PaymentProvider, PaymentStatus, Sport, UserRole } from '@/lib/types/database'

/**
 * Everything the player home (`/explore`) shows, for the signed-in user only. Reads run as the
 * user (RLS: own profile, own bookings, own club's courts) except the public club list, the
 * re-book availability (anon reads of public data), the next booking's payment record (service
 * role, for a booking id the user's own RLS read returned: players have no SELECT on payments) and
 * the cached match history (service role, filtered on the id from the verified session).
 */

/** Up to this many "Réserver à nouveau" suggestions on the home. */
const MAX_REBOOK = 3
/** Past bookings scanned for re-book patterns (most recent first). */
const HISTORY_SCAN = 50

export interface NextBooking {
  id: string
  clubName: string
  /** The assigned court, or "Attribution à l'arrivée" while the club has not assigned one. */
  courtLabel: string
  courtPending: boolean
  sport: Sport
  startsAt: string
  endsAt: string
  status: BookingStatus
  playerCount: number
  checkInCode: string | null
  /** 'awaiting_confirmation' while the club's H-4 agent waits for "je confirme ma venue". */
  checkInStatus: CheckInStatus
  reference: string
  /** Total in TND (null when no payment record could be read). */
  price: number | null
  paymentStatus: PaymentStatus | null
  paymentProvider: PaymentProvider | null
  /** Club address for the calendar event; turn-by-turn links when the club has a pin or an address. */
  address: string | null
  navigation: { google: string } | null
}

export interface RebookItem extends RebookSuggestion {
  sourceBookingId: string
}

/**
 * The club highlighted on /explore: where the player last booked ("Dernier club visité"), with a
 * one-tap re-book of that booking's sport + time when it has a free date; or, for a player with no
 * booking yet, a featured club (one with a cover photo and the most courts).
 */
export interface LastClub {
  club: Club
  kind: 'visited' | 'featured'
  /** Start of the booking it comes from (visited only). */
  lastPlayedAt: string | null
  rebook: RebookSuggestion | null
}

export interface PlayerHome {
  role: UserRole | null
  /** Null when the profile has none (the page falls back to the e-mail). */
  displayName: string | null
  lastClub: LastClub | null
  /** Other upcoming bookings after the next one (for the "N autres" link). */
  upcomingCount: number
  nextBooking: NextBooking | null
  rebook: RebookItem[]
  trust: { noShowCount: number; trustScore: number; suspendedUntil: string | null }
  clubs: Club[]
  clubsFailed: boolean
  /** Activity summary from the most recent past bookings. */
  stats: PlayerStats
  /** Level from every match played (count query). */
  level: LevelProgress
  /** Courts open and free right now, per sport (empty when it could not be read). */
  live: LiveAvailability
  /** Outdoor-play hint near the player's club (null when the weather could not be read). */
  weather: WeatherAdvice | null
  /** Bookings could not be read: the cards say so instead of claiming "nothing booked". */
  bookingsFailed: boolean
}

function reference(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

type HistoryRow = { id: string; org_id: string; sport: Sport; status: BookingStatus; starts_at: string; player_count: number }

/**
 * The matches a player has already played (newest first, for stats and re-book) and how many count for
 * the level. Cached per player (tag `player:<id>`) and keyed on the ids of their upcoming bookings: when
 * a match ends it leaves that list, the key changes and the history is read again; a status change made
 * by staff (absence, check-in, payment) drops the tag. Service role, but only ever for `userId`, which
 * comes from the verified session. A failed read throws, so it is not cached.
 */
function loadPlayedHistory(userId: string, upcomingKey: string): Promise<{ history: HistoryRow[]; played: number }> {
  return unstable_cache(
    async () => {
      const admin = getSupabaseAdmin()
      const nowIso = new Date().toISOString()
      const [historyRes, playedRes] = await Promise.all([
        admin
          .from('bookings')
          .select('id, org_id, sport, status, starts_at, player_count')
          .eq('booker_profile_id', userId)
          .neq('status', 'cancelled')
          .lte('ends_at', nowIso)
          .order('starts_at', { ascending: false })
          .limit(HISTORY_SCAN),
        // Every match played (a head count, no rows): the level. Cancelled, unpaid and no-show bookings earn nothing.
        admin
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('booker_profile_id', userId)
          .in('status', ['confirmed', 'completed'])
          .lte('ends_at', nowIso),
      ])
      if (historyRes.error || playedRes.error) throw new Error(historyRes.error?.message ?? playedRes.error?.message)
      return { history: historyRes.data, played: playedRes.count ?? 0 }
    },
    ['player-history', userId, upcomingKey],
    { revalidate: CACHE_TTL.player, tags: [CACHE_TAGS.player(userId)] }
  )()
}

/**
 * `userId` may be the proxy's hint (lib/session-hint.ts) while getUser() is still running: the cookie-bound
 * reads start at once, and the service-role history read waits for `verified` (true when getUser() returned
 * this same id), so it never runs for an id the auth server has not confirmed.
 */
export async function loadPlayerHome(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date,
  verified: Promise<boolean>,
  /** A booking to lead with instead of the soonest one (just booked: `/explore?reservation=`). */
  focusBookingId: string | null = null
): Promise<PlayerHome> {
  const nowIso = now.toISOString()
  const upcomingP = supabase
    .from('bookings')
    .select('id, org_id, court_id, court_pending, sport, starts_at, ends_at, status, player_count, check_in_code, check_in_status, organizations(name, address, city, latitude, longitude), courts(name)')
    .eq('booker_profile_id', userId)
    .in('status', ['pending_payment', 'confirmed'])
    .gt('ends_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(20)
  const historyP = Promise.all([upcomingP, verified]).then(([res, ok]) =>
    (ok ? loadPlayedHistory(userId, (res.data ?? []).map((b) => b.id).join(',')) : Promise.reject(new Error('session not verified'))).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error: { message: error instanceof Error ? error.message : String(error) } })
    )
  )
  const [profileRes, upcomingRes, historyRes, clubsRes, live] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, display_name, last_visited_club_id, no_show_count, trust_score, is_suspended, suspended_until')
      .eq('id', userId)
      .maybeSingle(),
    upcomingP,
    historyP,
    loadClubs(),
    loadLiveAvailability(),
  ])

  const profile = profileRes.data
  const bookingsFailed = Boolean(upcomingRes.error || historyRes.error)
  if (bookingsFailed) {
    console.error('loadPlayerHome: bookings failed', upcomingRes.error?.message ?? historyRes.error?.message)
  }

  const upcoming = upcomingRes.data ?? []
  const history = historyRes.data?.history ?? []
  // The ticket shows the booking just made when there is one; otherwise the soonest.
  const first = (focusBookingId && upcoming.find((b) => b.id === focusBookingId)) || upcoming[0]
  const isPlayer = profile?.role === 'player'
  // "Dernier club visité": the club the database records on every booking (last_visited_club_id), else the
  // most recent booking's (last match played, else the next one). Players book at any club.
  const latest = history[0] ?? upcoming[0] ?? null
  const latestClubId = profile?.last_visited_club_id ?? latest?.org_id ?? null
  const latestClub = (latestClubId && clubsRes.clubs.find((c) => c.id === latestClubId)) || null
  // The club of the next booking, embedded in it (any club; RLS lets a player read the clubs they booked at).
  const org = first?.organizations ?? null

  // The next booking's payment (service role, this booking only) and the re-book search, together.
  // Weather near the club the player is most likely to play at: the next match's, else the last one.
  const weatherPoint =
    org?.latitude != null && org.longitude != null
      ? { lat: org.latitude, lng: org.longitude }
      : latestClub?.latitude != null && latestClub.longitude != null
        ? { lat: latestClub.latitude, lng: latestClub.longitude }
        : null

  const [paymentRes, suggestions, weather] = await Promise.all([
    first
      ? getSupabaseAdmin()
          .from('payment_records')
          .select('amount, status, provider')
          .eq('booking_id', first.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { amount: number; status: PaymentStatus; provider: PaymentProvider } | null }),
    isPlayer && latestClub
      ? loadRebookSuggestions(
          latestClub.id,
          history.map((b) => ({ id: b.id, orgId: b.org_id, sport: b.sport, startsAt: b.starts_at, playerCount: b.player_count }))
        )
      : Promise.resolve(new Map<string, RebookSuggestion>()),
    loadWeather(weatherPoint),
  ])

  const address = [org?.address, org?.city].filter(Boolean).join(', ') || null
  const nextBooking: NextBooking | null = first
    ? {
        id: first.id,
        clubName: org?.name ?? 'Votre club',
        courtLabel: playerCourtLabel(first.courts?.name, first.court_pending),
        courtPending: first.court_pending,
        sport: first.sport,
        startsAt: first.starts_at,
        endsAt: first.ends_at,
        status: first.status,
        playerCount: first.player_count,
        checkInCode: first.check_in_code,
        checkInStatus: first.check_in_status,
        reference: reference(first.id),
        price: paymentRes.data ? Number(paymentRes.data.amount) : null,
        paymentStatus: paymentRes.data?.status ?? null,
        paymentProvider: paymentRes.data?.provider ?? null,
        address,
        navigation: navigationLinks({ latitude: org?.latitude ?? null, longitude: org?.longitude ?? null, address }),
      }
    : null

  // One suggestion per pattern, most recent pattern first (the history is newest first).
  const rebook: RebookItem[] = []
  const seen = new Set<string>()
  for (const b of history) {
    const s = suggestions.get(b.id)
    if (!s || seen.has(s.startsAt + s.sport)) continue
    seen.add(s.startsAt + s.sport)
    rebook.push({ ...s, sourceBookingId: b.id })
    if (rebook.length === MAX_REBOOK) break
  }

  const played = history
    .filter((b) => b.status === 'confirmed' || b.status === 'completed')
    .map((b) => ({ sport: b.sport, startsAt: b.starts_at }))
  const stats = computePlayerStats(played, now)

  return {
    role: (profile?.role as UserRole | undefined) ?? null,
    displayName: profile?.display_name || null,
    lastClub: latestClub
      ? {
          club: latestClub,
          kind: 'visited',
          lastPlayedAt: latest?.starts_at ?? null,
          rebook: history.map((b) => suggestions.get(b.id)).find((sug) => sug?.orgId === latestClub.id) ?? null,
        }
      : featuredClub(clubsRes.clubs),
    upcomingCount: Math.max(0, upcoming.length - 1),
    nextBooking,
    rebook,
    trust: {
      noShowCount: profile?.no_show_count ?? 0,
      trustScore: profile?.trust_score ?? 100,
      suspendedUntil: profile?.is_suspended ? (profile.suspended_until ?? null) : null,
    },
    clubs: clubsRes.clubs,
    clubsFailed: clubsRes.failed,
    stats,
    level: levelFor(Math.max(historyRes.data?.played ?? 0, played.length)),
    live,
    weather,
    bookingsFailed,
  }
}

/** A player with no booking yet: a club with a cover photo first, then the one with the most courts. */
function featuredClub(clubs: Club[]): LastClub | null {
  const club = [...clubs].sort((a, b) => Number(Boolean(b.coverUrl)) - Number(Boolean(a.coverUrl)) || b.totalCourts - a.totalCourts)[0]
  return club ? { club, kind: 'featured', lastPlayedAt: null, rebook: null } : null
}
