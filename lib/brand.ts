/**
 * The public brand, in ONE place: page titles, metadata, structured data, emails and the PWA manifest
 * read these. Pure (no server imports).
 *
 * Internal identifiers keep the old name on purpose and must not follow a rebrand: the QR payload
 * prefix `shiftgrid:checkin:` (passes already issued must still scan), rate-limit keys, telemetry ids,
 * the `*@shiftgrid.local` dev accounts, and sender/support addresses until the new domain's mailboxes
 * and SPF/DKIM exist.
 */
export const BRAND_NAME = 'Moovi'

/** Home page and Open Graph title. */
export const BRAND_TITLE = 'Moovi - Réservez vos terrains de Padel, Tennis & Foot en Tunisie'

/** Default meta description; pages with their own subject override it. */
export const BRAND_DESCRIPTION =
  'Réservez un terrain de padel, de tennis ou de football en Tunisie (Tunis, Sousse, Sfax...) sur Moovi : disponibilités en direct, créneau bloqué instantanément, prix en TND.'

/** Open Graph locale: French as written in Tunisia. */
export const BRAND_LOCALE = 'fr_TN'
