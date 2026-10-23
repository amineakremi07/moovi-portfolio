# Moovi (ShiftGrid) — Project Memory

> **Single source of truth** for project status, architecture and roadmap progress.
> Rules for writing code live in `CLAUDE.md` (root); design tokens in [`DESIGN.md`](DESIGN.md); session-by-session history in [`PROJECT_LOG.md`](PROJECT_LOG.md).
>
> **Update this file** whenever a phase or milestone completes, an agent / skill / plugin is added or removed, or the architecture changes significantly. Bump the date below and keep it short: detail goes in the log.

**Last updated:** 2026-10-23

---

## 1. Product

Multi-tenant SaaS for sports court booking (padel, tennis, football) in Tunisia. Brand **Moovi** (repo, package, fixtures and some ids still say ShiftGrid on purpose: see the 2026-10-21 log entry). Currency **TND**, UI **French** (`/admin/*` and `/api/*` stay English), one light theme.

| Door | Who | Entry | Gets |
|---|---|---|---|
| B2C | Players | `/` → `/courts`, home `/explore` | Find a club, live slots, book, open matches, tournaments, pass + QR |
| B2B | `org_admin` (owner), `staff` | `/espace-club`, `/dashboard/org` | Bookings board (grid), walk-ins, check-in, payments, analytics, team, tournaments |
| Platform | `platform_admin` | `/admin` | Club verification, account security |

Live: https://moovitn.vercel.app (older URL `shiftgridtn.vercel.app`).

### Decisions (recorded 2026-10-22)

- **Business model: monthly SaaS subscription for club owners.** Clubs (`org_admin`) pay a flat monthly fee to run their venue on Moovi; players book for free. Revenue does not depend on a per-booking commission, so a club has no reason to route bookings around the platform.
- **Positioning: the club's single source of truth.** The owner's Master Calendar (the "Grille" bookings board) holds every booking: online ones and the phone / walk-in ones staff enter through the walk-in modal. Every channel writes through `create_booking()` and the `court_slot_locks` GiST lock, so a slot sold by phone is instantly gone online. This is the answer to overbooking from clubs juggling several apps, a paper diary and WhatsApp.
- **Phase 6: WhatsApp video ingestion pipeline (planned).** Owners send short video clips of their courts / matches to a Moovi WhatsApp Business number → the clip is matched to the sender's club and ingested → an automated **Remotion** render applies Moovi's branded template (club name, logo, booking call-to-action) → the result is auto-published to Instagram and TikTok with the club tagged. Club logos (`organizations.logo_url`, shipped 2026-10-22) are the first building block.

## 2. Architecture

- **Stack:** Next.js 16.3 App Router (`proxy.ts`, Turbopack) · React 19 · TypeScript strict · Supabase (Postgres, Auth, Storage, Realtime) · Zod · Tailwind v4 · shadcn `radix-nova` · Framer Motion · Nodemailer SMTP (Brevo) · Upstash rate limit · Sentry / PostHog (off unless env set, PostHog consent-gated). Hosted on Vercel.
- **Database:** one hosted Supabase project `<your-project-ref>` for dev **and** prod today. 46 migrations in `supabase/migrations/`; remote is 1:1 up to `20261022183442_club_logo`. **`20261023000000_autonomous_agents` is written and dry-run checked but NOT applied** (apply it together with the app deploy).
- **Tenant isolation:** RLS on every table via `user_org_id()` / `user_role()` (executable by `authenticated` and `service_role` only; no policy targets `public`, and anon policies never call them); roles `platform_admin` › `org_admin` › `staff` › `player`, enforced in the proxy, in the page/action (`getOrgAccess()`, `requireOrgAction()`), and in RLS. Players have no `org_id`; `last_visited_club_id` tracks their club.
- **Bookings:** only through `create_booking()` RPC (`authenticated` has no INSERT privilege or policy on `bookings`). GiST exclusion on `court_slot_locks` prevents double booking (`23P01` / `23505` → "slot taken"). Trigger chain `set_booking_times → assign_court → create_court_lock`. Exactly one booker (profile or anonymous). Cancel = status update; no hard deletes (soft delete / anonymisation, Law 2004-63).
- **Privileged RPCs** (payments, check-in, reassign, open matches, tournaments): `EXECUTE` for `service_role` only, lock the row first; called from Server Actions after a role check.
- **Supabase clients:** `lib/supabase/{client,server,middleware,public,optimized-client}`; `optimized-client` is service role and bypasses RLS.
- **Caching:** Next Data Cache with tag invalidation (2026-10-19); streaming shells for dashboards.
- **Email:** `deliver()` in `lib/notifications/mailer.ts`, outbox table, sent inside `after()`.
- **Error resilience & system logs:** `reportServerError(area, err)` (`lib/observability.ts`) sends to Sentry **and** writes a scrubbed row to `system_logs` (`agent_name`, `error_message`, `created_at`; service role only, purged after 90 days by the notifications cron). Background work runs as `after(() => runInBackground('<agent>', job))`, so a failure is logged, never thrown. The cron runs each step independently; the payment webhook is wrapped in try/catch.
- **Security headers:** `lib/security-headers.ts` (CSP with nonce-free allow-list, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS), applied from `next.config.ts`; Permissions-Policy also in `proxy.ts`.
- **Performance:** hot columns indexed (bookings by org/status/time, court/time, booker; courts by org/sport; tournaments by org/upcoming/created_by). Heavy client code loads on demand: Leaflet maps, the react-day-picker calendar (`components/ui/lazy-calendar.tsx`), Recharts (`components/analytics/lazy-charts.tsx`). Owner / staff emails come from `profile_emails()` in one call (no per-person auth API calls).
- **Design system (Apple-style pass, 2026-10-22, within `docs/DESIGN.md`: flat, no shadows, Lime Pulse on actions only):**
  - *Type:* size-specific tracking and balanced wrapping on `h1`–`h3`, `text-wrap: pretty` on paragraphs, antialiased rendering (`app/globals.css` base layer).
  - *Press feedback:* `Button` scales to 0.97 on press (150 ms, off with reduced motion) instead of a 1px nudge; the house spring `SPRING` (400 / 25 / mass 0.6 ≈ damping ratio 0.8) is unchanged.
  - *Dialogs & sheets:* a 30% dimming scrim (was 10%), roomier padding (20px), larger semibold titles, a round muted close button, sheets without shadow, dialogs scroll within `100dvh`, footer "Fermer" (was English "Close").
  - *Empty states:* one `EmptyState` component (`components/ui/empty-state.tsx`: icon, title, one-line hint, at most one action; `card` / `outline`, `compact`) used across the dashboard and `/explore`.
  - *Skeletons:* `ExploreSkeleton` and `ClubPageSkeleton` rebuilt to mirror the real layouts (they still drew the removed full-screen map and old court columns); `Skeleton` respects reduced motion.
  - *Slot grid:* bookable times = solid Oat Milk cards, taken / past = dashed outline (no opacity fade, so both pass contrast); today's past times fold behind "N horaires déjà passés"; phone rows snap to the 16px gutter; tags in sentence case.
  - *Accessibility preferences:* `prefers-reduced-transparency` makes glass bars solid, `prefers-contrast: more` darkens hairlines and secondary text.
  - *Responsive:* `body { overflow-x: clip }` as a safety net; the dashboard nav is a full-width swipe row on phones (it could widen the page before).
- **Focused flows (2026-10-22, pre-Phase 4):**
  - *`/explore` filter pills:* one row of choices. A sport pill (Tous / Padel / Tennis / Football) always turns "Parties ouvertes" off and shows that sport's clubs; "Parties ouvertes" keeps the chosen sport and lists its open matches (`chooseSport()` in `explore-shell.tsx`).
  - *Club page gallery (desktop, `md`+):* bento mosaic in `components/club/club-hero.tsx` — featured photo on the left (3 of 5 columns, 60%), the right 40% holds one tall tile (2 photos), two stacked tiles (3–4 photos) or a 2×2 (5+ photos); `rounded-3xl` frame, slow hover zoom + light Forest Depths veil (off with reduced motion), a frosted "Voir toutes les photos (N)" pill opening the full gallery. Phones keep the swipe carousel.
  - *Club page:* header = name + address only (no per-sport pills, no "Voir les créneaux" button, no instruction line; the "Réserver un créneau" heading is screen-reader-only on phones). Phone hero is 2:1. **One sport at a time:** the sport chips are a radio group (`sport-filter-<sport>`) and only that sport's timeline, legend and rules render (`TimeSlotGrid` takes `sport`); switching sport clears a picked time. On a 390×844 phone the first time sits at ~520px, above the fold.
  - *Club dashboard nav:* only daily views — Réservations, Tournois, Terrains, Statistiques — plus **Paramètres** (`/dashboard/org/settings`), now open to every role: "Compte et accès" (Équipe for owners, Sécurité for all), "Affichage du planning" (Grille / Détails, per device via `lib/board-view.ts`, removed from the board itself), then the owner's club profile and hours. Équipe and Sécurité keep their URLs, show a "← Paramètres" back link and light up Paramètres in the nav. There is no API-keys screen in the dashboard (the API keys are managed through RPCs only).
- **Optimistic UI:** the booking drawer shows "Créneau retenu pour vous" (`useOptimistic`) the moment the player confirms; React reverts it on failure and the filled-in form returns with the reason.
- **Autonomous agents (Phase 4, 2026-10-23):** one Supabase Edge Function `supabase/functions/autonomous-agents` (Deno), called every 10 min by pg_cron + pg_net (`supabase/snippets/schedule_autonomous_agents.sql`, secret in Vault, header `x-agents-secret`). It only calls service-role RPCs that lock their rows, so overlapping runs are safe; each step has its own try/catch logging to `system_logs` (`severity`, `metadata`).
  - *H-4 anti no-show (opt-in per club, `organizations.auto_release_unconfirmed`, default off):* unpaid **online** member bookings with no split and no joiners are asked to confirm between H-24 and H-6 (`attendance_requested_at`), and released at H-4 if still unconfirmed (`status = 'cancelled'`, `released_at`). Players confirm with "Je confirme ma venue" on the next-match card or the pass (`confirm_booking_attendance`). `bookings.check_in_status` is a **generated** column (scheduled → awaiting_confirmation → attendance_confirmed → checked_in, or released / cancelled / no_show).
  - *3/4 matchmaker:* `match_requests` = players' searches ("Trouve-moi une partie": sport, day + period, places 1-3, partner level range, own level). The agent seats each search in an existing open match (`fulfil_match_request`: `match_players.seats`, `open_spots`, `match_filled_at`), completing 3/4 games first. **Skill = Niveau 1-5** (`profiles.skill_level`, `bookings.open_level_min/max`; labels Découverte → Compétition, distinct from the progression "Niveau" titles).
  - *Email:* the RPCs queue outbox rows (`notifications.status = 'queued'`) in the same transaction; `dispatchQueuedNotifications()` in the Next cron delivers them via `deliver()` (the function triggers that cron when `APP_URL` + `CRON_SECRET` are set).
  - *Realtime:* private broadcast topic `open-matches` (bookings trigger; id, sport, free places only; `realtime.messages` SELECT policy, no INSERT) + the player's own `match_requests` rows → `MatchmakingWidget` (`lib/realtime/open-matches-feed.ts`, throttled refresh).
- **Sport rules:** `lib/slot-duration.ts` (padel 90 min / 4 players, tennis 60 min / 2-4, football 90 min / 12-14, 15 min buffer).

## 3. Roadmap progress

| Phase / milestone | Status |
|---|---|
| M1 Database foundation & RLS | ✅ Done |
| M2 Auth, anti-spam, RBAC | ✅ Done |
| M3 Public availability & slot matrix | ✅ Done (date navigation shipped as `DateStrip` in `components/courts/day-picker.tsx`) |
| M4 Booking engine (member + guest) | ✅ Done (booking now requires a player account; guest mode kept server-side) |
| M5 Org admin & staff portal | 🟡 Mostly done: drag-and-drop court blocking and check-in roster left |
| M6 Platform admin verification portal | ✅ Verification done; super-admin portal is M12 |
| M7 Cancellation, Realtime, team | ✅ Done |
| M8 Analytics (TND) | ✅ Done |
| M9 Booking & payment flow | ✅ Done with a **sandbox** gateway |
| M10 Notifications | ✅ Done (real SMTP delivery blocked on Brevo credentials, see below) |
| M11 / 11b / 11c Production readiness, hardening, pooling, Sentry | ✅ Done |
| M13 Legal compliance & consent | ✅ Code done; legal review + INPDP filing are the owner's |
| V2 Anti no-show (check-in code, QR, trust score) | ✅ Done |
| Phase 1-2 (post-exam): one-screen checkout, time-first booking, rebook | ✅ Done |
| Phase 3 Club map · Phase 4 RLS consolidation · Phase 6 GEO / local SEO + rebrand | ✅ Done |
| Data caching layer, auth waterfalls | ✅ Done |
| Player home redesign, open matches, tournaments | ✅ Done, applied to hosted DB (2026-10-22) |
| Club page, owner "Grille" board | ✅ Done (2026-10-22) |
| Phase 2: OWASP / RLS hardening, `system_logs`, resilient background jobs | ✅ Done, applied to hosted DB (2026-10-22) |
| Phase 3: indexes, dynamic imports, N+1 removal, optimistic booking UI | ✅ Done (2026-10-22) |
| UI/UX audit, Apple-style refinement of `/explore`, club page, `/dashboard/org` | ✅ Done (2026-10-22); signed-in views checked in code only |
| Pre-Phase 4 cleanup: single-sport club page, minimal header, dashboard nav → daily views + Paramètres | ✅ Done (2026-10-22) |
| Explore home: compact Réserver / Rejoindre hero, clubs before tournaments, club logos (`logo_url`) | ✅ Done (2026-10-22) |
| Club page desktop bento gallery (60 / 40 mosaic, hover, "Voir toutes les photos") | ✅ Done (2026-10-22) |
| **Phase 4 (agents)** H-4 anti no-show scanner, 3/4 matchmaker, `MatchmakingWidget`, Edge Function | 🟡 Code done (2026-10-23); migration not applied, function not deployed / scheduled |
| **Phase 6** WhatsApp video ingestion → Remotion render → Instagram / TikTok auto-publish (see Decisions) | ⬜ Planned |
| **M12** Super-admin portal (system view, licence keys, suspension, audit logs), Lighthouse, WCAG 2.2, deployed smoke test | ⬜ Not started |

## 4. Open work

### Blocking
- **Sign-up emails fail:** Brevo returns `535 Authentication failed` to Supabase (wrong SMTP login/key in the dashboard) and `525 Unauthorized IP` to the `.env.local` key ("Authorized IPs" on). Owner fixes both in Brevo + Supabase.
- **Domain move to `moovitn.vercel.app`:** add `/{auth/callback,accept-invitation,reset-password}` to Supabase Redirect URLs, set Site URL, set `NEXT_PUBLIC_APP_URL` on Vercel, redeploy.

### Phase 4 go-live (owner)
- Apply `20261023000000_autonomous_agents` **and** deploy the app at the same time (new code reads `open_level_min/max`, old code reads `open_level`).
- `npx supabase functions deploy autonomous-agents --no-verify-jwt`; `npx supabase secrets set AGENTS_SECRET=… APP_URL=https://moovitn.vercel.app CRON_SECRET=…`; run `supabase/snippets/schedule_autonomous_agents.sql`.
- Update `/terms` (auto-release of unconfirmed unpaid bookings) and bump `LEGAL_VERSION` **before** any club turns the switch on.

### Launch checklist (owner)
- Legal review of `/terms` + `/privacy` (French draft), INPDP filing, privacy mailbox; bump `LEGAL_VERSION` after changes.
- Separate production Supabase project; real `SUPABASE_SERVICE_ROLE_KEY`; leaked-password protection; remove `*@shiftgrid.local` accounts and "ShiftGrid Test Club".
- Supabase Auth: Google provider; `supabase config diff` before any push (remote Site URL has a trailing slash).
- Vercel env: SMTP, `EMAIL_FROM`, `CRON_SECRET` + schedule `/api/cron/notifications`, Upstash, Sentry, legal identity vars. Gate: `npm run verify:launch -- --env-file .env.production.local --url <origin> --full`.
- Real payment gateway (sandbox `test` provider today); unpaid-split / pay-at-venue auto-release (update Terms when it ships).
- Load test from the deployed region (booking p95 ≈ 1.2 s locally, target 800 ms).
- Full deployment order: "🚀 Deployment steps" in `PROJECT_LOG.md` (archive section).

- **`npm run verify:db` cannot run:** 4 of its 5 scripts need the seeded "ShiftGrid Test Club" + `*@shiftgrid.local` accounts, which were removed from the hosted DB (which also serves production). Re-seed (`node scripts/seed-all-roles.mjs`) only on a separate dev/test project, or point the scripts at one via `TEST_SUPABASE_*`.

### Decisions pending
- RLS still lets `platform_admin` SELECT/DELETE data it should not reach (bookings, api_keys metadata, invites, shares): drop those policies? (Left unchanged by Phase 2: it is the owner's call.)
- `createBooking` still accepts `mode: 'guest'` without a session (k6 relies on it): refuse on the server?
- Guest consent is validated but not stored; staff walk-ins / invite acceptance have no consent box.

### Known gaps
- Design follow-ups: default `Button` is 32px tall (below the 44px touch target) — raise sizes on coarse pointers in a dedicated pass; the landing navbar still uses shadows, against DESIGN.md; `/explore` cards are white with black hairlines (the 2026-10-18 "clean SaaS" choice) rather than Oat Milk.
- Archiving a club cancels its bookings without emailing open-match joiners; cancelling a tournament does not email entrants.
- Tests to rewrite: `tests/booking-flow.spec.ts`, `tests/notifications.spec.ts`, `tests/phase2-auth.spec.ts` (English selectors, old guest flow).

## 5. Agents, skills & tooling

- **Project skills** (`.claude/skills/`): `owasp-security` (OWASP audit), `secret-scanner` (local secret scan), `dependency-audit` (npm audit).
- **Plugins:** narrowed in `.claude/settings.json`. Disabled for this project: `pyright-lsp`, `linkedin-agent`, `github` (bad token: use `gh`), `claude-mem`, `i-have-adhd`, `ecc`, `code-simplifier`, `context7`. Kept: supabase, vercel, playwright, typescript-lsp, superpowers, code-review, security-guidance, claude-md-management, frontend-design.
- **Verification scripts** (`scripts/verify-*.mjs`): `npm run verify:db` (needs seed fixtures, see Open work), `verify:launch`, `verify:consent`, `verify-community.mjs` (own fixtures).
- **CI:** `.github/workflows/ci.yml`. The `security` job seeds the test accounts and runs `verify:security` against the dedicated TEST project; it needs repository secrets `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` and **`SEED_PASSWORD`** (12+ chars, wired into the job `env:` since 2026-10-22; the job fails fast with a clear error if any is missing). Locally `SEED_PASSWORD` lives in `.env.local` (documented in `.env.local.example`).

## 6. Docs map

| File | Holds |
|---|---|
| `CLAUDE.md` (root) | Coding rules for agents; stays at root so Claude Code loads it |
| `AGENTS.md` (root) | Next.js 16 notice, regenerated by `next dev`; must stay at root |
| `README.md` (root) | Public overview and getting started |
| `docs/PROJECT_MEMORY.md` | This file: status, architecture, roadmap |
| `docs/PROJECT_LOG.md` | Per-session history + archived original log (gotchas, migrations, observability detail) |
| `docs/DESIGN.md` | Design system and tokens |
