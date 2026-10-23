import { z } from 'zod'

import { timeToMinutes, venueInstant } from '@/lib/court-time'
import { stripHtml } from '@/lib/sanitize-text'
import { calendarDaySchema } from '@/lib/validations/booking'
import { hhmm, tnd } from '@/lib/validations/court'
import type { SkillLevel } from '@/lib/types/database'

/**
 * Open matches and tournaments: what players and club owners may send. Ids of the player, the club and
 * the organiser never come from here; they come from the verified session.
 */

/** Niveau de jeu 1-5. */
export const skillLevel = z
  .number()
  .int('Niveau invalide')
  .min(1, 'Niveau invalide')
  .max(5, 'Niveau invalide')
  .transform((v) => v as SkillLevel)

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => stripHtml(v).trim())
    .optional()
    .transform((v) => (v ? v : null))

/** The organiser opens (or closes, with 0) places in their own match. */
export const openMatchSchema = z
  .object({
    bookingId: z.string().uuid('Réservation invalide'),
    openSpots: z.number().int('Nombre de places invalide').min(0, 'Nombre de places invalide').max(13, 'Nombre de places invalide'),
    /** The wanted range, Niveau 1-5; null = every level. */
    level: z
      .object({ min: skillLevel, max: skillLevel })
      .strict()
      .refine((l) => l.min <= l.max, 'Le niveau minimum doit être inférieur ou égal au maximum.')
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    note: optionalText(200, 'Le message est trop long (200 caractères maximum).'),
  })
  .strict()

export type OpenMatchInput = z.input<typeof openMatchSchema>

/** Join or leave someone else's open match. */
export const matchIdSchema = z.object({ bookingId: z.string().uuid('Partie invalide') }).strict()

/** A player's registration to a tournament. */
export const tournamentRegistrationSchema = z
  .object({
    tournamentId: z.string().uuid('Tournoi invalide'),
    teamName: optionalText(60, 'Le nom d\'équipe est trop long (60 caractères maximum).'),
    teammates: optionalText(300, 'La liste des coéquipiers est trop longue (300 caractères maximum).'),
  })
  .strict()

export type TournamentRegistrationInput = z.input<typeof tournamentRegistrationSchema>

export const tournamentIdSchema = z.object({ tournamentId: z.string().uuid('Tournoi invalide') }).strict()

/** A whole number typed in a form field. */
const wholeNumber = (message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, message)
    .transform(Number)

/** Club owner: create or edit a tournament. Dates and times are venue time (Africa/Tunis). */
export const tournamentFormSchema = z
  .object({
    title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères').max(120, 'Le titre est trop long').transform(stripHtml),
    description: optionalText(1000, 'La description est trop longue (1000 caractères maximum).'),
    prize: optionalText(120, 'La dotation est trop longue (120 caractères maximum).'),
    sport: z.enum(['padel', 'tennis', 'football'], { errorMap: () => ({ message: 'Choisissez un sport' }) }),
    date: calendarDaySchema,
    time: hhmm,
    deadlineDate: calendarDaySchema,
    deadlineTime: hhmm,
    entryFee: tnd('Les frais d\'inscription'),
    teamSize: wholeNumber('Taille d\'équipe invalide').pipe(z.number().min(1, 'Taille d\'équipe invalide').max(7, 'Taille d\'équipe invalide')),
    maxTeams: wholeNumber('Nombre de places invalide').pipe(z.number().min(2, 'Au moins 2 places').max(128, 'Au plus 128 places')),
  })
  .strict()
  .transform((v) => ({
    ...v,
    startsAt: venueInstant(v.date, timeToMinutes(v.time)).toISOString(),
    registrationDeadline: venueInstant(v.deadlineDate, timeToMinutes(v.deadlineTime)).toISOString(),
  }))
  .refine((v) => Date.parse(v.registrationDeadline) <= Date.parse(v.startsAt), {
    path: ['deadlineDate'],
    message: 'La clôture des inscriptions doit précéder le début du tournoi.',
  })

/** Raw form state: every field is text (numbers are typed). */
export type TournamentFormInput = z.input<typeof tournamentFormSchema>
export type TournamentFormValues = z.output<typeof tournamentFormSchema>

/** Parts of the day a player can ask the matchmaker for, in venue minutes [from, to). */
export const MATCH_PERIODS = {
  matin: { label: 'Matin', from: 8 * 60, to: 12 * 60 },
  apres_midi: { label: 'Après-midi', from: 12 * 60, to: 17 * 60 },
  soir: { label: 'Soir', from: 17 * 60, to: 23 * 60 },
  journee: { label: 'Toute la journée', from: 8 * 60, to: 23 * 60 },
} as const

export type MatchPeriod = keyof typeof MATCH_PERIODS

/**
 * "Trouve-moi une partie". The day is venue time (Africa/Tunis); the window is the start times the player
 * accepts. The player's own level is optional and saved on their profile. The requester id comes from the session.
 */
export const matchRequestSchema = z
  .object({
    sport: z.enum(['padel', 'tennis', 'football'], { errorMap: () => ({ message: 'Choisissez un sport' }) }),
    date: calendarDaySchema,
    period: z.enum(['matin', 'apres_midi', 'soir', 'journee'], { errorMap: () => ({ message: 'Choisissez un moment' }) }),
    requiredPlayers: z.number().int().min(1, 'Entre 1 et 3 places').max(3, 'Entre 1 et 3 places'),
    levelMin: skillLevel,
    levelMax: skillLevel,
    playerLevel: skillLevel.nullable().optional().transform((v) => v ?? null),
  })
  .strict()
  .refine((v) => v.levelMin <= v.levelMax, { path: ['levelMax'], message: 'Le niveau maximum doit être au moins le minimum.' })
  .transform((v) => ({
    ...v,
    windowStart: venueInstant(v.date, MATCH_PERIODS[v.period].from).toISOString(),
    windowEnd: venueInstant(v.date, MATCH_PERIODS[v.period].to).toISOString(),
  }))

export type MatchRequestInput = z.input<typeof matchRequestSchema>

export const matchRequestIdSchema = z.object({ requestId: z.string().uuid('Recherche invalide') }).strict()

export const attendanceSchema = z.object({ bookingId: z.string().uuid('Réservation invalide') }).strict()

const levelChoice = z.enum(['1', '2', '3', '4', '5'], { errorMap: () => ({ message: 'Choisissez un niveau' }) }).transform(Number)

/** The matchmaking widget's form (every Select value is text); its output is what createMatchRequest takes. */
export const matchRequestFormSchema = z
  .object({
    sport: z.enum(['padel', 'tennis', 'football'], { errorMap: () => ({ message: 'Choisissez un sport' }) }),
    date: calendarDaySchema,
    period: z.enum(['matin', 'apres_midi', 'soir', 'journee'], { errorMap: () => ({ message: 'Choisissez un moment' }) }),
    requiredPlayers: z.enum(['1', '2', '3']).transform(Number),
    levelMin: levelChoice,
    levelMax: levelChoice,
    playerLevel: levelChoice,
  })
  .strict()
  .refine((v) => v.levelMin <= v.levelMax, { path: ['levelMax'], message: 'Le niveau maximum doit être au moins le minimum.' })
  .transform((v): MatchRequestInput => v)

export type MatchRequestFormInput = z.input<typeof matchRequestFormSchema>
export type MatchRequestFormOutput = z.output<typeof matchRequestFormSchema>
