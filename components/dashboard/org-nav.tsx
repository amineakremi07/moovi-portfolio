'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarDays, LayoutGrid, Settings, Trophy } from 'lucide-react'

import { t } from '@/lib/i18n/messages'
import type { MessageKey } from '@/lib/i18n/messages'
import { cn } from '@/lib/utils'

/**
 * The daily views only, in the order a club uses them. Team, security and display preferences live
 * under Paramètres (`/dashboard/org/settings`), which every role can open (staff see only their part).
 */
const ITEMS: { href: string; label: MessageKey; icon: typeof Settings; ownerOnly: boolean; also?: string[] }[] = [
  { href: '/dashboard/org/bookings', label: 'dash.bookings', icon: CalendarDays, ownerOnly: false },
  { href: '/dashboard/org/tournaments', label: 'dash.tournaments', icon: Trophy, ownerOnly: false },
  { href: '/dashboard/org/courts', label: 'dash.courts', icon: LayoutGrid, ownerOnly: true },
  { href: '/dashboard/org/analytics', label: 'dash.analytics', icon: BarChart3, ownerOnly: true },
  { href: '/dashboard/org/settings', label: 'dash.settings', icon: Settings, ownerOnly: false, also: ['/dashboard/org/staff'] },
]

const isActive = (pathname: string, href: string, also: string[] = []) =>
  [href, ...also].some((p) => pathname === p || pathname.startsWith(`${p}/`))

export function OrgNav({ role }: { role: 'org_admin' | 'staff' }) {
  const pathname = usePathname()
  return (
    // Phones: a full-width row under the club name that swipes; min-w-0 lets it shrink instead of
    // widening the page. From lg it sits inline between the name and the account actions.
    <nav
      aria-label={t('dash.nav')}
      className="order-last -mx-4 flex w-[calc(100%+2rem)] min-w-0 snap-x scroll-px-4 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:w-[calc(100%+3rem)] sm:scroll-px-6 sm:px-6 lg:order-none lg:mx-0 lg:w-auto lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {ITEMS.filter((i) => !i.ownerOnly || role === 'org_admin').map(({ href, label, icon: Icon, also }) => {
        const active = isActive(pathname, href, also)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 active:scale-[0.97] motion-reduce:active:scale-100',
              active
                ? 'bg-[#f7f5f2] text-[#1d3023]'
                : 'text-[#f7f5f2]/80 hover:bg-[#f7f5f2]/10 hover:text-[#f7f5f2]'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(label)}
          </Link>
        )
      })}
    </nav>
  )
}
