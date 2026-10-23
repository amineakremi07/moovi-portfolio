import 'server-only'

import { scrubString } from '@/lib/sentry-scrub'
import { getSupabaseAdmin, serviceRoleKeyProblem } from '@/lib/supabase/optimized-client'

const MAX_MESSAGE = 4000

/** The text stored for an error: message only (no stack, no payload), scrubbed of personal data and secrets. */
export function systemLogMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error) ?? String(error)
  return scrubString(raw).slice(0, MAX_MESSAGE) || 'Unknown error'
}

/**
 * Persist a failure to `system_logs` (service role). Best effort: it never throws and never
 * waits on the caller's critical path for long, so logging can not turn a handled error into a crash.
 */
export async function logSystemError(agentName: string, error: unknown): Promise<void> {
  if (serviceRoleKeyProblem()) return
  try {
    const { error: insertError } = await getSupabaseAdmin()
      .from('system_logs')
      .insert({ agent_name: agentName.slice(0, 120) || 'unknown', error_message: systemLogMessage(error) })
    if (insertError) console.error('[system_logs] insert failed:', insertError.code ?? insertError.message)
  } catch (e) {
    console.error('[system_logs] insert failed:', e instanceof Error ? e.message : e)
  }
}

/** Delete entries older than `days` (default 90). Returns how many were removed; throws on a database error. */
export async function purgeSystemLogs(now: Date, days = 90): Promise<number> {
  const before = new Date(now.getTime() - days * 86_400_000).toISOString()
  const { error, count } = await getSupabaseAdmin().from('system_logs').delete({ count: 'exact' }).lt('created_at', before)
  if (error) throw new Error(`system_logs purge failed: ${error.code ?? error.message}`)
  return count ?? 0
}
