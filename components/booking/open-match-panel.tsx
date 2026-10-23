'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { PlayerSlots } from '@/components/player/open-matches'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { setMatchOpenSpots } from '@/lib/actions/community'
import { SKILL_LEVEL_LABEL, SKILL_LEVELS, type MatchRoster } from '@/lib/community'
import type { SkillLevel } from '@/lib/types/database'

const ANY_LEVEL = 'any'

/**
 * The organiser's "Chercher des joueurs" on their own pass: offer free places in "Parties ouvertes",
 * say which level is welcome, and see who joined. Turning it off withdraws the places still on offer;
 * players who already joined stay in the match.
 */
export function OpenMatchPanel({ bookingId, playerCount, roster }: { bookingId: string; playerCount: number; roster: MatchRoster }) {
  const router = useRouter()
  // Places held by joiners (a duo seated by the matchmaker holds two).
  const joined = roster.players.reduce((total, p) => total + p.seats, 0)
  const maxSpots = Math.max(0, playerCount - 1 - joined)
  const [enabled, setEnabled] = React.useState(roster.openSpots > 0)
  const [spots, setSpots] = React.useState(String(Math.max(1, Math.min(roster.openSpots || 1, maxSpots || 1))))
  const [levelMin, setLevelMin] = React.useState<string>(roster.level ? String(roster.level.min) : ANY_LEVEL)
  const [levelMax, setLevelMax] = React.useState<string>(roster.level ? String(roster.level.max) : '5')
  const [note, setNote] = React.useState(roster.note ?? '')
  const [busy, setBusy] = React.useState(false)

  const save = async (open: boolean) => {
    setBusy(true)
    const result = await setMatchOpenSpots({
      bookingId,
      openSpots: open ? Number(spots) : 0,
      level:
        open && levelMin !== ANY_LEVEL
          ? { min: Number(levelMin) as SkillLevel, max: Math.max(Number(levelMin), Number(levelMax)) as SkillLevel }
          : null,
      note: open ? note : undefined,
    })
    setBusy(false)
    if (!result.success) {
      toast.error(result.error)
      return false
    }
    toast.success(open ? 'Votre partie est visible dans « Parties ouvertes ».' : 'Votre partie n\'est plus proposée.')
    router.refresh()
    return true
  }

  const toggle = async (value: boolean) => {
    setEnabled(value)
    // Turning it off applies at once; turning it on waits for the number of places.
    if (!value && roster.openSpots > 0 && !(await save(false))) setEnabled(true)
  }

  return (
    <section aria-labelledby="open-match-heading" className="rounded-lg border border-border p-4" data-testid="open-match-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="open-match-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Chercher des joueurs
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Proposez les places libres dans « Parties ouvertes ». Chaque joueur règle sa part au club.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          disabled={busy || (maxSpots === 0 && roster.openSpots === 0)}
          aria-label="Chercher des joueurs"
        />
      </div>

      <div className="mt-3">
        <PlayerSlots total={playerCount} filled={playerCount - roster.openSpots} />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {joined === 0
            ? 'Personne n\'a encore rejoint votre partie.'
            : `${roster.players.length === 1 ? 'A rejoint' : 'Ont rejoint'} : ${roster.players
                .map((p) => (p.seats > 1 ? `${p.firstName} (+${p.seats - 1})` : p.firstName))
                .join(', ')}.`}
        </p>
      </div>

      {enabled && maxSpots > 0 && (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save(true)
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="open-spots">Places à pourvoir</Label>
            <Select value={spots} onValueChange={setSpots}>
              <SelectTrigger id="open-spots" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxSpots }, (_, i) => String(i + 1)).map((n) => (
                  <SelectItem key={n} value={n}>
                    {n} place{n === '1' ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Niveau de jeu recherché</legend>
            <div className="grid grid-cols-2 gap-2">
              <Select value={levelMin} onValueChange={setLevelMin}>
                <SelectTrigger id="open-level" className="w-full" aria-label="Niveau minimum">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_LEVEL}>Tous niveaux</SelectItem>
                  {SKILL_LEVELS.map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      Dès niv. {l} · {SKILL_LEVEL_LABEL[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={levelMax} onValueChange={setLevelMax} disabled={levelMin === ANY_LEVEL}>
                <SelectTrigger className="w-full" aria-label="Niveau maximum">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.filter((l) => levelMin === ANY_LEVEL || l >= Number(levelMin)).map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      Jusqu&apos;au niv. {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="open-note">Message (facultatif)</Label>
            <Input id="open-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ex. : partie détente, ambiance conviviale" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" className="h-10 px-4" disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {roster.openSpots > 0 ? 'Mettre à jour' : 'Publier la partie'}
            </Button>
          </div>
        </form>
      )}
      {enabled && maxSpots === 0 && <p className="mt-3 text-xs font-medium">Votre partie est complète.</p>}
    </section>
  )
}
