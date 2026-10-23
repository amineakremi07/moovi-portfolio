import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminNav, AdminTitle } from '@/components/admin/admin-nav'
import { OrgSwitcher } from '@/components/dashboard/org-switcher'
import { getAdminAccess } from '@/lib/admin/access'
import { getMemberships, hasMultipleMemberships } from '@/lib/org-memberships'

/**
 * Platform admin area. The proxy already sends signed-out users to login; this is
 * the authoritative server-side check (role `platform_admin`) for every request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess()
  if (access.kind === 'signed_out') redirect('/login-owner?redirect=/admin/verification')
  if (access.kind === 'mfa_required') redirect('/auth/mfa-verify?redirect=/admin/verification')
  if (access.kind === 'forbidden') redirect('/')
  // 'mfa_enrollment_required' renders the shell: the proxy only lets that admin reach /admin/security,
  // and every admin loader and action refuses through requireAdmin() until a factor is verified.
  // A platform admin sees ONLY the clubs they were explicitly added to; there is no list of all clubs here.
  const memberships = await getMemberships()
  const canSwitch = hasMultipleMemberships(memberships.items)

  return (
    <div className="min-h-screen bg-[#f7f5f2] text-[#2a1a1d]">
      <header className="bg-[#1d3023] text-[#f7f5f2]">
        <div className="mx-auto flex w-full max-w-[1700px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8 xl:px-12">
          <div>
            <Link href="/admin/verification" className="text-xs uppercase tracking-wider text-[#f7f5f2]/70 underline-offset-4 hover:underline">
              Platform admin
            </Link>
            <AdminTitle />
          </div>
          <div className="flex items-center gap-5 text-sm">
            {canSwitch && <OrgSwitcher items={memberships.items} activeOrgId={memberships.activeOrgId} />}
            <Link href="/" className="text-[#f7f5f2]/80 underline-offset-4 hover:underline">
              View public site
            </Link>
            <span className="text-[#f7f5f2]/70">{access.displayName}</span>
            <form action="/logout" method="post">
              <button type="submit" className="text-[#f7f5f2]/80 underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8 xl:px-12">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8 xl:px-12">{children}</main>
    </div>
  )
}
