import { headers } from 'next/headers'

/**
 * The proxy has already run getUser() for this request. It forwards the verified user id to the page in
 * this request header (and always deletes any copy the client sent), so a page can start its own-user
 * queries at the same time as its own getUser() instead of after it.
 *
 * It is a HINT, never the identity: callers still await getUser() and use what they started only when the
 * ids match (else they read again with the verified id). Queries started on the hint run with the visitor's
 * cookies, so RLS bounds them too; service-role reads must wait for the verified id.
 */
export const VERIFIED_USER_HEADER = 'x-sg-verified-user'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function sessionUserHint(): Promise<string | null> {
  const value = (await headers()).get(VERIFIED_USER_HEADER)
  return value && UUID.test(value) ? value : null
}
