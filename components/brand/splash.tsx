'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { LOGO_SIZE } from '@/components/brand/brand-mark'

import { SPLASH_SESSION_KEY } from '@/lib/splash'

/**
 * Initial splash: the Moovi logo, gently pulsing, over the page while it loads, faded out as
 * soon as the page has loaded (never before MIN_MS, never later than MAX_MS).
 *
 * - Server-rendered, so it is on screen from the first paint; position: fixed, so it never moves content
 *   (no layout shift). The page behind it is already complete server HTML.
 * - Shown once per browser session: a tiny inline script in the root layout sets `data-splash="off"` on
 *   <html> when `sessionStorage['sg-splash']` exists, and the CSS hides the overlay before first paint.
 * - No JavaScript: a <noscript> rule hides it. Reduced motion: no animation, instant fade.
 * Styles live in app/globals.css (`.sg-splash*`).
 */
const MIN_MS = 450
const MAX_MS = 4000
const FADE_MS = 320
export function Splash() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show')

  useEffect(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {
      /* storage blocked: the splash simply shows on every full load */
    }
    let leave: number | undefined
    let remove: number | undefined
    const start = () => {
      const wait = Math.max(0, MIN_MS - performance.now())
      leave = window.setTimeout(() => {
        setPhase('leave')
        remove = window.setTimeout(() => setPhase('gone'), FADE_MS)
      }, wait)
    }
    let cap: number | undefined
    if (document.readyState === 'complete') start()
    else {
      window.addEventListener('load', start, { once: true })
      cap = window.setTimeout(start, MAX_MS)
    }
    return () => {
      window.removeEventListener('load', start)
      window.clearTimeout(leave)
      window.clearTimeout(remove)
      window.clearTimeout(cap)
    }
  }, [])

  if (phase === 'gone') return null
  return (
    <div id="sg-splash" className="sg-splash" data-leaving={phase === 'leave' ? 'true' : undefined} aria-hidden={phase === 'leave' ? true : undefined} role="status" aria-label="Chargement de Moovi">
      {/* Same file as the nav logo, so the request is shared. Decorative: the status label names it. */}
      <Image src="/brand/logo-light.png" alt="" {...LOGO_SIZE} priority sizes="180px" className="sg-splash-logo" />
    </div>
  )
}
