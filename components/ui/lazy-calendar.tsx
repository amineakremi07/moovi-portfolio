'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'

import type { Calendar } from '@/components/ui/calendar'

/**
 * The French calendar, loaded on demand: react-day-picker and its locale only download when
 * a popover first shows it, never with the page. Same props as `Calendar` (locale preset).
 */
export const LazyCalendar = dynamic<React.ComponentProps<typeof Calendar>>(
  () =>
    Promise.all([import('@/components/ui/calendar'), import('react-day-picker/locale')]).then(([{ Calendar: Base }, { fr }]) => {
      function FrenchCalendar(props: React.ComponentProps<typeof Base>) {
        return <Base locale={fr} {...props} />
      }
      return FrenchCalendar
    }),
  {
    ssr: false,
    loading: () => <div className="h-[18.5rem] w-[17rem] animate-pulse rounded-md bg-muted" aria-hidden />,
  }
)
