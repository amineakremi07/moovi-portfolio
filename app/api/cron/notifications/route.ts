import { createHash, timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { emailEnabled } from '@/lib/notifications/mailer'
import { appOrigin } from '@/lib/notifications/origin'
import { reportServerError } from '@/lib/observability'
import { dispatchQueuedNotifications, retryFailedNotifications, sendDueReminders } from '@/lib/notifications/service'
import { purgeSystemLogs } from '@/lib/system-log'

/**
 * Scheduled notification run: sends the two-hour booking reminders that are due, delivers
 * the emails the autonomous agents queued, and retries emails that failed. Call it every 5 to 15 minutes from any scheduler
 * (Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions, a plain crontab):
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/notifications
 *
 * Vercel Cron sends that header itself when the CRON_SECRET environment variable is
 * set. The run is idempotent (each reminder has a unique dedupe key), so a double
 * trigger or an overlapping run never sends twice. It also deletes `system_logs` rows older than 90 days.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const digest = (value: string) => createHash('sha256').update(value).digest()

function authorized(request: Request, secret: string): boolean {
  const presented = request.headers.get('authorization') ?? ''
  // Compare fixed-length digests so neither the length nor the content leaks through timing.
  return timingSafeEqual(digest(presented), digest(`Bearer ${secret}`))
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  // No secret configured means the endpoint is off, never "open".
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured (16+ characters required).' }, { status: 503 })
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Each step runs on its own: a failing reminder batch must not stop the retries or the log purge.
  // Failures are reported (Sentry + system_logs) and the run answers 500 so the scheduler sees them.
  const now = new Date()
  let failed = false
  const step = async <T,>(agent: string, job: () => Promise<T>): Promise<T | null> => {
    try {
      return await job()
    } catch (error) {
      failed = true
      console.error(`[${agent}] failed:`, error instanceof Error ? error.message : error)
      reportServerError(agent, error)
      return null
    }
  }

  const origin = await step('cron.notifications.origin', () => appOrigin())
  const reminders = origin ? await step('cron.notifications.reminders', () => sendDueReminders(now, origin)) : null
  // Emails queued by the autonomous agents (Edge Function): attendance requests, releases, matches found.
  const queued = origin ? await step('cron.notifications.queued', () => dispatchQueuedNotifications(now, origin)) : null
  const retried = await step('cron.notifications.retry', () => retryFailedNotifications(now))
  const logsPurged = await step('cron.system_logs.purge', () => purgeSystemLogs(now))

  return NextResponse.json(
    { ok: !failed, at: now.toISOString(), emailEnabled: emailEnabled(), reminders, queued, retried, logsPurged },
    { status: failed ? 500 : 200 }
  )
}

export const GET = run
export const POST = run
