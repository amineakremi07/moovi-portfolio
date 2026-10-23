import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react'

import { DeleteAccount } from '@/components/booking/delete-account'
import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { ChangePasswordForm, ContactPreferencesForm, ProfileForm } from '@/components/player/settings-forms'
import { Button } from '@/components/ui/button'
import { signOutEverywhereAction } from '@/lib/actions/player-settings'
import { landingPathFor } from '@/lib/auth-landing'
import { formatVenueDate, venueDateString } from '@/lib/court-time'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database'
import { nationalNumber, splitDisplayName } from '@/lib/validations/player-settings'

/** Personal: never prerendered or cached. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Paramètres', robots: { index: false } }

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => Date.now()

/**
 * Player settings: profile (first name, last name, mobile), reminder channels, and account status
 * and security (email, club, trust, password, sessions, deletion). Club and admin accounts are sent
 * to their own area; signed-out visitors to the login page (proxy.ts, re-checked here).
 */
export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=%2Fsettings')

  const now = readClock()
  const [{ data: profile }, { count: upcomingCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'role, display_name, phone, remind_by_email, remind_by_sms, remind_by_whatsapp, trust_score, no_show_count, is_suspended, suspended_until, created_at, last_visited:organizations!profiles_last_visited_club_id_fkey(name)'
      )
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('booker_profile_id', user.id)
      .in('status', ['pending_payment', 'confirmed'])
      .gt('ends_at', new Date(now).toISOString()),
  ])
  if (!profile) redirect('/login')
  if (profile.role !== 'player') redirect(landingPathFor(profile.role as UserRole))

  const names = splitDisplayName(profile.display_name)
  // Accounts made with Google have no Moovi password to change.
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string]
  const hasPassword = providers.includes('email')
  const suspended = profile.is_suspended && profile.suspended_until !== null && Date.parse(profile.suspended_until) > now

  return (
    <>
    <main className="mx-auto w-full max-w-[1920px] px-4 pb-28 pt-8 sm:px-6 md:pt-24 lg:px-8 xl:px-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <Link href="/compte" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Mon compte
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Paramètres</h1>
          <p className="mt-1 text-muted-foreground">Votre profil, vos rappels et la sécurité de votre compte.</p>
        </header>

        <div className="mx-auto grid max-w-3xl gap-8">
          <section aria-labelledby="profile-heading" className="rounded-2xl bg-card p-6">
            <h2 id="profile-heading" className="text-lg font-semibold">
              Profil
            </h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">Le nom et le numéro que voit votre club.</p>
            <ProfileForm defaults={{ firstName: names.firstName, lastName: names.lastName, phone: nationalNumber(profile.phone) }} />
          </section>

          <section aria-labelledby="contact-heading" className="rounded-2xl bg-card p-6">
            <h2 id="contact-heading" className="text-lg font-semibold">
              Rappels de match
            </h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">Comment vous souhaitez être prévenu avant vos matchs.</p>
            <ContactPreferencesForm
              defaults={{ email: profile.remind_by_email, sms: profile.remind_by_sms, whatsapp: profile.remind_by_whatsapp }}
              hasPhone={Boolean(profile.phone)}
            />
          </section>

          <section aria-labelledby="account-heading" className="rounded-2xl bg-card p-6">
            <h2 id="account-heading" className="text-lg font-semibold">
              Compte et sécurité
            </h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">E-mail de connexion</dt>
                <dd className="mt-0.5 break-all font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Connexion</dt>
                <dd className="mt-0.5 font-medium">{hasPassword ? 'E-mail et mot de passe' : 'Compte Google'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dernier club visité</dt>
                <dd className="mt-0.5 font-medium">{profile.last_visited?.name ?? 'Aucun pour le moment'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Membre depuis</dt>
                <dd className="mt-0.5 font-medium">{formatVenueDate(venueDateString(new Date(profile.created_at)))}</dd>
              </div>
            </dl>

            <div
              className={
                suspended
                  ? 'mt-5 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm'
                  : 'mt-5 flex gap-3 rounded-lg border border-border p-4 text-sm'
              }
              data-testid="account-status"
            >
              {suspended ? (
                <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
              ) : (
                <ShieldCheck className="size-5 shrink-0 text-peacock-teal" aria-hidden />
              )}
              <div>
                <p className="font-medium">
                  {suspended
                    ? `Réservations suspendues jusqu'au ${formatVenueDate(venueDateString(new Date(profile.suspended_until as string)))}`
                    : 'Compte actif'}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Score de confiance {profile.trust_score}/100 ·{' '}
                  {profile.no_show_count === 0
                    ? 'aucune absence'
                    : `${profile.no_show_count} absence${profile.no_show_count === 1 ? '' : 's'}`}
                  . Trois absences suspendent les réservations pendant 30 jours.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="font-semibold">Mot de passe</h3>
              {hasPassword ? (
                <div className="mt-4">
                  <ChangePasswordForm />
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Vous vous connectez avec Google : il n&apos;y a pas de mot de passe Moovi. Pour en créer un, utilisez{' '}
                  <Link href="/forgot-password" className="underline underline-offset-4">
                    mot de passe oublié
                  </Link>{' '}
                  avec votre adresse e-mail.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="font-semibold">Sessions</h3>
              <p className="mt-1 text-sm text-muted-foreground">Déconnecte ce compte de tous les appareils, y compris celui-ci.</p>
              <form action={signOutEverywhereAction} className="mt-4">
                <Button type="submit" variant="outline" className="h-11">
                  Se déconnecter de tous les appareils
                </Button>
              </form>
            </div>
          </section>

          <DeleteAccount upcomingCount={upcomingCount ?? 0} />
        </div>
      </div>
    </main>
    <PlayerTabBar current="account" />
    </>
  )
}
