'use client'

import dynamic from 'next/dynamic'

/**
 * Recharts is the heaviest client dependency of the dashboard: the charts load in their own chunk
 * after the page's numbers are on screen. Skeletons keep the charts' height (TrendChart: toolbar +
 * h-72, HoursChart: h-64 + legend) so nothing shifts when they arrive.
 */
export const TrendChart = dynamic(() => import('@/components/analytics/charts').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-[22rem] w-full animate-pulse rounded-lg bg-muted" aria-hidden />,
})

export const HoursChart = dynamic(() => import('@/components/analytics/charts').then((m) => m.HoursChart), {
  ssr: false,
  loading: () => <div className="h-[19rem] w-full animate-pulse rounded-lg bg-muted" aria-hidden />,
})
