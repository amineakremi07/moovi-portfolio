import { expect, test } from '@playwright/test'

import { levelRange, levelRangeLabel } from '../lib/community'
import { attendanceRequestEmail, autoReleaseEmail, matchFoundEmail, type BookingFacts } from '../lib/notifications/templates'
import { matchRequestFormSchema, matchRequestSchema } from '../lib/validations/community'
import {
  applySeat,
  isCompatible,
  rankCandidates,
  type SnapshotMatch,
  type SnapshotRequest,
} from '../supabase/functions/autonomous-agents/matchmaking'

// Pure: no browser, no database. The RPCs re-check every rule under row locks (fulfil_match_request).

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const request = (over: Partial<SnapshotRequest> = {}): SnapshotRequest => ({
  id: 'r1',
  requester_id: ME,
  sport: 'padel',
  required_players: 1,
  skill_level_min: 2,
  skill_level_max: 4,
  window_start: '2026-11-02T16:00:00Z',
  window_end: '2026-11-02T22:00:00Z',
  created_at: '2026-11-01T10:00:00Z',
  player_level: 3,
  ...over,
})

const match = (over: Partial<SnapshotMatch> = {}): SnapshotMatch => ({
  booking_id: 'b1',
  sport: 'padel',
  starts_at: '2026-11-02T18:00:00Z',
  open_spots: 1,
  player_count: 4,
  open_level_min: null,
  open_level_max: null,
  booker_profile_id: OTHER,
  member_ids: [],
  ...over,
})

test('compatibility: sport, free places, time window, own match, levels', () => {
  expect(isCompatible(request(), match())).toBe(true)
  expect(isCompatible(request(), match({ sport: 'tennis' }))).toBe(false)
  expect(isCompatible(request({ required_players: 2 }), match({ open_spots: 1 }))).toBe(false)
  expect(isCompatible(request(), match({ starts_at: '2026-11-02T23:00:00Z' }))).toBe(false)
  expect(isCompatible(request(), match({ booker_profile_id: ME }))).toBe(false)
  expect(isCompatible(request(), match({ member_ids: [ME] }))).toBe(false)
  // Ranges must overlap, and the player's own level must sit inside the match's range.
  expect(isCompatible(request(), match({ open_level_min: 3, open_level_max: 4 }))).toBe(true)
  expect(isCompatible(request(), match({ open_level_min: 5, open_level_max: 5 }))).toBe(false)
  expect(isCompatible(request({ player_level: 2 }), match({ open_level_min: 3, open_level_max: 4 }))).toBe(false)
  expect(isCompatible(request({ player_level: null }), match({ open_level_min: 3, open_level_max: 4 }))).toBe(true)
})

test('ranking: a 3/4 match the request completes comes first, then closest level, then soonest', () => {
  const twoLeft = match({ booking_id: 'two-left', open_spots: 2, starts_at: '2026-11-02T17:00:00Z' })
  const lastSpot = match({ booking_id: 'last-spot', open_spots: 1, starts_at: '2026-11-02T20:00:00Z' })
  expect(rankCandidates(request(), [twoLeft, lastSpot]).map((m) => m.booking_id)).toEqual(['last-spot', 'two-left'])

  const far = match({ booking_id: 'far', open_level_min: 2, open_level_max: 2, starts_at: '2026-11-02T17:00:00Z' })
  const close = match({ booking_id: 'close', open_level_min: 3, open_level_max: 3, starts_at: '2026-11-02T19:00:00Z' })
  expect(rankCandidates(request({ skill_level_min: 2, skill_level_max: 3, player_level: 3 }), [far, close]).map((m) => m.booking_id)).toEqual([
    'close',
  ])

  const later = match({ booking_id: 'later', starts_at: '2026-11-02T21:00:00Z' })
  const sooner = match({ booking_id: 'sooner', starts_at: '2026-11-02T17:00:00Z' })
  expect(rankCandidates(request(), [later, sooner]).map((m) => m.booking_id)).toEqual(['sooner', 'later'])
})

test('applySeat: the local snapshot loses the places so the next request sees the truth', () => {
  const m = match({ open_spots: 2 })
  applySeat(m, request({ required_players: 2 }))
  expect(m.open_spots).toBe(0)
  expect(m.member_ids).toEqual([ME])
  expect(isCompatible(request({ id: 'r2', requester_id: OTHER }), m)).toBe(false)
})

test('level ranges: labels and validation', () => {
  expect(levelRangeLabel(null)).toBe('Tous niveaux')
  expect(levelRangeLabel({ min: 1, max: 5 })).toBe('Tous niveaux')
  expect(levelRangeLabel({ min: 3, max: 3 })).toBe('Niv. 3')
  expect(levelRangeLabel({ min: 2, max: 4 })).toBe('Niv. 2–4')
  expect(levelRange(4, 2)).toBeNull()
  expect(levelRange(null, 3)).toBeNull()
  expect(levelRange(2, 4)).toEqual({ min: 2, max: 4 })
})

test('matchRequestSchema: venue-time window, strict, bounded', () => {
  const ok = matchRequestSchema.safeParse({ sport: 'padel', date: '2026-11-02', period: 'soir', requiredPlayers: 1, levelMin: 2, levelMax: 4, playerLevel: 3 })
  expect(ok.success).toBe(true)
  // Africa/Tunis is UTC+1: 17:00-23:00 venue time.
  if (ok.success) expect([ok.data.windowStart, ok.data.windowEnd]).toEqual(['2026-11-02T16:00:00.000Z', '2026-11-02T22:00:00.000Z'])
  const base = { sport: 'padel', date: '2026-11-02', period: 'soir', requiredPlayers: 1, levelMin: 2, levelMax: 4 }
  expect(matchRequestSchema.safeParse({ ...base, levelMin: 5, levelMax: 2 }).success).toBe(false)
  expect(matchRequestSchema.safeParse({ ...base, requiredPlayers: 4 }).success).toBe(false)
  expect(matchRequestSchema.safeParse({ ...base, period: 'nuit' }).success).toBe(false)
  expect(matchRequestSchema.safeParse({ ...base, requesterId: ME }).success).toBe(false)
  // The form's text values become the action's numbers.
  const form = matchRequestFormSchema.safeParse({ ...base, requiredPlayers: '2', levelMin: '2', levelMax: '4', playerLevel: '3' })
  expect(form.success && form.data).toMatchObject({ requiredPlayers: 2, levelMin: 2, levelMax: 4, playerLevel: 3 })
})

const facts: BookingFacts = {
  clubName: 'Club <Test>',
  courtName: 'Terrain 1',
  sport: 'padel',
  date: 'lun. 2 nov. 2026',
  time: '18:00 – 19:30',
  reference: 'ABCD1234',
  amount: 100,
  playerCount: 4,
}

test('agent emails: escaped, French, with their one action', () => {
  const ask = attendanceRequestEmail({ ...facts, recipientName: 'Ali', deadline: '14:00', confirmUrl: 'https://moovi.tn/reservations/x' })
  expect(ask.subject).toContain('Confirmez votre venue')
  expect(ask.html).toContain('Club &lt;Test&gt;')
  expect(ask.text).toContain('avant 14:00')
  expect(ask.html).toContain('Je confirme ma venue')

  const released = autoReleaseEmail({ ...facts, recipientName: 'Ali', exploreUrl: 'https://moovi.tn/explore' })
  expect(released.subject).toContain('Réservation libérée')
  expect(released.text).toContain('rien à rembourser')

  const found = matchFoundEmail({
    recipientName: 'Sami',
    clubName: 'Club',
    sport: 'padel',
    date: 'lun. 2 nov.',
    time: '18:00 – 19:30',
    seats: 2,
    roster: '4/4 joueurs',
    exploreUrl: 'https://moovi.tn/explore',
  })
  expect(found.subject).toContain('Partie trouvée')
  expect(found.text).toContain('Vous avez 2 places')
})
