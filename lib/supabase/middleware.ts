import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { VERIFIED_USER_HEADER } from '@/lib/session-hint'
import type { Database } from '@/lib/types/database'

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }

/**
 * Supabase client for the Proxy (formerly Middleware) layer.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy` and pins it to the
 * Node.js runtime, so this runs per-request on the server. It returns both the
 * client and the mutable response so the caller can forward refreshed auth
 * cookies back to the browser, and `forwardUser` to pass the id getUser()
 * verified on to the page (lib/session-hint.ts).
 *
 * Callers: proxy.ts
 */
export function createProxyClient(request: NextRequest) {
  // Only the proxy may set this header: drop any copy the client sent before the request is forwarded.
  request.headers.delete(VERIFIED_USER_HEADER)

  let refreshed: CookieToSet[] = []
  // The forwarded request carries the (possibly refreshed) cookies and headers as they are now.
  const build = () => {
    const next = NextResponse.next({ request })
    refreshed.forEach(({ name, value, options }) => next.cookies.set(name, value, options))
    return next
  }
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          refreshed = cookiesToSet
          response = build()
        },
      },
    }
  )

  /** Call with the id getUser() returned, before getResponse(). */
  const forwardUser = (userId: string) => {
    request.headers.set(VERIFIED_USER_HEADER, userId)
    response = build()
  }

  // `response` is reassigned inside setAll, so hand back a getter rather than
  // the value captured at construction time.
  return { supabase, getResponse: () => response, forwardUser }
}
