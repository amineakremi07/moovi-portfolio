import { expect, test } from '@playwright/test'

import type { Club } from '../lib/clubs'
import { DEFAULT_WEEKLY_HOURS } from '../lib/operating-hours'
import { clubStatus, nearestClubId } from '../lib/club-map'
import { weatherAdvice } from '../lib/weather-advice'

/** Pure checks for the /explore club logic (no browser, no database). */

const club = (over: Partial<Club> = {}): Club => ({
  id: 'c1',
  name: 'Padel Club La Marsa',
  city: 'La Marsa',
  address: null,
  latitude: 36.88,
  longitude: 10.32,
  coverUrl: null,
  logoUrl: null,
  sports: [],
  totalCourts: 2,
  opensAt: 8 * 60,
  closesAt: 23 * 60,
  weeklyHours: null,
  ...over,
})

// Tunisia is UTC+1 all year: 2030-11-05 (a Tuesday) 12:00Z = 13:00 at the club.
const at = (iso: string) => new Date(iso)

test.describe('clubStatus (venue time)', () => {
  test('open during the courts hours, with the closing time', () => {
    expect(clubStatus(club(), at('2030-11-05T12:00:00Z'))).toEqual({ open: true, until: '23:00' })
  })

  test('closed before opening says when it opens; closed after closing does not', () => {
    expect(clubStatus(club(), at('2030-11-05T05:30:00Z'))).toEqual({ open: false, opensAt: '08:00' })
    expect(clubStatus(club(), at('2030-11-05T22:30:00Z'))).toEqual({ open: false, opensAt: null })
  })

  test('a window that runs past midnight is still open in the small hours', () => {
    const late = club({ closesAt: 26 * 60 }) // 08:00 - 02:00
    // 00:30 venue on Wednesday = 23:30Z Tuesday
    expect(clubStatus(late, at('2030-11-05T23:30:00Z'))).toEqual({ open: true, until: '02:00' })
    // 02:30 venue: closed
    expect(clubStatus(late, at('2030-11-06T01:30:00Z')).open).toBe(false)
  })

  test('weekly hours replace the courts hours, and a closed day is closed', () => {
    const weekly = { ...DEFAULT_WEEKLY_HOURS, tue: { open: false, from: '08:00', to: '22:00' } }
    expect(clubStatus(club({ weeklyHours: weekly }), at('2030-11-05T12:00:00Z'))).toEqual({ open: false, opensAt: null })
    const wed = { ...DEFAULT_WEEKLY_HOURS, wed: { open: true, from: '10:00', to: '12:00' } }
    expect(clubStatus(club({ weeklyHours: wed }), at('2030-11-06T08:00:00Z'))).toEqual({ open: false, opensAt: '10:00' })
    expect(clubStatus(club({ weeklyHours: wed }), at('2030-11-06T09:30:00Z'))).toEqual({ open: true, until: '12:00' })
  })
})

test('nearest club ignores clubs without a position', () => {
  const clubs = [
    club({ id: 'tunis', latitude: 36.8, longitude: 10.18 }),
    club({ id: 'sousse', latitude: 35.83, longitude: 10.64 }),
    club({ id: 'nowhere', latitude: null, longitude: null }),
  ]
  expect(nearestClubId(clubs, { lat: 35.9, lng: 10.6 })).toBe('sousse')
  expect(nearestClubId([clubs[2]], { lat: 35.9, lng: 10.6 })).toBeNull()
})

test('weather advice: rain and storms first, then wind, heat and cold, else ideal', () => {
  const base = { temperature: 22.4, precipitation: 0, windKmh: 10, code: 1 }
  expect(weatherAdvice(base)).toEqual({ tone: 'good', text: '22 °C · météo idéale pour jouer en extérieur' })
  expect(weatherAdvice({ ...base, code: 61 }).tone).toBe('warn')
  expect(weatherAdvice({ ...base, code: 95 }).text).toContain('Orages')
  expect(weatherAdvice({ ...base, windKmh: 40 }).text).toContain('Vent fort')
  expect(weatherAdvice({ ...base, temperature: 36 }).text).toContain('chaleur')
})
