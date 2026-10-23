'use server'

import { ACCOUNT_EXISTS_MESSAGE, isAccountExistsError, logAuthError, signUpErrorMessage } from '@/lib/auth-errors'
import { AUTH_PATHS } from '@/lib/auth-urls'
import { requestOrigin } from '@/lib/notifications/origin'
import { loadProfile } from '@/lib/org-access'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { actionRateLimit } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import { consentMetadata } from '@/lib/legal'
import {
  playerSignInSchema,
  playerSignUpSchema,
  playerRegisterSchema,
  type PlayerSignUpInput,
  type PlayerRegisterInput,
} from '@/lib/validations/player-auth'

/**
 * Server actions for player authentication (booking requires a player account)
 * Callers: PlayerAuthModal component
 * Affected tables: profiles, auth.users
 * Data schemas: playerSignInSchema, playerSignUpSchema, playerRegisterSchema
 */

export async function signInPlayer(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  const supabase = await createClient()

  // Validate input
  const validation = playerSignInSchema.safeParse({ email, password, rememberMe })
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }

  // Sign in with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: 'Échec de l\'authentification' }
  }

  // Get user profile to verify they're a player (not staff/owner). Read directly, not through the per-request
  // session cache: this request has just changed who is signed in.
  const profile = await loadProfile(supabase, authData.user.id)

  if (!profile) {
    // Sign out if no profile exists
    await supabase.auth.signOut()
    return { success: false, error: 'Compte introuvable. Veuillez contacter le support.' }
  }

  // Only allow player role (not org_admin or staff)
  if (profile.role !== 'player') {
    await supabase.auth.signOut()
    return { success: false, error: 'Ce compte ne peut pas se connecter en tant que joueur.' }
  }

  return { success: true, userId: authData.user.id }
}

export async function signUpPlayer(
  data: PlayerSignUpInput
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  // Validate first, then use ONLY the validated output (trimmed, lower-cased, canonical phone, HTML stripped).
  const validation = playerSignUpSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }
  const input = validation.data

  const supabase = await createClient()
  const supabaseAdmin = getSupabaseAdmin()

  // Check if organization exists and is approved
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, status, deleted_at')
    .eq('id', input.orgId)
    .single()

  if (orgError || !org) {
    return { success: false, error: 'Complexe sportif invalide' }
  }

  if (org.status !== 'approved' || org.deleted_at !== null) {
    return { success: false, error: 'Ce complexe sportif n\'est pas encore disponible à la réservation' }
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.displayName,
        phone: input.phone,
        ...consentMetadata(),
      },
      emailRedirectTo: `${await requestOrigin()}${AUTH_PATHS.callback}`, // must be on the Supabase Redirect URLs list (lib/auth-urls.ts)
    },
  })

  if (authError || !authData.user) {
    if (!isAccountExistsError(authError)) logAuthError('signUpPlayer: could not create user', authError)
    return { success: false, error: signUpErrorMessage(authError) }
  }

  // With "confirm email" on, signing up an address that already has an account does not error: Supabase
  // returns a look-alike user with NO identities (and an id that is not a real account). Never create a
  // profile for it, and never delete anything on its behalf.
  if (authData.user.identities?.length === 0) {
    return { success: false, error: 'Un compte existe déjà avec cet e-mail' }
  }

  // Create profile with player role
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      // Players are not tied to a club: the club they signed up from is their last visited one.
      org_id: null,
      last_visited_club_id: input.orgId,
      role: 'player',
      display_name: input.displayName,
      // NOTE: no `email` column on profiles — it lives on auth.users.
      phone: input.phone,
    })

  if (profileError) {
    // The user we just made (it has identities, so it is ours) must not be left without a profile.
    console.error('Profile creation failed:', profileError.message)
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: 'Échec de la création du profil joueur' }
  }

  revalidatePath('/dashboard')

  return { success: true, userId: authData.user.id }
}

export type RegisterPlayerResult =
  | {
      success: true
      /** The session is open (only when the project does not require email confirmation). */
      signedIn: boolean
      /** A confirmation link was emailed: the account works only after it is opened. */
      needsEmailConfirmation?: boolean
    }
  | { success: false; error: string }

/**
 * Register a player from `/register`: create the account and the `player` profile.
 *
 * The email address is NOT trusted until it is confirmed. The account used to be created already
 * confirmed, which let anyone register `victim@example.com` with their own password and wait for the
 * victim to arrive (a classic pre-account takeover, worse once "Continue with Google" can link to the
 * same address). Now Supabase emails a confirmation link (`/auth/callback`) and refuses to sign the
 * account in until it is opened; the dashboard setting "Confirm email" must stay ON.
 */
export async function registerPlayer(input: PlayerRegisterInput): Promise<RegisterPlayerResult> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  const parsed = playerRegisterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const { fullName, email, phone, password, orgId } = parsed.data

  const admin = getSupabaseAdmin()

  // The club the visitor came from is remembered as "last visited" only when it is open; otherwise ignored.
  const { data: org } = orgId
    ? await admin.from('organizations').select('id, status, deleted_at').eq('id', orgId).maybeSingle()
    : { data: null }
  const lastVisited = org && org.status === 'approved' && org.deleted_at === null ? org.id : null

  const supabase = await createClient()
  const { data: created, error: createError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, ...consentMetadata() },
      emailRedirectTo: `${await requestOrigin()}${AUTH_PATHS.callback}`,
    },
  })

  if (createError || !created.user) {
    // Log the real cause (weak_password, SMTP failure, rate limit...) and show its French equivalent.
    if (!isAccountExistsError(createError)) logAuthError('registerPlayer: could not create user', createError)
    return { success: false, error: signUpErrorMessage(createError) }
  }
  // An address that already has an account comes back as a look-alike user with no identities.
  if (created.user.identities?.length === 0) return { success: false, error: ACCOUNT_EXISTS_MESSAGE }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: null,
    last_visited_club_id: lastVisited,
    role: 'player',
    display_name: fullName,
    phone,
  })

  if (profileError) {
    console.error('registerPlayer: could not create profile:', profileError.message)
    // No orphaned auth user without a profile (it has identities, so it is the one we just made).
    await admin.auth.admin.deleteUser(created.user.id)
    return { success: false, error: 'Impossible de créer votre profil joueur. Veuillez réessayer.' }
  }

  revalidatePath('/')
  if (created.session) return { success: true, signedIn: true }
  return { success: true, signedIn: false, needsEmailConfirmation: true }
}
