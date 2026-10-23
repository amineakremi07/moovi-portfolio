import { cache } from 'react'

import { sessionNeedsSecondFactor } from '@/lib/mfa-guard'
import { sessionUserHint } from '@/lib/session-hint'
import { createClient } from '@/lib/supabase/server'
import type { OrgStatus, UserRole } from '@/lib/types/database'

type ServerClient = Awaited<ReturnType<typeof createClient>>

type SessionOrgRow = { id: string; name: string; status: OrgStatus; rejection_reason: string | null; deleted_at: string | null }

/** The caller's own profile row (the columns every access check needs), with their club embedded. */
export type SessionProfileRow = {
  role: UserRole
  /** Null for players (no home club). */
  org_id: string | null
  display_name: string
  organizations: SessionOrgRow | null
}

/**
 * One profile read, shared by getSessionProfile and the one place that signs a user in (signInPlayer). The
 * club comes embedded (RLS: a member reads their own club), so the dashboard guard needs no second read.
 */
export async function loadProfile(supabase: ServerClient, userId: string): Promise<SessionProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role, org_id, display_name, organizations!profiles_org_id_fkey(id, name, status, rejection_reason, deleted_at)')
    .eq('id', userId)
    .maybeSingle()
  return data ?? null
}

/**
 * The verified session user and their profile, read ONCE per request (React `cache`), plus the request's
 * Supabase client. Every access check and Server Action that needs "who is calling, and as what" goes through
 * here instead of repeating getUser() then a profile read.
 * `user` always comes from getUser() (the auth server), never from the cookie. The profile read starts on
 * the proxy's verified id at the same time (lib/session-hint.ts), so both take one round trip; it is used
 * only when that id is the one getUser() returns, and read again otherwise.
 *
 * Do not use it across a sign-in / sign-out inside the same request: the answer is fixed at first call.
 */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient()
  const hint = await sessionUserHint()
  const [
    {
      data: { user },
    },
    early,
  ] = await Promise.all([supabase.auth.getUser(), hint ? loadProfile(supabase, hint) : null])
  if (!user) return { supabase, user: null, profile: null }
  return { supabase, user, profile: hint === user.id ? early : await loadProfile(supabase, user.id) }
})

export type OrgContext = {
  userId: string
  role: 'org_admin' | 'staff'
  orgId: string
  orgName: string
  orgStatus: OrgStatus
  /** The club was archived (soft deleted): the dashboard is closed, its history is kept. */
  archived: boolean
  /** Why the club was rejected, when it was. */
  rejectionReason: string | null
  displayName: string
}

export type OrgAccess =
  | { kind: 'signed_out' }
  /** Signed in with a password, but the account's authenticator code has not been entered in this session. */
  | { kind: 'mfa_required' }
  | { kind: 'platform_admin' }
  /** Signed in, but not an owner or staff member of any club. */
  | { kind: 'not_staff'; role: UserRole | null }
  | { kind: 'ok'; ctx: OrgContext }

/**
 * Who is calling, and for which club. Always derived from the verified session
 * (getUser) and the caller's own profile row, never from request input, so every
 * dashboard page and Server Action can trust `ctx.orgId`.
 */
export const getOrgAccess = cache(async (): Promise<OrgAccess> => {
  const { supabase, user, profile } = await getSessionProfile()
  if (!user) return { kind: 'signed_out' }
  if (await sessionNeedsSecondFactor(supabase, user)) return { kind: 'mfa_required' }
  if (!profile) return { kind: 'not_staff', role: null }
  if (profile.role === 'platform_admin') return { kind: 'platform_admin' }
  // Club roles always carry their club (database CHECK); the null test only narrows the type.
  if ((profile.role !== 'org_admin' && profile.role !== 'staff') || !profile.org_id) {
    return { kind: 'not_staff', role: profile.role }
  }

  const org = profile.organizations
  if (!org) return { kind: 'not_staff', role: profile.role }

  return {
    kind: 'ok',
    ctx: {
      userId: user.id,
      role: profile.role,
      orgId: org.id,
      orgName: org.name,
      // An archived club counts as suspended everywhere an approved club is required.
      orgStatus: org.deleted_at ? 'suspended' : org.status,
      archived: Boolean(org.deleted_at),
      rejectionReason: org.rejection_reason,
      displayName: profile.display_name,
    },
  }
})

export type ActionAuth = { ok: true; ctx: OrgContext } | { ok: false; message: string }

/**
 * Guard for Server Actions. `roles` limits who may act; the club must be
 * approved (a pending or suspended club cannot take bookings or change data).
 */
export async function requireOrgAction(roles: ReadonlyArray<'org_admin' | 'staff'>): Promise<ActionAuth> {
  const access = await getOrgAccess()
  if (access.kind === 'signed_out') return { ok: false, message: 'Veuillez vous reconnecter.' }
  if (access.kind === 'mfa_required') return { ok: false, message: 'Saisissez votre code à deux facteurs pour continuer.' }
  if (access.kind !== 'ok') return { ok: false, message: 'Vous n\'avez pas accès à un tableau de bord de club.' }
  if (!roles.includes(access.ctx.role)) {
    return { ok: false, message: 'Seul le propriétaire du club peut effectuer cette action.' }
  }
  if (access.ctx.orgStatus !== 'approved') {
    return { ok: false, message: 'Votre club n\'est pas encore approuvé.' }
  }
  return { ok: true, ctx: access.ctx }
}
