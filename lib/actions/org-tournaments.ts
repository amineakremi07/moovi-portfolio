'use server'

import { revalidatePath } from 'next/cache'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { requireOrgAction } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { captureAudit } from '@/lib/telemetry'
import { tournamentFormSchema, type TournamentFormInput } from '@/lib/validations/community'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Club side of "Tournois & Événements". Clients cannot write tournaments at all (no grants), so these
 * run with the service role, always scoped by `.eq('org_id', ctx.orgId)` from the verified session after
 * requireOrgAction (which also enforces the second factor and an approved club).
 */
export async function saveTournament(tournamentId: string | null, input: TournamentFormInput): Promise<ActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return actionFail(auth.message)
  const limited = await actionRateLimit('booking', auth.ctx.userId)
  if (limited) return actionFail(limited)
  if (tournamentId !== null && !UUID.test(tournamentId)) return actionFail('Tournoi invalide.')

  const parsed = tournamentFormSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod('Veuillez corriger les champs signalés.', parsed.error)
  const v = parsed.data
  if (Date.parse(v.startsAt) <= Date.now()) {
    return actionFail('Veuillez corriger les champs signalés.', [
      { code: 'custom', path: ['date'], message: 'Le tournoi doit commencer dans le futur.' },
    ])
  }

  const fields = {
    title: v.title,
    description: v.description,
    prize: v.prize,
    sport: v.sport,
    starts_at: v.startsAt,
    registration_deadline: v.registrationDeadline,
    entry_fee: v.entryFee,
    team_size: v.teamSize,
    max_teams: v.maxTeams,
  }
  const admin = getSupabaseAdmin()

  if (tournamentId) {
    // Never fewer places than players already registered.
    const { count } = await admin
      .from('tournament_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'registered')
    if ((count ?? 0) > v.maxTeams) {
      return actionFail(`${count} inscriptions sont déjà enregistrées : le nombre de places ne peut pas être inférieur.`)
    }
    const { data, error } = await admin
      .from('tournaments')
      .update(fields)
      .eq('id', tournamentId)
      .eq('org_id', auth.ctx.orgId)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      console.error('saveTournament update failed', { code: error.code, message: error.message })
      return actionFail('Impossible d\'enregistrer le tournoi. Veuillez réessayer.')
    }
    if (!data?.length) return actionFail('Ce tournoi n\'existe plus.')
  } else {
    const { error } = await admin.from('tournaments').insert({ ...fields, org_id: auth.ctx.orgId, created_by: auth.ctx.userId })
    if (error) {
      console.error('saveTournament insert failed', { code: error.code, message: error.message })
      return actionFail('Impossible de créer le tournoi. Veuillez réessayer.')
    }
  }

  captureAudit({ action: tournamentId ? 'tournament.update' : 'tournament.create', status: 'published', org_id: auth.ctx.orgId, actor: 'org_admin' })
  revalidatePath('/dashboard/org/tournaments')
  revalidatePath('/explore')
  return actionOk()
}

/** Cancel a published tournament. Registrations stay on record. */
export async function cancelTournament(tournamentId: string): Promise<ActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return actionFail(auth.message)
  const limited = await actionRateLimit('booking', auth.ctx.userId)
  if (limited) return actionFail(limited)
  if (!UUID.test(tournamentId)) return actionFail('Tournoi invalide.')

  const { data, error } = await getSupabaseAdmin()
    .from('tournaments')
    .update({ status: 'cancelled' })
    .eq('id', tournamentId)
    .eq('org_id', auth.ctx.orgId)
    .eq('status', 'published')
    .select('id')
  if (error) {
    console.error('cancelTournament failed', { code: error.code, message: error.message })
    return actionFail('Impossible d\'annuler le tournoi. Veuillez réessayer.')
  }
  if (!data?.length) return actionFail('Ce tournoi est déjà annulé ou n\'existe plus.')

  captureAudit({ action: 'tournament.cancel', status: 'cancelled', org_id: auth.ctx.orgId, actor: 'org_admin' })
  revalidatePath('/dashboard/org/tournaments')
  revalidatePath('/explore')
  return actionOk()
}

/** Reception records (or undoes) the entry fee paid at the club. */
export async function setTournamentEntryPaid(registrationId: string, paid: boolean): Promise<ActionResult> {
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return actionFail(auth.message)
  const limited = await actionRateLimit('booking', auth.ctx.userId)
  if (limited) return actionFail(limited)
  if (!UUID.test(registrationId) || typeof paid !== 'boolean') return actionFail('Inscription invalide.')

  const { error } = await getSupabaseAdmin().rpc('mark_tournament_entry_paid', {
    p_registration_id: registrationId,
    p_org_id: auth.ctx.orgId,
    p_paid: paid,
  })
  if (error) {
    if (error.message.includes('not_found')) return actionFail('Cette inscription n\'existe plus.')
    console.error('setTournamentEntryPaid failed', { code: error.code, message: error.message })
    return actionFail('Impossible d\'enregistrer le paiement. Veuillez réessayer.')
  }

  captureAudit({ action: 'tournament.entry_paid', status: paid ? 'paid' : 'unpaid', org_id: auth.ctx.orgId, actor: auth.ctx.role })
  revalidatePath('/dashboard/org/tournaments')
  return actionOk()
}
