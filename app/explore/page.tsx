import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { TrustBanner } from '@/components/booking/trust-banner'
import { ExploreShell } from '@/components/explore/explore-shell'
import { MatchmakingWidget } from '@/components/player/matchmaking-widget'
import { NextBookingCard } from '@/components/player/next-booking-card'
import { PlayerLevelBanner, PlayerProfileCard } from '@/components/player/player-profile-card'
import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { QuickBookCard } from '@/components/player/quick-book-card'
import { TournamentsWidget } from '@/components/player/tournaments-widget'
import { WeatherBadge } from '@/components/player/weather-badge'
import { BOOKING_PATH, landingPathFor } from '@/lib/auth-landing'
import { loadCommunity, loadMatchRequests } from '@/lib/community-loader'
import { venueDateString } from '@/lib/court-time'
import { loadPlayerHome } from '@/lib/player-home-loader'
import { sessionUserHint } from '@/lib/session-hint'
import { createClient } from '@/lib/supabase/server'

/** Personal and live: never prerendered or cached. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Explorer', robots: { index: false } }

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => new Date()

/**
 * The player home, where players land after signing in. Main column: greeting with the weather hint,
 * the next match (or, with nothing booked, a hero to book or join a game), then search, filters, open
 * matches and every club. Sidebar (after the clubs on phones and tablets): level, tournaments, quick
 * re-book with the last club. The proxy already sends signed-out
 * visitors to /login; the checks here are the second lock, and club / admin accounts are sent to their
 * own area.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ExplorePage({ searchParams }: { searchParams?: Promise<{ reservation?: string }> }) {
  // Just booked on a club page: its ticket leads the home (only if it is one of this player's bookings).
  const asked = (await searchParams)?.reservation
  const focus = asked && UUID.test(asked) ? asked : null
  const supabase = await createClient()
  const now = readClock()
  // The home's reads start on the proxy's verified id while getUser() runs (lib/session-hint.ts).
  const hint = await sessionUserHint()
  const userP = supabase.auth.getUser().then((res) => res.data.user)
  const early = hint ? loadPlayerHome(supabase, hint, now, userP.then((u) => u?.id === hint), focus) : null
  void early?.catch(() => null)

  const user = await userP
  if (!user) redirect(`/login?redirect=${encodeURIComponent(BOOKING_PATH)}`)

  // Open matches and tournaments: service-role reads, so only for the id getUser() has just verified.
  const communityP = loadCommunity(user.id)
  const searchesP = loadMatchRequests(user.id, now)
  const home = early && hint === user.id ? await early : await loadPlayerHome(supabase, user.id, now, Promise.resolve(true), focus)
  if (home.role && home.role !== 'player') redirect(landingPathFor(home.role))

  const firstName = (home.displayName || user.email?.split('@')[0] || 'joueur').trim().split(/\s+/)[0]
  // Without the bookings, the level would read "Débutant" for everyone: show nothing instead.
  const progress = home.bookingsFailed ? null : { level: home.level, stats: home.stats }
  const [community, searches] = await Promise.all([communityP, searchesP])
  // Tournament cards wear their club's cover photo.
  const covers = new Map(home.clubs.map((c) => [c.id, c.coverUrl]))
  const tournaments = community.tournaments.map((t) => ({ ...t, coverUrl: covers.get(t.orgId) ?? null }))
  const openCount = community.matches.filter((m) => !m.joined && m.openSpots > 0).length

  return (
    <>
      <ExploreShell
        clubs={home.clubs}
        loadFailed={home.clubsFailed}
        live={home.live}
        matches={community.matches}
        matchesFailed={community.matchesFailed}
        top={
          <>
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Bonjour {firstName}</h2>
              <WeatherBadge weather={home.weather} />
            </header>
            {progress && <PlayerLevelBanner {...progress} />}
            <TrustBanner
              noShowCount={home.trust.noShowCount}
              trustScore={home.trust.trustScore}
              suspendedUntil={home.trust.suspendedUntil}
              now={now.getTime()}
            />
            <NextBookingCard
              booking={home.nextBooking}
              moreCount={home.upcomingCount}
              failed={home.bookingsFailed}
              openCount={openCount}
              justBooked={Boolean(focus && home.nextBooking?.id === focus)}
            />
          </>
        }
        sidebar={
          <>
            {progress && <PlayerProfileCard {...progress} className="hidden md:block" />}
            <MatchmakingWidget
              viewerId={user.id}
              today={venueDateString(now)}
              requests={searches?.requests ?? []}
              playerLevel={searches?.playerLevel ?? null}
              failed={!searches}
            />
            <TournamentsWidget tournaments={tournaments} failed={community.tournamentsFailed} />
            <QuickBookCard items={home.rebook} lastClub={home.lastClub} />
          </>
        }
      />
      <PlayerTabBar current="explore" />
    </>
  )
}
