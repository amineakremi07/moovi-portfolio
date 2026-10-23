import { venueDateString } from '@/lib/court-time'
import type { Sport } from '@/lib/slot-duration'

/** Pure: a player's activity summary from their past bookings (no React, no database). */

export interface PlayerStats {
  /** Matches played in the current venue month. */
  monthMatches: number
  /** Matches in the scanned history (the loader reads the most recent ones only). */
  totalMatches: number
  /** Most played first. */
  bySport: { sport: Sport; count: number; share: number }[]
  favouriteSport: Sport | null
  /** Consecutive weeks (Monday to Sunday) with at least one match, ending this week or last week. */
  weekStreak: number
}

const DAY_MS = 86_400_000

/** Monday-based week number of a venue date ("YYYY-MM-DD"); 1970-01-01 was a Thursday. */
function weekIndex(dateStr: string): number {
  return Math.floor((Date.parse(`${dateStr}T00:00:00Z`) / DAY_MS + 3) / 7)
}

export function computePlayerStats(history: { sport: Sport; startsAt: string }[], now: Date): PlayerStats {
  const today = venueDateString(now)
  const month = today.slice(0, 7)

  const counts = new Map<Sport, number>()
  const weeks = new Set<number>()
  let monthMatches = 0
  for (const b of history) {
    const date = venueDateString(new Date(b.startsAt))
    if (date.slice(0, 7) === month) monthMatches += 1
    counts.set(b.sport, (counts.get(b.sport) ?? 0) + 1)
    weeks.add(weekIndex(date))
  }

  const totalMatches = history.length
  const bySport = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sport, count]) => ({ sport, count, share: count / totalMatches }))

  // The streak is still alive during the week after the last match, so it does not read 0 every Monday.
  const thisWeek = weekIndex(today)
  let week = weeks.has(thisWeek) ? thisWeek : thisWeek - 1
  let weekStreak = 0
  while (weeks.has(week)) {
    weekStreak += 1
    week -= 1
  }

  return { monthMatches, totalMatches, bySport, favouriteSport: bySport[0]?.sport ?? null, weekStreak }
}
