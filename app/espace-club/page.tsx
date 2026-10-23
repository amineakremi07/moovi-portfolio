import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3, CalendarRange, LogIn, QrCode, Smartphone, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

import { SiteFooter } from '@/components/home/site-footer'
import { Navbar } from '@/components/nav/navbar'
import { Button } from '@/components/ui/button'

/**
 * B2B door ("Digitaliser mon club"): what a club gets, how onboarding works (the real
 * sequence: signup with the registration document -> manual verification -> courts and
 * hours), and the two ways in: create the club space or sign in to the management portal.
 * Static: no data, the same for every visitor. A signed-in manager who clicks "Se connecter"
 * is sent straight to their dashboard by the proxy.
 */
export const metadata: Metadata = {
  title: 'Espace club : gérez vos terrains de padel, tennis et foot',
  alternates: { canonical: '/espace-club' },
  description:
    'Digitalisez votre club de padel, tennis ou football en Tunisie : planning par terrain, réservations en ligne et au comptoir, check-in par QR, encaissements et statistiques en TND.',
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CalendarRange,
    title: 'Un planning par terrain',
    body: 'Les réservations en ligne, au comptoir et par téléphone arrivent sur la même grille, mise à jour en direct pour toute votre équipe.',
  },
  {
    icon: Smartphone,
    title: 'Réservation en ligne 24 h/24',
    body: 'Vos joueurs réservent depuis leur téléphone avec leur compte Moovi. Aucun double créneau possible.',
  },
  {
    icon: QrCode,
    title: 'Check-in et absences',
    body: "Chaque réservation a un code et un QR. Les absences sont enregistrées, et un joueur absent trois fois est suspendu 30 jours.",
  },
  {
    icon: Wallet,
    title: 'Encaissements clairs',
    body: 'Paiement au club marqué en un clic, montants dus visibles, tarifs de soirée appliqués automatiquement.',
  },
  {
    icon: BarChart3,
    title: 'Statistiques en TND',
    body: "Chiffre d'affaires, occupation par heure, terrains les plus rentables, taux d'annulation.",
  },
  {
    icon: UsersRound,
    title: 'Votre équipe',
    body: "Invitez vos réceptionnistes : ils gèrent les réservations, vous gardez la main sur les tarifs, horaires et terrains.",
  },
]

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Créez l’espace de votre club',
    body: "Nom, adresse et position sur la carte, sports proposés, et le document d'immatriculation de votre structure.",
  },
  {
    title: 'Nous vérifions votre club',
    body: "Notre équipe contrôle votre dossier. Vous recevez la décision par e-mail, avec le motif en cas de refus.",
  },
  {
    title: 'Ouvrez vos créneaux',
    body: 'Ajoutez vos terrains, tarifs et horaires : votre club apparaît sur Moovi et les joueurs peuvent réserver.',
  },
]

export default function ClubSpacePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section aria-labelledby="club-title" className="mx-auto w-full max-w-[1920px] px-3 pb-16 pt-3 sm:px-5 md:pb-24 md:pt-5 xl:px-9">
          <div className="relative isolate overflow-clip rounded-3xl bg-forest-depths text-bone-linen">
            <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 -z-10 size-[520px] rounded-full bg-peacock-teal/40 blur-3xl" />
            <div className="px-5 pb-14 pt-32 md:px-10 md:pb-20 md:pt-40">
              <p className="text-sm text-bone-linen/70">Moovi pour les clubs</p>
              <h1
                id="club-title"
                className="mt-3 max-w-[16ch] text-5xl font-semibold uppercase leading-[0.95] tracking-tighter text-balance sm:text-6xl md:text-7xl"
              >
                Digitalisez votre club
              </h1>
              <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-oat-milk md:text-lg">
                Réservations en ligne, planning, check-in et encaissements au même endroit. Pour les clubs de padel, de tennis et de
                football en Tunisie.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild className="h-12 px-6 text-base">
                  <Link href="/register?role=owner" prefetch data-testid="club-signup">
                    Créer l’espace de mon club
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-12 border-bone-linen/40 bg-transparent px-6 text-base text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen"
                >
                  <Link href="/login-owner" prefetch data-testid="club-login">
                    <LogIn aria-hidden />
                    J’ai déjà un compte
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="club-features" className="mx-auto w-full max-w-[1920px] px-4 pb-24 sm:px-6 lg:px-8 xl:px-12">
          <h2 id="club-features" className="max-w-[24ch] text-3xl font-semibold leading-[1.1] tracking-tight text-balance md:text-5xl">
            Tout ce qu’il faut pour remplir vos terrains
          </h2>
          <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="border-t border-border pt-5">
                <Icon className="size-5 text-peacock-teal" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold leading-snug">{title}</h3>
                <p className="mt-1.5 max-w-[48ch] leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="club-steps" className="border-t border-border/40 bg-muted/40">
          <div className="mx-auto w-full max-w-[1920px] px-4 py-24 sm:px-6 lg:px-8 xl:px-12">
            <h2 id="club-steps" className="text-3xl font-semibold tracking-tight md:text-4xl">
              Comment démarrer
            </h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl bg-card p-6">
                  <span className="flex size-9 items-center justify-center rounded-full bg-forest-depths text-sm font-semibold text-bone-linen tabular-nums" aria-hidden>
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold leading-snug">{step.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild className="h-12 px-6 text-base">
                <Link href="/register?role=owner">Créer l’espace de mon club</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Vous êtes réceptionniste ? Demandez une invitation au gérant de votre club.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
