// Moovi autonomous agents (Phase 4), one Supabase Edge Function run every 10 minutes by pg_cron
// (supabase/snippets/schedule_autonomous_agents.sql):
//
//   1. anti_no_show.request  queue "Confirmez votre présence" for bookings starting in 6-24 h
//   2. anti_no_show.release  at H-4, release (cancel) what is still unconfirmed — opted-in clubs only
//   3. matchmaker.expire     close searches whose window is over
//   4. matchmaker.match      seat open searches in compatible open matches (3/4 -> 4/4 first)
//   5. outbox.flush          ask the Next app to deliver the queued emails (deliver(), Nodemailer)
//
// Every state change happens inside a service_role RPC that locks its rows, so a double trigger or an
// overlapping run cannot release or seat twice. Each step has its own try/catch: a failure is written
// to system_logs and the next step still runs; the response is 500 if any step failed.
//
// Secrets (supabase secrets set ...): AGENTS_SECRET (16+ chars, sent by pg_cron as x-agents-secret),
// optional APP_URL + CRON_SECRET for the outbox flush. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are built in.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

import { applySeat, rankCandidates, RETRYABLE_FULFIL_ERRORS, type SnapshotMatch, type SnapshotRequest } from './matchmaking.ts'

type Severity = 'info' | 'warning' | 'error' | 'critical'

const MAX_TRIES_PER_REQUEST = 5
const MAX_MESSAGE = 4000

const encoder = new TextEncoder()

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

/** Compare fixed-length digests so neither the length nor the content leaks through timing. */
async function authorized(req: Request, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(req.headers.get('x-agents-secret') ?? ''), sha256(secret)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function messageOf(error: unknown): string {
  const raw =
    error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error)
  // Same spirit as lib/sentry-scrub.ts: no e-mail addresses or long tokens in the log.
  return raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .slice(0, MAX_MESSAGE) || 'Unknown error'
}

/** Best effort: logging must never turn a handled failure into a crash. */
async function log(admin: SupabaseClient, source: string, severity: Severity, message: string, metadata?: Record<string, unknown>) {
  try {
    const { error } = await admin.from('system_logs').insert({
      agent_name: source.slice(0, 120),
      severity,
      error_message: message.slice(0, MAX_MESSAGE),
      metadata: metadata ?? null,
    })
    if (error) console.error('[system_logs] insert failed:', error.code ?? error.message)
  } catch (e) {
    console.error('[system_logs] insert failed:', e instanceof Error ? e.message : e)
  }
}

async function rpc<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

/* ------------------------------- matchmaker ------------------------------- */

async function runMatchmaker(admin: SupabaseClient, now: Date) {
  const snapshot = await rpc<{ requests: SnapshotRequest[]; matches: SnapshotMatch[] }>(admin, 'matchmaker_snapshot', {
    p_now: now.toISOString(),
  })
  let matched = 0
  let completed = 0
  let conflicts = 0
  const failures: string[] = []

  // First come, first served: the snapshot is ordered by created_at.
  for (const request of snapshot.requests) {
    for (const candidate of rankCandidates(request, snapshot.matches).slice(0, MAX_TRIES_PER_REQUEST)) {
      const { data, error } = await admin.rpc('fulfil_match_request', { p_request_id: request.id, p_booking_id: candidate.booking_id })
      if (!error) {
        applySeat(candidate, request)
        matched += 1
        if ((data as { match_complete?: boolean } | null)?.match_complete) completed += 1
        break
      }
      const code = error.message.trim()
      if (RETRYABLE_FULFIL_ERRORS.has(code)) {
        conflicts += 1
        continue
      }
      // request_closed / the player may not play: nothing more to try for this request.
      if (code !== 'request_closed' && code !== 'not_player' && code !== 'suspended') failures.push(code)
      break
    }
  }

  if (failures.length) throw new Error(`fulfil_match_request failed ${failures.length}x: ${[...new Set(failures)].join(', ')}`)
  return { requests: snapshot.requests.length, openMatches: snapshot.matches.length, matched, completed, conflicts }
}

/* ------------------------------- outbox flush ------------------------------ */

async function flushOutbox() {
  const appUrl = Deno.env.get('APP_URL')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!appUrl || !cronSecret) return { skipped: 'APP_URL / CRON_SECRET not set' }
  const res = await fetch(new URL('/api/cron/notifications', appUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(50_000),
  })
  if (!res.ok) throw new Error(`notifications cron answered ${res.status}`)
  return { status: res.status }
}

/* ---------------------------------- serve ---------------------------------- */

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (error) {
    // Last boundary: anything the steps did not catch (bad env, client creation) still answers and is visible.
    console.error('[agents] run crashed:', messageOf(error))
    return Response.json({ ok: false, error: 'Agent run failed' }, { status: 500 })
  }
})

async function handle(req: Request): Promise<Response> {
  const secret = Deno.env.get('AGENTS_SECRET')
  // No secret configured means the function is off, never "open".
  if (!secret || secret.length < 16) return Response.json({ error: 'AGENTS_SECRET is not configured' }, { status: 503 })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  if (!(await authorized(req, secret))) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const now = new Date()
  const at = now.toISOString()
  let failed = false

  const step = async <T,>(source: string, job: () => Promise<T>): Promise<T | null> => {
    try {
      return await job()
    } catch (error) {
      failed = true
      const message = messageOf(error)
      console.error(`[${source}] failed:`, message)
      await log(admin, source, 'error', message, { at })
      return null
    }
  }

  const requested = await step('agents.anti_no_show.request', () => rpc<{ requested: number }>(admin, 'queue_attendance_requests', { p_now: at }))
  const released = await step('agents.anti_no_show.release', () =>
    rpc<{ released: number; booking_ids: string[] }>(admin, 'release_unconfirmed_bookings', { p_now: at })
  )
  const expired = await step('agents.matchmaker.expire', () => rpc<{ expired: number; cancelled: number }>(admin, 'expire_match_requests', { p_now: at }))
  const matchmaking = await step('agents.matchmaker.match', () => runMatchmaker(admin, now))

  const queued = (requested?.requested ?? 0) + (released?.released ?? 0) + (matchmaking?.matched ?? 0)
  const flushed = queued > 0 ? await step('agents.outbox.flush', () => flushOutbox()) : null

  const summary = { at, requested, released, expired, matchmaking, flushed }
  // Only runs that changed something leave an info row (a quiet run every 10 minutes would flood the table).
  if ((released?.released ?? 0) > 0 || (matchmaking?.matched ?? 0) > 0) {
    await log(admin, 'agents.run', 'info', `released ${released?.released ?? 0}, matched ${matchmaking?.matched ?? 0}`, summary)
  }

  return Response.json({ ok: !failed, ...summary }, { status: failed ? 500 : 200 })
}
