'use client'

import * as React from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

export type OpenMatchesFeedStatus = 'connecting' | 'live' | 'offline'

/** Refresh at most this often, however many matches change (every viewer refreshes on a broadcast). */
const MIN_REFRESH_MS = 15_000

/**
 * Live "Parties ouvertes" for the matchmaking widget, on one channel:
 *  - broadcast `open_match` on the PRIVATE topic `open-matches` (sent by a bookings trigger; payload is a
 *    booking id, sport and free places only; realtime.messages RLS lets signed-in users listen, nobody send);
 *  - Postgres changes on the viewer's own `match_requests` rows (RLS: own rows only), so "partie trouvée"
 *    appears the moment the matchmaker agent seats them.
 * Events are only a "go and fetch" signal: `onChange` re-reads through the server (router.refresh()),
 * throttled, and deferred while the tab is hidden. A dropped socket reconnects with backoff.
 */
export function useOpenMatchesFeed(
  viewerId: string,
  handlers: { onChange: () => void; onMatched?: (requestId: string) => void }
): OpenMatchesFeedStatus {
  const [status, setStatus] = React.useState<OpenMatchesFeedStatus>('connecting')
  const handlersRef = React.useRef(handlers)
  React.useEffect(() => {
    handlersRef.current = handlers
  })

  React.useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | undefined
    let closed = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let lastRefresh = 0
    let pending = false

    const refresh = () => {
      if (document.visibilityState === 'hidden') {
        pending = true
        return
      }
      const wait = Math.max(0, lastRefresh + MIN_REFRESH_MS - Date.now())
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        lastRefresh = Date.now()
        pending = false
        handlersRef.current.onChange()
      }, wait)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && pending) refresh()
    }

    const open = async () => {
      if (closed) return
      // Private channels authorise with the user's token (RLS on realtime.messages).
      const { data } = await supabase.auth.getSession()
      if (closed) return
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
      channel = supabase
        .channel('open-matches', { config: { private: true } })
        .on('broadcast', { event: 'open_match' }, refresh)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'match_requests', filter: `requester_id=eq.${viewerId}` },
          (change) => {
            const row = change.new as { id?: string; status?: string }
            if (change.eventType === 'UPDATE' && row.status === 'matched' && row.id) handlersRef.current.onMatched?.(row.id)
            refresh()
          }
        )
        .subscribe((s) => {
          if (closed) return
          if (s === 'SUBSCRIBED') {
            attempt = 0
            setStatus('live')
            return
          }
          if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
            setStatus('offline')
            const old = channel
            channel = undefined
            if (old) void supabase.removeChannel(old)
            // 1 s doubling to 30 s, +-25% jitter.
            const delay = Math.min(30_000, 1_000 * 2 ** attempt) * (0.75 + Math.random() * 0.5)
            attempt += 1
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => void open(), delay)
          }
        })
    }

    void open()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      closed = true
      clearTimeout(retryTimer)
      clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [viewerId])

  return status
}
