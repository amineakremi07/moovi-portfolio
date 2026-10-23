import { expect, test } from '@playwright/test'

import { countFreeNow, type LiveCourt } from '../lib/utils/slot-helpers'
import { levelFor, levelTitle } from '../lib/player-level'
import { computePlayerStats } from '../lib/player-stats'

/** Pure checks for the player dashboard widgets (no browser, no database). */

// Wednesday 2026-10-14, noon in Tunis (UTC+1, no DST).
const NOW = new Date('2026-10-14T11:00:00Z')
const at = (iso: string, sport: 'padel' | 'tennis' | 'football' = 'padel') => ({ sport, startsAt: iso })

test.describe('computePlayerStats', () => {
  test('no history: zeros, no favourite', () => {
    expect(computePlayerStats([], NOW)).toEqual({ monthMatches: 0, totalMatches: 0, bySport: [], favouriteSport: null, weekStreak: 0 })
  })

  test('counts this month, the sport split and the favourite', () => {
    const stats = computePlayerStats(
      [at('2026-10-12T18:00:00Z'), at('2026-10-05T18:00:00Z', 'tennis'), at('2026-09-28T18:00:00Z'), at('2026-09-01T18:00:00Z')],
      NOW
    )
    expect(stats.monthMatches).toBe(2)
    expect(stats.totalMatches).toBe(4)
    expect(stats.favouriteSport).toBe('padel')
    expect(stats.bySport.map((s) => [s.sport, s.count])).toEqual([
      ['padel', 3],
      ['tennis', 1],
    ])
    expect(stats.bySport[0].share).toBeCloseTo(0.75)
  })

  test('the month follows the venue date, not UTC', () => {
    // 23:30 UTC on 30 Sept is already 1 Oct in Tunis.
    expect(computePlayerStats([at('2026-09-30T23:30:00Z')], NOW).monthMatches).toBe(1)
  })

  test('streak counts consecutive weeks and stays alive through the week after the last match', () => {
    // Weeks of Oct 12 (this), Oct 5, Sep 28; a gap; Sep 14.
    const history = [at('2026-10-13T18:00:00Z'), at('2026-10-06T18:00:00Z'), at('2026-09-29T18:00:00Z'), at('2026-09-15T18:00:00Z')]
    expect(computePlayerStats(history, NOW).weekStreak).toBe(3)
    // Nothing yet this week: last week's run is still alive.
    expect(computePlayerStats(history.slice(1), NOW).weekStreak).toBe(2)
    // Two empty weeks: broken.
    expect(computePlayerStats([at('2026-09-29T18:00:00Z')], NOW).weekStreak).toBe(0)
  })
})

test.describe('countFreeNow', () => {
  const court = (id: string, sport: LiveCourt['sport'], open = '08:00', close = '23:00'): LiveCourt => ({
    id,
    orgId: 'o1',
    sport,
    openTime: open,
    closeTime: close,
  })
  const none = new Map<string, null>()

  test('counts open, unlocked courts per sport', () => {
    const courts = [court('a', 'padel'), court('b', 'padel'), court('c', 'tennis'), court('d', 'football', '16:00', '23:00')]
    expect(countFreeNow(courts, none, new Set(['b']), NOW)).toEqual({ padel: 1, tennis: 1 })
  })

  test('a window past midnight is open late in the evening', () => {
    const late = new Date('2026-10-14T22:30:00Z') // 23:30 in Tunis
    expect(countFreeNow([court('a', 'padel', '18:00', '02:00')], none, new Set(), late)).toEqual({ padel: 1 })
    expect(countFreeNow([court('a', 'padel', '08:00', '23:00')], none, new Set(), late)).toEqual({})
  })
})

test.describe('levels', () => {
  test('thresholds 0 / 3 / 10 / 25 / 50 / 100, with progress to the next one', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Débutant', next: 3, progress: 0, remaining: 3 })
    expect(levelFor(3)).toMatchObject({ level: 2, from: 3, next: 10, remaining: 7 })
    expect(levelFor(12)).toMatchObject({ level: 3, title: 'Joueur régulier', remaining: 13 })
    expect(levelFor(12).progress).toBeCloseTo(2 / 15)
    expect(levelFor(99)).toMatchObject({ level: 5, remaining: 1 })
  })

  test('the top level has no next step and a full bar', () => {
    expect(levelFor(250)).toMatchObject({ level: 6, title: 'Légende', next: null, progress: 1, remaining: 0 })
    expect(levelTitle(4)).toBe('Confirmé')
    expect(levelTitle(9)).toBeNull()
  })
})
