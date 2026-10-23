import { expect, test } from '@playwright/test'

import {
  changePasswordSchema,
  contactPreferencesSchema,
  joinDisplayName,
  nationalNumber,
  playerProfileSchema,
  splitDisplayName,
} from '../lib/validations/player-settings'

/** Pure checks for /settings (no browser, no database). */

test.describe('player settings', () => {
  test('the stored name is edited as first + last name and joined back unchanged', () => {
    expect(splitDisplayName('Ali Ben Salah')).toEqual({ firstName: 'Ali', lastName: 'Ben Salah' })
    expect(splitDisplayName('Amine')).toEqual({ firstName: 'Amine', lastName: '' })
    expect(joinDisplayName('Ali', 'Ben Salah')).toBe('Ali Ben Salah')
    const { firstName, lastName } = splitDisplayName('  Ali   Ben Salah ')
    expect(joinDisplayName(firstName, lastName)).toBe('Ali Ben Salah')
  })

  test('profile: names required, phone optional and stored canonical', () => {
    const ok = playerProfileSchema.safeParse({ firstName: 'Ali', lastName: 'Ben Salah', phone: '98 123 456' })
    expect(ok.success && ok.data.phone).toBe('+21698123456')
    const blank = playerProfileSchema.safeParse({ firstName: 'Ali', lastName: 'Ben Salah', phone: '' })
    expect(blank.success && blank.data.phone).toBeNull()
    expect(playerProfileSchema.safeParse({ firstName: '', lastName: 'X', phone: '' }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ firstName: 'A', lastName: 'B', phone: '71 123 456' }).success).toBe(false) // landline
    expect(playerProfileSchema.safeParse({ firstName: 'A', lastName: 'B', phone: '', role: 'org_admin' }).success).toBe(false) // strict
  })

  test('preferences are three booleans, nothing else', () => {
    expect(contactPreferencesSchema.safeParse({ email: true, sms: false, whatsapp: true }).success).toBe(true)
    expect(contactPreferencesSchema.safeParse({ email: true, sms: false, whatsapp: true, user_id: 'x' }).success).toBe(false)
    expect(contactPreferencesSchema.safeParse({ email: 'yes', sms: false, whatsapp: false }).success).toBe(false)
  })

  test('password change: current password, 8+ characters, matching confirmation', () => {
    const base = { currentPassword: 'old-password', password: 'New-password-1', confirmPassword: 'New-password-1' }
    expect(changePasswordSchema.safeParse(base).success).toBe(true)
    expect(changePasswordSchema.safeParse({ ...base, currentPassword: '' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ ...base, password: 'short', confirmPassword: 'short' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ ...base, confirmPassword: 'different-1' }).success).toBe(false)
  })

  test('the form shows the national number', () => {
    expect(nationalNumber('+21698123456')).toBe('98123456')
    expect(nationalNumber(null)).toBe('')
  })
})
