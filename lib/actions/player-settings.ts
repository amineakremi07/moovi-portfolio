'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createAnonClient } from '@supabase/supabase-js'

import { actionFail, actionFailFromZod, actionOk, type ActionResult } from '@/lib/actions/result'
import { reportServerError } from '@/lib/observability'
import { actionRateLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'
import {
  changePasswordSchema,
  contactPreferencesSchema,
  joinDisplayName,
  playerProfileSchema,
  type ChangePasswordInput,
  type ContactPreferences,
  type PlayerProfileInput,
} from '@/lib/validations/player-settings'

/**
 * /settings. Every action works on the VERIFIED session's own account (never an id from the
 * browser), is rate limited, and validates its input with a strict Zod schema.
 */

async function sessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/** First + last name and mobile. Written as the user (column grants allow display_name and phone). */
export async function updatePlayerProfileAction(input: PlayerProfileInput): Promise<ActionResult<{ displayName: string }>> {
  const parsed = playerProfileSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0].message, parsed.error)

  const { supabase, user } = await sessionUser()
  if (!user) return actionFail('Veuillez vous reconnecter.')
  const limited = await actionRateLimit('lookup', user.id)
  if (limited) return actionFail(limited)

  const displayName = joinDisplayName(parsed.data.firstName, parsed.data.lastName)
  const { error } = await supabase.from('profiles').update({ display_name: displayName, phone: parsed.data.phone }).eq('id', user.id)
  if (error) {
    console.error('updatePlayerProfile failed', { code: error.code, message: error.message })
    return actionFail("Impossible d'enregistrer votre profil. Veuillez réessayer.")
  }
  revalidatePath('/settings')
  revalidatePath('/explore')
  return actionOk({ displayName })
}

/**
 * Reminder channels. Service role scoped to the session's id: there is deliberately no client UPDATE
 * grant on these columns (a club owner's profile policy would otherwise reach a member's choices).
 * SMS and WhatsApp need a mobile number on the profile.
 */
export async function updateContactPreferencesAction(input: ContactPreferences): Promise<ActionResult> {
  const parsed = contactPreferencesSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod('Préférences invalides.', parsed.error)

  const { user } = await sessionUser()
  if (!user) return actionFail('Veuillez vous reconnecter.')
  const limited = await actionRateLimit('lookup', user.id)
  if (limited) return actionFail(limited)

  const admin = getSupabaseAdmin()
  if (parsed.data.sms || parsed.data.whatsapp) {
    const { data: profile } = await admin.from('profiles').select('phone').eq('id', user.id).maybeSingle()
    if (!profile?.phone) return actionFail('Ajoutez votre numéro de mobile dans votre profil pour recevoir des SMS ou des messages WhatsApp.')
  }
  const { error } = await admin
    .from('profiles')
    .update({ remind_by_email: parsed.data.email, remind_by_sms: parsed.data.sms, remind_by_whatsapp: parsed.data.whatsapp })
    .eq('id', user.id)
  if (error) {
    console.error('updateContactPreferences failed', { code: error.code, message: error.message })
    return actionFail("Impossible d'enregistrer vos préférences. Veuillez réessayer.")
  }
  revalidatePath('/settings')
  return actionOk()
}

/** New password, after checking the current one on a separate client (the session is untouched). */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return actionFailFromZod(parsed.error.issues[0].message, parsed.error)

  const { user } = await sessionUser()
  if (!user?.email) return actionFail('Veuillez vous reconnecter.')
  const limited = await actionRateLimit('auth', user.id)
  if (limited) return actionFail(limited)

  const checker = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: check, error: authError } = await checker.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword })
  if (authError || check.user?.id !== user.id) return actionFail('Votre mot de passe actuel est incorrect.')
  if (parsed.data.currentPassword === parsed.data.password) return actionFail("Le nouveau mot de passe doit être différent de l'actuel.")

  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, { password: parsed.data.password })
  if (error) {
    console.error('changePassword failed', { message: error.message })
    reportServerError('account.change_password', new Error('updateUserById failed'))
    return actionFail(
      /weak|pwned|leaked/i.test(error.message)
        ? 'Ce mot de passe est trop courant ou a fuité ailleurs. Choisissez-en un autre.'
        : 'Impossible de changer le mot de passe. Veuillez réessayer.'
    )
  }
  return actionOk()
}

/** Ends every session of this account, on every device, then back to the login page. */
export async function signOutEverywhereAction(): Promise<void> {
  const { supabase, user } = await sessionUser()
  if (user) await supabase.auth.signOut({ scope: 'global' }).catch(() => {})
  redirect('/login')
}
