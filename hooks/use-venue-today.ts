'use client'

import * as React from 'react'

import { addDays, venueDateString, venueInstant } from '@/lib/court-time'

/**
 * Today's venue date (YYYY-MM-DD, Africa/Tunis), kept current while the page stays open: it changes
 * at venue midnight, and is re-read when the tab becomes visible or the window regains focus (a laptop
 * that slept through midnight). The server's value is used for the first render, so hydration matches.
 */
export function useVenueToday(serverToday: string): string {
  return React.useSyncExternalStore(subscribeToVenueDay, () => venueDateString(), () => serverToday)
}

function subscribeToVenueDay(onChange: () => void): () => void {
  let timer: number | undefined
  const schedule = () => {
    // One second past the next venue midnight; timers can drift, so it re-arms from the real clock each time.
    const next = venueInstant(addDays(venueDateString(), 1), 0).getTime()
    timer = window.setTimeout(() => {
      onChange()
      schedule()
    }, Math.max(1_000, next - Date.now() + 1_000))
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange()
  }
  schedule()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onChange)
  return () => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onChange)
  }
}
