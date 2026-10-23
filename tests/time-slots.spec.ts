import { expect, test } from '@playwright/test'

import { aggregateTimeSlots, COURT_PENDING_LABEL, playerCourtLabel, slotIsBusy, type PricedCourt } from '../lib/time-slots'
import type { CourtSlot } from '../lib/court-slots'

/** Pure checks for time-first booking (no browser, no database). */

// 2030-11-05 venue day. 17:30Z = 18:30 at the club; padel = 90 min + 15 min buffer.
const DATE = '2030-11-05'
const T1 = '2030-11-05T17:30:00.000Z'
const T1_END = '2030-11-05T19:00:00.000Z'
const T2 = '2030-11-05T19:15:00.000Z'
const T2_END = '2030-11-05T20:45:00.000Z'

const court = (id: string, name: string, pricePerHour: number, slots: CourtSlot[], sport: PricedCourt['sport'] = 'padel') => ({
  id,
  name,
  sport,
  pricePerHour,
  nightSurchargePerHour: 0,
  nightStartsAt: '18:00:00',
  slots,
})
const slot = (start: string, end: string, state: CourtSlot['state']): CourtSlot => ({ start, end, state })

test.describe('time-first slot grid', () => {
  test('a time is free when ANY court of the sport is free, at the cheapest free price', () => {
    const rows = aggregateTimeSlots(
      [
        court('a', 'Court A', 40, [slot(T1, T1_END, 'occupied'), slot(T2, T2_END, 'available')]),
        court('b', 'Court B', 60, [slot(T1, T1_END, 'available'), slot(T2, T2_END, 'available')]),
        court('t', 'Tennis', 10, [slot(T1, T1_END, 'available')], 'tennis'),
      ],
      'padel',
      DATE
    )
    expect(rows.map((r) => [r.start, r.state, r.freeCourts, r.court?.id, r.price])).toEqual([
      [T1, 'available', 1, 'b', 90], // only Court B is free: its price (60/h x 1.5 h)
      [T2, 'available', 2, 'a', 60], // both free: the cheaper Court A (40/h x 1.5 h)
    ])
  })

  test('every court taken = full; a started slot = past; another sport never counts', () => {
    const rows = aggregateTimeSlots(
      [
        court('a', 'Court A', 40, [slot(T1, T1_END, 'occupied'), slot(T2, T2_END, 'past')]),
        court('b', 'Court B', 40, [slot(T1, T1_END, 'occupied'), slot(T2, T2_END, 'past')]),
      ],
      'padel',
      DATE
    )
    expect(rows.map((r) => [r.state, r.court, r.price])).toEqual([
      ['occupied', null, null],
      ['past', null, null],
    ])
    expect(aggregateTimeSlots([court('a', 'Court A', 40, [slot(T1, T1_END, 'available')])], 'tennis', DATE)).toEqual([])
  })

  test('same price: the court name decides, so the choice is stable', () => {
    const rows = aggregateTimeSlots(
      [court('z', 'Court 2', 40, [slot(T1, T1_END, 'available')]), court('y', 'Court 1', 40, [slot(T1, T1_END, 'available')])],
      'padel',
      DATE
    )
    expect(rows[0].court?.name).toBe('Court 1')
  })

  test('a lock overlapping play + buffer makes the court busy (same rule as the GiST constraint)', () => {
    expect(slotIsBusy([{ from: T1, until: '2030-11-05T19:15:00.000Z' }], T1, 'padel')).toBe(true)
    // A lock ending exactly when the slot starts does not overlap.
    expect(slotIsBusy([{ from: '2030-11-05T16:00:00.000Z', until: T1 }], T1, 'padel')).toBe(false)
    // A lock starting inside the 15 min buffer after play does overlap.
    expect(slotIsBusy([{ from: '2030-11-05T19:10:00.000Z', until: '2030-11-05T21:00:00.000Z' }], T1, 'padel')).toBe(true)
  })

  test('players see the court only once the club assigned it', () => {
    expect(playerCourtLabel('Court 3', true)).toBe(COURT_PENDING_LABEL)
    expect(playerCourtLabel('Court 3', false)).toBe('Court 3')
    expect(playerCourtLabel(null, false)).toBe('Terrain')
  })
})
