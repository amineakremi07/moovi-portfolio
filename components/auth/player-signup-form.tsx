'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import { GoogleButton } from '@/components/auth/google-button'
import { BOOKING_PATH } from '@/lib/auth-landing'
import { Button } from '@/components/ui/button'
import { ConsentCheckbox } from '@/components/legal/consent-checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerPlayer } from '@/lib/actions/player-auth'
import { playerRegisterSchema } from '@/lib/validations/player-auth'
import { PASSWORD_RULES_HINT } from '@/lib/validations/password-reset'

export interface RegisterClub {
  id: string
  name: string
  city: string | null
}

type FormInput = z.input<typeof playerRegisterSchema>
type FormOutput = z.output<typeof playerRegisterSchema>

/**
 * Player registration form. On success the player is signed in and sent to
 * `next` (the page they came from) or the home page.
 */
export function PlayerSignupForm({
  clubs,
  initialClubId,
  next,
}: {
  clubs: RegisterClub[]
  /** Preselected club, e.g. when arriving from that club's page. */
  initialClubId: string | null
  /** Already validated with `safeRedirectPath`. */
  next: string | null
}) {
  const router = useRouter()
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(playerRegisterSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      acceptTerms: false,
      orgId: clubs.some((c) => c.id === initialClubId) ? (initialClubId ?? '') : '',
    },
    mode: 'onTouched',
  })
  const { errors } = form.formState
  const watchedOrgId = useWatch({ control: form.control, name: 'orgId' })
  const acceptedTerms = !!useWatch({ control: form.control, name: 'acceptTerms' })

  const onSubmit = async (values: FormOutput) => {
    setSubmitting(true)
    setError(null)
    try {
      const result = await registerPlayer(values)

      if (!result.success) {
        setError(result.error)
        toast.error(result.error)
        return
      }

      if (result.needsEmailConfirmation) {
        toast.info('Vérifiez votre boîte mail', {
          description: 'Nous vous avons envoyé un lien de confirmation. Ouvrez-le pour activer votre compte, puis connectez-vous.',
          duration: 12000,
        })
        router.push('/login?registered=1')
        router.refresh()
        return
      }
      if (result.signedIn) {
        toast.success('Bienvenue sur Moovi', { description: 'Votre compte joueur est prêt.' })
      } else {
        toast.info('Compte créé', {
          description: 'Connectez-vous depuis la page d\'un club pour continuer.',
        })
      }
      router.push(next ?? BOOKING_PATH)
      router.refresh()
    } catch {
      const message = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="player-name">Nom complet</Label>
        <Input
          id="player-name"
          autoComplete="name"
          placeholder="Ali Ben Salah"
          error={!!errors.fullName}
          aria-describedby={errors.fullName ? 'player-name-error' : undefined}
          {...form.register('fullName')}
        />
        {errors.fullName && (
          <p id="player-name-error" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="player-email">E-mail</Label>
        <Input
          id="player-email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          error={!!errors.email}
          aria-describedby={errors.email ? 'player-email-error' : undefined}
          {...form.register('email')}
        />
        {errors.email && (
          <p id="player-email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="player-phone">Numéro de téléphone</Label>
        <div className="flex">
          <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
            +216
          </span>
          <Input
            id="player-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98 123 456"
            className="rounded-l-none"
            error={!!errors.phone}
            aria-describedby={errors.phone ? 'player-phone-error' : 'player-phone-hint'}
            {...form.register('phone')}
          />
        </div>
        {errors.phone ? (
          <p id="player-phone-error" className="text-sm text-destructive">
            {errors.phone.message}
          </p>
        ) : (
          <p id="player-phone-hint" className="text-xs text-muted-foreground">
            8 chiffres commençant par 2, 4, 5 ou 9.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="player-password">Mot de passe</Label>
        <div className="relative">
          <Input
            id="player-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Au moins 8 caractères"
            className="pr-11"
            error={!!errors.password}
            aria-describedby={errors.password ? 'player-password-error' : 'player-password-hint'}
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {errors.password ? (
          <p id="player-password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : (
          <p id="player-password-hint" className="text-xs text-muted-foreground">
            {PASSWORD_RULES_HINT}
          </p>
        )}
      </div>

      <Controller
        name="acceptTerms"
        control={form.control}
        render={({ field }) => (
          <ConsentCheckbox
            id="player-terms"
            checked={!!field.value}
            onChange={field.onChange}
            error={errors.acceptTerms?.message}
          />
        )}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" aria-hidden />}
        Créer un compte joueur
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* The club the visitor came from (last visited) and the return path travel in the sg-oauth cookie; the Terms box above must be ticked. */}
      <GoogleButton
        orgId={watchedOrgId || undefined}
        next={next ?? undefined}
        disabled={submitting || !acceptedTerms}
      />
      {!acceptedTerms && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Acceptez les conditions pour continuer avec Google.
        </p>
      )}
    </form>
  )
}
