'use client'

import * as React from 'react'
import { CalendarPlus, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { trackEvent } from '@/components/providers/posthog-provider'
import { bookingCalendarEvent, googleCalendarUrl } from '@/lib/calendar'
import { bookingWhatsappLink, resolveContactNumber } from '@/lib/whatsapp'

export type BookingActionsProps = {
  bookingId: string
  clubName: string
  courtName: string
  sport: string
  /** Display-ready venue date and time range for the WhatsApp message, ex. « mar. 3 nov. 2026 », "18:00 – 19:30". */
  date: string
  time: string
  /** Real instants (ISO) for the calendar. */
  startsAt: string
  endsAt: string
  reference: string
  address?: string | null
  /** The club's own number; the platform contact is used when it is missing. */
  whatsappNumber?: string | null
}

/** "Contact the club on WhatsApp" + "Add to Google Calendar", for the confirmation screen and the pass page. */
export function BookingActions(p: BookingActionsProps) {
  const whatsappHref = bookingWhatsappLink(p.whatsappNumber, {
    clubName: p.clubName,
    date: p.date,
    time: p.time,
    courtName: p.courtName,
    reference: p.reference,
  })
  const isFallback = resolveContactNumber(p.whatsappNumber)?.isFallback ?? false

  const event = bookingCalendarEvent({
    bookingId: p.bookingId,
    clubName: p.clubName,
    courtName: p.courtName,
    sport: p.sport,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    address: p.address,
    reference: p.reference,
  })

  return (
    <div className="grid gap-2">
      {whatsappHref && (
        <Button asChild variant="outline" className="h-12 w-full">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('whatsapp_contact_clicked', { club_name: p.clubName, fallback: isFallback })}
          >
            <MessageCircle aria-hidden />
            {isFallback ? 'Contacter Moovi sur WhatsApp' : 'Contacter le club sur WhatsApp'}
          </a>
        </Button>
      )}
      <Button asChild variant="outline" className="h-12 w-full">
        <a
          href={googleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('add_to_calendar_clicked', { club_name: p.clubName, target: 'google' })}
        >
          <CalendarPlus aria-hidden />
          Ajouter à Google Agenda
        </a>
      </Button>
    </div>
  )
}
