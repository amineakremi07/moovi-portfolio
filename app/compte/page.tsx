import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarCheck, ChevronRight, Cookie, FileText, LogOut, Settings, ShieldCheck } from 'lucide-react'

import { CookieSettingsButton } from '@/components/consent/consent-banner'
import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { landingPathFor } from '@/lib/auth-landing'
import { formatVenueDate, venueDateString } from '@/lib/court-time'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database'

/** Personal: never prerendered or cached. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon compte', robots: { index: false } }

const ROW =
  'flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm font-medium transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50'

/**
 * "Mon compte": who is signed in, and everything that is not booking (settings, legal, cookies,
 * sign out), kept out of the Explorer. Club and admin accounts are sent to their own area;
 * signed-out visitors to the login page (proxy.ts, re-checked here).
 */
export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=%2Fcompte')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, trust_score, created_at')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) redirect('/login')
  if (profile.role !== 'player') redirect(landingPathFor(profile.role as UserRole))

  const initial = profile.display_name.trim().slice(0, 1).toUpperCase() || '?'

  return (
    <>
      <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-8 md:pt-24">
        <h1 className="text-3xl font-semibold tracking-tight">Mon compte</h1>

        <section aria-label="Profil" className="mt-6 flex items-center gap-4 rounded-2xl bg-card p-5">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-forest-depths text-xl font-semibold text-bone-linen"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{profile.display_name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Membre depuis {formatVenueDate(venueDateString(new Date(profile.created_at)))} · confiance {profile.trust_score}/100
            </p>
          </div>
        </section>

        <nav aria-label="Compte" className="mt-6 overflow-hidden rounded-2xl bg-card">
          <ul className="divide-y divide-black/5">
            <li>
              <Link href="/settings" className={ROW}>
                <Settings className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">
                  Paramètres
                  <span className="block text-xs font-normal text-muted-foreground">Profil, rappels de match, mot de passe, suppression</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            <li>
              <Link href="/reservations" className={ROW}>
                <CalendarCheck className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Historique des réservations</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={ROW}>
                <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Confidentialité</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            <li>
              <Link href="/terms" className={ROW}>
                <FileText className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Conditions d&apos;utilisation</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            {/* Renders nothing when analytics are not configured: drop the empty row. */}
            <li className="empty:hidden">
              <CookieSettingsButton className={ROW}>
                <Cookie className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Gestion des cookies</span>
              </CookieSettingsButton>
            </li>
          </ul>
        </nav>

        {/* A POST, not a link: a prefetch must never sign anyone out. */}
        <form action="/logout" method="post" className="mt-6 overflow-hidden rounded-2xl bg-card">
          <button type="submit" className={`${ROW} text-destructive`}>
            <LogOut className="size-5" aria-hidden />
            Se déconnecter
          </button>
        </form>
      </main>
      <PlayerTabBar current="account" />
    </>
  )
}
