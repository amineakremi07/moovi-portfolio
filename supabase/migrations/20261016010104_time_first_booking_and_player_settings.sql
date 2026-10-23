-- Time-first booking (players pick sport + date + time, never a court) and player contact preferences.
-- Additive only: one column on bookings, three on profiles, one service-role function.

-- ---------------------------------------------------------------------------
-- 1. bookings.court_pending
--    A time-first booking still holds a REAL court (the cheapest free one, chosen by the server), so
--    the GiST exclusion on court_slot_locks keeps protecting the club's capacity. That court is
--    provisional: players are shown "Terrain attribué sur place" until club staff confirm or move it.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists court_pending boolean not null default false;

comment on column public.bookings.court_pending is
  'Booked by time, not by court: the court holding the slot is provisional until club staff assign one (reassign_booking_court).';

-- authenticated already has table-level SELECT on bookings (RLS decides the rows), so the column is
-- readable by the player who booked it and by the club; it is written only by the service role.

-- ---------------------------------------------------------------------------
-- 2. reassign_booking_court: staff assign (or confirm) the court of an open booking.
--    Moves the slot lock and the booking together, in one transaction. A busy target court raises
--    23P01 (overlap, GiST) or 23505 (same start, primary key) and nothing changes.
-- ---------------------------------------------------------------------------
create or replace function public.reassign_booking_court(p_org_id uuid, p_booking_id uuid, p_court_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and org_id = p_org_id
  for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.status not in ('pending_payment', 'confirmed') then
    raise exception 'booking_closed';
  end if;
  if v_booking.ends_at <= now() then
    raise exception 'booking_past';
  end if;

  perform 1 from public.courts c
  where c.id = p_court_id
    and c.org_id = p_org_id
    and c.sport = v_booking.sport
    and c.status = 'active'
    and c.deleted_at is null;
  if not found then
    raise exception 'invalid_court';
  end if;

  if v_booking.court_id is distinct from p_court_id then
    update public.court_slot_locks set court_id = p_court_id where booking_id = p_booking_id;
    update public.bookings set court_id = p_court_id, court_pending = false where id = p_booking_id;
  else
    update public.bookings set court_pending = false where id = p_booking_id;
  end if;

  return jsonb_build_object('booking_id', p_booking_id, 'court_id', p_court_id);
end;
$$;

revoke all on function public.reassign_booking_court(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reassign_booking_court(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Player contact preferences (/settings).
--    Email reminders are honoured by the reminder cron. SMS and WhatsApp are stored choices only:
--    no SMS / WhatsApp sender exists yet, and the settings page says so.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists remind_by_email boolean not null default true,
  add column if not exists remind_by_sms boolean not null default false,
  add column if not exists remind_by_whatsapp boolean not null default false;

-- No client UPDATE grant on purpose: the policy "Org admins can update profiles in their org" would
-- then let a club owner change a member's preferences. They are written only by the player's own
-- server action (lib/actions/player-settings.ts, service role scoped to the verified session's id).
-- authenticated keeps table-level SELECT on profiles (RLS: own row; the club sees its members).
