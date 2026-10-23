import { levelRange, type MatchRequestCard, type MatchRoster, type OpenMatch, type TournamentCard } from '@/lib/community'
import type { SkillLevel } from '@/lib/types/database'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Open matches and upcoming tournaments for the player home. Server only. Service role, through
 * list_open_matches / list_tournaments, which return safe fields only; `viewerId` MUST come from the
 * verified session (it decides "joined" / "registered" and hides the viewer's own matches).
 * A failed read is reported (`failed`), never shown as "nothing open".
 */
export async function loadCommunity(viewerId: string): Promise<{
  matches: OpenMatch[]
  tournaments: TournamentCard[]
  matchesFailed: boolean
  tournamentsFailed: boolean
}> {
  const admin = getSupabaseAdmin()
  const [matchesRes, tournamentsRes] = await Promise.all([
    admin.rpc('list_open_matches', { p_viewer: viewerId, p_limit: 24 }),
    admin.rpc('list_tournaments', { p_viewer: viewerId, p_limit: 12 }),
  ])
  if (matchesRes.error) console.error('loadCommunity: open matches failed', matchesRes.error.message)
  if (tournamentsRes.error) console.error('loadCommunity: tournaments failed', tournamentsRes.error.message)

  return {
    matches: (matchesRes.data ?? []).map((m) => ({
      bookingId: m.booking_id,
      orgId: m.org_id,
      clubName: m.club_name,
      city: m.city,
      sport: m.sport,
      startsAt: m.starts_at,
      endsAt: m.ends_at,
      playerCount: m.player_count,
      openSpots: m.open_spots,
      level: levelRange(m.open_level_min, m.open_level_max),
      note: m.open_note,
      organizer: m.organizer_first_name,
      pricePerPlayer: m.price_per_player === null ? null : Number(m.price_per_player),
      joined: m.joined,
    })),
    tournaments: (tournamentsRes.data ?? []).map((t) => ({
      id: t.id,
      orgId: t.org_id,
      clubName: t.club_name,
      city: t.city,
      title: t.title,
      description: t.description,
      prize: t.prize,
      coverUrl: null,
      sport: t.sport,
      startsAt: t.starts_at,
      registrationDeadline: t.registration_deadline,
      entryFee: Number(t.entry_fee),
      teamSize: t.team_size,
      maxTeams: t.max_teams,
      registeredCount: t.registered_count,
      registered: t.registered,
    })),
    matchesFailed: Boolean(matchesRes.error),
    tournamentsFailed: Boolean(tournamentsRes.error),
  }
}

/** `bookingId` must be one the caller owns (lib/pass.ts resolved the viewer as `owner`). */
export async function loadMatchRoster(bookingId: string): Promise<MatchRoster | null> {
  const admin = getSupabaseAdmin()
  const [bookingRes, playersRes] = await Promise.all([
    admin.from('bookings').select('open_spots, open_level_min, open_level_max, open_note').eq('id', bookingId).maybeSingle(),
    admin
      .from('match_players')
      .select('joined_at, seats, profiles(display_name)')
      .eq('booking_id', bookingId)
      .is('left_at', null)
      .order('joined_at'),
  ])
  if (bookingRes.error || playersRes.error || !bookingRes.data) {
    if (bookingRes.error || playersRes.error) console.error('loadMatchRoster failed', bookingRes.error?.message ?? playersRes.error?.message)
    return null
  }
  return {
    openSpots: bookingRes.data.open_spots,
    level: levelRange(bookingRes.data.open_level_min, bookingRes.data.open_level_max),
    note: bookingRes.data.open_note,
    players: (playersRes.data ?? []).map((p) => ({
      firstName: (p.profiles?.display_name ?? '').trim().split(/\s+/)[0] || 'Joueur',
      joinedAt: p.joined_at,
      seats: p.seats,
    })),
  }
}

/**
 * The viewer's matchmaker searches: open ones, and those matched or expired in the last 24 h (so the widget
 * can say "partie trouvée"). `viewerId` MUST come from the verified session. Null on a failed read.
 */
export async function loadMatchRequests(viewerId: string, now: Date): Promise<{ requests: MatchRequestCard[]; playerLevel: SkillLevel | null } | null> {
  const admin = getSupabaseAdmin()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const [requestsRes, profileRes] = await Promise.all([
    admin
      .from('match_requests')
      .select('id, sport, status, required_players, skill_level_min, skill_level_max, window_start, window_end, matched_at, bookings(starts_at, ends_at, organizations(name))')
      .eq('requester_id', viewerId)
      .or(`status.eq.open,and(status.in.(matched,expired),updated_at.gte.${since})`)
      .order('created_at', { ascending: false })
      .limit(6),
    admin.from('profiles').select('skill_level').eq('id', viewerId).maybeSingle(),
  ])
  if (requestsRes.error || profileRes.error) {
    console.error('loadMatchRequests failed', requestsRes.error?.message ?? profileRes.error?.message)
    return null
  }
  return {
    playerLevel: profileRes.data?.skill_level ?? null,
    requests: (requestsRes.data ?? []).map((r) => ({
      id: r.id,
      sport: r.sport,
      status: r.status,
      requiredPlayers: r.required_players,
      level: { min: r.skill_level_min, max: r.skill_level_max },
      windowStart: r.window_start,
      windowEnd: r.window_end,
      match: r.bookings ? { startsAt: r.bookings.starts_at, endsAt: r.bookings.ends_at, clubName: r.bookings.organizations?.name ?? 'Club' } : null,
    })),
  }
}
