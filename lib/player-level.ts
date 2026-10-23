/**
 * Pure: the player's level from matches played. Only played matches count: cancellations and no-shows
 * earn nothing.
 */

export interface Level {
  level: number
  title: string
  /** Matches needed to reach this level. */
  from: number
  /** Matches needed for the next one; null at the top level. */
  next: number | null
}

const LEVELS: { from: number; title: string }[] = [
  { from: 0, title: 'Débutant' },
  { from: 3, title: 'Joueur occasionnel' },
  { from: 10, title: 'Joueur régulier' },
  { from: 25, title: 'Confirmé' },
  { from: 50, title: 'Expert' },
  { from: 100, title: 'Légende' },
]

export interface LevelProgress extends Level {
  matches: number
  /** 0..1 towards the next level (1 at the top level). */
  progress: number
  /** Matches still needed (0 at the top level). */
  remaining: number
}

export function levelFor(matches: number): LevelProgress {
  const n = Math.max(0, Math.floor(matches))
  let i = 0
  while (i + 1 < LEVELS.length && n >= LEVELS[i + 1].from) i++
  const from = LEVELS[i].from
  const next = LEVELS[i + 1]?.from ?? null
  return {
    level: i + 1,
    title: LEVELS[i].title,
    from,
    next,
    matches: n,
    progress: next === null ? 1 : (n - from) / (next - from),
    remaining: next === null ? 0 : next - n,
  }
}

/** Every level in order (1-based `level`), for the "how to level up" explanation. */
export const LEVEL_LADDER: readonly { level: number; title: string; from: number }[] = LEVELS.map((l, i) => ({ level: i + 1, ...l }))

/** The title of a level number (1-based), for "prochain niveau : …". */
export function levelTitle(level: number): string | null {
  return LEVELS[level - 1]?.title ?? null
}
