'use client'

import * as React from 'react'

const KEY = 'sg:favorite-clubs'
const EMPTY: readonly string[] = []

/** Stable snapshot: the raw string is the cache key, so useSyncExternalStore sees a new array only on change. */
let cachedRaw: string | null = null
let cachedIds: readonly string[] = EMPTY
const listeners = new Set<() => void>()

function read(): readonly string[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    // Storage blocked (private window): favourites then live for this page view only.
    return cachedIds
  }
  if (raw === cachedRaw) return cachedIds
  cachedRaw = raw
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cachedIds = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, 100) : EMPTY
  } catch {
    cachedIds = EMPTY
  }
  return cachedIds
}

function write(ids: readonly string[]) {
  cachedIds = ids
  try {
    const raw = JSON.stringify(ids)
    window.localStorage.setItem(KEY, raw)
    cachedRaw = raw
  } catch {
    // Not persisted; the in-memory list above still updates the page.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The player's bookmarked clubs, kept on this device (localStorage) and shared between tabs. Empty on
 * the server and during hydration, so the first paint matches the server render.
 */
export function useFavoriteClubs() {
  const ids = React.useSyncExternalStore(subscribe, read, () => EMPTY)
  const toggle = React.useCallback((id: string) => {
    const current = read()
    write(current.includes(id) ? current.filter((x) => x !== id) : [id, ...current])
  }, [])
  return { favorites: ids, toggle }
}
