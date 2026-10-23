import { clubDistanceKm, formatMinutes, type Club, type Point } from '@/lib/clubs'
import { addDays, minutesSinceVenueDayStart, timeToMinutes, venueDateString } from '@/lib/court-time'
import { weekdayKey } from '@/lib/operating-hours'

/**
 * Club open/closed status and nearest-club logic for /explore. Pure: no React, so it can be tested against fixtures.
 */

/* --------------------------------- status -------------------------------- */

export type ClubStatus = { open: true; until: string } | { open: false; opensAt: string | null }

/** A venue day's opening window in minutes from that day's 00:00; `to` > 1440 means past midnight. */
function dayWindow(club: Club, dateStr: string): { from: number; to: number } | null {
  if (club.weeklyHours) {
    const day = club.weeklyHours[weekdayKey(dateStr)]
    if (!day.open) return null
    const from = timeToMinutes(day.from)
    const to = timeToMinutes(day.to)
    return { from, to: to <= from ? to + 1440 : to }
  }
  return { from: club.opensAt, to: club.closesAt }
}

/**
 * Is the club open right now (venue time, Africa/Tunis)? The club's weekly hours win when set,
 * otherwise the widest span of its courts. A window that runs past midnight is still "open" in the
 * small hours of the next day.
 */
export function clubStatus(club: Club, now: Date): ClubStatus {
  const today = venueDateString(now)
  const minute = minutesSinceVenueDayStart(now, today)

  const yesterday = dayWindow(club, addDays(today, -1))
  if (yesterday && yesterday.to > 1440 && minute < yesterday.to - 1440) {
    return { open: true, until: formatMinutes(yesterday.to - 1440) }
  }

  const window = dayWindow(club, today)
  if (window && minute >= window.from && minute < window.to) return { open: true, until: formatMinutes(window.to) }
  return { open: false, opensAt: window && minute < window.from ? formatMinutes(window.from) : null }
}

/** The closest club that has a position, or null. */
export function nearestClubId(clubs: Club[], from: Point): string | null {
  let best: { id: string; km: number } | null = null
  for (const club of clubs) {
    const km = clubDistanceKm(club, from)
    if (km !== null && (!best || km < best.km)) best = { id: club.id, km }
  }
  return best?.id ?? null
}
