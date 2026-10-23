import * as React from 'react'

/**
 * How the bookings board draws the day, chosen once in Paramètres (a per-device display preference, so
 * localStorage): "timeline" = hours × courts grid (default), "columns" = one column of booking details
 * per court. Storage can be missing or blocked (private mode): the default then applies.
 */
export type BoardView = 'timeline' | 'columns'

const KEY = 'sg-board-view'
const EVENT = 'sg-board-view-change'

export function readBoardView(): BoardView {
  try {
    return window.localStorage.getItem(KEY) === 'columns' ? 'columns' : 'timeline'
  } catch {
    return 'timeline'
  }
}

export function writeBoardView(view: BoardView) {
  try {
    window.localStorage.setItem(KEY, view)
  } catch {
    // Not persisted (blocked storage): the change still applies to this page.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

/** The saved view; the server render (and the first client render) use the default, so nothing mismatches. */
export function useBoardView(): BoardView {
  return React.useSyncExternalStore(subscribe, readBoardView, () => 'timeline')
}
