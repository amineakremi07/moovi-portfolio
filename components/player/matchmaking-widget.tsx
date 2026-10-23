'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { Button } from '@/components/ui/button'
import { SPRING } from '@/components/ui/motion-button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cancelMatchRequest, createMatchRequest } from '@/lib/actions/matchmaking'
import { SPORT_LABEL } from '@/lib/clubs'
import { levelRangeLabel, SKILL_LEVEL_LABEL, SKILL_LEVELS, type MatchRequestCard } from '@/lib/community'
import { addDays, formatVenueDayMonth, formatVenueTime, venueDateString } from '@/lib/court-time'
import { useOpenMatchesFeed, type OpenMatchesFeedStatus } from '@/lib/realtime/open-matches-feed'
import type { SkillLevel, Sport } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import {
  MATCH_PERIODS,
  matchRequestFormSchema,
  type MatchPeriod,
  type MatchRequestFormInput,
  type MatchRequestFormOutput,
} from '@/lib/validations/community'

const SPORTS: Sport[] = ['padel', 'tennis', 'football']
const DAYS_AHEAD = 14

/**
 * "Trouve-moi une partie": the player says when, at which level and for how many, and the matchmaker agent
 * (supabase/functions/autonomous-agents) seats them in a compatible open match, filling 3/4 games first.
 * Flat white surface, hairline borders, no shadows; Lime Pulse only on the action that starts a
 * search. Live: the private `open-matches` broadcast and the player's own match_requests rows refresh it.
 */
export function MatchmakingWidget({
  viewerId,
  today,
  requests,
  playerLevel,
  failed = false,
  className,
}: {
  viewerId: string
  /** The venue's date (Africa/Tunis) at render time, from the server: no hydration drift at midnight. */
  today: string
  requests: MatchRequestCard[]
  playerLevel: SkillLevel | null
  failed?: boolean
  className?: string
}) {
  const router = useRouter()
  const open = requests.filter((r) => r.status === 'open')
  const [composing, setComposing] = React.useState(open.length === 0 && !failed)
  const reduceMotion = useReducedMotion()

  const status = useOpenMatchesFeed(viewerId, {
    onChange: () => router.refresh(),
    onMatched: () => toast.success('Partie trouvée ! Retrouvez-la dans « Parties ouvertes ».'),
  })

  return (
    <section
      aria-labelledby="matchmaking-heading"
      className={cn('rounded-xl border border-black/[0.08] bg-white p-4', className)}
      data-testid="matchmaking-widget"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="matchmaking-heading" className="text-base font-semibold tracking-tight">
            Trouve-moi une partie
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">On vous place dans une partie ouverte à votre niveau, en priorité celles à qui il manque un joueur.</p>
        </div>
        <LiveDot status={status} />
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-sm text-muted-foreground">
          Impossible de charger vos recherches. Actualisez la page dans un instant.
        </p>
      ) : (
        requests.length > 0 && (
          <ul className="mt-3 divide-y divide-black/[0.08] border-y border-black/[0.08]" aria-label="Vos recherches">
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </ul>
        )
      )}

      <AnimatePresence initial={false}>
        {composing && !failed ? (
          <motion.div
            key="form"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0 } : SPRING}
            className="overflow-hidden"
          >
            <RequestForm today={today} playerLevel={playerLevel} onDone={() => setComposing(false)} canClose={open.length > 0} />
          </motion.div>
        ) : (
          !failed && (
            <motion.div key="cta" initial={false} className="mt-3">
              <Button variant="outline" className="h-10 w-full" onClick={() => setComposing(true)} disabled={open.length >= 3}>
                <Search aria-hidden />
                {open.length >= 3 ? 'Trois recherches en cours' : 'Nouvelle recherche'}
              </Button>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </section>
  )
}

function LiveDot({ status }: { status: OpenMatchesFeedStatus }) {
  const label = status === 'live' ? 'En direct' : status === 'connecting' ? 'Connexion…' : 'Hors ligne'
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="matchmaking-live" data-status={status}>
      <span aria-hidden className={cn('size-2 rounded-full', status === 'live' ? 'bg-peacock-teal' : 'border border-muted-foreground/50')} />
      {label}
    </span>
  )
}

function windowLabel(r: Pick<MatchRequestCard, 'windowStart' | 'windowEnd'>): string {
  const day = formatVenueDayMonth(venueDateString(new Date(r.windowStart)))
  return `${day} · ${formatVenueTime(r.windowStart)}–${formatVenueTime(r.windowEnd)}`
}

function RequestRow({ request }: { request: MatchRequestCard }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const Icon = SPORT_ICON[request.sport]

  const cancel = async () => {
    setBusy(true)
    const result = await cancelMatchRequest({ requestId: request.id })
    setBusy(false)
    if (!result.success) toast.error(result.error)
    router.refresh()
  }

  return (
    <li className="flex items-center gap-3 py-3" data-testid="match-request" data-status={request.status}>
      <Icon className="size-5 shrink-0 text-peacock-teal" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {SPORT_LABEL[request.sport]} · {levelRangeLabel(request.level)}
          {request.requiredPlayers > 1 && <span className="text-muted-foreground"> · {request.requiredPlayers} places</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {request.status === 'matched' && request.match
            ? `${request.match.clubName} · ${formatVenueDayMonth(venueDateString(new Date(request.match.startsAt)))} à ${formatVenueTime(request.match.startsAt)}`
            : windowLabel(request)}
        </p>
      </div>
      {request.status === 'open' ? (
        <>
          <span className="shrink-0 rounded-sm border border-dashed border-peacock-teal/60 px-2 py-0.5 text-xs font-medium text-peacock-teal">Recherche…</span>
          <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={cancel} disabled={busy} aria-label="Annuler cette recherche">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
          </Button>
        </>
      ) : request.status === 'matched' ? (
        <span className="shrink-0 rounded-sm bg-forest-depths px-2 py-0.5 text-xs font-medium text-bone-linen">Partie trouvée</span>
      ) : (
        <span className="shrink-0 rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground">Expirée</span>
      )}
    </li>
  )
}

function RequestForm({
  today,
  playerLevel,
  onDone,
  canClose,
}: {
  today: string
  playerLevel: SkillLevel | null
  onDone: () => void
  canClose: boolean
}) {
  const router = useRouter()
  const days = React.useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)), [today])
  const ownLevel = String(playerLevel ?? 3) as MatchRequestFormInput['playerLevel']
  const form = useForm<MatchRequestFormInput, unknown, MatchRequestFormOutput>({
    resolver: zodResolver(matchRequestFormSchema),
    defaultValues: {
      sport: 'padel',
      date: today,
      period: 'soir',
      requiredPlayers: '1',
      playerLevel: ownLevel,
      levelMin: String(Math.max(1, Number(ownLevel) - 1)) as MatchRequestFormInput['levelMin'],
      levelMax: String(Math.min(5, Number(ownLevel) + 1)) as MatchRequestFormInput['levelMax'],
    },
  })
  const { isSubmitting, errors } = form.formState
  const levelMin = Number(useWatch({ control: form.control, name: 'levelMin' }))

  const submit = form.handleSubmit(async (values) => {
    const result = await createMatchRequest(values)
    if (!result.success) return void toast.error(result.error)
    toast.success('Recherche lancée. Nous vous prévenons par e-mail dès qu\'une partie est trouvée.')
    onDone()
    router.refresh()
  })

  const select = (name: 'date' | 'period' | 'requiredPlayers' | 'playerLevel' | 'levelMin' | 'levelMax', label: string, options: [string, string][], id: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(errors[name])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors[name]?.message && <p className="text-xs text-destructive">{errors[name]?.message}</p>}
    </div>
  )

  const levels = SKILL_LEVELS.map((l): [string, string] => [String(l), `Niv. ${l} · ${SKILL_LEVEL_LABEL[l]}`])

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3" data-testid="match-request-form" noValidate>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Sport</legend>
        <Controller
          control={form.control}
          name="sport"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Sport" className="grid grid-cols-3 gap-2">
              {SPORTS.map((sport) => {
                const Icon = SPORT_ICON[sport]
                const checked = field.value === sport
                return (
                  <button
                    key={sport}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => field.onChange(sport)}
                    className={cn(
                      'flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      checked ? 'border-forest-depths bg-forest-depths text-bone-linen' : 'border-black/[0.12] hover:bg-black/[0.03]'
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {SPORT_LABEL[sport]}
                  </button>
                )
              })}
            </div>
          )}
        />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {select(
          'date',
          'Jour',
          days.map((d, i): [string, string] => [d, i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : formatVenueDayMonth(d)]),
          'mm-date'
        )}
        {select(
          'period',
          'Moment',
          (Object.keys(MATCH_PERIODS) as MatchPeriod[]).map((p): [string, string] => [p, MATCH_PERIODS[p].label]),
          'mm-period'
        )}
        {select('playerLevel', 'Votre niveau', levels, 'mm-own-level')}
        {select(
          'requiredPlayers',
          'Places',
          [
            ['1', 'Moi seul'],
            ['2', 'Nous deux'],
            ['3', 'Nous trois'],
          ],
          'mm-places'
        )}
        {select('levelMin', 'Partenaires dès', levels, 'mm-level-min')}
        {select(
          'levelMax',
          "Jusqu'à",
          levels.filter(([v]) => Number(v) >= levelMin),
          'mm-level-max'
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" className="h-11 flex-1" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          Lancer la recherche
        </Button>
        {canClose && (
          <Button type="button" variant="ghost" className="h-11" onClick={onDone} disabled={isSubmitting}>
            Fermer
          </Button>
        )}
      </div>
    </form>
  )
}
