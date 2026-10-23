/**
 * French messages for Supabase Auth failures when creating an account (signUp, admin.createUser).
 * Pure (no server imports) so it is unit-tested.
 *
 * Supabase's own messages are English and sometimes reveal configuration, so we never show them as-is:
 * map the documented error codes, and log the raw error on the server (logAuthError) so a generic
 * message never hides the real cause again.
 */

type AuthErrorLike = { code?: string | null; status?: number | null; message?: string | null; name?: string | null }

export const ACCOUNT_EXISTS_MESSAGE = 'Un compte existe déjà avec cet e-mail. Essayez de vous connecter.'

export function isAccountExistsError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === 'user_already_exists' ||
    error.code === 'email_exists' ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  )
}

export function signUpErrorMessage(error: AuthErrorLike | null | undefined): string {
  const message = error?.message ?? ''
  if (isAccountExistsError(error)) return ACCOUNT_EXISTS_MESSAGE

  switch (error?.code) {
    case 'weak_password':
      return /pwned|leaked|breach/i.test(message)
        ? 'Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.'
        : 'Mot de passe trop faible : utilisez au moins 8 caractères avec une minuscule, une majuscule, un chiffre et un symbole.'
    case 'email_address_invalid':
      return 'Cette adresse e-mail n\'est pas acceptée. Vérifiez-la ou utilisez-en une autre.'
    case 'email_address_not_authorized':
      return 'Les e-mails ne peuvent pas être envoyés à cette adresse pour le moment. Utilisez une autre adresse.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Les inscriptions sont momentanément fermées. Réessayez plus tard.'
  }

  // The confirmation email could not be sent (SMTP / Brevo failure): Supabase rolls the user back.
  if (isSmtpDispatchError(error)) {
    return 'Votre compte n\'a pas pu être créé car l\'e-mail de confirmation n\'a pas pu être envoyé. Réessayez dans quelques minutes.'
  }
  if (/database error saving new user/i.test(message)) {
    return 'Une erreur technique empêche la création du compte. Réessayez dans quelques minutes ou contactez le support.'
  }
  return 'Impossible de créer votre compte. Veuillez réessayer.'
}

/**
 * Supabase Auth could not hand the confirmation / magic-link email to the custom SMTP server
 * (`500 unexpected_failure`, "Error sending confirmation email"). The SMTP reply itself (e.g. Brevo's
 * `535 5.7.8 Authentication failed`) is only in the Supabase Auth logs, never in the API response.
 */
export function isSmtpDispatchError(error: AuthErrorLike | null | undefined): boolean {
  const message = error?.message ?? ''
  return /error sending .*e-?mail|smtp|\b5\.7\.\d\b/i.test(message) || (error?.status === 500 && /e-?mail/i.test(message))
}

/** One structured server log line for an Auth failure: code, HTTP status and Supabase's own message. */
export function logAuthError(context: string, error: AuthErrorLike | null | undefined): void {
  if (isSmtpDispatchError(error)) {
    console.error('[SMTP_ERROR] Failed to send confirmation email via Supabase Auth', {
      context,
      code: error?.code ?? null,
      status: error?.status ?? null,
      message: error?.message ?? null,
      hint: 'Supabase dashboard > Authentication > Emails > SMTP Settings (Brevo login, SMTP key, port 587, verified sender). The SMTP reply code is in the Auth logs.',
    })
    return
  }
  console.error(`${context}:`, {
    code: error?.code ?? null,
    status: error?.status ?? null,
    name: error?.name ?? null,
    message: error?.message ?? 'no error returned (missing user)',
  })
}
