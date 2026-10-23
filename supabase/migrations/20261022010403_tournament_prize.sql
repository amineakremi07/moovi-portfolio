-- Tournaments: an optional prize line ("Dotation : 500 TND + raquettes"), shown on the players' card.
-- list_tournaments gains the column (its return type changes, so it is dropped and recreated).

alter table public.tournaments
  add column if not exists prize text;

alter table public.tournaments drop constraint if exists tournaments_prize_len;
alter table public.tournaments
  add constraint tournaments_prize_len check (prize is null or char_length(prize) between 1 and 120);

drop function if exists public.list_tournaments(uuid, integer);

create function public.list_tournaments(p_viewer uuid, p_limit integer default 12)
returns table (
  id uuid,
  org_id uuid,
  club_name text,
  city text,
  title text,
  description text,
  prize text,
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
    t.prize,
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

revoke all on function public.list_tournaments(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_tournaments(uuid, integer) to service_role;
