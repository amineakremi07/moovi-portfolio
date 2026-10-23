import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { MfaSetup } from '@/components/dashboard/mfa-setup'
import { checkMFAStatus } from '@/lib/actions/mfa'
import { getAdminAccess } from '@/lib/admin/access'

export const dynamic = 'force-dynamic'

/**
 * Account security for platform admins (the admin layout already guards the role). It is also the one
 * admin page an admin without a verified authenticator can open: enrolling is mandatory for this role.
 */
export default async function AdminSecurityPage() {
  const access = await getAdminAccess()
  if (access.kind !== 'ok' && access.kind !== 'mfa_enrollment_required') redirect('/')
  const mustEnroll = access.kind === 'mfa_enrollment_required'

  const status = await checkMFAStatus()
  const factors = status.ok && status.signedIn ? status.factors : []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/admin/verification"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to Admin Dashboard
      </Link>
      <h2 className="text-2xl font-semibold tracking-tight">Account security</h2>
      {mustEnroll && (
        <p role="alert" className="rounded-lg border border-[#1d3023]/20 bg-white p-4 text-sm">
          Platform admin accounts must use two-factor authentication. Set up an authenticator app below to open the
          admin dashboard.
        </p>
      )}
      <MfaSetup factors={factors} />
    </div>
  )
}
