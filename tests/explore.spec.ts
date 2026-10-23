import { expect, test } from '@playwright/test'

import { replayAllowed } from '../lib/consent'

/** Pure checks for the player area (no browser, no database). */

test('the account page is never session-recorded, like the rest of the player area', () => {
  for (const path of ['/compte', '/explore', '/settings', '/reservations']) expect(replayAllowed(path)).toBe(false)
  expect(replayAllowed('/courts/abc')).toBe(true)
})
