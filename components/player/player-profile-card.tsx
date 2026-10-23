import { Flame } from 'lucide-react'

import { InfoTip } from '@/components/ui/info-tip'
import { LEVEL_LADDER, levelTitle, type LevelProgress } from '@/lib/player-level'
import type { PlayerStats } from '@/lib/player-stats'
import { cn } from '@/lib/utils'

/**
 * The player's level, progress to the next one and three numbers. Desktop: a compact card in the
 * sidebar. Phones: `PlayerLevelBanner`, one row under the greeting. Both spell out the rule
 * ("1/3 matchs joués pour débloquer Niveau 2 : …") and keep the full ladder behind an ⓘ.
 */
export function PlayerProfileCard({ level, stats, className }: { level: LevelProgress; stats: PlayerStats; className?: string }) {
  return (
    <section aria-labelledby="player-level-title" data-testid="player-profile" className={cn('rounded-xl border border-black/[0.08] bg-white p-4', className)}>
      <div className="flex items-center gap-3">
        <LevelMark level={level.level} className="size-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 id="player-level-title" className="truncate text-sm font-semibold">
              Niveau {level.level} · {level.title}
            </h2>
            <LevelHelp level={level} />
          </div>
          <ProgressTrack value={level.progress} label={progressLine(level)} className="mt-2" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="level-progress-line">
        {progressLine(level)}
      </p>

      <dl className="mt-3 grid grid-cols-3 divide-x divide-black/[0.06] border-t border-black/[0.06] pt-3 text-center">
        <Figure label="ce mois-ci" value={stats.monthMatches} />
        <Figure label={stats.weekStreak > 1 ? 'semaines' : 'semaine'} value={stats.weekStreak} streak />
        <Figure label={level.matches > 1 ? 'matchs joués' : 'match joué'} value={level.matches} />
      </dl>
    </section>
  )
}

export function PlayerLevelBanner({ level, stats }: { level: LevelProgress; stats: PlayerStats }) {
  return (
    <section aria-label={`Niveau ${level.level} · ${level.title}`} data-testid="player-level-banner" className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-white p-3 md:hidden">
      <LevelMark level={level.level} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-0.5">
            <span className="truncate text-sm font-semibold">{level.title}</span>
            <LevelHelp level={level} />
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
            <Flame className="size-3.5 text-peacock-teal" aria-hidden />
            {stats.weekStreak} sem. · {stats.monthMatches} ce mois
          </span>
        </div>
        <ProgressTrack value={level.progress} label={progressLine(level)} className="mt-1.5" />
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="level-progress-line">
          {progressLine(level)}
        </p>
      </div>
    </section>
  )
}

function LevelMark({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg bg-forest-depths text-bone-linen', className)} aria-label={`Niveau ${level}`}>
      <span className="text-[0.625rem] font-medium uppercase leading-none tracking-[0.06em] text-bone-linen/70" aria-hidden>
        Niv.
      </span>
      <span className="mt-0.5 text-lg font-semibold leading-none tabular-nums" aria-hidden>
        {level}
      </span>
    </span>
  )
}

/** "1/3 matchs joués pour débloquer Niveau 2 : Joueur occasionnel". */
function progressLine(level: LevelProgress) {
  if (level.next === null) return `Niveau maximum atteint · ${level.matches} matchs joués`
  return `${level.matches}/${level.next} ${level.next > 1 ? 'matchs joués' : 'match joué'} pour débloquer Niveau ${level.level + 1} : ${levelTitle(level.level + 1)}`
}

/** The rule and the full ladder, one tap away. */
function LevelHelp({ level }: { level: LevelProgress }) {
  return (
    <InfoTip label="Comment monter de niveau ?">
      <p className="font-semibold text-foreground">Comment monter de niveau ?</p>
      <p className="mt-1">
        <strong>1 match joué = +1 XP.</strong> Un match compte une fois le créneau terminé, si la réservation est confirmée. Les
        annulations et les absences ne comptent pas.
      </p>
      <ol className="mt-2 space-y-0.5">
        {LEVEL_LADDER.map((l) => (
          <li
            key={l.level}
            aria-current={l.level === level.level ? 'true' : undefined}
            className={cn('flex justify-between gap-3 tabular-nums', l.level === level.level && 'font-semibold text-foreground')}
          >
            <span>
              Niv. {l.level} · {l.title}
            </span>
            <span className="text-muted-foreground">{l.from === 0 ? 'départ' : `${l.from} XP`}</span>
          </li>
        ))}
      </ol>
    </InfoTip>
  )
}

function ProgressTrack({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn('h-1.5 overflow-hidden rounded-full bg-black/[0.06]', className)}>
      <div className="h-full rounded-full bg-peacock-teal" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Figure({ label, value, streak = false }: { label: string; value: number; streak?: boolean }) {
  return (
    <div className="px-1">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center justify-center gap-1 text-base font-semibold leading-tight tabular-nums">
        {streak && <Flame className="size-3.5 text-peacock-teal" aria-hidden />}
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground" aria-hidden>
        {label}
      </dd>
    </div>
  )
}
