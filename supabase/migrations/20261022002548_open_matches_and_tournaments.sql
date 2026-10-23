-- Open matches ("Rejoindre une partie") and club tournaments ("Tournois & Événements").
--
-- Open matches
--   * bookings.open_spots: places the organiser is looking to fill (0 = private match). The match shows
--     "player_count - open_spots / player_count joueurs". open_level / open_note describe who is wanted.
--   * match_players: who joined someone else's match. Joiners pay their part at the club; no payment row
--     is created. Leaving sets left_at (no hard delete) and gives the place back.
--   * set_match_open_spots / join_open_match / leave_open_match lock the booking row first, so two
--     players can never take the last place. list_open_matches returns safe fields only (never phone,
--     e-mail, reference or check-in code). All four are service_role only: the Server Action derives the
--     profile id from the verified session.
--
-- Tournaments
--   * tournaments: published by a club's owner (writes go through the service role after the owner check).
--     Anyone can read published, upcoming tournaments of approved clubs; the club's staff read all of theirs.
--   * tournament_registrations: one active registration per player. Entry fees are paid at the club;
--     staff record it with mark_tournament_entry_paid.
--   * register_for_tournament / cancel_tournament_registration lock the tournament row first (capacity).

-- ---------------------------------------------------------------------------
-- 1. Open matches: columns on bookings
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists open_spots smallint not null default 0,
  add column if not exists open_level text,
  add column if not exists open_note text;

alter table public.bookings drop constraint if exists bookings_open_spots_range;
alter table public.bookings
  add constraint bookings_open_spots_range check (open_spots >= 0 and open_spots < player_count);
alter table public.bookings drop constraint if exists bookings_open_level_check;
alter table public.bookings
  add constraint bookings_open_level_check check (open_level is null or open_level in ('debutant', 'intermediaire', 'avance'));
alter table public.bookings drop constraint if exists bookings_open_note_len;
alter table public.bookings
  add constraint bookings_open_note_len check (open_note is null or char_length(open_note) between 1 and 200);

comment on column public.bookings.open_spots is
  'Places the organiser is looking to fill through "Parties ouvertes" (0 = private). Written only by the open-match RPCs.';

create index if not exists idx_bookings_open_matches on public.bookings (starts_at)
  where open_spots > 0 and status in ('pending_payment', 'confirmed');

-- bookings uses column-level grants: players may read the new columns of rows RLS shows them, never write them.
grant select (open_spots, open_level, open_note) on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. match_players
-- ---------------------------------------------------------------------------
create table if not exists public.match_players (
  id          uuid primary key default extensions.uuid_generate_v4(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  check (left_at is null or left_at >= joined_at)
);

create unique index if not exists match_players_active_key on public.match_players (booking_id, profile_id) where left_at is null;
create index if not exists idx_match_players_profile on public.match_players (profile_id) where left_at is null;

alter table public.match_players enable row level security;

-- The joiner, the organiser and the club's staff. Nobody writes through the API.
drop policy if exists "Players, organisers and club staff can view match players" on public.match_players;
create policy "Players, organisers and club staff can view match players"
  on public.match_players for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.bookings b
      where b.id = match_players.booking_id
        and (
          b.booker_profile_id = (select auth.uid())
          or (b.org_id = (select public.user_org_id()) and (select public.user_role()) = any (array['org_admin', 'staff']))
        )
    )
  );

revoke all on public.match_players from public, anon, authenticated;
grant select on public.match_players to authenticated;
grant all on public.match_players to service_role;

-- ---------------------------------------------------------------------------
-- 3. Open-match RPCs (service_role only)
-- ---------------------------------------------------------------------------

-- A player may join only when they are an active, unsuspended player.
create or replace function public.player_can_play(p_profile_id uuid)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select case
    when p.id is null or p.role <> 'player' or p.anonymized_at is not null then 'not_player'
    when p.is_suspended and (p.suspended_until is null or p.suspended_until > now()) then 'suspended'
    else null
  end
  from (select 1) one
  left join public.profiles p on p.id = p_profile_id;
$$;

create or replace function public.set_match_open_spots(
  p_booking_id uuid,
  p_profile_id uuid,
  p_open_spots integer,
  p_level text default null,
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

  select count(*) into v_joined from public.match_players where booking_id = p_booking_id and left_at is null;
  if p_open_spots < 0 or p_open_spots + v_joined > v_booking.player_count - 1 then
    raise exception 'invalid_spots';
  end if;

  update public.bookings
     set open_spots = p_open_spots,
         open_level = case when p_open_spots > 0 then p_level end,
         open_note  = case when p_open_spots > 0 then nullif(btrim(p_note), '') end
   where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'open_spots', p_open_spots, 'joined', v_joined);
end;
$$;

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
  update public.bookings set open_spots = open_spots - 1 where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'open_spots', v_booking.open_spots - 1);
end;
$$;

create or replace function public.leave_open_match(p_booking_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_booking.starts_at <= now() then
    raise exception 'match_started';
  end if;

  update public.match_players set left_at = now()
   where booking_id = p_booking_id and profile_id = p_profile_id and left_at is null;
  if not found then
    raise exception 'not_joined';
  end if;

  -- The place goes back on offer while the match is still on.
  if v_booking.status in ('pending_payment', 'confirmed') then
    update public.bookings set open_spots = open_spots + 1 where id = p_booking_id;
  end if;

  return jsonb_build_object('booking_id', p_booking_id);
end;
$$;

-- Upcoming open matches for one player: those with a free place, and those they already joined.
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
  open_level text,
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
    b.open_level,
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
-- 4. Tournaments
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  title                 text not null check (char_length(title) between 3 and 120),
  description           text check (description is null or char_length(description) between 1 and 1000),
  sport                 text not null check (sport in ('padel', 'tennis', 'football')),
  starts_at             timestamptz not null,
  registration_deadline timestamptz not null,
  entry_fee             numeric(10,2) not null default 0 check (entry_fee >= 0 and entry_fee <= 10000),
  team_size             smallint not null check (team_size between 1 and 7),
  max_teams             smallint not null check (max_teams between 2 and 128),
  status                text not null default 'published' check (status in ('published', 'cancelled')),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  check (registration_deadline <= starts_at)
);

create index if not exists idx_tournaments_org on public.tournaments (org_id, starts_at desc);
create index if not exists idx_tournaments_upcoming on public.tournaments (starts_at)
  where status = 'published' and deleted_at is null;

drop trigger if exists trigger_tournaments_updated_at on public.tournaments;
create trigger trigger_tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.update_updated_at();

alter table public.tournaments enable row level security;

drop policy if exists "Published tournaments of approved clubs are public" on public.tournaments;
create policy "Published tournaments of approved clubs are public"
  on public.tournaments for select to anon, authenticated
  using (
    status = 'published' and deleted_at is null
    and exists (select 1 from public.organizations o where o.id = tournaments.org_id and o.status = 'approved' and o.deleted_at is null)
  );

drop policy if exists "Club staff can view their tournaments" on public.tournaments;
create policy "Club staff can view their tournaments"
  on public.tournaments for select to authenticated
  using (org_id = (select public.user_org_id()) and (select public.user_role()) = any (array['org_admin', 'staff']));

revoke all on public.tournaments from public, anon, authenticated;
grant select on public.tournaments to anon, authenticated;
grant all on public.tournaments to service_role;

create table if not exists public.tournament_registrations (
  id             uuid primary key default extensions.uuid_generate_v4(),
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  team_name      text check (team_name is null or char_length(team_name) between 1 and 60),
  teammates      text check (teammates is null or char_length(teammates) between 1 and 300),
  status         text not null default 'registered' check (status in ('registered', 'cancelled')),
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists tournament_registrations_active_key
  on public.tournament_registrations (tournament_id, profile_id) where status = 'registered';
create index if not exists idx_tournament_registrations_profile on public.tournament_registrations (profile_id);
create index if not exists idx_tournament_registrations_tournament on public.tournament_registrations (tournament_id);

drop trigger if exists trigger_tournament_registrations_updated_at on public.tournament_registrations;
create trigger trigger_tournament_registrations_updated_at
  before update on public.tournament_registrations
  for each row execute function public.update_updated_at();

alter table public.tournament_registrations enable row level security;

drop policy if exists "Players and club staff can view registrations" on public.tournament_registrations;
create policy "Players and club staff can view registrations"
  on public.tournament_registrations for select to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.org_id = (select public.user_org_id())
        and (select public.user_role()) = any (array['org_admin', 'staff'])
    )
  );

revoke all on public.tournament_registrations from public, anon, authenticated;
grant select on public.tournament_registrations to authenticated;
grant all on public.tournament_registrations to service_role;

-- ---------------------------------------------------------------------------
-- 5. Tournament RPCs (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.register_for_tournament(
  p_tournament_id uuid,
  p_profile_id uuid,
  p_team_name text default null,
  p_teammates text default null
)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_t public.tournaments%rowtype;
  v_count integer;
  v_reason text;
  v_id uuid;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found or v_t.status <> 'published' or v_t.deleted_at is not null
     or not exists (
       select 1 from public.organizations o where o.id = v_t.org_id and o.status = 'approved' and o.deleted_at is null
     ) then
    raise exception 'not_found';
  end if;
  if now() > v_t.registration_deadline then
    raise exception 'registration_closed';
  end if;

  v_reason := public.player_can_play(p_profile_id);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;

  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and profile_id = p_profile_id and status = 'registered') then
    raise exception 'already_registered';
  end if;

  select count(*) into v_count from public.tournament_registrations where tournament_id = p_tournament_id and status = 'registered';
  if v_count >= v_t.max_teams then
    raise exception 'tournament_full';
  end if;

  insert into public.tournament_registrations (tournament_id, profile_id, team_name, teammates)
  values (p_tournament_id, p_profile_id, nullif(btrim(p_team_name), ''), nullif(btrim(p_teammates), ''))
  returning id into v_id;

  return jsonb_build_object('registration_id', v_id, 'spots_left', v_t.max_teams - v_count - 1);
end;
$$;

create or replace function public.cancel_tournament_registration(p_tournament_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_t public.tournaments%rowtype;
begin
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if now() >= v_t.starts_at then
    raise exception 'tournament_started';
  end if;

  update public.tournament_registrations set status = 'cancelled'
   where tournament_id = p_tournament_id and profile_id = p_profile_id and status = 'registered';
  if not found then
    raise exception 'not_registered';
  end if;

  return jsonb_build_object('tournament_id', p_tournament_id);
end;
$$;

-- Staff record the entry fee collected at the club (or undo it).
create or replace function public.mark_tournament_entry_paid(p_registration_id uuid, p_org_id uuid, p_paid boolean default true)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_reg public.tournament_registrations%rowtype;
begin
  select r.* into v_reg
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
   where r.id = p_registration_id and t.org_id = p_org_id
   for update of r;
  if not found or v_reg.status <> 'registered' then
    raise exception 'not_found';
  end if;

  update public.tournament_registrations
     set paid_at = case when p_paid then coalesce(paid_at, now()) end
   where id = p_registration_id;

  return jsonb_build_object('registration_id', p_registration_id, 'paid', p_paid);
end;
$$;

-- Upcoming published tournaments, with places left and whether this player is registered.
create or replace function public.list_tournaments(p_viewer uuid, p_limit integer default 12)
returns table (
  id uuid,
  org_id uuid,
  club_name text,
  city text,
  title text,
  description text,
  sport text,
  starts_at timestamptz,
  registration_deadline timestamptz,
  entry_fee numeric,
  team_size integer,
  max_teams integer,
  registered_count integer,
  registered boolean
)
language sql
stable
set search_path = public, extensions
as $$
  select
    t.id,
    t.org_id,
    o.name,
    o.city,
    t.title,
    t.description,
    t.sport,
    t.starts_at,
    t.registration_deadline,
    t.entry_fee,
    t.team_size::integer,
    t.max_teams::integer,
    (select count(*)::integer from public.tournament_registrations r where r.tournament_id = t.id and r.status = 'registered'),
    exists (select 1 from public.tournament_registrations r where r.tournament_id = t.id and r.profile_id = p_viewer and r.status = 'registered')
  from public.tournaments t
  join public.organizations o on o.id = t.org_id and o.status = 'approved' and o.deleted_at is null
  where t.status = 'published' and t.deleted_at is null and t.starts_at > now()
  order by t.starts_at
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 6. Notifications: new kinds
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('booking_confirmation', 'split_invite', 'cancellation', 'reminder_2h', 'match_joined', 'match_cancelled', 'tournament_registration'));

-- ---------------------------------------------------------------------------
-- 7. EXECUTE: service_role only
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.player_can_play(uuid)',
    'public.set_match_open_spots(uuid, uuid, integer, text, text)',
    'public.join_open_match(uuid, uuid)',
    'public.leave_open_match(uuid, uuid)',
    'public.list_open_matches(uuid, integer)',
    'public.register_for_tournament(uuid, uuid, text, text)',
    'public.cancel_tournament_registration(uuid, uuid)',
    'public.mark_tournament_entry_paid(uuid, uuid, boolean)',
    'public.list_tournaments(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
