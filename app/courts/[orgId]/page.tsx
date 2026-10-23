import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, MapPin } from 'lucide-react'

import type { BookingDrawerMember } from '@/components/booking/booking-drawer'
import type { MatrixCourt } from '@/components/courts/court-slot-matrix'
import { ClubBookingView } from '@/components/courts/club-booking-view'
import { ClubHero } from '@/components/club/club-hero'
import { ClubLogo } from '@/components/club/club-logo'
import { ClubLocation } from '@/components/club/club-location'
import { ownGalleryUrls, ownLogoUrl } from '@/lib/club-profile'
import { demandFor, venueWeekdayHour } from '@/lib/demand'
import { loadClubDemand, loadMemberHistory } from '@/lib/insights-loader'
import { favouriteSlot, isRecommended } from '@/lib/recommendations'
import { displayAddress } from '@/lib/geocode'
import { generateCourtSlots } from '@/lib/court-slots'
import { addDays, venueDateString } from '@/lib/court-time'
import { effectiveHours, parseWeeklyHours, weekdayKey, WEEKDAY_LABELS } from '@/lib/operating-hours'
import { onlinePaymentMode } from '@/lib/payments'
import { SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { loadClubCourts, loadClubLocks, loadClubProfile } from '@/lib/club-page-loader'
import { createClient } from '@/lib/supabase/server'
import { JsonLd } from '@/components/seo/json-ld'
import { resolveAppUrl } from '@/lib/app-url'
import { BRAND_NAME } from '@/lib/brand'
import { buildClubs, formatHours, type Club } from '@/lib/clubs'
import { clubJsonLd, sportList } from '@/lib/seo'

/** Personalised (the drawer knows who is signed in) and live, so never prerendered. */
export const dynamic = 'force-dynamic'

/** How far ahead a slot can be booked; mirrors the server action. */
const MAX_DAYS_AHEAD = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

function isSport(value: string): value is Sport {
  return value in SPORT_DURATION_MIN
}

/**
 * "Réserver à nouveau" opens this page on a time: `?sport=&start=` (or an older `?court=&start=` link,
 * read as that court's sport). Anything malformed is ignored and the page opens normally.
 */
function preselectFrom(
  query: { sport?: string; court?: string; start?: string },
  courts: MatrixCourt[]
): { sport: Sport; startsAt: string } | null {
  if (!query.start || Number.isNaN(Date.parse(query.start))) return null
  const sport = query.sport && isSport(query.sport) ? query.sport : courts.find((c) => c.id === query.court)?.sport
  return sport ? { sport, startsAt: new Date(query.start).toISOString() } : null
}

type ClubProfile = NonNullable<Awaited<ReturnType<typeof loadClubProfile>>>
type ClubCourts = Awaited<ReturnType<typeof loadClubCourts>>

/** The club as the directory summarises it (sports, court counts, starting prices, hours), for SEO. */
function summarise(org: ClubProfile, courts: ClubCourts | null): Club | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const cover = ownGalleryUrls(org.gallery_urls, org.id, supabaseUrl)[0] ?? null
  const rows = (courts ?? []).map((c) => ({ ...c, org_id: org.id, price_per_hour: Number(c.price_per_hour) }))
  return buildClubs([{ ...org, cover_url: cover, logo_url: ownLogoUrl(org.logo_url, org.id, supabaseUrl) }], rows)[0] ?? null
}

/**
 * Local-search title and description ("<Club> - Terrains de Padel à Tunis | Moovi"). The canonical is
 * the bare club URL: `?date=` and re-book links are the same page.
 */
export async function generateMetadata({ params }: { params: Promise<{ orgId: string }> }): Promise<Metadata> {
  const { orgId } = await params
  if (!UUID.test(orgId)) return {}
  const org = await loadClubProfile(orgId).catch(() => null)
  if (!org) return { title: 'Club introuvable', robots: { index: false } }
  const club = summarise(org, await loadClubCourts(orgId).catch(() => null))

  const sports = club?.sports.length ? sportList(club.sports) : null
  const where = org.city ? ` à ${org.city}` : ' en Tunisie'
  const prices = (club?.sports ?? []).map((s) => s.startingPrice).filter((p): p is number => p !== null)
  const title = sports ? `${org.name} - Terrains de ${sports}${where}` : `${org.name}${where}`
  const description = `Réservez un terrain${sports ? ` de ${sports.toLowerCase()}` : ''}${where} chez ${org.name} sur ${BRAND_NAME} : disponibilités en direct, créneau bloqué instantanément${prices.length ? `, à partir de ${Math.min(...prices)} TND` : ''}.`
  const canonical = `/courts/${org.id}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: 'website', url: canonical, title: `${title} | ${BRAND_NAME}`, description },
    twitter: { card: 'summary_large_image', title: `${title} | ${BRAND_NAME}`, description },
  }
}

/** Who is browsing, for the drawer. Null when signed out. Any player books as a member, at any club. */
async function loadMember(): Promise<{ member: BookingDrawerMember; userId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, role, org_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    member: {
      displayName: profile?.display_name ?? user.email ?? 'Votre compte',
      email: user.email ?? null,
      phone: profile?.phone ?? null,
      role: profile?.role ?? 'unknown',
      // Any player account books as a member at any club (no home club since 20261017000000).
      isMember: profile?.role === 'player',
    },
  }
}

export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams?: Promise<{ date?: string; sport?: string; court?: string; start?: string }>
}) {
  const { orgId } = await params
  if (!UUID.test(orgId)) notFound()

  // Clamp the requested day into the bookable window (venue time, not the server's).
  const today = venueDateString()
  const maxDate = addDays(today, MAX_DAYS_AHEAD)
  const query = (await searchParams) ?? {}
  const requested = query.date
  const dateStr = requested && DATE.test(requested) ? requested : today
  const day = dateStr < today ? today : dateStr > maxDate ? maxDate : dateStr

  // Public (anon) reads, cached (lib/club-page-loader.ts): RLS exposes only approved clubs, active
  // courts, and lock ranges. The club, its courts and who is browsing do not depend on each other: one
  // round trip. Only the slot locks need the court ids, so they follow.
  const [org, courtsRes, viewer] = await Promise.all([
    // A club that cannot be read is not shown as "not found": the error page offers a retry.
    loadClubProfile(orgId),
    loadClubCourts(orgId).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error: error instanceof Error ? error.message : String(error) })
    ),
    loadMember(),
  ])
  if (!org) notFound()
  const courts = courtsRes.data
  const courtsError = courtsRes.error
  const member = viewer?.member ?? null

  // Slot hints, in parallel with the locks below: how busy this club usually is at each hour, and (for a
  // signed-in member) the weekday + hour they usually book. Both fall back quietly when unavailable.
  // Locks overlapping the day: cached 15 s, dropped by every booking change at the club.
  const courtIds = (courts ?? []).map((c) => c.id)
  const [demand, history, locksRes] = await Promise.all([
    loadClubDemand(orgId, (courts ?? []).length),
    viewer?.member.isMember ? loadMemberHistory(viewer.userId, orgId) : Promise.resolve([] as string[]),
    courtIds.length
      ? loadClubLocks(orgId, courtIds, day).then(
          (data) => ({ data, error: null }),
          (error: unknown) => ({ data: null, error: error instanceof Error ? error.message : String(error) })
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  const favourite = favouriteSlot(history)
  const locks = locksRes.data
  const locksError = locksRes.error

  // If availability could not be read, say so. Rendering every slot as free would
  // invite players to book slots that are already taken.
  const loadFailed = Boolean(courtsError || locksError)
  if (loadFailed) {
    console.error('Failed to load club availability:', {
      courts: courtsError,
      locks: locksError,
    })
  }

  const photos = ownGalleryUrls(org.gallery_urls, org.id, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  const logo = ownLogoUrl(org.logo_url, org.id, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  const summary = summarise(org, courts)
  const hasPin = org.latitude !== null && org.longitude !== null
  const hasProfile = photos.length > 0 || hasPin || Boolean(org.description)

  const now = new Date()
  const weekly = parseWeeklyHours(org.weekly_hours)
  const closedToday = Boolean(weekly && !weekly[weekdayKey(day)].open)
  const matrixCourts: MatrixCourt[] = loadFailed
    ? []
    : (courts ?? []).flatMap((court) => {
        if (!isSport(court.sport)) return []
        const courtLocks = (locks ?? [])
          .filter((l) => l.court_id === court.id)
          .map((l) => ({ from: l.occupied_from, until: l.occupied_until }))

        const hours = effectiveHours(weekly, day, court)

        return [
          {
            id: court.id,
            name: court.name,
            sport: court.sport,
            pricePerHour: Number(court.price_per_hour),
            nightSurchargePerHour: Number(court.night_surcharge_per_hour),
            nightStartsAt: court.night_starts_at,
            slots: hours
              ? generateCourtSlots({
                  sport: court.sport,
                  openTime: hours.openTime,
                  closeTime: hours.closeTime,
                  dateStr: day,
                  locks: courtLocks,
                  now,
                }).map((slot) => {
                  if (slot.state !== 'available') return slot
                  const { weekday, hour } = venueWeekdayHour(slot.start)
                  const level = demandFor(demand, weekday, hour)
                  const tag = isRecommended(slot.start, favourite) ? 'recommended' : level === 'high' ? 'high_demand' : level === 'quiet' ? 'quiet' : undefined
                  return tag ? { ...slot, tag } : slot
                })
              : [],
          },
        ]
      })

  const booking = loadFailed ? (
    <div role="alert" className="rounded-xl bg-card px-6 py-12 text-center">
      <p className="text-lg font-semibold">Impossible de charger les disponibilités pour le moment</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">
        Veuillez actualiser la page dans un instant. Les créneaux ne sont pas affichés, afin que vous ne puissiez pas en réserver un par erreur.
      </p>
    </div>
  ) : matrixCourts.length === 0 ? (
    <div className="rounded-xl bg-card px-6 py-12 text-center">
      <p className="text-lg font-semibold">Aucun terrain n&apos;est encore ouvert à la réservation</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted-foreground">Ce club n&apos;a pas encore configuré ses terrains. Revenez bientôt.</p>
    </div>
  ) : (
    <ClubBookingView
      closedNotice={closedToday ? `${org.name} est fermé le ${WEEKDAY_LABELS[weekdayKey(day)].toLowerCase()}.` : null}
      orgId={org.id}
      orgName={org.name}
      orgAddress={[org.address, org.city].filter(Boolean).join(', ') || null}
      orgWhatsapp={org.whatsapp_number}
      dateStr={day}
      minDate={today}
      maxDate={maxDate}
      courts={matrixCourts}
      member={member}
      onlineMode={onlinePaymentMode()}
      preselect={preselectFrom(query, matrixCourts)}
    />
  )

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 md:pt-6 lg:px-8">
      {summary && (
        <JsonLd data={clubJsonLd({ club: summary, description: org.description, photos, whatsapp: org.whatsapp_number }, resolveAppUrl())} />
      )}
      <Link href="/explore" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Tous les clubs
      </Link>

      <ClubHero urls={photos} name={org.name} />

      <header className="mt-4 flex min-w-0 items-center gap-3 md:gap-4">
        <ClubLogo url={logo} name={org.name} sizes="(min-width: 768px) 4rem, 3.5rem" className="size-14 text-xl md:size-16 md:text-2xl" />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{org.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground md:text-base">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{displayAddress(org.address, org.city) || 'Tunisie'}</span>
          </p>
        </div>
      </header>

      <div className="mt-5 grid gap-8 md:mt-8 lg:grid-cols-12 lg:gap-10">
        <section id="reserver" aria-labelledby="book-heading" className="min-w-0 scroll-mt-4 lg:col-span-8">
          {/* Named for screen readers; on screen the date strip and the times speak for themselves. */}
          <h2 id="book-heading" className="sr-only md:not-sr-only md:mb-2 md:text-xl md:font-semibold md:tracking-tight">
            Réserver un créneau
          </h2>
          {booking}
        </section>

        {(hasProfile || summary) && (
          <aside aria-label={`À propos de ${org.name}`} className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:col-span-4 lg:self-start" data-testid="club-profile">
            <div className="space-y-5 rounded-xl border border-border bg-card p-5">
              {org.description && (
                <section aria-labelledby="club-about-heading" className="space-y-1.5">
                  <h2 id="club-about-heading" className="text-sm font-semibold">
                    À propos
                  </h2>
                  <p className="line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-muted-foreground" data-testid="club-bio">
                    {org.description}
                  </p>
                </section>
              )}
              {summary && (
                <section aria-labelledby="club-hours-heading" className="space-y-1.5">
                  <h2 id="club-hours-heading" className="text-sm font-semibold">
                    Horaires
                  </h2>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                    <Clock className="size-4 shrink-0" aria-hidden />
                    {formatHours(summary)}
                  </p>
                </section>
              )}
              {hasPin && (
                <ClubLocation name={org.name} address={org.address} latitude={org.latitude as number} longitude={org.longitude as number} />
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  )
}
