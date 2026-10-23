import { expect, test } from '@playwright/test'

import {
  communityErrorMessage,
  filledSpots,
  filterOpenMatches,
  matchSpotsLabel,
  teamSizeLabel,
  tournamentOpen,
  tournamentSpotsLeft,
  type OpenMatch,
} from '../lib/community'
import { matchCancelledEmail, matchJoinedEmail, tournamentRegistrationEmail } from '../lib/notifications/templates'
import { openMatchSchema, tournamentFormSchema, tournamentRegistrationSchema } from '../lib/validations/community'

// Pure: no browser, no database. The RPCs themselves are checked by scripts/verify-community.mjs.

const ID = '3922dd5f-1d3f-4a6b-8c9d-1e2f3a4b5c6d'

const match = (over: Partial<OpenMatch> = {}): OpenMatch => ({
  bookingId: ID,
  orgId: ID,
  clubName: 'Club',
  city: 'Tunis',
  sport: 'padel',
  startsAt: '2026-11-02T17:00:00Z',
  endsAt: '2026-11-02T18:30:00Z',
  playerCount: 4,
  openSpots: 1,
  level: null,
  note: null,
  organizer: 'Ali',
  pricePerPlayer: 25,
  joined: false,
  ...over,
})

test('open match spots read "3/4 joueurs · 1 place restante"', () => {
  expect(filledSpots(match())).toBe(3)
  expect(matchSpotsLabel(match())).toBe('3/4 joueurs · 1 place restante')
  expect(matchSpotsLabel(match({ openSpots: 2 }))).toBe('2/4 joueurs · 2 places restantes')
  expect(matchSpotsLabel(match({ openSpots: 0 }))).toBe('4/4 joueurs · complet')
  expect(matchSpotsLabel(match({ playerCount: 12, openSpots: 3 }))).toBe('9/12 joueurs · 3 places restantes')
})

test('the sport filter keeps matching sports, joined matches first', () => {
  const list = [
    match({ bookingId: 'a', sport: 'tennis' }),
    match({ bookingId: 'b', sport: 'padel' }),
    match({ bookingId: 'c', sport: 'padel', joined: true }),
  ]
  expect(filterOpenMatches(list, 'all').map((m) => m.bookingId)).toEqual(['c', 'a', 'b'])
  expect(filterOpenMatches(list, 'padel').map((m) => m.bookingId)).toEqual(['c', 'b'])
  expect(filterOpenMatches(list, 'football')).toEqual([])
})

test('tournament places and the registration window', () => {
  const t = { maxTeams: 8, registeredCount: 6, registrationDeadline: '2026-11-01T19:00:00Z' }
  expect(tournamentSpotsLeft(t)).toBe(2)
  expect(tournamentSpotsLeft({ ...t, registeredCount: 9 })).toBe(0)
  expect(tournamentOpen(t, Date.parse('2026-11-01T18:59:00Z'))).toBe(true)
  expect(tournamentOpen(t, Date.parse('2026-11-01T19:01:00Z'))).toBe(false)
  expect(tournamentOpen({ ...t, registeredCount: 8 }, Date.parse('2026-10-01T00:00:00Z'))).toBe(false)
  expect(teamSizeLabel(1)).toBe('Individuel')
  expect(teamSizeLabel(2)).toBe('Équipes de 2')
})

test('RPC error codes become French messages; unknown ones fall back', () => {
  expect(communityErrorMessage('match_full', 'x')).toMatch(/dernière place/)
  expect(communityErrorMessage('own_match', 'x')).toMatch(/votre propre partie/)
  expect(communityErrorMessage('tournament_full', 'x')).toMatch(/complet/)
  expect(communityErrorMessage('permission denied for function', 'fallback')).toBe('fallback')
  expect(communityErrorMessage(null, 'fallback')).toBe('fallback')
})

test('openMatchSchema: strict, bounded, note stripped of markup', () => {
  const ok = openMatchSchema.safeParse({ bookingId: ID, openSpots: 2, level: { min: 3, max: 4 }, note: ' <b>Sympa</b> ' })
  expect(ok.success && ok.data).toEqual({ bookingId: ID, openSpots: 2, level: { min: 3, max: 4 }, note: 'Sympa' })
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1, level: { min: 4, max: 2 } }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1, level: { min: 0, max: 2 } }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 0 }).success).toBe(true)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: -1 }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1.5 }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1, level: 'avance' }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1, profileId: ID }).success).toBe(false)
  expect(openMatchSchema.safeParse({ bookingId: ID, openSpots: 1, note: 'x'.repeat(201) }).success).toBe(false)
})

test('tournamentRegistrationSchema: optional team fields become null; extra keys refused', () => {
  const ok = tournamentRegistrationSchema.safeParse({ tournamentId: ID, teamName: '  ', teammates: '' })
  expect(ok.success && ok.data).toEqual({ tournamentId: ID, teamName: null, teammates: null })
  expect(tournamentRegistrationSchema.safeParse({ tournamentId: ID, profileId: ID }).success).toBe(false)
})

test('tournamentFormSchema: venue time to instants, deadline before start, numbers typed as text', () => {
  const base = {
    title: 'Coupe du week-end',
    description: '',
    sport: 'padel' as const,
    date: '2026-11-07',
    time: '09:00',
    deadlineDate: '2026-11-06',
    deadlineTime: '20:00',
    entryFee: '40,5',
    teamSize: '2',
    maxTeams: '16',
  }
  const ok = tournamentFormSchema.safeParse(base)
  expect(ok.success).toBe(true)
  if (ok.success) {
    expect(ok.data.startsAt).toBe('2026-11-07T08:00:00.000Z') // 09:00 in Tunis (UTC+1)
    expect(ok.data.registrationDeadline).toBe('2026-11-06T19:00:00.000Z')
    expect(ok.data.entryFee).toBe(40.5)
    expect(ok.data.teamSize).toBe(2)
    expect(ok.data.maxTeams).toBe(16)
    expect(ok.data.description).toBeNull()
  }
  const late = tournamentFormSchema.safeParse({ ...base, deadlineDate: '2026-11-08' })
  expect(late.success).toBe(false)
  if (!late.success) expect(late.error.issues[0]?.path).toEqual(['deadlineDate'])
  expect(tournamentFormSchema.safeParse({ ...base, maxTeams: '1' }).success).toBe(false)
  expect(tournamentFormSchema.safeParse({ ...base, teamSize: '8' }).success).toBe(false)
  expect(tournamentFormSchema.safeParse({ ...base, entryFee: '-5' }).success).toBe(false)
})

test('community emails escape user text and never show a reference to joiners', () => {
  const facts = { clubName: 'Club <A>', courtName: 'Terrain 1', sport: 'padel', date: 'lun. 2 nov. 2026', time: '18:00 – 19:30', reference: 'ABCD1234', amount: 100, playerCount: 4 }
  const joined = matchJoinedEmail({ ...facts, recipientName: 'Sami', joinerName: '<script>', spotsLeft: 1, passUrl: 'https://moovitn.vercel.app/reservations/x' })
  expect(joined.html).not.toContain('<script>')
  expect(joined.html).toContain('&lt;script&gt;')
  expect(joined.text).toContain('Il reste 1 place.')

  const cancelled = matchCancelledEmail({ recipientName: 'Lina', clubName: 'Club', sport: 'padel', date: facts.date, time: facts.time, exploreUrl: 'https://moovitn.vercel.app/explore' })
  expect(cancelled.html).not.toContain('ABCD1234')
  expect(cancelled.subject).toBe('Partie annulée : Club, lun. 2 nov. 2026')

  const reg = tournamentRegistrationEmail({ recipientName: 'Lina', title: 'Coupe', clubName: 'Club', sport: 'tennis', date: facts.date, time: '09:00', entryFee: 0, teamName: null, exploreUrl: 'https://moovitn.vercel.app/explore#tournois' })
  expect(reg.text).toContain("L'inscription est gratuite.")
})
