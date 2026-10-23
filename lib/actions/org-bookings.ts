'use server'

import { revalidatePath } from 'next/cache'

import { actionFail, actionOk, type ActionResult } from '@/lib/actions/result'
import { invalidateBooking } from '@/lib/cache'
import { markNoShow } from '@/lib/check-in'
import { requireOrgAction } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

// Bookings made by staff go through POST /api/v1/bookings/manual (lib/manual-booking.ts).

export type NoShowResult = ActionResult<{ message: string }>

/**
 * Mark a booking nobody turned up for. A member loses 30 trust points and gains a
 * no-show (the 3rd suspends them for 30 days); a guest has no account, so only the
 * booking is marked. The club comes from the caller's session, never from input.
 */
export async function markNoShowAction(bookingId: string): Promise<NoShowResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
    return actionFail('Réservation invalide.')
  }
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return actionFail(auth.message)

  const result = await markNoShow(auth.ctx.orgId, bookingId)
  if (!result.ok) return actionFail(result.message)

  await invalidateBooking({ orgId: auth.ctx.orgId, bookingId })
  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/dashboard/org/analytics')
  revalidatePath('/reservations')

  if (!result.isMember) return actionOk({ message: 'Marquée comme absence.' })
  const base = `Marquée comme absence. Le score de confiance est désormais de ${result.trustScore}, avec ${result.noShowCount} absence${result.noShowCount === 1 ? '' : 's'}.`
  return actionOk({ message: result.suspendedUntil ? `${base} Le joueur est suspendu des réservations pendant 30 jours.` : base })
}

export type AssignCourtResult = ActionResult<{ message: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Assign (or confirm) the court of an open booking. Players book a time, not a court, so a
 * time-first booking holds a provisional court until staff assign one here. The database moves the
 * slot lock and the booking together (reassign_booking_court): a busy court is refused, nothing
 * changes. Owner or staff of the booking's club; the club comes from the session, never from input.
 */
export async function assignCourtAction(input: { bookingId: string; courtId: string }): Promise<AssignCourtResult> {
  if (!UUID.test(input?.bookingId ?? '') || !UUID.test(input?.courtId ?? '')) {
    return actionFail("Réservation ou terrain invalide.")
  }
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return actionFail(auth.message)

  const { error } = await getSupabaseAdmin().rpc('reassign_booking_court', {
    p_org_id: auth.ctx.orgId,
    p_booking_id: input.bookingId,
    p_court_id: input.courtId,
  })
  if (error) {
    const message = error.message ?? ''
    if (error.code === '23P01' || error.code === '23505') return actionFail("Ce terrain est déjà occupé à cette heure. Choisissez-en un autre.")
    if (message.includes('booking_not_found')) return actionFail("Cette réservation n'existe plus.")
    if (message.includes('booking_closed')) return actionFail("Cette réservation n'est plus ouverte (annulée ou terminée).")
    if (message.includes('booking_past')) return actionFail("Ce créneau est déjà terminé.")
    if (message.includes('invalid_court')) return actionFail("Ce terrain ne convient pas à cette réservation (autre sport, inactif ou archivé).")
    console.error('reassign_booking_court failed', { code: error.code, message })
    return actionFail("Impossible d'attribuer le terrain. Veuillez réessayer.")
  }

  await invalidateBooking({ orgId: auth.ctx.orgId, bookingId: input.bookingId })
  revalidatePath('/dashboard/org/bookings')
  revalidatePath('/reservations')
  revalidatePath('/explore')
  return actionOk({ message: 'Terrain attribué.' })
}
