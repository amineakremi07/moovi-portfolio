'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldCheck, ClipboardCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/** The platform admin's sections. The first one is the admin dashboard (where `/admin` lands). */
export const ADMIN_SECTIONS = [
  { href: '/admin/verification', label: 'Club verification', icon: ClipboardCheck },
  { href: '/admin/security', label: 'Security', icon: ShieldCheck },
] as const

export function adminSectionTitle(pathname: string): string {
  return ADMIN_SECTIONS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.label ?? 'Admin dashboard'
}

/** Header tabs, so every admin page can reach every other one (and the dashboard) in one click. */
export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin sections" className="-mb-px flex gap-1 overflow-x-auto">
      {ADMIN_SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#26d862]/60',
              active ? 'border-[#26d862] text-[#f7f5f2]' : 'border-transparent text-[#f7f5f2]/70 hover:text-[#f7f5f2]'
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The current section's title, for the header. */
export function AdminTitle() {
  return <h1 className="text-xl font-semibold tracking-tight">{adminSectionTitle(usePathname())}</h1>
}
