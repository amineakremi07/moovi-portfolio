import { redirect } from 'next/navigation'

import { TournamentManager, type ManagedTournament } from '@/components/dashboard/tournament-manager'
import { getOrgAccess } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export const dynamic = 'force-dynamic'

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => Date.now()

/**
 * The club's tournaments with their registrations. Owners manage them; staff see the list and record
 * entry fees. Service role (players' names and phones are not readable through RLS), always scoped to the
 * club from the verified session.
 */
export default async function OrgTournamentsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  const { ctx } = access

  const { data, error } = await getSupabaseAdmin()
    .from('tournaments')
    .select(
      'id, title, description, prize, sport, starts_at, registration_deadline, entry_fee, team_size, max_teams, status, tournament_registrations(id, team_name, teammates, status, paid_at, created_at, profiles(display_name, phone))'
    )
    .eq('org_id', ctx.orgId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })

  if (error) {
    console.error('Failed to load tournaments:', { code: error.code, message: error.message })
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        Impossible de charger vos tournois. Veuillez actualiser la page dans un instant.
      </div>
    )
  }

  const tournaments: ManagedTournament[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    prize: t.prize,
    sport: t.sport,
    startsAt: t.starts_at,
    registrationDeadline: t.registration_deadline,
    entryFee: Number(t.entry_fee),
    teamSize: t.team_size,
    maxTeams: t.max_teams,
    status: t.status,
    registrations: (t.tournament_registrations ?? [])
      .filter((r) => r.status === 'registered')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({
        id: r.id,
        playerName: r.profiles?.display_name || 'Joueur',
        phone: r.profiles?.phone ?? null,
        teamName: r.team_name,
        teammates: r.teammates,
        paid: r.paid_at !== null,
        registeredAt: r.created_at,
      })),
  }))

  return <TournamentManager tournaments={tournaments} canEdit={ctx.role === 'org_admin'} now={readClock()} />
}
