-- Phase 4: autonomous agents (H-4 anti no-show scanner, 3/4 matchmaker).
--
--  1. system_logs gains `severity` and `metadata` (agent runs log warnings and summaries, not only errors).
--     `agent_name` is the log's source and `error_message` its message (names kept: lib/system-log.ts writes them).
--  2. Skill level "Niveau 1-5": profiles.skill_level (the player's own), and an open match's wanted range
--     bookings.open_level_min / open_level_max, replacing the three-label bookings.open_level
--     (debutant -> 1-2, intermediaire -> 3, avance -> 4-5).
--  3. Booking lifecycle: attendance_requested_at / attendance_confirmed_at / released_at / match_filled_at, and
--     check_in_status, a GENERATED column read from status + those timestamps (never written, never out of sync).
--  4. organizations.auto_release_unconfirmed: the club's opt-in (default off) for releasing unconfirmed bookings.
--  5. match_requests: players asking "trouve-moi une partie" (sport, level range, time window). The matchmaker
--     seats them in an open match with enough free places; match_players.seats lets a duo take two places.
--  6. Agent RPCs (service_role only, rows locked first): queue_attendance_requests, release_unconfirmed_bookings,
--     confirm_booking_attendance, create/cancel_match_request, expire_match_requests, matchmaker_snapshot,
--     fulfil_match_request. Emails are QUEUED in the outbox (`notifications.status = 'queued'`) in the same
--     transaction as the state change; the Next cron delivers them through deliver().
--  7. Realtime: a private broadcast topic `open-matches` (booking id + free places only) whenever an open match
--     changes, readable by signed-in users; match_requests joins the publication (RLS: own rows only).

-- ---------------------------------------------------------------------------
-- 1. system_logs
-- ---------------------------------------------------------------------------
alter table public.system_logs
  add column if not exists severity text not null default 'error',
  add column if not exists metadata jsonb;

alter table public.system_logs drop constraint if exists system_logs_severity_check;
alter table public.system_logs
  add constraint system_logs_severity_check check (severity in ('debug', 'info', 'warning', 'error', 'critical'));
alter table public.system_logs drop constraint if exists system_logs_metadata_size;
alter table public.system_logs
  add constraint system_logs_metadata_size check (metadata is null or pg_column_size(metadata) <= 8192);

create index if not exists idx_system_logs_severity on public.system_logs (severity, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Skill levels (Niveau 1-5)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists skill_level smallint;
alter table public.profiles drop constraint if exists profiles_skill_level_range;
alter table public.profiles
  add constraint profiles_skill_level_range check (skill_level is null or skill_level between 1 and 5);
comment on column public.profiles.skill_level is
  'The player''s own level, Niveau 1 (débutant) to 5 (expert). Written only by the server (create_match_request).';
grant select (skill_level) on public.profiles to authenticated;

alter table public.bookings
  add column if not exists open_level_min smallint,
  add column if not exists open_level_max smallint;

update public.bookings
   set open_level_min = case open_level when 'debutant' then 1 when 'intermediaire' then 3 when 'avance' then 4 end,
       open_level_max = case open_level when 'debutant' then 2 when 'intermediaire' then 3 when 'avance' then 5 end
 where open_level is not null;

alter table public.bookings drop constraint if exists bookings_open_level_check;
alter table public.bookings drop column if exists open_level;

alter table public.bookings drop constraint if exists bookings_open_level_range;
alter table public.bookings
  add constraint bookings_open_level_range check (
    (open_level_min is null and open_level_max is null)
    or (open_level_min between 1 and 5 and open_level_max between 1 and 5 and open_level_min <= open_level_max)
  );

-- ---------------------------------------------------------------------------
-- 3. Booking lifecycle
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists attendance_requested_at timestamptz,
  add column if not exists attendance_confirmed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists match_filled_at timestamptz;

alter table public.bookings
  add column if not exists check_in_status text generated always as (
    case
      when status = 'completed' then 'checked_in'
      when status = 'no_show' then 'no_show'
      when status = 'cancelled' and released_at is not null then 'released'
      when status = 'cancelled' then 'cancelled'
      when attendance_confirmed_at is not null then 'attendance_confirmed'
      when attendance_requested_at is not null then 'awaiting_confirmation'
      else 'scheduled'
    end
  ) stored;

comment on column public.bookings.check_in_status is
  'Derived lifecycle: scheduled -> awaiting_confirmation -> attendance_confirmed -> checked_in, or released / cancelled / no_show.';

grant select (open_level_min, open_level_max, attendance_requested_at, attendance_confirmed_at, released_at, match_filled_at, check_in_status)
  on public.bookings to authenticated;

-- What the H-4 scanner walks: unpaid online bookings of members, by start time.
create index if not exists idx_bookings_attendance_scan on public.bookings (starts_at)
  where status = 'pending_payment' and source = 'online' and booker_profile_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Club opt-in
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists auto_release_unconfirmed boolean not null default false;
comment on column public.organizations.auto_release_unconfirmed is
  'Release unpaid online bookings whose player did not confirm attendance 4 h before kickoff. Off by default.';
grant select (auto_release_unconfirmed) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- 5. match_requests + match_players.seats
-- ---------------------------------------------------------------------------
alter table public.match_players
  add column if not exists seats smallint not null default 1;
alter table public.match_players drop constraint if exists match_players_seats_range;
alter table public.match_players
  add constraint match_players_seats_range check (seats between 1 and 3);

create table if not exists public.match_requests (
  id               uuid primary key default extensions.uuid_generate_v4(),
  -- Null while searching; the match the player was seated in once matched.
  booking_id       uuid references public.bookings(id) on delete set null,
  requester_id     uuid not null references public.profiles(id) on delete cascade,
  sport            text not null check (sport in ('padel', 'tennis', 'football')),
  -- Places the requester needs (1 = alone, 2 = with a partner...).
  required_players smallint not null default 1 check (required_players between 1 and 3),
  -- Places secured so far: 0 while searching, required_players once matched.
  current_players  smallint not null default 0,
  skill_level_min  smallint not null default 1 check (skill_level_min between 1 and 5),
  skill_level_max  smallint not null default 5 check (skill_level_max between 1 and 5),
  window_start     timestamptz not null,
  window_end       timestamptz not null,
  status           text not null default 'open' check (status in ('open', 'matched', 'cancelled', 'expired')),
  matched_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (skill_level_min <= skill_level_max),
  check (window_start < window_end),
  check (current_players between 0 and required_players),
  -- booking_id may go back to null if the booking is purged; matched_at stays.
  check ((status = 'matched') = (matched_at is not null))
);

-- One search per sport at a time.
create unique index if not exists match_requests_open_key on public.match_requests (requester_id, sport) where status = 'open';
create index if not exists idx_match_requests_open on public.match_requests (sport, created_at) where status = 'open';
create index if not exists idx_match_requests_requester on public.match_requests (requester_id, created_at desc);
create index if not exists idx_match_requests_booking on public.match_requests (booking_id) where booking_id is not null;

drop trigger if exists trigger_match_requests_updated_at on public.match_requests;
create trigger trigger_match_requests_updated_at
  before update on public.match_requests
  for each row execute function public.update_updated_at();

alter table public.match_requests enable row level security;

-- A player reads (and receives Realtime changes for) their own requests. No client writes.
drop policy if exists "Players can view their own match requests" on public.match_requests;
create policy "Players can view their own match requests"
  on public.match_requests for select to authenticated
  using (requester_id = (select auth.uid()));

revoke all on public.match_requests from public, anon, authenticated;
grant select on public.match_requests to authenticated;
grant all on public.match_requests to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_requests') then
    alter publication supabase_realtime add table public.match_requests;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6a. Outbox: queued emails written by the agents
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('booking_confirmation', 'split_invite', 'cancellation', 'reminder_2h', 'match_joined', 'match_cancelled',
                  'tournament_registration', 'attendance_request', 'auto_release', 'match_found'));
alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications
  add constraint notifications_status_check check (status in ('queued', 'pending', 'sent', 'failed', 'skipped'));

create index if not exists idx_notifications_queued on public.notifications (created_at) where status = 'queued';

-- Queue one email to a member (their auth e-mail). Skipped silently when the account has no address;
-- dedupe_key makes "once" a database fact. Internal helper: service_role only.
create or replace function public.queue_member_email(
  p_kind text, p_booking_id uuid, p_profile_id uuid, p_subject text, p_payload jsonb, p_dedupe_key text
)
returns boolean
language plpgsql
set search_path = public, extensions
as $$
declare
  v_email text;
begin
  select e.email into v_email from public.profile_emails(array[p_profile_id]) e;
  if v_email is null or btrim(v_email) = '' then
    return false;
  end if;
  insert into public.notifications (kind, booking_id, recipient, subject, status, payload, dedupe_key)
  values (p_kind, p_booking_id, v_email, p_subject, 'queued', p_payload, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6b. H-4 anti no-show
-- ---------------------------------------------------------------------------
-- Ask for a confirmation between H-24 and H-6 (so the player has at least 2 h before the H-4 deadline).
-- Only bookings the club could release: online, unpaid, booked by a member, at an opted-in club,
-- no split shares and nobody joined. Bookings made after H-6 are never asked, so never released.
create or replace function public.queue_attendance_requests(p_now timestamptz default now(), p_limit integer default 200)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v record;
  v_count integer := 0;
begin
  for v in
    select b.id, b.booker_profile_id
      from public.bookings b
      join public.organizations o on o.id = b.org_id and o.auto_release_unconfirmed and o.deleted_at is null
     where b.status = 'pending_payment' and b.source = 'online' and b.booker_profile_id is not null
       and b.attendance_requested_at is null and b.attendance_confirmed_at is null
       and b.starts_at > p_now + interval '6 hours' and b.starts_at <= p_now + interval '24 hours'
       and not exists (select 1 from public.booking_shares s where s.booking_id = b.id)
       and not exists (select 1 from public.match_players mp where mp.booking_id = b.id and mp.left_at is null)
     order by b.starts_at
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
     for update of b skip locked
  loop
    update public.bookings set attendance_requested_at = p_now where id = v.id;
    perform public.queue_member_email('attendance_request', v.id, v.booker_profile_id,
      'Confirmez votre présence', jsonb_build_object('profile_id', v.booker_profile_id), 'attendance_request:' || v.id);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('requested', v_count);
end;
$$;

-- At H-4: release what is still unconfirmed. Cancel = status update (the trigger frees the court lock).
create or replace function public.release_unconfirmed_bookings(p_now timestamptz default now(), p_limit integer default 200)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v record;
  v_ids uuid[] := '{}';
begin
  for v in
    select b.id, b.booker_profile_id
      from public.bookings b
      join public.organizations o on o.id = b.org_id and o.auto_release_unconfirmed and o.deleted_at is null
     where b.status = 'pending_payment' and b.source = 'online' and b.booker_profile_id is not null
       and b.attendance_requested_at is not null and b.attendance_confirmed_at is null
       and b.attendance_requested_at <= b.starts_at - interval '6 hours'
       and b.starts_at > p_now and b.starts_at <= p_now + interval '4 hours'
       and not exists (select 1 from public.booking_shares s where s.booking_id = b.id)
       and not exists (select 1 from public.payment_records pr where pr.booking_id = b.id and pr.status = 'paid')
       and not exists (select 1 from public.match_players mp where mp.booking_id = b.id and mp.left_at is null)
     order by b.starts_at
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
     for update of b skip locked
  loop
    update public.bookings
       set status = 'cancelled',
           released_at = p_now,
           open_spots = 0,
           cancellation_reason = 'Libérée automatiquement : présence non confirmée 4 h avant le match.'
     where id = v.id;
    perform public.queue_member_email('auto_release', v.id, v.booker_profile_id,
      'Votre réservation a été libérée', jsonb_build_object('profile_id', v.booker_profile_id), 'auto_release:' || v.id);
    v_ids := v_ids || v.id;
  end loop;
  return jsonb_build_object('released', coalesce(array_length(v_ids, 1), 0), 'booking_ids', to_jsonb(v_ids));
end;
$$;

-- The player says "je viens". Idempotent; refused once the booking is over, cancelled or not theirs.
create or replace function public.confirm_booking_attendance(p_booking_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v public.bookings%rowtype;
begin
  select * into v from public.bookings where id = p_booking_id for update;
  if not found or v.booker_profile_id is distinct from p_profile_id then
    raise exception 'not_found';
  end if;
  if v.status not in ('pending_payment', 'confirmed') or v.starts_at <= now() then
    raise exception 'booking_closed';
  end if;
  if v.attendance_confirmed_at is null then
    update public.bookings set attendance_confirmed_at = now() where id = v.id returning * into v;
  end if;
  return jsonb_build_object('booking_id', v.id, 'attendance_confirmed_at', v.attendance_confirmed_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6c. Open matches with level ranges and seats
-- ---------------------------------------------------------------------------
drop function if exists public.set_match_open_spots(uuid, uuid, integer, text, text);
create or replace function public.set_match_open_spots(
  p_booking_id uuid,
  p_profile_id uuid,
  p_open_spots integer,
  p_level_min integer default null,
  p_level_max integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_joined integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.booker_profile_id is distinct from p_profile_id then
    raise exception 'not_found';
  end if;
  if v_booking.status not in ('pending_payment', 'confirmed') or v_booking.starts_at <= now() then
    raise exception 'match_closed';
  end if;
  if (p_level_min is null) <> (p_level_max is null)
     or (p_level_min is not null and not (p_level_min between 1 and 5 and p_level_max between 1 and 5 and p_level_min <= p_level_max)) then
    raise exception 'invalid_level';
  end if;

  select coalesce(sum(seats), 0) into v_joined from public.match_players where booking_id = p_booking_id and left_at is null;
  if p_open_spots < 0 or p_open_spots + v_joined > v_booking.player_count - 1 then
    raise exception 'invalid_spots';
  end if;

  update public.bookings
     set open_spots     = p_open_spots,
         open_level_min = case when p_open_spots > 0 then p_level_min end,
         open_level_max = case when p_open_spots > 0 then p_level_max end,
         open_note      = case when p_open_spots > 0 then nullif(btrim(p_note), '') end,
         match_filled_at = case when p_open_spots = 0 and v_joined > 0 then coalesce(match_filled_at, now()) else null end
   where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'open_spots', p_open_spots, 'joined', v_joined);
end;
$$;

-- Joining by hand also completes the match when it takes the last place.
create or replace function public.join_open_match(p_booking_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_reason text;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_booking.status not in ('pending_payment', 'confirmed') or v_booking.starts_at <= now()
     or not exists (
       select 1 from public.organizations o
       where o.id = v_booking.org_id and o.status = 'approved' and o.deleted_at is null
     ) then
    raise exception 'match_closed';
  end if;
  if v_booking.booker_profile_id = p_profile_id then
    raise exception 'own_match';
  end if;

  v_reason := public.player_can_play(p_profile_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  if exists (select 1 from public.match_players where booking_id = p_booking_id and profile_id = p_profile_id and left_at is null) then
    raise exception 'already_joined';
  end if;
  if v_booking.open_spots <= 0 then
    raise exception 'match_full';
  end if;

  insert into public.match_players (booking_id, profile_id) values (p_booking_id, p_profile_id);
  update public.bookings
     set open_spots = open_spots - 1,
         match_filled_at = case when open_spots - 1 = 0 then now() else match_filled_at end
   where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'open_spots', v_booking.open_spots - 1);
end;
$$;

-- Leaving gives back every place the player held (a duo frees two).
create or replace function public.leave_open_match(p_booking_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_seats integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_booking.starts_at <= now() then
    raise exception 'match_started';
  end if;

  update public.match_players set left_at = now()
   where booking_id = p_booking_id and profile_id = p_profile_id and left_at is null
  returning seats into v_seats;
  if not found then
    raise exception 'not_joined';
  end if;

  if v_booking.status in ('pending_payment', 'confirmed') then
    update public.bookings set open_spots = open_spots + v_seats, match_filled_at = null where id = p_booking_id;
  end if;

  return jsonb_build_object('booking_id', p_booking_id);
end;
$$;

drop function if exists public.list_open_matches(uuid, integer);
create or replace function public.list_open_matches(p_viewer uuid, p_limit integer default 24)
returns table (
  booking_id uuid,
  org_id uuid,
  club_name text,
  city text,
  sport text,
  starts_at timestamptz,
  ends_at timestamptz,
  player_count integer,
  open_spots integer,
  open_level_min integer,
  open_level_max integer,
  open_note text,
  organizer_first_name text,
  price_per_player numeric,
  joined boolean
)
language sql
stable
set search_path = public, extensions
as $$
  select
    b.id,
    b.org_id,
    o.name,
    o.city,
    b.sport,
    b.starts_at,
    b.ends_at,
    b.player_count,
    b.open_spots::integer,
    b.open_level_min::integer,
    b.open_level_max::integer,
    b.open_note,
    nullif(split_part(btrim(p.display_name), ' ', 1), ''),
    (select round(pr.amount / b.player_count, 2) from public.payment_records pr
      where pr.booking_id = b.id order by pr.created_at desc limit 1),
    exists (select 1 from public.match_players mp where mp.booking_id = b.id and mp.profile_id = p_viewer and mp.left_at is null)
  from public.bookings b
  join public.organizations o on o.id = b.org_id and o.status = 'approved' and o.deleted_at is null
  join public.profiles p on p.id = b.booker_profile_id
  where b.status in ('pending_payment', 'confirmed')
    and b.starts_at > now()
    and b.booker_profile_id is distinct from p_viewer
    and (
      b.open_spots > 0
      or exists (select 1 from public.match_players mp where mp.booking_id = b.id and mp.profile_id = p_viewer and mp.left_at is null)
    )
  order by b.starts_at
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- 6d. Matchmaker
-- ---------------------------------------------------------------------------
create or replace function public.create_match_request(
  p_profile_id uuid,
  p_sport text,
  p_required_players integer,
  p_level_min integer,
  p_level_max integer,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_player_level integer default null
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_reason text;
  v_id uuid;
begin
  v_reason := public.player_can_play(p_profile_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  if p_sport not in ('padel', 'tennis', 'football') or p_required_players not between 1 and 3
     or p_level_min not between 1 and 5 or p_level_max not between 1 and 5 or p_level_min > p_level_max
     or (p_player_level is not null and p_player_level not between 1 and 5) then
    raise exception 'invalid_request';
  end if;
  if p_window_end <= greatest(p_window_start, now() + interval '1 hour') or p_window_end > now() + interval '14 days' then
    raise exception 'invalid_window';
  end if;
  if (select count(*) from public.match_requests where requester_id = p_profile_id and status = 'open') >= 3 then
    raise exception 'too_many_requests';
  end if;

  if p_player_level is not null then
    update public.profiles set skill_level = p_player_level where id = p_profile_id;
  end if;

  insert into public.match_requests (requester_id, sport, required_players, skill_level_min, skill_level_max, window_start, window_end)
  values (p_profile_id, p_sport, p_required_players, p_level_min, p_level_max, greatest(p_window_start, now()), p_window_end)
  returning id into v_id;

  return jsonb_build_object('request_id', v_id);
exception
  when unique_violation then
    raise exception 'already_searching';
end;
$$;

create or replace function public.cancel_match_request(p_request_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
begin
  update public.match_requests set status = 'cancelled'
   where id = p_request_id and requester_id = p_profile_id and status = 'open';
  if not found then
    raise exception 'not_found';
  end if;
  return jsonb_build_object('request_id', p_request_id);
end;
$$;

-- Close searches that can no longer succeed: the window is (almost) over, or the player may not play any more.
create or replace function public.expire_match_requests(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_expired integer;
  v_cancelled integer;
begin
  update public.match_requests set status = 'expired'
   where status = 'open' and window_end <= p_now + interval '1 hour';
  get diagnostics v_expired = row_count;

  update public.match_requests r set status = 'cancelled'
   where r.status = 'open' and public.player_can_play(r.requester_id) is not null;
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object('expired', v_expired, 'cancelled', v_cancelled);
end;
$$;

-- What the matchmaker reads in one call: open searches and open matches starting at least an hour from now.
create or replace function public.matchmaker_snapshot(p_now timestamptz default now(), p_limit integer default 500)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select mr.id, mr.requester_id, mr.sport, mr.required_players, mr.skill_level_min, mr.skill_level_max,
               mr.window_start, mr.window_end, mr.created_at, p.skill_level as player_level
          from public.match_requests mr
          join public.profiles p on p.id = mr.requester_id
         where mr.status = 'open' and mr.window_end > p_now + interval '1 hour'
         order by mr.created_at
         limit least(greatest(coalesce(p_limit, 500), 1), 2000)
      ) r
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.starts_at)
      from (
        select b.id as booking_id, b.sport, b.starts_at, b.open_spots, b.player_count,
               b.open_level_min, b.open_level_max, b.booker_profile_id,
               coalesce((select array_agg(mp.profile_id) from public.match_players mp
                          where mp.booking_id = b.id and mp.left_at is null), '{}') as member_ids
          from public.bookings b
          join public.organizations o on o.id = b.org_id and o.status = 'approved' and o.deleted_at is null
         where b.status in ('pending_payment', 'confirmed') and b.open_spots > 0
           and b.starts_at > p_now + interval '1 hour' and b.starts_at <= p_now + interval '15 days'
         order by b.starts_at
         limit least(greatest(coalesce(p_limit, 500), 1), 2000)
      ) m
    ), '[]'::jsonb)
  );
$$;

-- Seat one search in one match. Locks the request, then the booking (join_open_match only locks bookings,
-- so the order cannot deadlock). Every rule is checked again here: the snapshot may be stale.
create or replace function public.fulfil_match_request(p_request_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  r public.match_requests%rowtype;
  b public.bookings%rowtype;
  v_level smallint;
  v_reason text;
  v_left integer;
begin
  select * into r from public.match_requests where id = p_request_id for update;
  if not found or r.status <> 'open' then
    raise exception 'request_closed';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status not in ('pending_payment', 'confirmed') or b.starts_at <= now() + interval '1 hour'
     or not exists (select 1 from public.organizations o where o.id = b.org_id and o.status = 'approved' and o.deleted_at is null) then
    raise exception 'match_closed';
  end if;
  if b.sport <> r.sport or b.starts_at < r.window_start or b.starts_at > r.window_end then
    raise exception 'not_compatible';
  end if;
  if b.booker_profile_id = r.requester_id
     or exists (select 1 from public.match_players where booking_id = b.id and profile_id = r.requester_id and left_at is null) then
    raise exception 'already_joined';
  end if;
  if b.open_spots < r.required_players then
    raise exception 'match_full';
  end if;

  -- Levels: the match's wanted range (none = every level) must overlap the requester's, and the
  -- requester's own level, when known, must sit inside the match's range.
  select skill_level into v_level from public.profiles where id = r.requester_id;
  if b.open_level_min is not null and (
       r.skill_level_max < b.open_level_min or r.skill_level_min > b.open_level_max
       or (v_level is not null and v_level not between b.open_level_min and b.open_level_max)
     ) then
    raise exception 'not_compatible';
  end if;

  v_reason := public.player_can_play(r.requester_id);
  if v_reason is not null then
    update public.match_requests set status = 'cancelled' where id = r.id;
    raise exception '%', v_reason;
  end if;

  insert into public.match_players (booking_id, profile_id, seats) values (b.id, r.requester_id, r.required_players);
  v_left := b.open_spots - r.required_players;
  update public.bookings
     set open_spots = v_left,
         match_filled_at = case when v_left = 0 then now() else match_filled_at end
   where id = b.id;
  update public.match_requests
     set status = 'matched', booking_id = b.id, current_players = r.required_players, matched_at = now()
   where id = r.id;

  perform public.queue_member_email('match_found', b.id, r.requester_id, 'Partie trouvée',
    jsonb_build_object('profile_id', r.requester_id, 'request_id', r.id), 'match_found:' || r.id);
  if b.booker_profile_id is not null then
    perform public.queue_member_email('match_joined', b.id, b.booker_profile_id, 'Un joueur rejoint votre partie',
      jsonb_build_object('profile_id', b.booker_profile_id, 'joiner_id', r.requester_id, 'spots_left', v_left),
      'match_joined:' || b.id || ':' || r.requester_id || ':' || r.id);
  end if;

  return jsonb_build_object('request_id', r.id, 'booking_id', b.id, 'open_spots', v_left, 'match_complete', v_left = 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Realtime: "open-matches" broadcast
-- ---------------------------------------------------------------------------
-- Safe fields only (id, sport, free places). A broadcast failure must never fail the booking write.
create or replace function public.broadcast_open_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('booking_id', new.id, 'sport', new.sport, 'open_spots',
        case when new.status in ('pending_payment', 'confirmed') then new.open_spots else 0 end),
      'open_match',
      'open-matches',
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_open_match_change() from public, anon, authenticated;

drop trigger if exists trg_open_match_broadcast on public.bookings;
create trigger trg_open_match_broadcast
  after update of open_spots, status, open_level_min, open_level_max on public.bookings
  for each row
  when (old.open_spots > 0 or new.open_spots > 0)
  execute function public.broadcast_open_match_change();

-- Signed-in users may listen on the topic; nobody may send to it (no INSERT policy).
drop policy if exists "Signed-in users receive open-match broadcasts" on realtime.messages;
create policy "Signed-in users receive open-match broadcasts"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'open-matches');

-- ---------------------------------------------------------------------------
-- 8. EXECUTE: service_role only
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.queue_member_email(text, uuid, uuid, text, jsonb, text)',
    'public.queue_attendance_requests(timestamptz, integer)',
    'public.release_unconfirmed_bookings(timestamptz, integer)',
    'public.confirm_booking_attendance(uuid, uuid)',
    'public.set_match_open_spots(uuid, uuid, integer, integer, integer, text)',
    'public.join_open_match(uuid, uuid)',
    'public.leave_open_match(uuid, uuid)',
    'public.list_open_matches(uuid, integer)',
    'public.create_match_request(uuid, text, integer, integer, integer, timestamptz, timestamptz, integer)',
    'public.cancel_match_request(uuid, uuid)',
    'public.expire_match_requests(timestamptz)',
    'public.matchmaker_snapshot(timestamptz, integer)',
    'public.fulfil_match_request(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
