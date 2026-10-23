'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Heart, Navigation } from 'lucide-react'

import { ClubCompactCard } from '@/components/explore/club-compact-card'
import { ExploreControls } from '@/components/explore/explore-controls'
import { OpenMatches } from '@/components/player/open-matches'
import { Button } from '@/components/ui/button'
import { useFavoriteClubs } from '@/hooks/use-favorite-clubs'
import { useMinuteClock } from '@/hooks/use-minute-clock'
import { clubStatus, type ClubStatus } from '@/lib/club-map'
import { filterOpenMatches, type OpenMatch } from '@/lib/community'
import {
  clubDistanceKm,
  filterClubs,
  sortClubs,
  type Club,
  type Point,
  type SortMode,
  type SportFilter,
} from '@/lib/clubs'
import { t } from '@/lib/i18n/messages'
import type { LiveAvailability } from '@/lib/live-availability'

/** How often the free-court counters are re-read from the server while the tab is visible. */
const LIVE_REFRESH_MS = 2 * 60_000

const SPORT_ORDER: SportFilter[] = ['padel', 'tennis', 'football']

type GeoStatus = 'idle' | 'locating' | 'denied' | 'timeout' | 'unavailable' | 'unsupported'

/**
 * The player's Explorer. Phones and tablets: one column (`top`, then the filters, "Clubs à proximité" and the
 * open matches, then `sidebar` with the tournaments; open matches and clubs swipe sideways on phones). The DOM
 * follows that order, so reading and tab order match the phone layout. From `lg`: a 12-column dashboard,
 * the main column (8: `top`, filters, open matches, club grid) beside a sticky sidebar (4: `sidebar`).
 * `top` and `sidebar` are rendered on the server. The "Parties ouvertes" chip swaps the clubs for every open
 * match; the sport chips filter both. No map here; each club page has its own. The tab bar is rendered by the page.
 */
export function ExploreShell({
  clubs,
  loadFailed = false,
  live,
  top,
  sidebar,
  matches = [],
  matchesFailed = false,
}: {
  clubs: Club[]
  /** Courts open and free right now, per sport (server-read; refreshed every couple of minutes). */
  live: LiveAvailability
  /** The server could not read clubs; distinct from "there are none yet". */
  loadFailed?: boolean
  /** Greeting, warnings and the next match: the head of the main column. */
  top?: React.ReactNode
  /** Level, tournaments, quick re-book: the sidebar from `lg`, after `top` on phones and tablets. */
  sidebar?: React.ReactNode
  /** Other players' open matches (and the ones this player joined). */
  matches?: OpenMatch[]
  matchesFailed?: boolean
}) {
  const [query, setQuery] = React.useState('')
  const [sport, setSport] = React.useState<SportFilter>('all')
  const [sort, setSort] = React.useState<SortMode>('name')
  const [position, setPosition] = React.useState<Point | null>(null)
  const [geoStatus, setGeoStatus] = React.useState<GeoStatus>('idle')
  // "Parties ouvertes" mode: the chip, or a link to #parties-ouvertes (the home's "Rejoindre une partie").
  const hash = React.useSyncExternalStore(subscribeHash, readHash, () => '')
  const [openChoice, setOpenChoice] = React.useState<boolean | null>(null)
  const openOnly = openChoice ?? hash === OPEN_MATCHES_HASH
  // The section moves up when the mode turns on: scroll to where it now is, not where the anchor was.
  React.useEffect(() => {
    if (hash !== OPEN_MATCHES_HASH) return
    const id = window.requestAnimationFrame(() => document.getElementById('parties-ouvertes')?.scrollIntoView({ block: 'start' }))
    return () => window.cancelAnimationFrame(id)
  }, [hash])
  const setOpenOnly = (value: boolean) => {
    setOpenChoice(value)
    // Leaving the mode drops the hash, so a later "Rejoindre une partie" turns it on again.
    if (!value && window.location.hash === OPEN_MATCHES_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  // The pills read as one row of choices: a sport (or "Tous") always brings the clubs back, so picking one
  // while "Parties ouvertes" is on leaves that mode instead of filtering a list the player cannot see.
  // "Parties ouvertes" keeps the chosen sport: Padel, then "Parties ouvertes" = padel open matches.
  const chooseSport = (value: SportFilter) => {
    setSport(value)
    setOpenOnly(false)
  }

  const router = useRouter()
  const { favorites, toggle: toggleFavorite } = useFavoriteClubs()
  // The venue clock, refreshed every minute; null until hydrated (the open / closed status waits for it).
  const minute = useMinuteClock()

  // Favourites float to the top; the filter's own order (name or distance) is kept within each group.
  const visible = React.useMemo(() => {
    const sorted = sortClubs(filterClubs(clubs, { query, sport }), sort, position)
    return [...sorted.filter((c) => favorites.includes(c.id)), ...sorted.filter((c) => !favorites.includes(c.id))]
  }, [clubs, query, sport, sort, position, favorites])

  const statuses = React.useMemo(() => {
    if (minute === null) return {}
    const now = new Date(minute)
    return Object.fromEntries(visible.map((club) => [club.id, clubStatus(club, now)])) as Record<string, ClubStatus>
  }, [visible, minute])

  const sports = React.useMemo<SportFilter[]>(
    () => ['all', ...SPORT_ORDER.filter((s) => clubs.some((c) => c.sports.some((x) => x.sport === s)))],
    [clubs]
  )
  const favoriteCount = visible.filter((c) => favorites.includes(c.id)).length
  const visibleMatches = React.useMemo(() => filterOpenMatches(matches, sport), [matches, sport])
  const openCount = matches.filter((m) => !m.joined && m.openSpots > 0).length

  // A new order (filters, a favourite moved to the front after hydration) starts the phone carousel at
  // its first card. Without this the browser re-snaps to the card that was showing, now further along.
  const carousel = React.useRef<HTMLUListElement>(null)
  const order = visible.map((c) => c.id).join()
  React.useLayoutEffect(() => {
    const el = carousel.current
    if (el && el.scrollLeft !== 0) el.scrollLeft = 0
  }, [order])

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [router])

  const clearFilters = () => {
    setQuery('')
    setSport('all')
  }

  const toggleNearest = () => {
    if (sort === 'nearest') return setSort('name')
    if (position) return setSort('nearest')
    if (!('geolocation' in navigator)) return setGeoStatus('unsupported')
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus('idle')
        setSort('nearest')
      },
      (error) =>
        setGeoStatus(error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable'),
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    )
  }

  const notice =
    geoStatus === 'denied'
      ? t('disc.geo.denied')
      : geoStatus === 'timeout'
        ? t('disc.geo.timeout')
        : geoStatus === 'unavailable'
          ? t('disc.geo.unavailable')
          : geoStatus === 'unsupported'
            ? t('disc.geo.unsupported')
            : null
  const count = clubs.length > 0 ? t(visible.length === 1 ? 'disc.count.one' : 'disc.count.other', { n: visible.length }) : null

  const message = loadFailed ? (
    <Message title={t('disc.failed.title')} body={t('disc.failed.body')} />
  ) : clubs.length === 0 ? (
    <Message title={t('disc.empty.title')} body={t('disc.empty.body')} />
  ) : visible.length === 0 ? (
    <Message
      title={t('disc.noMatch.title')}
      body={t('disc.noMatch.body')}
      action={
        <Button variant="outline" size="sm" onClick={clearFilters}>
          {t('disc.clearFilters')}
        </Button>
      }
    />
  ) : null

  return (
    // Desktop: row 1 = top | sidebar, row 2 = discovery | (sidebar continues). The sidebar spans both rows and
    // row 2 takes the slack, so a tall sidebar never opens a gap under `top`; the sidebar is sticky so it stays
    // beside the club grid while it scrolls. Phones: top, discovery (clubs first), then the sidebar.
    <main className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:pb-12 md:pt-20 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:px-8">
      <h1 className="sr-only">Explorer les clubs</h1>

      <div className="min-w-0 space-y-4 lg:col-span-8 lg:col-start-1 lg:row-start-1">{top}</div>

      <section aria-label="Trouver un club ou une partie" className="min-w-0 space-y-6 lg:col-span-8 lg:col-start-1 lg:row-start-2">
        <div className="space-y-3">
          <ExploreControls
            query={query}
            onQuery={setQuery}
            sport={sport}
            onSport={chooseSport}
            sports={sports}
            live={live}
            nearest={sort === 'nearest'}
            locating={geoStatus === 'locating'}
            onNearest={toggleNearest}
            openOnly={openOnly}
            onOpenOnly={setOpenOnly}
            openCount={openCount}
          />
          <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
            {notice}
          </p>
        </div>

        {openOnly && <OpenMatches matches={visibleMatches} failed={matchesFailed} />}

        {!openOnly && message}

        {!openOnly && visible.length > 0 && (
          <section id="clubs" aria-labelledby="clubs-heading" className="scroll-mt-4">
            <h2 id="clubs-heading" className="mb-1 text-lg font-semibold tracking-tight">
              Clubs à proximité
            </h2>
            <p className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5">
                {sort === 'nearest' && position ? (
                  <>
                    <Navigation className="size-3.5 shrink-0" aria-hidden /> {t('disc.map.near')}
                  </>
                ) : favoriteCount > 0 ? (
                  <>
                    <Heart className="size-3.5 shrink-0 fill-current text-peacock-teal" aria-hidden />
                    {favoriteCount === 1 ? '1 favori en tête' : `${favoriteCount} favoris en tête`}
                  </>
                ) : null}
              </span>
              {count && <span className="shrink-0 tabular-nums">{count}</span>}
            </p>
            {/* Phones: a swipeable carousel, the next card peeking at the edge. From md: a grid. */}
            <ul
              ref={carousel}
              aria-label={count ?? 'Clubs'}
              className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-2 2xl:grid-cols-3 [&::-webkit-scrollbar]:hidden"
            >
              {visible.map((club, i) => (
                <ClubCompactCard
                  key={club.id}
                  club={club}
                  // The first photo is the page's largest image (LCP): load it at once.
                  eager={i === 0}
                  sport={sport}
                  distanceKm={clubDistanceKm(club, position)}
                  status={statuses[club.id] ?? null}
                  favorite={favorites.includes(club.id)}
                  onToggleFavorite={toggleFavorite}
                  className="w-[85%] max-w-[22rem] shrink-0 snap-start md:w-auto md:max-w-none"
                />
              ))}
            </ul>
          </section>
        )}

        {/* Below the clubs: a few open matches; the "Parties ouvertes" chip shows them all instead of the clubs. */}
        {!openOnly && <OpenMatches matches={visibleMatches} failed={matchesFailed} preview onShowAll={() => setOpenOnly(true)} />}
      </section>

      <aside
        aria-label="Votre espace"
        className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        {sidebar}
      </aside>
    </main>
  )
}

const OPEN_MATCHES_HASH = '#parties-ouvertes'
const readHash = () => window.location.hash
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function Message({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/[0.08] bg-white p-4">
      <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
