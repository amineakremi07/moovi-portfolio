'use client'

import * as React from 'react'

/**
 * The current minute (ms timestamp floored to the minute), re-rendering when the minute changes and
 * when the tab becomes visible again. Null on the server and during hydration, so anything derived
 * from "now" (open / closed badges) appears only after hydration and never mismatches.
 */
export function useMinuteClock(): number | null {
  return React.useSyncExternalStore(subscribe, readMinute, () => null)
}

const readMinute = () => Math.floor(Date.now() / 60_000) * 60_000

function subscribe(onChange: () => void): () => void {
  let timer: number | undefined
  const schedule = () => {
    timer = window.setTimeout(() => {
      onChange()
      schedule()
    }, 60_000 - (Date.now() % 60_000) + 50)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange()
  }
  schedule()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
