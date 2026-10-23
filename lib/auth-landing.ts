import { safeRedirectPath } from '@/lib/safe-redirect'
import type { UserRole } from '@/lib/types/database'

/**
 * The player home (`/explore`): next booking, quick re-book, home club and the club finder. Needs a
 * signed-in account (proxy.ts); `/courts` redirects here.
 */
export const BOOKING_PATH = '/explore'

/** Where each role starts after signing in. One table, used by both login pages, the proxy and the header. */
export function landingPathFor(role: UserRole | null | undefined): string {
  switch (role) {
    case 'platform_admin':
      return '/admin/verification'
    case 'org_admin':
      return '/dashboard/org'
    case 'staff':
      return '/dashboard/org/bookings'
    default:
      // Players go straight to their home: next booking, re-book, clubs. "My reservations" is a
      // header link (hooks/use-auth-nav.ts), not their landing page.
      return BOOKING_PATH
  }
}

/** The area of the site a role may be sent to by a `?redirect=` link. */
function areaAllows(role: UserRole | null | undefined, path: string): boolean {
  const isAdmin = path === '/admin' || path.startsWith('/admin/')
  const isDashboard = path === '/dashboard' || path.startsWith('/dashboard/')
  if (role === 'platform_admin') return isAdmin
  if (role === 'org_admin' || role === 'staff') return isDashboard
  return !isAdmin && !isDashboard // players: anywhere public
}

/**
 * Post-login destination: the page the visitor was heading for when it is a safe
 * same-site path their role can open, otherwise their role's landing page. This
 * keeps a player who followed a dashboard link from landing on a redirect loop.
 */
export function postLoginPath(role: UserRole | null | undefined, requested: string | null | undefined): string {
  const safe = safeRedirectPath(requested)
  return safe && areaAllows(role, safe) ? safe : landingPathFor(role)
}
