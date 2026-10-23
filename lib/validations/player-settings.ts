import { z } from 'zod'

import { newPasswordSchema } from '@/lib/validations/password-reset'
import { guestPhoneSchema } from '@/lib/validations/booking'
import { stripHtml } from '@/lib/sanitize-text'

/**
 * /settings forms. The profile keeps ONE stored name (`profiles.display_name`, what clubs and
 * emails show); the form edits it as first + last name and joins them.
 */

const namePart = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Veuillez saisir votre ${label}`)
    .max(50, `Le ${label} est trop long`)
    .transform(stripHtml)

export const playerProfileSchema = z
  .object({
    firstName: namePart('prénom'),
    lastName: namePart('nom'),
    /** Blank = no number. Otherwise a Tunisian mobile, stored canonical (+216XXXXXXXX). */
    phone: z.union([z.literal('').transform(() => null), guestPhoneSchema]),
  })
  .strict()

export type PlayerProfileInput = z.input<typeof playerProfileSchema>

export const contactPreferencesSchema = z
  .object({
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
  })
  .strict()

export type ContactPreferences = z.infer<typeof contactPreferencesSchema>

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Saisissez votre mot de passe actuel').max(200) })
  .and(newPasswordSchema)

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** "Ali Ben Salah" -> first "Ali", last "Ben Salah": the first word is the first name. */
export function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

/** The stored display name from the two fields. */
export function joinDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

/** "+21698123456" -> "98123456" for the form (the +216 prefix is drawn next to the field). */
export function nationalNumber(phone: string | null | undefined): string {
  return phone ? phone.replace(/^\+216/, '') : ''
}
