/**
 * The 3/4 matchmaker's choices, as pure functions (no Deno, no network): unit-tested from
 * tests/matchmaking.spec.ts. The database re-checks every rule in fulfil_match_request() under a row
 * lock, so this only decides the ORDER in which to try matches; it can never seat anyone on its own.
 */

/** One open search, as matchmaker_snapshot() returns it. */
export interface SnapshotRequest {
  id: string
  requester_id: string
  sport: string
  /** Places the requester needs (1 alone, 2 with a partner...). */
  required_players: number
  skill_level_min: number
  skill_level_max: number
  window_start: string
  window_end: string
  created_at: string
  /** The requester's own Niveau 1-5, when they gave it. */
  player_level: number | null
}

/** One open match (a booking with free places). */
export interface SnapshotMatch {
  booking_id: string
  sport: string
  starts_at: string
  open_spots: number
  player_count: number
  /** The organiser's wanted range; both null = every level welcome. */
  open_level_min: number | null
  open_level_max: number | null
  booker_profile_id: string | null
  member_ids: string[]
}

/** The same rules as fulfil_match_request(), minus the ones only the database can know (status, lead time). */
export function isCompatible(r: SnapshotRequest, m: SnapshotMatch): boolean {
  if (m.sport !== r.sport || m.open_spots < r.required_players) return false
  const start = Date.parse(m.starts_at)
  if (start < Date.parse(r.window_start) || start > Date.parse(r.window_end)) return false
  if (m.booker_profile_id === r.requester_id || m.member_ids.includes(r.requester_id)) return false
  if (m.open_level_min !== null && m.open_level_max !== null) {
    if (r.skill_level_max < m.open_level_min || r.skill_level_min > m.open_level_max) return false
    if (r.player_level !== null && (r.player_level < m.open_level_min || r.player_level > m.open_level_max)) return false
  }
  return true
}

/**
 * Best first: a match this request COMPLETES (3/4 -> 4/4) before one it only fills further, then the
 * closest level (the middle of the wanted range against the player's own level), then the soonest start.
 */
export function rankCandidates(r: SnapshotRequest, matches: SnapshotMatch[]): SnapshotMatch[] {
  const levelGap = (m: SnapshotMatch) =>
    r.player_level === null || m.open_level_min === null || m.open_level_max === null
      ? 0
      : Math.abs((m.open_level_min + m.open_level_max) / 2 - r.player_level)
  return matches
    .filter((m) => isCompatible(r, m))
    .sort(
      (a, b) =>
        Number(a.open_spots !== r.required_players) - Number(b.open_spots !== r.required_players) ||
        levelGap(a) - levelGap(b) ||
        Date.parse(a.starts_at) - Date.parse(b.starts_at)
    )
}

/** After a successful seat: the local copy reflects it, so the next request sees the right free places. */
export function applySeat(m: SnapshotMatch, r: SnapshotRequest): void {
  m.open_spots -= r.required_players
  m.member_ids = [...m.member_ids, r.requester_id]
}

/** RPC errors that only mean "try the next match" (the snapshot was stale). */
export const RETRYABLE_FULFIL_ERRORS = new Set(['match_full', 'match_closed', 'not_compatible', 'already_joined'])
