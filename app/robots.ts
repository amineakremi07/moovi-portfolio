import type { MetadataRoute } from 'next'

import { resolveAppUrl } from '@/lib/app-url'

/**
 * Public pages are open to every crawler, AI answer engines included (GPTBot, PerplexityBot,
 * Google-Extended, ClaudeBot...): being cited by them is the point. Account, dashboard, admin, API and
 * token-link pages are excluded; they are private, and most of them redirect a crawler to a login.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = resolveAppUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/dashboard',
        '/explore',
        '/reservations',
        '/compte',
        '/settings',
        '/auth/',
        '/accept-invite',
        '/accept-invitation',
        '/reset-password',
        '/forgot-password',
        '/logout',
        '/courts/preview',
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  }
}
