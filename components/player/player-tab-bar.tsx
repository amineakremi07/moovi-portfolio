import Link from 'next/link'
import { CalendarCheck, Compass, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PlayerTab = 'explore' | 'reservations' | 'account'

const TABS = [
  { key: 'explore', href: '/explore', label: 'Explorer', icon: Compass },
  { key: 'reservations', href: '/reservations', label: 'Mes réservations', icon: CalendarCheck },
  { key: 'account', href: '/compte', label: 'Mon compte', icon: UserRound },
] as const

/**
 * The player's three places: book (Explorer), their bookings, their account. Phones: a bottom tab bar
 * (pages keep `pb-28` clear of it). From `md`: a floating pill at the top right.
 * Everything that is not booking (settings, sign out) lives under "Mon compte".
 */
export function PlayerTabBar({ current }: { current: PlayerTab }) {
  return (
    <nav
      aria-label="Espace joueur"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl',
        'md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:rounded-full md:border md:p-1 md:pb-1 md:shadow-lg'
      )}
    >
      <ul className="grid h-16 grid-cols-3 md:flex md:h-auto md:gap-1">
        {TABS.map(({ key, href, label, icon: Icon }) => {
          const active = current === key
          return (
            <li key={key} className="flex">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50',
                  'md:min-h-10 md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm md:font-medium md:normal-case md:tracking-normal',
                  active ? 'text-foreground md:bg-forest-depths md:text-bone-linen' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors md:h-auto md:w-auto',
                    active && 'bg-forest-depths text-bone-linen md:bg-transparent'
                  )}
                >
                  <Icon className="size-[1.15rem] md:size-4" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
