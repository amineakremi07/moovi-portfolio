import { expect, test } from '@playwright/test'

import { nextRebookSlot, rebookHref, rebookPatternKey } from '../lib/rebook'

// 2030-11-05 is a Tuesday. Venue time is UTC+1, so 17:30Z = 18:30 at the club.
// Padel slots with an 08:00 open: 08:00, 09:45, 11:30, 13:15, 15:00, 16:45, 18:30, 20:15, 22:00.
const hours = () => ({ openTime: '08:00:00', closeTime: '23:30:00' })
const court = (id: string, locks: { from: string; until: string }[] = [], hoursFor = hours as (d: string) => ReturnType<typeof hours> | null) => ({
  id,
  hoursFor,
  locks,
})
const base = {
  sport: 'padel' as const,
  sourceStartsAt: '2030-10-29T17:30:00.000Z', // Tuesday 18:30, one week before
  today: '2030-11-01',
  maxDate: '2030-12-31',
  courts: [court('c1')],
  now: new Date('2030-11-01T10:00:00.000Z'),
}
const taken = (date: string) => ({ from: `${date}T17:30:00.000Z`, until: `${date}T19:15:00.000Z` })

test.describe('Réserver à nouveau', () => {
  test('the pattern is sport + venue weekday + venue time, not the court', () => {
    expect(rebookPatternKey('padel', '2030-11-05T17:30:00.000Z')).toBe('padel|tue|18:30')
    // 23:30Z is already Wednesday 00:30 at the club.
    expect(rebookPatternKey('padel', '2030-11-05T23:30:00.000Z')).toBe('padel|wed|00:30')
    expect(rebookPatternKey('tennis', '2030-11-05T17:30:00.000Z')).not.toBe(rebookPatternKey('padel', '2030-11-05T17:30:00.000Z'))
  })

  test('finds the next same weekday and time', () => {
    expect(nextRebookSlot(base)).toEqual({
      date: '2030-11-05',
      startsAt: '2030-11-05T17:30:00.000Z',
      endsAt: '2030-11-05T19:00:00.000Z',
      freeCourtIds: ['c1'],
    })
  })

  test('any free court of the sport will do: one taken court does not skip the week', () => {
    const slot = nextRebookSlot({ ...base, courts: [court('c1', [taken('2030-11-05')]), court('c2')] })
    expect(slot?.date).toBe('2030-11-05')
    expect(slot?.freeCourtIds).toEqual(['c2'])
  })

  test('skips a week when every court is taken', () => {
    const slot = nextRebookSlot({ ...base, courts: [court('c1', [taken('2030-11-05')]), court('c2', [taken('2030-11-05')])] })
    expect(slot?.date).toBe('2030-11-12')
    expect(slot?.freeCourtIds).toEqual(['c1', 'c2'])
  })

  test('skips a day the club is closed', () => {
    const slot = nextRebookSlot({ ...base, courts: [court('c1', [], (d) => (d === '2030-11-05' ? null : hours()))] })
    expect(slot?.date).toBe('2030-11-12')
  })

  test('a slot that has already started today is not offered', () => {
    const slot = nextRebookSlot({ ...base, today: '2030-11-05', now: new Date('2030-11-05T17:45:00.000Z') })
    expect(slot?.date).toBe('2030-11-12')
  })

  test('nothing when the time is no longer on any grid', () => {
    // The club now opens at 09:00, so padel starts 09:00, 10:45 ... and 18:30 never comes back.
    expect(nextRebookSlot({ ...base, courts: [court('c1', [], () => ({ openTime: '09:00:00', closeTime: '23:30:00' }))] })).toBeNull()
  })

  test('nothing beyond the booking window', () => {
    expect(nextRebookSlot({ ...base, maxDate: '2030-11-04' })).toBeNull()
  })

  test('a past-midnight slot is matched on its own weekday', () => {
    // Open 20:00 - 03:00: padel 20:00, 21:45, 23:30, 01:15 (the last is on the next calendar day).
    const late = {
      ...base,
      sourceStartsAt: '2030-10-30T00:15:00.000Z', // Wednesday 01:15 at the club
      courts: [court('c1', [], () => ({ openTime: '20:00:00', closeTime: '03:00:00' }))],
    }
    // It belongs to Tuesday's grid but starts on Wednesday.
    expect(nextRebookSlot(late)).toMatchObject({ date: '2030-11-05', startsAt: '2030-11-06T00:15:00.000Z', endsAt: '2030-11-06T01:45:00.000Z' })
  })

  test('the link opens the club page with that sport and time pre-selected, no court', () => {
    const url = new URL(
      rebookHref({ orgId: 'f350ebab-85d5-4846-8673-c2da58f96193', sport: 'padel', date: '2030-11-05', startsAt: '2030-11-05T17:30:00.000Z' }),
      'https://x.test'
    )
    expect(url.pathname).toBe('/courts/f350ebab-85d5-4846-8673-c2da58f96193')
    expect(Object.fromEntries(url.searchParams)).toEqual({ date: '2030-11-05', sport: 'padel', start: '2030-11-05T17:30:00.000Z' })
  })
})
