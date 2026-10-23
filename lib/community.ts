import type { MatchRequestStatus, SkillLevel, Sport } from '@/lib/types/database'

/**
 * Open matches ("Rejoindre une partie") and club tournaments ("Tournois & Événements"): the shapes the
 * player home shows and the plain helpers around them. Pure (no server imports), so it is unit-tested.
 * The data comes from list_open_matches / list_tournaments (lib/community-loader.ts).
 */

export interface OpenMatch {
  bookingId: string
  orgId: string
  clubName: string
  city: string | null
  sport: Sport
  startsAt: string
  endsAt: string
  playerCount: number
  /** Places still free. */
  openSpots: number
  /** The wanted range, Niveau 1-5 (null = every level). */
  level: LevelRange | null
  note: string | null
  /** First name only: never a phone, e-mail or full name. */
  organizer: string | null
  /** The total split evenly, paid at the club (null when unknown). */
  pricePerPlayer: number | null
  /** The viewer already joined this match. */
  joined: boolean
}

export interface TournamentCard {
  id: string
  orgId: string
  clubName: string
  city: string | null
  title: string
  description: string | null
  /** What the winners get, as the club wrote it. */
  prize: string | null
  /** The club's cover photo (the card's background), or null. */
  coverUrl: string | null
  sport: Sport
  startsAt: string
  registrationDeadline: string
  /** TND, paid at the club. */
  entryFee: number
  teamSize: number
  maxTeams: number
  registeredCount: number
  /** The viewer is registered. */
  registered: boolean
}

/** The organiser's side of their own match (the pass page): places on offer and who joined (first names). */
export interface MatchRoster {
  openSpots: number
  level: LevelRange | null
  note: string | null
  /** `seats` > 1 when a player came with partners (matchmaker duo). */
  players: { firstName: string; joinedAt: string; seats: number }[]
}

/** One of the viewer's matchmaker searches (the MatchmakingWidget). */
export interface MatchRequestCard {
  id: string
  sport: Sport
  status: MatchRequestStatus
  requiredPlayers: number
  level: LevelRange
  windowStart: string
  windowEnd: string
  /** The match the matchmaker seated them in (status 'matched'). */
  match: { startsAt: string; endsAt: string; clubName: string } | null
}

/** "Niveau de jeu" (how well someone plays), not the "Niveau" earned by playing (lib/player-level.ts). */
export interface LevelRange {
  min: SkillLevel
  max: SkillLevel
}

export const SKILL_LEVELS: readonly SkillLevel[] = [1, 2, 3, 4, 5]

/** Words chosen to differ from the progression titles (Débutant ... Légende) shown on the same home. */
export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  1: 'Découverte',
  2: 'Initié',
  3: 'Intermédiaire',
  4: 'Avancé',
  5: 'Compétition',
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** Both ends present and ordered, else null ("every level"). */
export function levelRange(min: number | null | undefined, max: number | null | undefined): LevelRange | null {
  return isSkillLevel(min) && isSkillLevel(max) && min <= max ? { min, max } : null
}

/** "Niv. 3" / "Niv. 2–4" / "Tous niveaux". */
export function levelRangeLabel(range: LevelRange | null): string {
  if (!range || (range.min === 1 && range.max === 5)) return 'Tous niveaux'
  return range.min === range.max ? `Niv. ${range.min}` : `Niv. ${range.min}–${range.max}`
}

/** Players already in: everyone the organiser booked for, minus the places still on offer. */
export function filledSpots(m: Pick<OpenMatch, 'playerCount' | 'openSpots'>): number {
  return Math.max(0, m.playerCount - m.openSpots)
}

/** "3/4 joueurs · 1 place restante". */
export function matchSpotsLabel(m: Pick<OpenMatch, 'playerCount' | 'openSpots'>): string {
  const filled = filledSpots(m)
  const left = m.openSpots <= 0 ? 'complet' : m.openSpots === 1 ? '1 place restante' : `${m.openSpots} places restantes`
  return `${filled}/${m.playerCount} joueurs · ${left}`
}

export function tournamentSpotsLeft(t: Pick<TournamentCard, 'maxTeams' | 'registeredCount'>): number {
  return Math.max(0, t.maxTeams - t.registeredCount)
}

/** "Simple" / "Équipes de 2" / ... */
export function teamSizeLabel(teamSize: number): string {
  return teamSize <= 1 ? 'Individuel' : `Équipes de ${teamSize}`
}

/** Registration is open until the deadline (and only while places remain). */
export function tournamentOpen(t: Pick<TournamentCard, 'registrationDeadline' | 'maxTeams' | 'registeredCount'>, now: number): boolean {
  return now <= Date.parse(t.registrationDeadline) && tournamentSpotsLeft(t) > 0
}

/** Open matches the sport filter keeps ('all' keeps every sport); joined matches come first. */
export function filterOpenMatches(matches: OpenMatch[], sport: Sport | 'all'): OpenMatch[] {
  const kept = sport === 'all' ? matches : matches.filter((m) => m.sport === sport)
  return [...kept.filter((m) => m.joined), ...kept.filter((m) => !m.joined)]
}

/** French message for an exception raised by the open-match / tournament RPCs. */
const RPC_MESSAGES: Record<string, string> = {
  not_found: 'Cette partie ou ce tournoi n\'est plus disponible.',
  match_closed: 'Cette partie n\'accepte plus de joueurs.',
  own_match: 'C\'est votre propre partie.',
  not_player: 'Seuls les comptes joueurs peuvent participer.',
  suspended: 'Votre compte est suspendu : vous ne pouvez pas rejoindre de partie pour le moment.',
  already_joined: 'Vous participez déjà à cette partie.',
  match_full: 'Trop tard : la dernière place vient d\'être prise.',
  match_started: 'La partie a déjà commencé.',
  not_joined: 'Vous ne participez pas à cette partie.',
  invalid_spots: 'Nombre de places invalide : il doit rester au moins vous dans la partie.',
  invalid_level: 'Niveau invalide : choisissez un niveau minimum inférieur ou égal au maximum.',
  invalid_request: 'Recherche invalide. Vérifiez le sport, le niveau et le nombre de places.',
  invalid_window: "Choisissez un créneau qui se termine dans plus d'une heure et au plus dans 14 jours.",
  already_searching: 'Vous cherchez déjà une partie pour ce sport.',
  too_many_requests: "Trois recherches au plus en même temps : annulez-en une d'abord.",
  booking_closed: 'Cette réservation est terminée ou annulée.',
  registration_closed: 'Les inscriptions à ce tournoi sont closes.',
  already_registered: 'Vous êtes déjà inscrit à ce tournoi.',
  tournament_full: 'Ce tournoi est complet.',
  tournament_started: 'Le tournoi a déjà commencé.',
  not_registered: 'Vous n\'êtes pas inscrit à ce tournoi.',
}

export function communityErrorMessage(rpcMessage: string | null | undefined, fallback: string): string {
  const code = (rpcMessage ?? '').trim()
  return RPC_MESSAGES[code] ?? fallback
}
