'use client'

import { CloudSun, Sun } from 'lucide-react'

import { useMinuteClock } from '@/hooks/use-minute-clock'
import { formatVenueTime } from '@/lib/court-time'
import type { WeatherAdvice } from '@/lib/weather-advice'
import { cn } from '@/lib/utils'

/**
 * A quiet context line under the greeting: Tunis time (live, after hydration) and the outdoor-play hint
 * near the player's club. Shows the time alone when the weather could not be read.
 */
export function WeatherBadge({ weather }: { weather: WeatherAdvice | null }) {
  const minute = useMinuteClock()
  const time = minute === null ? null : formatVenueTime(new Date(minute))
  if (!weather && !time) return null

  const good = weather?.tone === 'good'
  const Icon = good ? Sun : CloudSun
  return (
    <p
      data-testid="weather-badge"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        good ? 'border-peacock-teal/20 bg-peacock-teal/[0.06] text-peacock-teal' : 'border-black/[0.08] bg-white text-foreground/80'
      )}
    >
      {time && (
        <span className="shrink-0 tabular-nums">
          <span className="sr-only">Heure à Tunis : </span>
          {time}
        </span>
      )}
      {time && weather && <span aria-hidden>·</span>}
      {weather && (
        <>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{weather.text}</span>
        </>
      )}
    </p>
  )
}
