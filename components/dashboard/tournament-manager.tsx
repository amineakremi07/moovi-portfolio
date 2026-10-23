'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, ChevronDown, Loader2, Pencil, Plus, Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { cancelTournament, saveTournament, setTournamentEntryPaid } from '@/lib/actions/org-tournaments'
import { issuesToFieldErrors } from '@/lib/actions/result'
import { SPORT_LABEL } from '@/lib/clubs'
import { teamSizeLabel } from '@/lib/community'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { formatTND } from '@/lib/payments'
import type { Sport, TournamentStatus } from '@/lib/types/database'
import { tournamentFormSchema, type TournamentFormInput } from '@/lib/validations/community'

export type ManagedRegistration = {
  id: string
  playerName: string
  phone: string | null
  teamName: string | null
  teammates: string | null
  paid: boolean
  registeredAt: string
}

export type ManagedTournament = {
  id: string
  title: string
  description: string | null
  prize: string | null
  sport: Sport
  startsAt: string
  registrationDeadline: string
  entryFee: number
  teamSize: number
  maxTeams: number
  status: TournamentStatus
  registrations: ManagedRegistration[]
}

/** Default team size per sport: padel doubles, tennis singles, five-a-side football. */
const DEFAULT_TEAM: Record<Sport, string> = { padel: '2', tennis: '1', football: '5' }

const EMPTY_FORM: TournamentFormInput = {
  title: '',
  description: '',
  prize: '',
  sport: 'padel',
  date: '',
  time: '09:00',
  deadlineDate: '',
  deadlineTime: '20:00',
  entryFee: '0',
  teamSize: DEFAULT_TEAM.padel,
  maxTeams: '16',
}

const when = (iso: string) => `${formatVenueDate(venueDateString(new Date(iso)))} à ${formatVenueTime(iso)}`

/**
 * The club's tournaments. Owners create, edit and cancel them; owners and staff see who registered and
 * record entry fees paid at the club. Published tournaments appear on every player's home.
 */
export function TournamentManager({ tournaments, canEdit, now }: { tournaments: ManagedTournament[]; canEdit: boolean; now: number }) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<ManagedTournament | 'new' | null>(null)
  const [toCancel, setToCancel] = React.useState<ManagedTournament | null>(null)
  const [busy, setBusy] = React.useState(false)

  const upcoming = tournaments.filter((t) => Date.parse(t.startsAt) > now)
  const past = tournaments.filter((t) => Date.parse(t.startsAt) <= now)

  const cancel = async () => {
    if (!toCancel) return
    setBusy(true)
    const result = await cancelTournament(toCancel.id)
    setBusy(false)
    setToCancel(null)
    if (!result.success) return void toast.error(result.error)
    toast.success('Tournoi annulé. Il n\'apparaît plus aux joueurs.')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Tournois &amp; Événements</h2>
          <p className="text-sm text-[#645757]">
            Publiez vos tournois : ils s&apos;affichent sur l&apos;accueil de tous les joueurs. Les frais d&apos;inscription se règlent au club.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setEditing('new')} className="h-9 bg-[#1d3023] px-3 text-[#f7f5f2] hover:bg-[#1d3023]/90">
            <Plus aria-hidden /> Nouveau tournoi
          </Button>
        )}
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Aucun tournoi à venir"
          description={canEdit ? 'Créez votre premier tournoi pour attirer de nouveaux joueurs.' : 'Le propriétaire du club peut publier des tournois.'}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {upcoming.map((t) => (
            <TournamentRow key={t.id} t={t} canEdit={canEdit} onEdit={() => setEditing(t)} onCancel={() => setToCancel(t)} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-tournaments" className="space-y-3">
          <h3 id="past-tournaments" className="text-sm font-semibold">
            Tournois passés ({past.length})
          </h3>
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {past.map((t) => (
              <TournamentRow key={t.id} t={t} canEdit={false} />
            ))}
          </ul>
        </section>
      )}

      <Dialog open={toCancel !== null} onOpenChange={(o) => !o && !busy && setToCancel(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler {toCancel?.title} ?</DialogTitle>
            <DialogDescription>
              Le tournoi disparaît de l&apos;accueil des joueurs. Les {toCancel?.registrations.length ?? 0} inscriptions restent visibles ici :
              prévenez les inscrits et remboursez les frais déjà encaissés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setToCancel(null)} disabled={busy}>
              Le conserver
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Annuler le tournoi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TournamentDialog
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function TournamentRow({ t, canEdit, onEdit, onCancel }: { t: ManagedTournament; canEdit: boolean; onEdit?: () => void; onCancel?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const cancelled = t.status === 'cancelled'
  const paid = t.registrations.filter((r) => r.paid).length

  return (
    <li className="rounded-xl bg-[#eae6df] p-5" data-testid="managed-tournament">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{SPORT_LABEL[t.sport]}</Badge>
        <Badge variant="outline">{teamSizeLabel(t.teamSize)}</Badge>
        {cancelled ? <Badge variant="destructive">Annulé</Badge> : <Badge variant="success">Publié</Badge>}
      </div>
      <h3 className="mt-2 text-base font-semibold">{t.title}</h3>
      {t.prize && <p className="mt-0.5 text-sm text-[#0e634f]">Dotation : {t.prize}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[#645757]">Début</dt>
          <dd className="font-medium">{when(t.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-[#645757]">Clôture des inscriptions</dt>
          <dd className="font-medium">{when(t.registrationDeadline)}</dd>
        </div>
        <div>
          <dt className="text-[#645757]">Frais d&apos;inscription</dt>
          <dd className="font-medium">{t.entryFee > 0 ? formatTND(t.entryFee) : 'Gratuit'}</dd>
        </div>
        <div>
          <dt className="text-[#645757]">Inscriptions</dt>
          <dd className="font-medium tabular-nums">
            {t.registrations.length}/{t.maxTeams}
            {t.entryFee > 0 && t.registrations.length > 0 && <span className="text-[#645757]"> · {paid} payée{paid > 1 ? 's' : ''}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className={open ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden />
          Inscrits ({t.registrations.length})
        </Button>
        {canEdit && !cancelled && (
          <>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil aria-hidden /> Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel}>
              <Ban aria-hidden /> Annuler
            </Button>
          </>
        )}
      </div>

      {open && <Registrations registrations={t.registrations} withFee={t.entryFee > 0} />}
    </li>
  )
}

function Registrations({ registrations, withFee }: { registrations: ManagedRegistration[]; withFee: boolean }) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const setPaid = async (r: ManagedRegistration, paid: boolean) => {
    setBusyId(r.id)
    const result = await setTournamentEntryPaid(r.id, paid)
    setBusyId(null)
    if (!result.success) return void toast.error(result.error)
    toast.success(paid ? `Paiement de ${r.playerName} enregistré` : `Paiement de ${r.playerName} retiré`)
    router.refresh()
  }

  if (registrations.length === 0) return <p className="mt-3 text-sm text-[#645757]">Aucun inscrit pour le moment.</p>

  return (
    <ul className="mt-3 divide-y divide-[#d7d2cc] rounded-lg bg-[#f7f5f2] px-3 text-sm">
      {registrations.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="font-medium">
              {r.playerName}
              {r.teamName && <span className="text-[#645757]"> · {r.teamName}</span>}
            </p>
            <p className="text-xs text-[#645757]">
              {r.phone && (
                <a href={`tel:${r.phone}`} className="underline-offset-4 hover:underline">
                  {r.phone}
                </a>
              )}
              {r.teammates && <span>{r.phone ? ' · ' : ''}Avec : {r.teammates}</span>}
            </p>
          </div>
          {withFee && (
            <label className="flex items-center gap-2 text-xs">
              {busyId === r.id && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {r.paid ? 'Payé' : 'À payer'}
              <Switch checked={r.paid} disabled={busyId === r.id} onCheckedChange={(v) => setPaid(r, v)} aria-label={`Frais payés par ${r.playerName}`} />
            </label>
          )}
        </li>
      ))}
    </ul>
  )
}

function toForm(t: ManagedTournament): TournamentFormInput {
  return {
    title: t.title,
    description: t.description ?? '',
    prize: t.prize ?? '',
    sport: t.sport,
    date: venueDateString(new Date(t.startsAt)),
    time: formatVenueTime(t.startsAt),
    deadlineDate: venueDateString(new Date(t.registrationDeadline)),
    deadlineTime: formatVenueTime(t.registrationDeadline),
    entryFee: String(t.entryFee),
    teamSize: String(t.teamSize),
    maxTeams: String(t.maxTeams),
  }
}

function TournamentDialog({ target, onClose, onSaved }: { target: ManagedTournament | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const existing = target && target !== 'new' ? target : null
  const [form, setForm] = React.useState<TournamentFormInput>(existing ? toForm(existing) : EMPTY_FORM)
  const [errors, setErrors] = React.useState<Record<string, string[] | undefined>>({})
  const [saving, setSaving] = React.useState(false)

  const set = <K extends keyof TournamentFormInput>(key: K, value: TournamentFormInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = tournamentFormSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues))
      return
    }
    setErrors({})
    setSaving(true)
    const result = await saveTournament(existing?.id ?? null, form)
    setSaving(false)
    if (!result.success) {
      if (result.issues) setErrors(issuesToFieldErrors(result.issues))
      return void toast.error(result.error)
    }
    toast.success(existing ? 'Tournoi mis à jour' : 'Tournoi publié')
    onSaved()
  }

  const err = (k: string) => errors[k]?.[0]

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-[#eae6df] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Modifier le tournoi' : 'Nouveau tournoi'}</DialogTitle>
          <DialogDescription>Dates et heures du club (heure de Tunis).</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="t-title" label="Titre" error={err('title')}>
            <Input
              id="t-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Tournoi padel du week-end"
              maxLength={120}
              error={Boolean(err('title'))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="t-sport" label="Sport" error={err('sport')}>
              <Select
                value={form.sport}
                onValueChange={(v) => setForm((f) => ({ ...f, sport: v as Sport, teamSize: existing ? f.teamSize : DEFAULT_TEAM[v as Sport] }))}
              >
                <SelectTrigger id="t-sport" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padel">Padel</SelectItem>
                  <SelectItem value="tennis">Tennis</SelectItem>
                  <SelectItem value="football">Football</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="t-team" label="Joueurs par équipe" error={err('teamSize')}>
              <Select value={String(form.teamSize)} onValueChange={(v) => set('teamSize', v)}>
                <SelectTrigger id="t-team" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4', '5', '6', '7'].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n === '1' ? '1 (individuel)' : n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="t-date" label="Date" error={err('date')}>
              <Input id="t-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} error={Boolean(err('date'))} />
            </Field>
            <Field id="t-time" label="Heure de début" error={err('time')}>
              <Input id="t-time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} error={Boolean(err('time'))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="t-deadline" label="Clôture des inscriptions" error={err('deadlineDate')}>
              <Input
                id="t-deadline"
                type="date"
                value={form.deadlineDate}
                onChange={(e) => set('deadlineDate', e.target.value)}
                error={Boolean(err('deadlineDate'))}
              />
            </Field>
            <Field id="t-deadline-time" label="à" error={err('deadlineTime')}>
              <Input
                id="t-deadline-time"
                type="time"
                value={form.deadlineTime}
                onChange={(e) => set('deadlineTime', e.target.value)}
                error={Boolean(err('deadlineTime'))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="t-fee" label="Frais d'inscription (TND)" error={err('entryFee')}>
              <Input id="t-fee" inputMode="decimal" value={form.entryFee} onChange={(e) => set('entryFee', e.target.value)} error={Boolean(err('entryFee'))} />
            </Field>
            <Field id="t-max" label="Places (équipes ou joueurs)" error={err('maxTeams')}>
              <Input
                id="t-max"
                inputMode="numeric"
                value={String(form.maxTeams)}
                onChange={(e) => set('maxTeams', e.target.value)}
                error={Boolean(err('maxTeams'))}
              />
            </Field>
          </div>

          <Field id="t-prize" label="Dotation (facultatif)" error={err('prize')}>
            <Input
              id="t-prize"
              value={form.prize ?? ''}
              onChange={(e) => set('prize', e.target.value)}
              maxLength={120}
              placeholder="Ex. : 500 TND + raquettes pour les vainqueurs"
              error={Boolean(err('prize'))}
            />
          </Field>

          <Field id="t-desc" label="Description (facultatif)" error={err('description')}>
            <Textarea
              id="t-desc"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Format, lots, niveau conseillé..."
            />
          </Field>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {existing ? 'Enregistrer' : 'Publier le tournoi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
