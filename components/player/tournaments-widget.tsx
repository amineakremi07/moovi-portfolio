'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { CalendarDays, Gift, Loader2, MapPin, Trophy, Users } from 'lucide-react'
import { toast } from 'sonner'

import { SPORT_ICON } from '@/components/icons/sport-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useMinuteClock } from '@/hooks/use-minute-clock'
import { cancelTournamentRegistration, registerForTournament } from '@/lib/actions/community'
import { SPORT_LABEL } from '@/lib/clubs'
import { teamSizeLabel, tournamentOpen, tournamentSpotsLeft, type TournamentCard } from '@/lib/community'
import { formatVenueDayMonth, formatVenueTime, venueDateString } from '@/lib/court-time'
import { formatTND } from '@/lib/payments'
import { cn } from '@/lib/utils'

const dayOf = (iso: string) => formatVenueDayMonth(venueDateString(new Date(iso)))

/**
 * "Tournois & Événements": upcoming tournaments of every club. Sidebar card from `lg` (a vertical list);
 * on phones and tablets a swipeable row. Each card: the club's photo as cover with the sport / format
 * badge, title and date on it; then the entry fee and prize, how full it is, and one full-width action.
 * Registration is free to make; the entry fee is paid at the club.
 */
export function TournamentsWidget({ tournaments, failed = false }: { tournaments: TournamentCard[]; failed?: boolean }) {
  // The open / closed state needs the clock: null until hydrated, so server and client agree.
  const now = useMinuteClock()

  return (
    <section id="tournois" aria-labelledby="tournaments-heading" className="scroll-mt-24 rounded-xl border border-black/[0.08] bg-white p-4 md:p-5">
      <h2 id="tournaments-heading" className="flex items-center gap-2 font-semibold">
        <Trophy className="size-4 text-peacock-teal" aria-hidden />
        Tournois &amp; Événements
      </h2>

      {failed ? (
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          Impossible de charger les tournois. Actualisez la page dans un instant.
        </p>
      ) : tournaments.length === 0 ? (
        <EmptyState
          variant="outline"
          compact
          icon={Trophy}
          title="Aucun tournoi annoncé"
          description="Les clubs publient leurs prochains tournois ici."
          className="mt-3"
          data-testid="tournaments-empty"
        />
      ) : (
        <ul
          aria-label="Prochains tournois"
          className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:-mx-5 md:scroll-px-5 md:px-5 lg:mx-0 lg:flex-col lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {tournaments.map((t) => (
            <TournamentItem key={t.id} tournament={t} now={now} className="w-[82%] max-w-[21rem] shrink-0 snap-start sm:w-[21rem] lg:w-auto lg:max-w-none" />
          ))}
        </ul>
      )}
    </section>
  )
}

function TournamentItem({ tournament: t, now, className }: { tournament: TournamentCard; now: number | null; className?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [teamName, setTeamName] = React.useState('')
  const [teammates, setTeammates] = React.useState('')
  const Icon = SPORT_ICON[t.sport]
  const left = tournamentSpotsLeft(t)
  const canRegister = now !== null && tournamentOpen(t, now)
  const closedLabel = left <= 0 ? 'Complet' : 'Inscriptions closes'

  const register = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await registerForTournament({ tournamentId: t.id, teamName, teammates })
    setBusy(false)
    if (!result.success) {
      toast.error(result.error)
      router.refresh()
      return
    }
    setOpen(false)
    toast.success(`Inscription confirmée : ${t.title}. Un e-mail récapitulatif arrive.`)
    router.refresh()
  }

  const unregister = async () => {
    setBusy(true)
    const result = await cancelTournamentRegistration({ tournamentId: t.id })
    setBusy(false)
    if (!result.success) return void toast.error(result.error)
    toast.success('Inscription annulée.')
    router.refresh()
  }

  const filled = Math.min(100, Math.round((t.registeredCount / Math.max(1, t.maxTeams)) * 100))

  return (
    <li className={cn('flex flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-white', className)} data-testid="tournament">
      {/* Cover: the club's photo under a forest gradient (or the forest room with the sport's mark). */}
      <div className="relative h-32 shrink-0 overflow-hidden bg-forest-depths">
        {t.coverUrl ? (
          <Image src={t.coverUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 22rem, 80vw" className="object-cover" />
        ) : (
          <Icon className="absolute -bottom-6 -right-4 size-36 text-bone-linen/10" aria-hidden />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-depths via-forest-depths/55 to-forest-depths/10" aria-hidden />
        <div className="absolute inset-x-3 top-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-lime-pulse px-2 py-0.5 text-[0.7rem] font-semibold text-forest-depths">
            <Icon className="size-3.5" aria-hidden />
            {SPORT_LABEL[t.sport]} · {teamSizeLabel(t.teamSize)}
          </span>
          {t.registered && (
            <span className="rounded-full bg-bone-linen px-2 py-0.5 text-[0.7rem] font-semibold text-forest-depths">Inscrit</span>
          )}
        </div>
        <div className="absolute inset-x-3 bottom-2.5 text-bone-linen">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">{t.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-bone-linen/80">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            {dayOf(t.startsAt)} · <span className="tabular-nums">{formatVenueTime(t.startsAt)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {t.clubName}
          {t.city ? `, ${t.city}` : ''}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-oat-milk px-2.5 py-2">
            <dt className="text-[0.7rem] text-muted-foreground">Inscription</dt>
            <dd className="font-semibold tabular-nums">{t.entryFee > 0 ? formatTND(t.entryFee) : 'Gratuite'}</dd>
          </div>
          <div className="rounded-lg bg-oat-milk px-2.5 py-2">
            <dt className="flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <Gift className="size-3" aria-hidden />
              Dotation
            </dt>
            <dd className="line-clamp-2 font-semibold leading-snug" title={t.prize ?? undefined}>
              {t.prize ?? 'À découvrir au club'}
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 tabular-nums">
              <Users className="size-3.5" aria-hidden />
              {t.registeredCount}/{t.maxTeams} inscrits
            </span>
            <span className="tabular-nums">{left > 0 ? `${left} place${left > 1 ? 's' : ''}` : 'Complet'}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]" role="presentation">
            <div className="h-full rounded-full bg-peacock-teal" style={{ width: `${filled}%` }} />
          </div>
        </div>

        <div className="mt-auto pt-3.5">
          {t.registered ? (
            <Button variant="outline" className="h-10 w-full" onClick={unregister} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Se désinscrire
            </Button>
          ) : canRegister ? (
            <Button className="h-10 w-full text-sm font-semibold" onClick={() => setOpen(true)}>
              <Trophy aria-hidden />
              S&apos;inscrire{t.entryFee > 0 ? ` · ${formatTND(t.entryFee)}` : ''}
            </Button>
          ) : (
            <Button variant="outline" className="h-10 w-full" disabled>
              {now === null ? 'Chargement…' : closedLabel}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>S&apos;inscrire : {t.title}</DialogTitle>
            <DialogDescription>
              {t.clubName}, {dayOf(t.startsAt)} à {formatVenueTime(t.startsAt)}. Clôture des inscriptions le {dayOf(t.registrationDeadline)} à{' '}
              {formatVenueTime(t.registrationDeadline)}. {t.entryFee > 0 ? `Frais d'inscription : ${formatTND(t.entryFee)}, à régler au club.` : 'Inscription gratuite.'}
            </DialogDescription>
          </DialogHeader>
          {t.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{t.description}</p>}
          <form onSubmit={register} className="grid gap-4" noValidate>
            {t.teamSize > 1 && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`team-${t.id}`}>Nom de l&apos;équipe (facultatif)</Label>
                  <Input id={`team-${t.id}`} value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={60} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`mates-${t.id}`}>Vos coéquipiers (facultatif)</Label>
                  <Textarea
                    id={`mates-${t.id}`}
                    value={teammates}
                    onChange={(e) => setTeammates(e.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="Prénoms et noms, séparés par des virgules"
                  />
                </div>
              </>
            )}
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Confirmer l&apos;inscription
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  )
}
