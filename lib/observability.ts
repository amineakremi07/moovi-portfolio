import * as Sentry from '@sentry/nextjs'
import { after } from 'next/server'

import { logSystemError } from '@/lib/system-log'

/**
 * Report an error the code handled (so Next never sees it) but that still means
 * something is wrong: an unexpected database failure, a payment step that broke.
 * `area` becomes a Sentry tag and the `system_logs` agent name; `extra` must hold only
 * non-personal facts (codes, ids of rows), and is scrubbed again before sending.
 * Sentry is a no-op without a DSN; the `system_logs` row is written whenever the
 * service role is configured, and never throws.
 */
export function reportServerError(area: string, error: unknown, extra?: Record<string, string | number | boolean | null | undefined>) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  Sentry.captureException(err, { tags: { area }, extra })
  // after() keeps a serverless invocation alive until the row is written (it may be nested in
  // another after()); outside a request scope it throws, and the write simply runs detached.
  try {
    after(() => logSystemError(area, err))
  } catch {
    void logSystemError(area, err)
  }
}

/**
 * Run work after the response (inside Next's `after()`) so that a failure is logged, never
 * thrown: `after(() => runInBackground('notify.booking_created', () => notifyBookingCreated(...)))`.
 */
export async function runInBackground(agent: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job()
  } catch (error) {
    console.error(`[${agent}] background job failed:`, error instanceof Error ? error.message : error)
    reportServerError(agent, error)
  }
}
