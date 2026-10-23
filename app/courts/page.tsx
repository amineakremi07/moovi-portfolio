import { permanentRedirect } from 'next/navigation'

import { BOOKING_PATH } from '@/lib/auth-landing'

/**
 * The club finder moved into the player home (`/explore`). Old links, bookmarks and the PWA
 * shortcut land there; a signed-out visitor is then sent to log in by the proxy.
 * Club pages (`/courts/<id>`) are unchanged.
 */
export default function CourtsIndex() {
  permanentRedirect(BOOKING_PATH)
}
