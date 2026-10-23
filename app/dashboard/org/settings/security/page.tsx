import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { MfaSetup } from '@/components/dashboard/mfa-setup'
import { checkMFAStatus } from '@/lib/actions/mfa'
import { getOrgAccess } from '@/lib/org-access'

export const dynamic = 'force-dynamic'

/** Account security for everyone who signs in to a club dashboard (owner and staff). */
export default async function OrgSecurityPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')

  const status = await checkMFAStatus()
  const factors = status.ok && status.signedIn ? status.factors : []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/dashboard/org/settings" className="inline-flex items-center gap-1 text-sm text-[#645757] hover:text-[#2a1a1d]">
          <ChevronLeft className="size-4" aria-hidden />
          Paramètres
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Sécurité</h1>
      </div>
      <MfaSetup factors={factors} />
    </div>
  )
}
