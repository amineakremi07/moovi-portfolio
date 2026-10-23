import { expect, test } from '@playwright/test'

import { ACCOUNT_EXISTS_MESSAGE, isSmtpDispatchError, logAuthError, signUpErrorMessage } from '../lib/auth-errors'
import { strongPasswordSchema } from '../lib/validations/password-reset'
import { playerRegisterSchema } from '../lib/validations/player-auth'

// Pure: no browser, no database.

test('strongPasswordSchema mirrors the Supabase policy (lower, upper, digit, symbol, 8-72)', () => {
  expect(strongPasswordSchema.safeParse('Moovi2026!').success).toBe(true)
  for (const weak of ['moovi2026!', 'MOOVI2026!', 'MooviMoovi!', 'Moovi20266', 'Mo2!', 'A1!' + 'a'.repeat(70)]) {
    expect(strongPasswordSchema.safeParse(weak).success, weak).toBe(false)
  }
})

test('the /register schema rejects a password Supabase would refuse', () => {
  const base = { fullName: 'Test Joueur', email: 'a@b.tn', phone: '98 123 456', acceptTerms: true }
  expect(playerRegisterSchema.safeParse({ ...base, password: 'motdepasse1' }).success).toBe(false)
  const ok = playerRegisterSchema.safeParse({ ...base, password: 'Motdepasse1!' })
  expect(ok.success && ok.data.phone).toBe('+21698123456')
})

test('Supabase sign-up errors map to specific French messages', () => {
  expect(signUpErrorMessage({ code: 'weak_password', message: 'Password should contain at least one character of each' })).toMatch(/trop faible/)
  expect(signUpErrorMessage({ code: 'weak_password', message: 'Password is known to be weak and easy to guess (pwned)' })).toMatch(/fuite/)
  expect(signUpErrorMessage({ code: 'user_already_exists', message: 'User already registered' })).toBe(ACCOUNT_EXISTS_MESSAGE)
  expect(signUpErrorMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toMatch(/Trop de tentatives/)
  expect(signUpErrorMessage({ code: 'unexpected_failure', status: 500, message: 'Error sending confirmation email' })).toMatch(/e-mail de confirmation/)
  expect(signUpErrorMessage({ code: 'unexpected_failure', message: 'Database error saving new user' })).toMatch(/erreur technique/)
  expect(signUpErrorMessage(null)).toBe('Impossible de créer votre compte. Veuillez réessayer.')
})

test('a Supabase SMTP dispatch failure is detected and logged with the [SMTP_ERROR] tag', () => {
  const smtp = { code: 'unexpected_failure', status: 500, message: 'Error sending confirmation email' }
  expect(isSmtpDispatchError(smtp)).toBe(true)
  expect(isSmtpDispatchError({ status: 500, message: '535 "5.7.8 Authentication failed"' })).toBe(true)
  expect(isSmtpDispatchError({ code: 'weak_password', status: 422, message: 'Password should contain...' })).toBe(false)

  const original = console.error
  const lines: unknown[][] = []
  console.error = (...args: unknown[]) => void lines.push(args)
  try {
    logAuthError('registerPlayer', smtp)
  } finally {
    console.error = original
  }
  expect(lines[0]?.[0]).toBe('[SMTP_ERROR] Failed to send confirmation email via Supabase Auth')
})
