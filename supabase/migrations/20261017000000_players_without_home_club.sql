-- Players are no longer tied to one club.
--
-- Before: a player profile had profiles.org_id = "their" club; they booked as a member only there
-- (create_booking raised not_a_member elsewhere) and every player RLS rule was scoped by
-- org_id = user_org_id(). Club staff could read every profile tied to their club.
--
-- After:
--   * profiles.org_id is for club accounts (org_admin, staff, platform_admin) only; players have NULL.
--   * profiles.last_visited_club_id = the club of the player's most recent booking (trigger), used
--     for "Dernier club visité". Backfilled from booking history, else from the old org_id.
--   * Any player books as a member at any approved club (no details to type again).
--   * Players see THEIR OWN bookings, and the courts / clubs of those bookings, at every club.
--   * Club staff see only the players who booked WITH THEIR CLUB (was: everyone tied to the club).
--   * A BEFORE trigger moves any club written to a player's org_id into last_visited_club_id, so an
--     older deployment that still writes org_id for players keeps working.

-- ---------------------------------------------------------------------------
-- 1. Columns and constraints
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_visited_club_id uuid references public.organizations(id) on delete set null;

comment on column public.profiles.last_visited_club_id is
  'Players: the club of their most recent booking (set by trg_bookings_last_visited_club). Not a membership.';

alter table public.profiles alter column org_id drop not null;

-- Club accounts still belong to exactly one active club.
alter table public.profiles drop constraint if exists profiles_org_required_for_club_roles;
alter table public.profiles
  add constraint profiles_org_required_for_club_roles check (role = 'player' or org_id is not null);

create index if not exists idx_profiles_last_visited_club on public.profiles (last_visited_club_id);
create index if not exists idx_bookings_booker_profile_starts on public.bookings (booker_profile_id, starts_at desc)
  where booker_profile_id is not null;

-- ---------------------------------------------------------------------------
-- 2. A player's org_id is always NULL (older code may still write one: keep it as "last visited")
-- ---------------------------------------------------------------------------
create or replace function public.normalize_player_club()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.role = 'player' and new.org_id is not null then
    new.last_visited_club_id := coalesce(new.last_visited_club_id, new.org_id);
    new.org_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_05_normalize_player_club on public.profiles;
create trigger trg_05_normalize_player_club
  before insert or update of org_id, role on public.profiles
  for each row execute function public.normalize_player_club();

revoke all on function public.normalize_player_club() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill: last visited = latest booking's club, else the old home club; then detach players
-- ---------------------------------------------------------------------------
update public.profiles p
set last_visited_club_id = coalesce(
  (select b.org_id from public.bookings b where b.booker_profile_id = p.id order by b.starts_at desc limit 1),
  p.org_id
)
where p.role = 'player';

update public.profiles set org_id = null where role = 'player' and org_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Track the last visited club on every member booking
-- ---------------------------------------------------------------------------
create or replace function public.track_last_visited_club()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.booker_profile_id is not null then
    update public.profiles set last_visited_club_id = new.org_id
    where id = new.booker_profile_id and role = 'player'
      and last_visited_club_id is distinct from new.org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_last_visited_club on public.bookings;
create trigger trg_bookings_last_visited_club
  after insert on public.bookings
  for each row execute function public.track_last_visited_club();

revoke all on function public.track_last_visited_club() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_booking: a member is any player (not suspended), at any club
--    Same signature and body as 20261007000000 except the membership check.
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_org_id uuid, p_court_id uuid, p_sport text, p_starts_at timestamp with time zone, p_player_count integer, p_amount numeric,
  p_profile_id uuid default null::uuid, p_guest_name text default null::text, p_guest_phone text default null::text,
  p_status text default 'pending_payment'::text, p_source text default 'online'::text, p_notes text default null::text,
  p_paid boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_profile public.profiles;
  v_anon_id uuid;
  v_booking public.bookings;
  v_token text;
  v_pass_token text;
  v_open integer;
  v_phone text := nullif(btrim(coalesce(p_guest_phone, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF p_status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  IF p_source NOT IN ('online', 'manual', 'phone') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  IF p_paid AND (p_source = 'online' OR p_status <> 'confirmed') THEN
    RAISE EXCEPTION 'invalid_paid';
  END IF;
  IF p_starts_at <= now() THEN
    RAISE EXCEPTION 'slot_in_past';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
    -- Any player account, at any club: there is no home club any more. Club accounts book through
    -- the staff tools (as a desk customer), never as a member.
    IF NOT FOUND OR v_profile.role <> 'player' OR v_profile.anonymized_at IS NOT NULL THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
    IF v_profile.is_suspended THEN
      IF v_profile.suspended_until IS NULL OR v_profile.suspended_until > now() THEN
        RAISE EXCEPTION 'account_suspended';
      END IF;
      UPDATE public.profiles SET is_suspended = false, suspended_until = NULL WHERE id = p_profile_id;
    END IF;
    v_pass_token := encode(gen_random_bytes(24), 'hex');
  ELSE
    IF btrim(coalesce(p_guest_name, '')) = '' OR (v_phone IS NULL AND p_source = 'online') THEN
      RAISE EXCEPTION 'guest_details_required';
    END IF;

    IF p_source = 'online' AND v_phone IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || v_phone, 0));
      SELECT count(*) INTO v_open
        FROM public.bookings b
        JOIN public.anonymous_bookers a ON a.id = b.booker_anon_id
       WHERE b.org_id = p_org_id
         AND a.phone = v_phone
         AND b.source = 'online'
         AND b.status = 'pending_payment'
         AND b.ends_at > now();
      IF v_open >= 2 THEN
        RAISE EXCEPTION 'too_many_pending';
      END IF;
    END IF;

    IF v_phone IS NOT NULL THEN
      INSERT INTO public.anonymous_bookers (org_id, name, phone)
      VALUES (p_org_id, btrim(p_guest_name), v_phone)
      ON CONFLICT (org_id, phone) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_anon_id;
    ELSE
      INSERT INTO public.anonymous_bookers (org_id, name, phone)
      VALUES (p_org_id, btrim(p_guest_name), NULL)
      RETURNING id INTO v_anon_id;
    END IF;

    v_token := encode(gen_random_bytes(24), 'hex');
  END IF;

  INSERT INTO public.bookings (
    org_id, court_id, sport, booker_profile_id, booker_anon_id,
    starts_at, player_count, payment_method, status, guest_cancel_token_hash, pass_token_hash, source
  )
  VALUES (
    p_org_id, p_court_id, p_sport, p_profile_id, v_anon_id,
    p_starts_at, p_player_count, 'cash', p_status,
    CASE WHEN v_token IS NULL THEN NULL ELSE encode(digest(v_token, 'sha256'), 'hex') END,
    CASE WHEN v_pass_token IS NULL THEN NULL ELSE encode(digest(v_pass_token, 'sha256'), 'hex') END,
    p_source
  )
  RETURNING * INTO v_booking;

  IF v_notes IS NOT NULL THEN
    INSERT INTO public.booking_notes (booking_id, org_id, note) VALUES (v_booking.id, p_org_id, v_notes);
  END IF;

  INSERT INTO public.payment_records (booking_id, amount, currency, provider, status, paid_at)
  VALUES (v_booking.id, round(p_amount, 2), 'TND', 'cash',
          CASE WHEN p_paid THEN 'paid' ELSE 'pending' END,
          CASE WHEN p_paid THEN now() ELSE NULL END);

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'reference', upper(substr(replace(v_booking.id::text, '-', ''), 1, 8)),
    'court_id', v_booking.court_id,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'amount', round(p_amount, 2),
    'cancel_token', v_token,
    'pass_token', coalesce(v_pass_token, v_token),
    'check_in_code', v_booking.check_in_code
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. RLS: player rules no longer go through user_org_id()
-- ---------------------------------------------------------------------------

-- Bookings: a player sees and cancels their OWN bookings at any club. (Staff keep the org-scoped
-- policies: "Members can view their own bookings" stays for its staff branch.)
drop policy if exists "Players can view their own bookings" on public.bookings;
create policy "Players can view their own bookings" on public.bookings
  for select to authenticated
  using (booker_profile_id = (select auth.uid()));

drop policy if exists "Members can cancel their own bookings before deadline" on public.bookings;
drop policy if exists "Players can cancel their own bookings before deadline" on public.bookings;
create policy "Players can cancel their own bookings before deadline" on public.bookings
  for update to authenticated
  using (booker_profile_id = (select auth.uid()) and now() < cancellation_deadline)
  with check (booker_profile_id = (select auth.uid()) and status = 'cancelled');

-- Courts and clubs of a player's own bookings stay readable (names in the history even after a
-- court or club is archived). Column grants on organizations still hide its private columns.
drop policy if exists "Players can view courts of their bookings" on public.courts;
create policy "Players can view courts of their bookings" on public.courts
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.court_id = courts.id and b.booker_profile_id = (select auth.uid())));

drop policy if exists "Players can view clubs of their bookings" on public.organizations;
create policy "Players can view clubs of their bookings" on public.organizations
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.org_id = organizations.id and b.booker_profile_id = (select auth.uid())));

-- Profiles: club staff see the players who booked WITH THEIR CLUB, nobody else.
create or replace function public.booked_with_my_club(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.user_role() in ('org_admin', 'staff')
     and exists (
       select 1 from public.bookings b
       where b.booker_profile_id = p_profile_id and b.org_id = public.user_org_id()
     );
$$;
revoke all on function public.booked_with_my_club(uuid) from public, anon;
grant execute on function public.booked_with_my_club(uuid) to authenticated;

drop policy if exists "Club staff can view players who booked with them" on public.profiles;
create policy "Club staff can view players who booked with them" on public.profiles
  for select to authenticated
  using (role = 'player' and public.booked_with_my_club(id));
