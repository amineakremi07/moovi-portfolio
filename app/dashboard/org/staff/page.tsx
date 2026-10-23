import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { StaffManager } from '@/components/dashboard/staff-manager'
import { getOrgAccess } from '@/lib/org-access'
import { loadStaffOverview } from '@/lib/staff-overview'

export const dynamic = 'force-dynamic'

export default async function OrgStaffPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  // Staff run the bookings; only the owner manages the team.
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const overview = await loadStaffOverview(access.ctx.orgId)
  if (!overview.ok) {
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        Impossible de charger votre équipe. Veuillez actualiser la page dans un instant.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/org/settings" className="inline-flex items-center gap-1 text-sm text-[#645757] hover:text-[#2a1a1d]">
        <ChevronLeft className="size-4" aria-hidden />
        Paramètres
      </Link>
      <StaffManager staff={overview.staff} invites={overview.invites} />
    </div>
  )
}
