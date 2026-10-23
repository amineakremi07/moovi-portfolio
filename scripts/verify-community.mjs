#!/usr/bin/env node
/**
 * Database checks for open matches ("Parties ouvertes") and tournaments, against the hosted project:
 *   - set_match_open_spots / join_open_match / leave_open_match: ownership, limits, the last place taken
 *     once under concurrency, suspended players refused, cancelled matches closed;
 *   - list_open_matches returns safe fields only and hides the viewer's own and full matches;
 *   - register_for_tournament: capacity under concurrency, duplicates, deadline, cancel, entry-fee marking;
 *   - RLS / grants: players see only their own rows, cannot write the tables, cannot call the RPCs.
 * It creates its own club, court, players and bookings (*@shiftgrid.local) and removes them at the end.
 *
 *   node scripts/verify-community.mjs
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = { ...process.env }
try {
  for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const fresh = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
// Meets the project's policy (lower, upper, digit, symbol).
const PASSWORD = `Cv9!${randomBytes(12).toString('hex')}`
const RUN = Date.now()

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const raised = (res, code) => Boolean(res.error?.message?.includes(code))

const ids = { org: null, otherOrg: null, court: null, bookings: [], users: [], tournaments: [] }
const slot = (days, hour) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour - 1, 0, 0, 0) // Tunis = UTC+1
  return d.toISOString()
}

async function player(name) {
  const email = `community-${name.toLowerCase()}-${RUN}@shiftgrid.local`
  const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (u.error) throw new Error(`fixture user ${name}: ${u.error.message}`)
  ids.users.push(u.data.user.id)
  const p = await admin.from('profiles').insert({ id: u.data.user.id, role: 'player', display_name: `${name} Probe` })
  if (p.error) throw new Error(`fixture profile ${name}: ${p.error.message}`)
  return { id: u.data.user.id, email }
}
async function signIn(email) {
  const sb = fresh()
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return sb
}
const openSpots = async (id) => (await admin.from('bookings').select('open_spots').eq('id', id).single()).data.open_spots

try {
  // ---- fixtures -------------------------------------------------------------------------------
  const org = await admin
    .from('organizations')
    .insert({ name: `Community Probe Club ${RUN}`, status: 'approved', city: 'Tunis', address: 'Probe street', sport_types: ['padel'] })
    .select('id')
    .single()
  if (org.error) throw new Error(`fixture org: ${org.error.message}`)
  ids.org = org.data.id
  const other = await admin
    .from('organizations')
    .insert({ name: `Community Other Club ${RUN}`, status: 'approved', city: 'Sousse', address: 'Other street', sport_types: ['padel'] })
    .select('id')
    .single()
  if (other.error) throw new Error(`fixture other org: ${other.error.message}`)
  ids.otherOrg = other.data.id
  const court = await admin
    .from('courts')
    .insert({ org_id: ids.org, name: 'Probe court', sport: 'padel', status: 'active', price_per_hour: 80, open_time: '08:00', close_time: '23:00' })
    .select('id')
    .single()
  if (court.error) throw new Error(`fixture court: ${court.error.message}`)
  ids.court = court.data.id

  const [organiser, j1, j2, j3, outsider] = await Promise.all(['Organiser', 'Joueur1', 'Joueur2', 'Joueur3', 'Outsider'].map(player))

  const book = async (days, hour, who) => {
    const r = await admin.rpc('create_booking', {
      p_org_id: ids.org, p_court_id: ids.court, p_sport: 'padel', p_starts_at: slot(days, hour),
      p_player_count: 4, p_amount: 100, p_profile_id: who.id,
    })
    if (r.error) throw new Error(`fixture booking: ${r.error.message}`)
    ids.bookings.push(r.data.booking_id)
    return r.data.booking_id
  }
  const match = await book(40, 10, organiser)

  // ---- open matches: organiser side ---------------------------------------------------------------
  const notMine = await admin.rpc('set_match_open_spots', { p_booking_id: match, p_profile_id: j1.id, p_open_spots: 1 })
  check(raised(notMine, 'not_found'), 'only the organiser can open places in a match')
  const tooMany = await admin.rpc('set_match_open_spots', { p_booking_id: match, p_profile_id: organiser.id, p_open_spots: 4 })
  check(raised(tooMany, 'invalid_spots'), 'the organiser keeps a place: 4 of 4 cannot be opened')
  const opened = await admin.rpc('set_match_open_spots', {
    p_booking_id: match, p_profile_id: organiser.id, p_open_spots: 2, p_level_min: 3, p_level_max: 4, p_note: '  Partie détente  ',
  })
  const after = (await admin.from('bookings').select('open_spots, open_level_min, open_level_max, open_note').eq('id', match).single()).data
  check(!opened.error && after.open_spots === 2 && after.open_level_min === 3 && after.open_level_max === 4 && after.open_note === 'Partie détente', 'opening 2 places stores spots, level and trimmed note', opened.error?.message)

  // ---- listing --------------------------------------------------------------------------------
  const listJ1 = await admin.rpc('list_open_matches', { p_viewer: j1.id, p_limit: 100 })
  const seen = listJ1.data?.find((m) => m.booking_id === match)
  check(Boolean(seen) && seen.open_spots === 2 && seen.organizer_first_name === 'Organiser' && Number(seen.price_per_player) === 25, 'another player sees the match: 2 places, organiser first name, 25 TND each')
  const keys = Object.keys(seen ?? {}).sort().join(',')
  check(!/phone|email|check_in|reference|token|profile/.test(keys), 'the listing carries no phone, e-mail, code, reference or profile id', keys)
  const listOwn = await admin.rpc('list_open_matches', { p_viewer: organiser.id, p_limit: 100 })
  check(!listOwn.data?.some((m) => m.booking_id === match), 'the organiser does not see their own match in the list')

  // ---- joining ----------------------------------------------------------------------------------
  const own = await admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: organiser.id })
  check(raised(own, 'own_match'), 'the organiser cannot join their own match')

  const race = await Promise.all([j1, j2, j3].map((p) => admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: p.id })))
  const won = race.filter((r) => !r.error).length
  const full = race.filter((r) => raised(r, 'match_full')).length
  check(won === 2 && full === 1, 'three players race for two places: two get in, one is told it is full', `${won} in, ${full} full`)
  check((await openSpots(match)) === 0, 'no place left after the race')
  const winners = [j1, j2, j3].filter((_, i) => !race[i].error)
  const loser = [j1, j2, j3].find((_, i) => race[i].error)

  const twice = await admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: winners[0].id })
  check(raised(twice, 'already_joined'), 'joining twice is refused')

  const listWinner = await admin.rpc('list_open_matches', { p_viewer: winners[0].id, p_limit: 100 })
  check(listWinner.data?.find((m) => m.booking_id === match)?.joined === true, 'a player who joined still sees the full match, marked joined')
  const listOutsider = await admin.rpc('list_open_matches', { p_viewer: outsider.id, p_limit: 100 })
  check(!listOutsider.data?.some((m) => m.booking_id === match), 'a full match disappears for everyone else')

  const shrink = await admin.rpc('set_match_open_spots', { p_booking_id: match, p_profile_id: organiser.id, p_open_spots: 2 })
  check(raised(shrink, 'invalid_spots'), 'with 2 joined, the organiser cannot offer 2 more places')
  const oneMore = await admin.rpc('set_match_open_spots', { p_booking_id: match, p_profile_id: organiser.id, p_open_spots: 1 })
  check(!oneMore.error && (await openSpots(match)) === 1, 'with 2 joined, 1 more place can be offered')

  const left = await admin.rpc('leave_open_match', { p_booking_id: match, p_profile_id: winners[0].id })
  check(!left.error && (await openSpots(match)) === 2, 'leaving gives the place back', left.error?.message)
  const leftAgain = await admin.rpc('leave_open_match', { p_booking_id: match, p_profile_id: winners[0].id })
  check(raised(leftAgain, 'not_joined'), 'leaving twice is refused')
  const rejoin = await admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: winners[0].id })
  check(!rejoin.error, 'a player who left can join again', rejoin.error?.message)

  await admin.from('profiles').update({ is_suspended: true, suspended_until: slot(10, 12) }).eq('id', outsider.id)
  const suspended = await admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: outsider.id })
  check(raised(suspended, 'suspended'), 'a suspended player cannot join')
  await admin.from('profiles').update({ is_suspended: false, suspended_until: null }).eq('id', outsider.id)

  // ---- RLS and grants --------------------------------------------------------------------------
  const sbWinner = await signIn(winners[0].email)
  const sbOutsider = await signIn(outsider.email)
  const sbOrganiser = await signIn(organiser.email)
  const anon = fresh()

  const mine = await sbWinner.from('match_players').select('profile_id, booking_id')
  check(!mine.error && mine.data.length >= 1 && mine.data.every((r) => r.profile_id === winners[0].id), 'a joiner reads only their own match_players rows', mine.error?.message)
  const organiserView = await sbOrganiser.from('match_players').select('profile_id').eq('booking_id', match).is('left_at', null)
  check(!organiserView.error && organiserView.data.length === 2, 'the organiser reads who joined their match', organiserView.error?.message ?? `${organiserView.data?.length} rows`)
  const outsiderView = await sbOutsider.from('match_players').select('profile_id').eq('booking_id', match)
  check(!outsiderView.error && outsiderView.data.length === 0, 'an outsider reads no one in the match')
  const anonView = await anon.from('match_players').select('profile_id').limit(5)
  check(anonView.error || anonView.data.length === 0, 'anon reads no match_players rows')

  const forged = await sbOutsider.from('match_players').insert({ booking_id: match, profile_id: outsider.id })
  check(Boolean(forged.error), 'a player cannot insert themselves into a match directly', forged.error?.code)
  const spotsBefore = await openSpots(match)
  const bump = await sbOrganiser.from('bookings').update({ open_spots: 3 }).eq('id', match)
  check(Boolean(bump.error) && (await openSpots(match)) === spotsBefore, 'the organiser cannot write open_spots directly', bump.error?.code)
  for (const [fn, args] of [
    ['join_open_match', { p_booking_id: match, p_profile_id: outsider.id }],
    ['set_match_open_spots', { p_booking_id: match, p_profile_id: organiser.id, p_open_spots: 3 }],
    ['list_open_matches', { p_viewer: outsider.id }],
    ['register_for_tournament', { p_tournament_id: match, p_profile_id: outsider.id }],
  ]) {
    const asPlayer = await sbOutsider.rpc(fn, args)
    const asAnon = await anon.rpc(fn, args)
    check(Boolean(asPlayer.error) && Boolean(asAnon.error), `players and anon cannot call ${fn}`, `${asPlayer.error?.code}/${asAnon.error?.code}`)
  }

  // ---- cancelled match --------------------------------------------------------------------------
  await admin.from('bookings').update({ status: 'cancelled', cancellation_reason: 'verify' }).eq('id', match)
  const closed = await admin.rpc('join_open_match', { p_booking_id: match, p_profile_id: loser.id })
  check(raised(closed, 'match_closed'), 'a cancelled match cannot be joined')
  const listAfterCancel = await admin.rpc('list_open_matches', { p_viewer: winners[0].id, p_limit: 100 })
  check(!listAfterCancel.data?.some((m) => m.booking_id === match), 'a cancelled match leaves the list, even for joiners')

  // ---- tournaments ------------------------------------------------------------------------------
  const mk = async (fields) => {
    const r = await admin
      .from('tournaments')
      .insert({ org_id: ids.org, title: `Probe cup ${RUN}`, sport: 'padel', starts_at: slot(30, 9), registration_deadline: slot(29, 20), entry_fee: 40, team_size: 2, max_teams: 2, ...fields })
      .select('id')
      .single()
    if (r.error) throw new Error(`fixture tournament: ${r.error.message}`)
    ids.tournaments.push(r.data.id)
    return r.data.id
  }
  const cup = await mk({})
  const anonCup = await anon.from('tournaments').select('id, title').eq('id', cup)
  check(!anonCup.error && anonCup.data.length === 1, 'a published tournament is public (anon can read it)')
  const forgedCup = await sbOutsider.from('tournaments').insert({ org_id: ids.org, title: 'Forged', sport: 'padel', starts_at: slot(30, 9), registration_deadline: slot(29, 9), team_size: 2, max_teams: 4 })
  check(Boolean(forgedCup.error), 'a player cannot create a tournament', forgedCup.error?.code)

  const r1 = await admin.rpc('register_for_tournament', { p_tournament_id: cup, p_profile_id: j1.id, p_team_name: ' Les As ', p_teammates: 'Ali' })
  check(!r1.error && r1.data.spots_left === 1, 'registration accepted, 1 place left', r1.error?.message)
  const dup = await admin.rpc('register_for_tournament', { p_tournament_id: cup, p_profile_id: j1.id })
  check(raised(dup, 'already_registered'), 'registering twice is refused')
  const cupRace = await Promise.all([j2, j3].map((p) => admin.rpc('register_for_tournament', { p_tournament_id: cup, p_profile_id: p.id })))
  check(cupRace.filter((r) => !r.error).length === 1 && cupRace.filter((r) => raised(r, 'tournament_full')).length === 1, 'two players race for the last place: one gets it, one is told it is full')
  const listed = (await admin.rpc('list_tournaments', { p_viewer: j1.id, p_limit: 50 })).data?.find((t) => t.id === cup)
  check(listed?.registered === true && listed.registered_count === 2 && listed.max_teams === 2, 'list_tournaments: count and "registered" for the viewer')

  const unreg = await admin.rpc('cancel_tournament_registration', { p_tournament_id: cup, p_profile_id: j1.id })
  check(!unreg.error, 'a player can cancel their registration', unreg.error?.message)
  const freed = await admin.rpc('register_for_tournament', { p_tournament_id: cup, p_profile_id: outsider.id })
  check(!freed.error, 'the freed place can be taken', freed.error?.message)

  const regRow = (await admin.from('tournament_registrations').select('id').eq('tournament_id', cup).eq('profile_id', outsider.id).eq('status', 'registered').single()).data
  const wrongOrg = await admin.rpc('mark_tournament_entry_paid', { p_registration_id: regRow.id, p_org_id: ids.otherOrg, p_paid: true })
  check(raised(wrongOrg, 'not_found'), 'another club cannot mark an entry fee paid')
  const paid = await admin.rpc('mark_tournament_entry_paid', { p_registration_id: regRow.id, p_org_id: ids.org, p_paid: true })
  const paidAt = (await admin.from('tournament_registrations').select('paid_at').eq('id', regRow.id).single()).data.paid_at
  check(!paid.error && paidAt !== null, 'the club marks the entry fee paid')

  const myRegs = await sbOutsider.from('tournament_registrations').select('profile_id')
  check(!myRegs.error && myRegs.data.length >= 1 && myRegs.data.every((r) => r.profile_id === outsider.id), 'a player reads only their own registrations')

  const lateCup = await mk({ registration_deadline: slot(-1, 9) })
  const late = await admin.rpc('register_for_tournament', { p_tournament_id: lateCup, p_profile_id: j1.id })
  check(raised(late, 'registration_closed'), 'registration after the deadline is refused')

  await admin.from('tournaments').update({ status: 'cancelled' }).eq('id', cup)
  const anonCancelled = await anon.from('tournaments').select('id').eq('id', cup)
  const listedCancelled = (await admin.rpc('list_tournaments', { p_viewer: j1.id, p_limit: 50 })).data?.some((t) => t.id === cup)
  check(!anonCancelled.error && anonCancelled.data.length === 0 && !listedCancelled, 'a cancelled tournament is hidden from players')
  const toCancelled = await admin.rpc('register_for_tournament', { p_tournament_id: cup, p_profile_id: j1.id })
  check(raised(toCancelled, 'not_found'), 'a cancelled tournament takes no registration')
} catch (e) {
  failures++
  console.error('FAIL  setup / unexpected error:', e instanceof Error ? e.message : e)
} finally {
  if (ids.tournaments.length) await admin.from('tournaments').delete().in('id', ids.tournaments)
  if (ids.bookings.length) await admin.rpc('purge_bookings', { p_ids: ids.bookings }) // bookings are never hard-deleted; this is the maintenance door
  for (const id of ids.users) {
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  if (ids.court) await admin.from('courts').delete().eq('id', ids.court)
  for (const id of [ids.org, ids.otherOrg].filter(Boolean)) await admin.from('organizations').delete().eq('id', id)
  console.log('\nfixtures removed')
}
console.log(failures ? `${failures} check(s) FAILED` : 'All checks passed')
process.exit(failures ? 1 : 0)
