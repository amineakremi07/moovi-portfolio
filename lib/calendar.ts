/**
 * "Add to calendar" for a booking: a Google Calendar link (no .ics file). Pure: the same code builds
 * the on-screen buttons and the email link. Times are real instants (ISO), written in UTC, so no time
 * zone data is needed.
 */

export type CalendarEvent = {
  /** The booking id. */
  uid: string
  title: string
  startsAt: string
  endsAt: string
  location?: string | null
  description?: string | null
}

const stamp = (iso: string): string => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}` })
  if (e.location) params.set('location', e.location)
  if (e.description) params.set('details', e.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Event for a booking from display-ready facts. */
export function bookingCalendarEvent(p: {
  bookingId: string
  clubName: string
  courtName: string
  sport: string
  startsAt: string
  endsAt: string
  address?: string | null
  reference?: string
}): CalendarEvent {
  return {
    uid: p.bookingId,
    title: `${p.sport ? p.sport.charAt(0).toUpperCase() + p.sport.slice(1) : 'Match'} à ${p.clubName}`,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    location: [p.clubName, p.address].filter(Boolean).join(', '),
    description: `Terrain : ${p.courtName}${p.reference ? `\nRéférence : ${p.reference}` : ''}\nRéservé avec Moovi`,
  }
}
