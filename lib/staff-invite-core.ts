import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

/**
 * Server-side lookup for the Supabase-link invitation landing (/accept-invitation). Not a 'use server'
 * module on purpose: that would make it a public endpoint. The organization always comes from OUR
 * `staff_invites` row (written by an owner), never from the link, the browser or the Supabase user's
 * metadata, so an invited address can only ever join the club that invited it.
 */

export type PendingInvite = {
  id: string
  orgId: string
  email: string
  clubName: string
}

/** The newest usable invitation for an address: unaccepted, unexpired, club approved and not archived. */
export async function findPendingInviteForEmail(email: string | null | undefined): Promise<PendingInvite | null> {
  const address = email?.trim().toLowerCase()
  if (!address) return null
  const admin = getSupabaseAdmin()

  const { data: invites } = await admin
    .from('staff_invites')
    .select('id, org_id, email, expires_at')
    .eq('email', address)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  if (!invites?.length) return null
  // The invites' clubs in one query, then the newest invite whose club is live wins.
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, status, deleted_at')
    .in('id', [...new Set(invites.map((i) => i.org_id))])
  const liveOrg = new Map((orgs ?? []).filter((o) => o.status === 'approved' && o.deleted_at === null).map((o) => [o.id, o.name]))
  const invite = invites.find((i) => liveOrg.has(i.org_id))
  return invite ? { id: invite.id, orgId: invite.org_id, email: invite.email, clubName: liveOrg.get(invite.org_id)! } : null
}
