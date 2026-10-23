'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { invalidateClub } from '@/lib/cache'
import { requireOrgAction } from '@/lib/org-access'
import { actionRateLimit } from '@/lib/rate-limit'
import { weeklyHoursSchema, type WeeklyHours } from '@/lib/operating-hours'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export type SettingsResult = ActionResult

const autoReleaseSchema = z.object({ enabled: z.boolean() }).strict()

/**
 * Save the club's weekly hours.
 *
 * Uses the service-role client because org_admin deliberately has no UPDATE
 * policy on `organizations` (status and verification live there). Authorization
 * is therefore the role check below, and only `weekly_hours` is written, always
 * for the caller's own organization.
 */
export async function saveWeeklyHours(input: WeeklyHours): Promise<SettingsResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return actionFail(auth.message)

  const parsed = weeklyHoursSchema.safeParse(input)
  if (!parsed.success) {
    return actionFailFromZod('Veuillez corriger les jours signalés.', parsed.error)
  }

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({ weekly_hours: parsed.data })
    .eq('id', auth.ctx.orgId)
  if (error) {
    console.error('saveWeeklyHours failed', { code: error.code, message: error.message })
    return actionFail('Impossible d\'enregistrer les horaires. Veuillez réessayer.')
  }

  revalidatePath('/dashboard/org/settings')
  invalidateClub(auth.ctx.orgId)
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return actionOk()
}

/**
 * Opt in (or out) of the H-4 anti no-show release: unpaid online bookings whose player did not confirm
 * attendance are cancelled 4 h before kick-off by the autonomous-agents Edge Function. Owners only.
 */
export async function saveAutoRelease(input: { enabled: boolean }): Promise<SettingsResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return actionFail(auth.message)
  const limited = await actionRateLimit('api', auth.ctx.userId)
  if (limited) return actionFail(limited)

  const parsed = autoReleaseSchema.safeParse(input)
  if (!parsed.success) return actionFail('Requête invalide.')

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({ auto_release_unconfirmed: parsed.data.enabled })
    .eq('id', auth.ctx.orgId)
  if (error) {
    console.error('saveAutoRelease failed', { code: error.code, message: error.message })
    return actionFail('Impossible d\'enregistrer ce réglage. Veuillez réessayer.')
  }

  revalidatePath('/dashboard/org/settings')
  return actionOk()
}
