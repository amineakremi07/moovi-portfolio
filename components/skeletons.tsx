import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading skeletons for the `loading.tsx` of data-driven routes. Next shows a
 * route's loading.tsx the moment you click a link (and prefetches it ahead of the
 * click), so the page changes instantly and the data streams in behind it. They
 * mirror the real page's shell so nothing jumps when the content arrives.
 */

function Busy({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

const PAGE = 'mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12'

function CardRow() {
  return (
    <div className="rounded-xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-4 flex gap-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  )
}

/** /reservations: the player's bookings. Same frame as the page's Shell, so the heading does not move. */
export function ReservationsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 pb-28 pt-8 sm:px-6 md:pt-24 lg:px-8 xl:px-12">
      <Busy label="Chargement de vos réservations" className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">Mes réservations</h1>
        <h2 className="mb-3 text-lg font-semibold">À venir</h2>
        <div className="space-y-3">
          <CardRow />
          <CardRow />
          <CardRow />
        </div>
      </Busy>
    </main>
  )
}

/** /reservations/[id], /reservations/join, /reservations/cancel-guest: one card. */
export function SingleCardSkeleton({ label = 'Chargement' }: { label?: string }) {
  return (
    <main className={PAGE}>
      <Busy label={label} className="mx-auto max-w-xl">
        <div className="overflow-hidden rounded-xl bg-card">
          <div className="space-y-2 bg-[#1d3023] p-5">
            <Skeleton className="h-3 w-24 bg-white/20" />
            <Skeleton className="h-6 w-48 bg-white/20" />
            <Skeleton className="h-4 w-32 bg-white/20" />
          </div>
          <div className="space-y-4 p-5">
            <div className="flex justify-between gap-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-40" />
              </div>
              <Skeleton className="size-[168px]" />
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </Busy>
    </main>
  )
}

/** /explore: greeting, next match, sidebar, then search, chips and the club list. */
export function ExploreSkeleton() {
  // Same frame as ExploreShell: greeting + next match (8 columns), sidebar (4), then search, chips and clubs.
  return (
    <main className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-1 gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:pb-12 md:pt-20 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:px-8">
      <Busy label="Chargement de votre espace" className="contents">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
        <div className="hidden min-w-0 space-y-4 lg:col-span-4 lg:row-span-2 lg:block">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <Skeleton className="h-11 w-full rounded-full" />
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="flex gap-3 overflow-hidden md:grid md:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-60 w-[85%] max-w-[22rem] shrink-0 rounded-xl md:w-auto md:max-w-none" />
            ))}
          </div>
        </div>
      </Busy>
    </main>
  )
}

/** /courts/[orgId]: back link, cover photo, name and chips, then the slot picker (8) beside the club info (4). */
export function ClubPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <Busy label="Chargement des disponibilités">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="-mx-4 mt-4 aspect-[2/1] rounded-none md:mx-0 md:aspect-auto md:h-[22rem] md:rounded-3xl lg:h-[26rem]" />
        <Skeleton className="mt-6 h-9 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-60 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-40 rounded-full" />
          ))}
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-5 lg:col-span-8">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-2 overflow-hidden">
              {Array.from({ length: 9 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-12 shrink-0 rounded-lg" />
              ))}
            </div>
            {Array.from({ length: 2 }, (_, t) => (
              <div key={t} className="space-y-2.5">
                <Skeleton className="h-8 w-32" />
                <div className="flex gap-2 overflow-hidden md:grid md:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
                  {Array.from({ length: 6 }, (_, s) => (
                    <Skeleton key={s} className="h-[4.75rem] w-[6.5rem] shrink-0 rounded-lg md:w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl lg:col-span-4" />
        </div>
      </Busy>
    </main>
  )
}

/** Club dashboard pages (inside the org layout, which already draws the header). */
export function DashboardSkeleton() {
  return (
    <Busy label="Chargement">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-64 max-w-full" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-72 w-full rounded-xl" />
    </Busy>
  )
}

/** /dashboard/org/bookings: the day's schedule (heading + actions, four stats, sport filter, court columns). */
export function ScheduleSkeleton() {
  return (
    <Busy label="Chargement du planning" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Planning du jour</h2>
          <Skeleton className="h-5 w-[34rem] max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[4.25rem] rounded-xl" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 3 }, (_, c) => (
          <div key={c} className="space-y-3 rounded-xl bg-[#eae6df] p-4">
            <Skeleton className="h-5 w-32 bg-[#f7f5f2]" />
            {Array.from({ length: 6 }, (_, s) => (
              <Skeleton key={s} className="h-14 w-full bg-[#f7f5f2]" />
            ))}
          </div>
        ))}
      </div>
    </Busy>
  )
}

/** Platform admin pages. */
export function AdminSkeleton() {
  return (
    <Busy label="Chargement">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </Busy>
  )
}
