import { Audiences } from '@/components/home/audiences'
import { HeroSection } from '@/components/home/hero-section'
import { HowItWorks } from '@/components/home/how-it-works'
import { SiteFooter } from '@/components/home/site-footer'
import { TrustSignals } from '@/components/home/trust-signals'
import { Navbar } from '@/components/nav/navbar'
import { ScrollToTop } from '@/components/nav/scroll-to-top'
import type { Metadata } from 'next'

import { JsonLd } from '@/components/seo/json-ld'
import { resolveAppUrl } from '@/lib/app-url'
import { BRAND_TITLE } from '@/lib/brand'
import { loadClubs } from '@/lib/clubs-loader'
import { clubDirectoryJsonLd, platformJsonLd } from '@/lib/seo'

// `absolute`: the home page carries the full brand title, not "… | Moovi".
export const metadata: Metadata = {
  title: { absolute: BRAND_TITLE },
  alternates: { canonical: '/' },
}

/**
 * The public marketing + onboarding page: two doors (players book at /courts, which needs an
 * account; clubs go to /espace-club), what each side gets, how booking works, and what the
 * platform guarantees. The club finder itself lives at /courts.
 *
 * The club counts are public data, the same for every visitor, so the page is
 * regenerated at most once a minute instead of hitting the database per request.
 */
export const revalidate = 60

export default async function Home() {
  const { clubs } = await loadClubs()
  const appUrl = resolveAppUrl()

  return (
    <>
      <JsonLd data={platformJsonLd(appUrl)} />
      {clubs.length > 0 && <JsonLd data={clubDirectoryJsonLd(clubs, appUrl)} />}
      <Navbar />
      <main className="flex-1">
        <HeroSection clubCount={clubs.length} courtCount={clubs.reduce((n, c) => n + c.totalCourts, 0)} />
        <Audiences />
        <HowItWorks />
        <TrustSignals />
      </main>
      <SiteFooter />
      <ScrollToTop />
    </>
  )
}
