-- Phase 2/3: RLS hardening, system_logs, missing FK index, one-round-trip owner/staff emails.
--
-- 1. Policies written for PUBLIC (which includes anon) move to `authenticated`, with their helper
--    calls wrapped in (select ...) so they are evaluated once per statement, not once per row.
-- 2. anon no longer evaluates user_org_id() / user_role(): the slot-lock policy is split per role,
--    then EXECUTE on both helpers is revoked from PUBLIC (they stay callable by authenticated).
-- 3. Bookings are created only by create_booking() (service role): the direct INSERT policy and
--    privilege for authenticated are removed.
-- 4. tournaments: one SELECT policy per role instead of two permissive ones for authenticated.
-- 5. system_logs: failures of background jobs and webhooks, service role only.
-- 6. profile_emails(): owner / staff emails in one call instead of one auth API call per person.

-- ---- 1. PUBLIC policies -> authenticated --------------------------------------------------------
alter policy "Org staff can view anonymous bookers" on public.anonymous_bookers to authenticated
  using ((org_id = (select public.user_org_id())) and ((select public.user_role()) = any (array['org_admin', 'staff'])));

alter policy "Org admins can create API keys" on public.api_keys to authenticated
  with check ((organization_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));
alter policy "Org admins can delete API keys" on public.api_keys to authenticated
  using ((organization_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));
alter policy "Org admins can update API keys" on public.api_keys to authenticated
  using ((organization_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));

alter policy "Bookers and club staff can view shares" on public.booking_shares to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_shares.booking_id
      and (b.booker_profile_id = (select auth.uid())
        or (b.org_id = (select public.user_org_id()) and (select public.user_role()) = any (array['org_admin', 'staff']))
        or (select public.user_role()) = 'platform_admin')
  ));

alter policy "Org admins can insert courts" on public.courts to authenticated
  with check ((org_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));
alter policy "Org admins can update courts" on public.courts to authenticated
  using ((org_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin') and (deleted_at is null))
  with check ((org_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin') and (deleted_at is null));

alter policy "Platform admins can insert organizations" on public.organizations to authenticated
  with check ((select public.user_role()) = 'platform_admin');

alter policy "Org admins can update payment records" on public.payment_records to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = payment_records.booking_id and b.org_id = (select public.user_org_id()) and (select public.user_role()) = 'org_admin'
  ));
alter policy "Org admins can view payment records" on public.payment_records to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = payment_records.booking_id and b.org_id = (select public.user_org_id())
      and (select public.user_role()) = any (array['org_admin', 'staff'])
  ));

alter policy "Org admins can create staff invites" on public.staff_invites to authenticated
  with check ((org_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));
alter policy "Org admins can update staff invites" on public.staff_invites to authenticated
  using ((org_id = (select public.user_org_id())) and ((select public.user_role()) = 'org_admin'));

-- ---- 2. anon never calls the tenant helpers ----------------------------------------------------
drop policy "View slot locks of public courts or own club" on public.court_slot_locks;

create policy "Anyone can view slot locks of public courts" on public.court_slot_locks
  for select to anon
  using (exists (
    select 1 from public.courts c
    where c.id = court_slot_locks.court_id and c.status = 'active' and c.deleted_at is null and public.org_is_approved(c.org_id)
  ));

create policy "View slot locks of public courts or own club" on public.court_slot_locks
  for select to authenticated
  using (exists (
    select 1 from public.courts c
    where c.id = court_slot_locks.court_id
      and ((c.status = 'active' and c.deleted_at is null and public.org_is_approved(c.org_id))
        or c.org_id = (select public.user_org_id()))
  ));

revoke execute on function public.user_org_id() from public, anon;
revoke execute on function public.user_role() from public, anon;
grant execute on function public.user_org_id() to authenticated, service_role;
grant execute on function public.user_role() to authenticated, service_role;

-- ---- 3. bookings: create_booking() only ---------------------------------------------------------
drop policy "Org staff can insert bookings in their org" on public.bookings;
revoke insert on public.bookings from authenticated, anon;

-- ---- 4. tournaments: one SELECT policy per role -------------------------------------------------
drop policy "Club staff can view their tournaments" on public.tournaments;
drop policy "Published tournaments of approved clubs are public" on public.tournaments;

create policy "Published tournaments of approved clubs are public" on public.tournaments
  for select to anon
  using (status = 'published' and deleted_at is null and exists (
    select 1 from public.organizations o where o.id = tournaments.org_id and o.status = 'approved' and o.deleted_at is null
  ));

create policy "Published tournaments, or own club's" on public.tournaments
  for select to authenticated
  using (
    (org_id = (select public.user_org_id()) and (select public.user_role()) = any (array['org_admin', 'staff']))
    or (status = 'published' and deleted_at is null and exists (
      select 1 from public.organizations o where o.id = tournaments.org_id and o.status = 'approved' and o.deleted_at is null
    ))
  );

create index if not exists idx_tournaments_created_by on public.tournaments (created_by);

-- ---- 5. system_logs -----------------------------------------------------------------------------
create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null check (char_length(agent_name) between 1 and 120),
  error_message text not null check (char_length(error_message) between 1 and 4000),
  created_at timestamptz not null default now()
);

comment on table public.system_logs is
  'Failures of background jobs, webhooks and handled server errors. Written by the service role only; messages are scrubbed of personal data before insert. Purged after 90 days by the notifications cron.';

create index idx_system_logs_created_at on public.system_logs (created_at desc);
create index idx_system_logs_agent_created on public.system_logs (agent_name, created_at desc);

alter table public.system_logs enable row level security;
revoke all on public.system_logs from public, anon, authenticated;
grant select, insert, delete on public.system_logs to service_role;

-- ---- 6. profile_emails() ------------------------------------------------------------------------
create or replace function public.profile_emails(p_ids uuid[])
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where u.id = any (p_ids[1:500]);
$$;

revoke all on function public.profile_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.profile_emails(uuid[]) to service_role;
