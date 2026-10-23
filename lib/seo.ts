import { BRAND_DESCRIPTION, BRAND_NAME } from '@/lib/brand'
import { SPORT_LABEL, type Club } from '@/lib/clubs'
import { WEEKDAY_KEYS, type WeekdayKey } from '@/lib/operating-hours'

/**
 * Schema.org structured data (JSON-LD) for search engines and AI answer engines. Pure (no server
 * imports), so it is unit-tested. Every URL is absolute: crawlers read the JSON without the page's base.
 *
 * Only public facts go in: what an anonymous visitor already sees on the page (name, address, pin,
 * hours, sports, starting prices, photos, the club's WhatsApp number).
 */

type JsonLd = Record<string, unknown>

const SCHEMA_DAY: Record<WeekdayKey, string> = {
  mon: 'https://schema.org/Monday',
  tue: 'https://schema.org/Tuesday',
  wed: 'https://schema.org/Wednesday',
  thu: 'https://schema.org/Thursday',
  fri: 'https://schema.org/Friday',
  sat: 'https://schema.org/Saturday',
  sun: 'https://schema.org/Sunday',
}

/** "Padel, Tennis et Football". */
export function sportList(sports: ReadonlyArray<{ sport: keyof typeof SPORT_LABEL }>): string {
  const labels = sports.map((s) => SPORT_LABEL[s.sport])
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
// Google reads a closing time of 00:00 as "closed at the start of the day": midnight is written 23:59.
const closing = (time: string) => (time === '00:00' ? '23:59' : time)

/** Opening hours: the club's weekly hours when set, otherwise its courts' widest daily window. */
export function openingHours(club: Pick<Club, 'weeklyHours' | 'opensAt' | 'closesAt' | 'totalCourts'>): JsonLd[] {
  if (club.weeklyHours) {
    const weekly = club.weeklyHours
    return WEEKDAY_KEYS.filter((k) => weekly[k].open).map((k) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAY[k],
      opens: weekly[k].from,
      closes: closing(weekly[k].to),
    }))
  }
  if (club.totalCourts === 0) return []
  return [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: WEEKDAY_KEYS.map((k) => SCHEMA_DAY[k]),
      opens: hhmm(club.opensAt),
      closes: closing(hhmm(club.closesAt % 1440)),
    },
  ]
}

/** The platform itself: who publishes the pages, referenced by every club as its booking provider. */
export function platformJsonLd(appUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${appUrl}/#organization`,
        name: BRAND_NAME,
        url: `${appUrl}/`,
        logo: `${appUrl}/icons/icon-512.png`,
        description: BRAND_DESCRIPTION,
        areaServed: { '@type': 'Country', name: 'Tunisie' },
        knowsAbout: ['Padel', 'Tennis', 'Football', 'Réservation de terrains de sport'],
      },
      {
        '@type': 'WebSite',
        '@id': `${appUrl}/#website`,
        name: BRAND_NAME,
        url: `${appUrl}/`,
        inLanguage: 'fr-TN',
        publisher: { '@id': `${appUrl}/#organization` },
      },
    ],
  }
}

/** Every listed club, so an engine can answer "where can I play padel in Tunis?" from the home page. */
export function clubDirectoryJsonLd(clubs: ReadonlyArray<Club>, appUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Clubs de sport à réserver sur ${BRAND_NAME}`,
    numberOfItems: clubs.length,
    itemListElement: clubs.map((club, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${appUrl}/courts/${club.id}`,
      name: club.name,
    })),
  }
}

export interface ClubJsonLdInput {
  club: Club
  description: string | null
  photos: ReadonlyArray<string>
  whatsapp: string | null
}

/**
 * One club: a `SportsClub` (a kind of `SportsActivityLocation`) with its address, pin, hours, sports and
 * prices, plus a `ReserveAction` pointing at its booking page on the platform.
 */
export function clubJsonLd({ club, description, photos, whatsapp }: ClubJsonLdInput, appUrl: string): JsonLd {
  const url = `${appUrl}/courts/${club.id}`
  const prices = club.sports.map((s) => s.startingPrice).filter((p): p is number => p !== null)
  const sports = club.sports.map((s) => SPORT_LABEL[s.sport])

  return {
    '@context': 'https://schema.org',
    '@type': ['SportsClub', 'SportsActivityLocation'],
    '@id': `${url}#club`,
    name: club.name,
    url,
    description: description?.trim() || `Terrains de ${sportList(club.sports).toLowerCase()} à réserver en ligne${club.city ? ` à ${club.city}` : ''}, sur ${BRAND_NAME}.`,
    ...(photos.length ? { image: photos.slice(0, 6) } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(club.address ? { streetAddress: club.address } : {}),
      ...(club.city ? { addressLocality: club.city } : {}),
      addressCountry: 'TN',
    },
    ...(club.latitude !== null && club.longitude !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude: club.latitude, longitude: club.longitude } }
      : {}),
    ...(whatsapp ? { telephone: whatsapp } : {}),
    openingHoursSpecification: openingHours(club),
    currenciesAccepted: 'TND',
    ...(prices.length ? { priceRange: `À partir de ${Math.min(...prices)} TND` } : {}),
    keywords: sports.join(', '),
    amenityFeature: club.sports.map((s) => ({
      '@type': 'LocationFeatureSpecification',
      name: `Terrains de ${SPORT_LABEL[s.sport].toLowerCase()}`,
      value: s.courts,
    })),
    potentialAction: {
      '@type': 'ReserveAction',
      name: `Réserver un terrain chez ${club.name}`,
      target: {
        '@type': 'EntryPoint',
        urlTemplate: url,
        inLanguage: 'fr-TN',
        actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
      },
      result: { '@type': 'Reservation', name: `Réservation de terrain chez ${club.name}` },
      provider: { '@type': 'Organization', '@id': `${appUrl}/#organization`, name: BRAND_NAME },
    },
  }
}

// U+2028 / U+2029: valid in JSON, but line terminators to older JavaScript parsers. Built from code
// points so no raw separator character sits in this file.
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g')
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g')

/**
 * JSON for a `<script type="application/ld+json">`. Club names and descriptions are typed by owners, so
 * every character that could close the script or start markup is escaped (`</script>` cannot appear).
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029')
}
