import { z } from 'zod'

/** The email box on /forgot-password. */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Veuillez saisir une adresse e-mail valide'),
})

/** Shown under every "choose a password" field: the same rules as strongPasswordSchema. */
export const PASSWORD_RULES_HINT = '8 caractères minimum, avec une minuscule, une majuscule, un chiffre et un symbole.'

/**
 * Any password we hand to Supabase Auth (sign-up, invitation, reset). It mirrors the hosted project's
 * Auth policy (Authentication > Providers > Email: "lowercase, uppercase, digits and symbols"): a weaker
 * password passes here but Supabase refuses it with `weak_password`. Change both together.
 * 72 is bcrypt's byte limit: longer passwords would be silently truncated.
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(72, 'Le mot de passe ne doit pas dépasser 72 caractères')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un symbole (!, ?, #, ...)')

/**
 * The new password on /reset-password. Same limits as sign-up (8 characters minimum;
 * 72 is bcrypt's byte limit, longer passwords would be silently truncated) plus a
 * matching confirmation. Supabase additionally refuses weak or leaked passwords when
 * that protection is switched on, and a password equal to the current one.
 */
export const newPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Les deux mots de passe ne correspondent pas' })

export type NewPasswordInput = z.infer<typeof newPasswordSchema>
