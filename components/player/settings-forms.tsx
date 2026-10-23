'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  changePasswordAction,
  updateContactPreferencesAction,
  updatePlayerProfileAction,
} from '@/lib/actions/player-settings'
import {
  changePasswordSchema,
  playerProfileSchema,
  type ContactPreferences,
} from '@/lib/validations/player-settings'
import { cn } from '@/lib/utils'

/** A label + control with its error underneath, linked by id for screen readers. */
function Field({ id, label, error, children }: { id: string; label: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/* ------------------------------- profile -------------------------------- */

type ProfileIn = z.input<typeof playerProfileSchema>
type ProfileOut = z.output<typeof playerProfileSchema>

export function ProfileForm({ defaults }: { defaults: { firstName: string; lastName: string; phone: string } }) {
  const router = useRouter()
  const form = useForm<ProfileIn, unknown, ProfileOut>({
    resolver: zodResolver(playerProfileSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updatePlayerProfileAction({ ...values, phone: values.phone ?? '' })
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Profil enregistré.')
    form.reset({ ...form.getValues() })
    router.refresh()
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={isSubmitting}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="settings-first-name" label="Prénom" error={errors.firstName?.message}>
          <Input
            id="settings-first-name"
            autoComplete="given-name"
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? 'settings-first-name-error' : undefined}
            {...form.register('firstName')}
          />
        </Field>
        <Field id="settings-last-name" label="Nom" error={errors.lastName?.message}>
          <Input
            id="settings-last-name"
            autoComplete="family-name"
            aria-invalid={!!errors.lastName}
            aria-describedby={errors.lastName ? 'settings-last-name-error' : undefined}
            {...form.register('lastName')}
          />
        </Field>
      </div>
      <Field id="settings-phone" label="Numéro de mobile" error={errors.phone?.message}>
        <div className="flex">
          <span
            className={cn(
              'flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground',
              errors.phone && 'border-destructive'
            )}
          >
            +216
          </span>
          <Input
            id="settings-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98 123 456"
            className="rounded-l-none"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'settings-phone-error' : 'settings-phone-hint'}
            {...form.register('phone')}
          />
        </div>
        {!errors.phone && (
          <p id="settings-phone-hint" className="text-xs text-muted-foreground">
            Le club l&apos;utilise pour vous joindre au sujet d&apos;une réservation.
          </p>
        )}
      </Field>
      <Button type="submit" className="h-11" disabled={isSubmitting || !isDirty}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Enregistrer le profil
      </Button>
    </form>
  )
}

/* -------------------------- contact preferences -------------------------- */

const CHANNELS: { key: keyof ContactPreferences; label: string; hint: string; soon?: boolean }[] = [
  { key: 'email', label: 'Rappel par e-mail', hint: 'Deux heures avant chaque match. Les confirmations et annulations sont toujours envoyées.' },
  { key: 'sms', label: 'Rappel par SMS', hint: 'Bientôt disponible : votre choix est enregistré et sera appliqué dès l’ouverture du service.', soon: true },
  { key: 'whatsapp', label: 'Rappel par WhatsApp', hint: 'Bientôt disponible : votre choix est enregistré et sera appliqué dès l’ouverture du service.', soon: true },
]

export function ContactPreferencesForm({ defaults, hasPhone }: { defaults: ContactPreferences; hasPhone: boolean }) {
  const router = useRouter()
  const [prefs, setPrefs] = React.useState(defaults)
  const [saving, setSaving] = React.useState<keyof ContactPreferences | null>(null)

  // Each switch saves at once and rolls back if the server refuses.
  const toggle = async (key: keyof ContactPreferences, value: boolean) => {
    const previous = prefs
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSaving(key)
    const result = await updateContactPreferencesAction(next)
    setSaving(null)
    if (!result.success) {
      setPrefs(previous)
      toast.error(result.error)
      return
    }
    toast.success('Préférences enregistrées.')
    router.refresh()
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Rappels de match</legend>
      {CHANNELS.map(({ key, label, hint, soon }) => {
        const id = `pref-${key}`
        const needsPhone = key !== 'email' && !hasPhone
        return (
          <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-medium">
                {label}
                {soon && <span className="rounded-sm bg-muted px-1.5 text-xs font-normal text-muted-foreground">Bientôt</span>}
              </label>
              <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted-foreground">
                {needsPhone ? 'Ajoutez votre numéro de mobile ci-dessus pour activer ce canal.' : hint}
              </p>
            </div>
            <span className="flex items-center gap-2">
              {saving === key && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
              <input
                id={id}
                type="checkbox"
                role="switch"
                aria-describedby={`${id}-hint`}
                className="size-5 accent-[#0e634f]"
                checked={prefs[key]}
                disabled={saving !== null || (needsPhone && !prefs[key])}
                onChange={(e) => toggle(key, e.target.checked)}
              />
            </span>
          </div>
        )
      })}
    </fieldset>
  )
}

/* ------------------------------- password -------------------------------- */

type PasswordIn = z.input<typeof changePasswordSchema>

export function ChangePasswordForm() {
  const form = useForm<PasswordIn>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await changePasswordAction(values)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Mot de passe modifié.')
    form.reset()
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4" aria-busy={isSubmitting}>
      <Field id="current-password" label="Mot de passe actuel" error={errors.currentPassword?.message}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
          {...form.register('currentPassword')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-password" label="Nouveau mot de passe" error={errors.password?.message}>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'new-password-error' : undefined}
            {...form.register('password')}
          />
        </Field>
        <Field id="confirm-password" label="Confirmer" error={errors.confirmPassword?.message}>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
            {...form.register('confirmPassword')}
          />
        </Field>
      </div>
      <Button type="submit" variant="outline" className="h-11" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Changer le mot de passe
      </Button>
    </form>
  )
}
