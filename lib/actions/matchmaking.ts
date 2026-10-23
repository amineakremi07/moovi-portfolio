'use server'

import { revalidatePath } from 'next/cache'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { communityErrorMessage } from '@/lib/community'
import { getSessionProfile } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { captureAudit } from '@/lib/telemetry'
import {
  attendanceSchema,
  matchRequestIdSchema,
  matchRequestSchema,
  type MatchRequestInput,
} from '@/lib/validations/community'

/**
 * The player's side of the Phase 4 agents: ask the matchmaker for a game, withdraw that search, and
 * confirm attendance before the H-4 release. Same rules as lib/actions/community.ts: the player id comes
 * from the verified session, input is parsed strictly, and a service_role RPC that locks its rows decides.
 */

async function currentPlayer(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { user, profile } = await getSessionProfile()
  if (!user) return { ok: false, error: 'Connectez-vous pour continuer.' }
  if (profile?.role !== 'player') return { ok: false, error: 'Seuls les comptes joueurs peuvent participer.' }
  return { ok: true, userId: user.id }
}

export async function createMatchRequest(input: MatchRequestInput): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = matchRequestSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0]?.message ?? 'Recherche invalide.', parsed.error)
  const v = parsed.data

  const { error } = await getSupabaseAdmin().rpc('create_match_request', {
    p_profile_id: player.userId,
    p_sport: v.sport,
    p_required_players: v.requiredPlayers,
    p_level_min: v.levelMin,
    p_level_max: v.levelMax,
    p_window_start: v.windowStart,
    p_window_end: v.windowEnd,
    p_player_level: v.playerLevel,
  })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible de lancer la recherche. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('createMatchRequest failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'match_request.create', status: v.sport, actor: 'player' })
  revalidatePath('/explore')
  return actionOk()
}

export async function cancelMatchRequest(input: { requestId: string }): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = matchRequestIdSchema.safeParse(input)
  if (!parsed.success) return actionFail('Recherche invalide.')

  const { error } = await getSupabaseAdmin().rpc('cancel_match_request', {
    p_request_id: parsed.data.requestId,
    p_profile_id: player.userId,
  })
  if (error) {
    // not_found: already matched, expired or cancelled; the widget refreshes and shows which.
    const message = error.message.trim() === 'not_found' ? 'Cette recherche est déjà terminée.' : 'Impossible d\'annuler la recherche. Veuillez réessayer.'
    if (error.message.trim() !== 'not_found') console.error('cancelMatchRequest failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'match_request.cancel', status: 'cancelled', actor: 'player' })
  revalidatePath('/explore')
  return actionOk()
}

/** "Je confirme ma venue": keeps an unpaid booking from being released 4 h before kick-off. */
export async function confirmAttendance(input: { bookingId: string }): Promise<ActionResult> {
  const player = await currentPlayer()
  if (!player.ok) return actionFail(player.error)
  const limited = await actionRateLimit('booking', player.userId)
  if (limited) return actionFail(limited)

  const parsed = attendanceSchema.safeParse(input)
  if (!parsed.success) return actionFail('Réservation invalide.')
  const { bookingId } = parsed.data

  const { error } = await getSupabaseAdmin().rpc('confirm_booking_attendance', { p_booking_id: bookingId, p_profile_id: player.userId })
  if (error) {
    const message = communityErrorMessage(error.message, 'Impossible de confirmer. Veuillez réessayer.')
    if (message.startsWith('Impossible')) console.error('confirmAttendance failed', { code: error.code, message: error.message })
    return actionFail(message)
  }

  captureAudit({ action: 'booking.attendance_confirmed', status: 'confirmed', booking_id: bookingId, actor: 'player' })
  revalidatePath('/explore')
  revalidatePath(`/reservations/${bookingId}`)
  return actionOk()
}
