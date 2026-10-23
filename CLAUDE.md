@AGENTS.md

# ShiftGrid

Multi-tenant SaaS for sports court booking in Tunisia. Roles: `platform_admin` › `org_admin` (club owner) › `staff` › `player`. Currency **TND** only. UI is **French** (`/admin/*` and `/api/*` stay English), one light theme.
Status, architecture, roadmap: **`docs/PROJECT_MEMORY.md`**, the single source of truth. Update it whenever a phase completes, an agent/skill/plugin is added, or the architecture changes; add a session entry to `docs/PROJECT_LOG.md` at session end. Design tokens: `docs/DESIGN.md`. All docs live in `docs/` (only `README.md`, `CLAUDE.md`, `AGENTS.md` stay at root).

## Stack
Next.js 16.3 App Router · React 19 · TypeScript strict · Supabase (Postgres, Auth, Storage, Realtime) · Zod · Tailwind v4 · shadcn `radix-nova` (local in `components/ui/`) · Framer Motion · Nodemailer SMTP · Upstash rate limit · Sentry/PostHog (off unless env set).
Local dev uses the **hosted** project `<your-project-ref>` (no local Docker Supabase).

## Commands
```bash
npx tsc --noEmit && npm run lint && npm run build   # all must be clean
E2E_SKIP_SEED=1 npx playwright test tests/<f>.spec.ts  # pure specs, writes nothing
npm run test:e2e        # seeds *@shiftgrid.local into the hosted DB: remove them after
npm run verify:db       # payments, concurrency, RLS, retention scripts
npm run verify:launch   # production readiness gate
```

## Next.js 16
- `proxy.ts` exporting `proxy()`, not `middleware.ts`; Node runtime only; no `NextRequest.ip` (`getClientIp()`).
- Turbopack default: top-level `turbopack: {}`, never add a webpack config.
- `await cookies()`; `useSearchParams()` needs `<Suspense>`; `import Link from 'next/link'`.
- Check `node_modules/next/dist/docs/` before trusting memory.

## Supabase, RLS & RPC rules
- Clients in `lib/supabase/`: `client`, `server`, `middleware`, `public` (anon, explicit column lists), `optimized-client` (service role, **bypasses RLS**: assert the caller's role first). No module-level client singletons.
- Server auth: `supabase.auth.getUser()`, never `getSession()`.
- Org and role come from the session (`getOrgAccess()`, `requireOrgAction(roles)`), never from input.
- Tenant isolation = RLS via `user_org_id()` / `user_role()`. New table: RLS on + explicit GRANTs (`service_role` needs grants too). `organizations`, `profiles`, `bookings` use column-level grants.
- Clients may update only `profiles.display_name, phone, avatar_url`; role/org changes are server-only.
- Bookings only via `create_booking()`; payment, check-in, reassign RPCs: `EXECUTE` for `service_role` only, lock the booking row first. Price, sport, member id derived server-side.
- Slot conflicts: GiST on `court_slot_locks` → `23P01`; same start → `23505`. Map both to "slot taken".
- Cancel = `UPDATE status='cancelled'` (trigger frees the lock). No hard deletes: `deleted_at` soft delete; test cleanup uses `purge_bookings()`.
- Tokens (guest, pass, invite) stored as SHA-256 only.
- BEFORE triggers fire alphabetically: name them `trg_10_…`.
- Hint embeds: `organizations!profiles_org_id_fkey(...)`.
- Migrations in `supabase/migrations/`; local and remote history match 1:1 (`npx supabase migration list`). MCP `apply_migration` stamps its own version: rename the local file to it. SQL-editor runs write no history row: `migration repair --status applied <v>`. Never `db push` / `config push` without `--dry-run` / `config diff`. Regenerate `lib/types/database.types.ts`, diff against curated `database.ts`.

## Coding rules
- Server Actions: Zod `.strict()` parse + `actionRateLimit()`. `'use server'` files export only async functions.
- `?next=` / `?redirect=` always through `safeRedirectPath()`.
- Time: `lib/court-time.ts` (`Africa/Tunis`), never `toLocaleTimeString()`. Price: `computePrice()`. Phone: `guestPhoneSchema`. Sport rules: `lib/slot-duration.ts`.
- Email only via `deliver()` (`lib/notifications/mailer.ts`), inside `after(() => runInBackground('<agent>', job))`. Handled server errors → `reportServerError()` (Sentry + `system_logs`).
- Forms: `useForm<z.input<S>, unknown, z.output<S>>`; checkboxes bind `checked`; Radix Select/Tabs via `Controller`.
- `components/ui/` filenames lowercase (Linux build).
- Motion: import `SPRING` from `motion-button.tsx`, gate on `useReducedMotion()`. Lime Pulse = actions only; no shadows.
- New third-party origin → CSP in `lib/security-headers.ts`. Permissions-Policy lives in both `next.config.ts` and `proxy.ts`.
- `ph-no-capture` on anything showing a secret link, QR or document.

## Layout
```
app/            routes (proxy.ts at root)
lib/actions/    Server Actions     lib/validations/  Zod
lib/supabase/   clients            lib/notifications/ email
components/     ui, booking, courts, explore, dashboard, player, home, nav, admin
supabase/       migrations, config.toml
scripts/        verify-*.mjs, seeds   tests/  Playwright
```

Plugins are narrowed in `.claude/settings.json`.
