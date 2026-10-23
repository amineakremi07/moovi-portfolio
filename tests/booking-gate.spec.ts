import { expect, test } from '@playwright/test'

import { BOOKING_PATH, landingPathFor, postLoginPath } from '../lib/auth-landing'

test.describe('booking needs a player account', () => {
  test('players land on their home, /explore, after signing in', () => {
    expect(BOOKING_PATH).toBe('/explore')
    expect(landingPathFor('player')).toBe('/explore')
    expect(postLoginPath('player', null)).toBe('/explore')
  })

  test('the page a player was heading for wins (e.g. a club page or /explore)', () => {
    expect(postLoginPath('player', '/explore')).toBe('/explore')
    expect(postLoginPath('player', '/courts/f350ebab-85d5-4846-8673-c2da58f96193?date=2030-11-05')).toBe(
      '/courts/f350ebab-85d5-4846-8673-c2da58f96193?date=2030-11-05'
    )
  })

  test('club and admin roles keep their own landing', () => {
    expect(postLoginPath('org_admin', '/explore')).toBe('/dashboard/org')
    expect(postLoginPath('staff', '/explore')).toBe('/dashboard/org/bookings')
    expect(postLoginPath('platform_admin', '/explore')).toBe('/admin/verification')
  })

  test('a hostile redirect still falls back to booking', () => {
    expect(postLoginPath('player', '//evil.example/explore')).toBe('/explore')
    expect(postLoginPath('player', 'https://evil.example')).toBe('/explore')
  })
})
