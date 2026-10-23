import 'server-only'

import type { Point } from '@/lib/clubs'
import { weatherAdvice, type WeatherAdvice } from '@/lib/weather-advice'

/**
 * Current weather near the player's club, for a one-line outdoor-play hint on /explore. Read on the
 * server from Open-Meteo (free, no key, no browser request: no CSP change), cached 30 minutes. Only
 * a club's public coordinates are sent, rounded to ~1 km. Any failure returns null: no badge.
 */

/** Tunis centre, when the player has no club with a position yet. */
const FALLBACK: Point = { lat: 36.81, lng: 10.18 }

export async function loadWeather(point: Point | null): Promise<WeatherAdvice | null> {
  const { lat, lng } = point ?? FALLBACK
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}` +
    '&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=Africa%2FTunis'
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const body = (await res.json()) as { current?: Record<string, unknown> }
    const c = body.current
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const temperature = num(c?.temperature_2m)
    const code = num(c?.weather_code)
    if (temperature === null || code === null) return null
    return weatherAdvice({ temperature, code, precipitation: num(c?.precipitation) ?? 0, windKmh: num(c?.wind_speed_10m) ?? 0 })
  } catch {
    return null
  }
}
