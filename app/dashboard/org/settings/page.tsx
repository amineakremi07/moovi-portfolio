import { redirect } from 'next/navigation'
import { ShieldCheck, Users } from 'lucide-react'

import { AutoReleaseSetting } from '@/components/dashboard/auto-release-setting'
import { ClubProfileForm } from '@/components/dashboard/club-profile-form'
import { HoursForm } from '@/components/dashboard/hours-form'
import { SettingsGroup, type SettingsRow } from '@/components/dashboard/settings-group'
import { BoardViewSetting } from '@/components/dashboard/settings-hub'
import { ownGalleryUrls, ownLogoUrl } from '@/lib/club-profile'
import { getOrgAccess } from '@/lib/org-access'
import { DEFAULT_WEEKLY_HOURS, parseWeeklyHours } from '@/lib/operating-hours'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Paramètres: everything that is not a daily view, in one place. Every role: account security and how
 * the bookings board is drawn. Owners also: the team, the club's public profile ("vitrine") and its
 * opening hours.
 */
export default async function OrgSettingsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  const owner = access.ctx.role === 'org_admin'

  const rows: SettingsRow[] = [
    ...(owner
      ? [{ href: '/dashboard/org/staff', title: 'Équipe', hint: 'Inviter ou retirer des réceptionnistes', icon: Users }]
      : []),
    { href: '/dashboard/org/settings/security', title: 'Sécurité', hint: 'Double authentification de votre compte', icon: ShieldCheck },
  ]
  const general = (
    <>
      <SettingsGroup label="Compte et accès" rows={rows} />
      <BoardViewSetting />
    </>
  )

  if (!owner) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        {general}
      </div>
    )
  }

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('name, description, whatsapp_number, address, city, latitude, longitude, gallery_urls, logo_url, weekly_hours, auto_release_unconfirmed')
    .eq('id', access.ctx.orgId)
    .maybeSingle()
  if (!org) redirect('/dashboard/org')

  const saved = parseWeeklyHours(org.weekly_hours)
  return (
    <div className="mx-auto max-w-3xl space-y-14">
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        {general}
        <AutoReleaseSetting enabled={org.auto_release_unconfirmed} />
        <nav aria-label="Sections du club" className="flex gap-4 px-1 text-sm">
          <a href="#profile" className="underline-offset-4 hover:underline">
            Profil du club
          </a>
          <a href="#hours" className="underline-offset-4 hover:underline">
            Horaires d&apos;ouverture
          </a>
        </nav>
      </div>

      <div id="profile" className="scroll-mt-6">
        <ClubProfileForm
          initial={{
            name: org.name,
            description: org.description,
            whatsappNumber: org.whatsapp_number,
            address: org.address,
            city: org.city,
            latitude: org.latitude,
            longitude: org.longitude,
            galleryUrls: ownGalleryUrls(org.gallery_urls, access.ctx.orgId, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
            logoUrl: ownLogoUrl(org.logo_url, access.ctx.orgId, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
          }}
        />
      </div>

      <div id="hours" className="scroll-mt-6">
        <HoursForm initial={saved ?? DEFAULT_WEEKLY_HOURS} configured={Boolean(saved)} />
      </div>
    </div>
  )
}
