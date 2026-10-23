'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { communityErrorMessage } from '@/lib/community'
import { appOrigin } from '@/lib/notifications/origin'
import { notifyMatchJoined, notifyTournamentRegistration } from '@/lib/notifications/service'
import { getSessionProfile } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { captureAudit } from '@/lib/telemetry'
import { runInBackground } from '@/lib/observability'
import {
  matchIdSchema,
  openMatchSchema,
  tournamentIdSchema,
  tournamentRegistrationSchema,
  type OpenMatchInput,
  type TournamentRegistrationInput,
} from '@/lib/validations/community'

/**
 * Player side of "Parties ouvertes" and "Tournois". Every action:
 *  - takes the player id from the verified session (getUser), never from input;
 *  - is rate limited per player and parses its input with a strict Zod schema;
 *  - calls a service_role RPC that locks the booking / tournament row first, so the last place can
 *    only be taken once. The RPC's own checks (own match, full, past, suspended) are the real gate.
 */

async function currentPlayer(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Connectez-vous pour continuer.' }
  if (profile?.role !== 'player') return { ok: false, error: 'Seuls les comptes joueurs peuvent participer.' }
  return { ok: true, userId: user.id }
}

/** The organiser opens places in their own upcoming match (0 closes it). */
export async function setMatchOpenSpots(input: OpenMatchInput): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = openMatchSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0]?.message ?? 'Requête invalide.', parsed.error)
  const { bookingId, openSpots, level, note } = parsed.data

  const { error } = await getSupabaseAdmin().rpc('set_match_open_spots', {
    p_booking_id: bookingId,
    p_profile_id: player.userId,
    p_open_spots: openSpots,
    p_level_min: level?.min ?? null,
    p_level_max: level?.max ?? null,
    p_note: note,
  })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible d\'enregistrer. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('setMatchOpenSpots failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'match.open_spots', status: String(openSpots), booking_id: bookingId, actor: 'player' })
  revalidatePath(`/reservations/${bookingId}`)
  revalidatePath('/explore')
  return actionOk()
}

export async function joinOpenMatch(input: { bookingId: string }): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = matchIdSchema.safeParse(input)
  if (!parsed.success) return actionFail('Partie invalide.')
  const { bookingId } = parsed.data

  const { error } = await getSupabaseAdmin().rpc('join_open_match', { p_booking_id: bookingId, p_profile_id: player.userId })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible de rejoindre la partie. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('joinOpenMatch failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'match.join', status: 'joined', booking_id: bookingId, actor: 'player' })
  revalidatePath('/explore')
  const origin = await appOrigin()
  after(() => runInBackground('notify.match_joined', () => notifyMatchJoined({ bookingId, joinerId: player.userId, origin })))
  return actionOk()
}

export async function leaveOpenMatch(input: { bookingId: string }): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = matchIdSchema.safeParse(input)
  if (!parsed.success) return actionFail('Partie invalide.')
  const { bookingId } = parsed.data

  const { error } = await getSupabaseAdmin().rpc('leave_open_match', { p_booking_id: bookingId, p_profile_id: player.userId })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible de quitter la partie. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('leaveOpenMatch failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'match.leave', status: 'left', booking_id: bookingId, actor: 'player' })
  revalidatePath('/explore')
  return actionOk()
}

export async function registerForTournament(input: TournamentRegistrationInput): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = tournamentRegistrationSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0]?.message ?? 'Requête invalide.', parsed.error)
  const { tournamentId, teamName, teammates } = parsed.data

  const { data, error } = await getSupabaseAdmin().rpc('register_for_tournament', {
    p_tournament_id: tournamentId,
    p_profile_id: player.userId,
    p_team_name: teamName,
    p_teammates: teammates,
  })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible de vous inscrire. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('registerForTournament failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  const registrationId = (data as { registration_id?: string } | null)?.registration_id
  captureAudit({ action: 'tournament.register', status: 'registered', detail: tournamentId, actor: 'player' })
  revalidatePath('/explore')
  if (registrationId) {
    const origin = await appOrigin()
    after(() => runInBackground('notify.tournament_registration', () => notifyTournamentRegistration({ registrationId, origin })))
  }
  return actionOk()
}

export async function cancelTournamentRegistration(input: { tournamentId: string }): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = tournamentIdSchema.safeParse(input)
  if (!parsed.success) return actionFail('Tournoi invalide.')
  const { tournamentId } = parsed.data

  const { error } = await getSupabaseAdmin().rpc('cancel_tournament_registration', {
    p_tournament_id: tournamentId,
    p_profile_id: player.userId,
  })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible d\'annuler l\'inscription. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('cancelTournamentRegistration failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'tournament.unregister', status: 'cancelled', detail: tournamentId, actor: 'player' })
  revalidatePath('/explore')
  return actionOk()
}
