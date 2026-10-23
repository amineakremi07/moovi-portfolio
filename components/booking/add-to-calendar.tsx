'use client'

import { CalendarPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/components/providers/posthog-provider'
import { googleCalendarUrl, type CalendarEvent } from '@/lib/calendar'
import { cn } from '@/lib/utils'

/**
 * "Ajouter à Google Agenda" (no .ics download). `tone="dark"` styles it for the Forest Depths surface of
 * the next-booking card.
 */
export function AddToCalendar({
  event,
  clubName,
  tone = 'light',
}: {
  event: CalendarEvent
  clubName: string
  tone?: 'light' | 'dark'
}) {
  const dark = tone === 'dark'
  return (
    <Button
      asChild
      variant="outline"
      className={cn('h-11', dark && 'border-bone-linen/40 bg-transparent text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen')}
    >
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('add_to_calendar_clicked', { club_name: clubName, target: 'google' })}
      >
        <CalendarPlus aria-hidden />
        Ajouter à Google Agenda
      </a>
    </Button>
  )
}
