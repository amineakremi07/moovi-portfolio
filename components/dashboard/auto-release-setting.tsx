'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { TimerReset } from 'lucide-react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import { saveAutoRelease } from '@/lib/actions/org-settings'

/**
 * Owner opt-in for the H-4 anti no-show agent. On: unpaid online bookings are asked to confirm between
 * 24 h and 6 h before kick-off, and released 4 h before if the player did not. Paid bookings, split
 * payments, open matches with joiners and desk / phone bookings are never released.
 */
export function AutoReleaseSetting({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = React.useState(enabled)
  const [busy, setBusy] = React.useState(false)

  const toggle = async (value: boolean) => {
    setOn(value)
    setBusy(true)
    const result = await saveAutoRelease({ enabled: value })
    setBusy(false)
    if (!result.success) {
      setOn(!value)
      toast.error(result.error)
      return
    }
    toast.success(value ? 'Libération automatique activée.' : 'Libération automatique désactivée.')
    router.refresh()
  }

  return (
    <section aria-labelledby="auto-release-heading" className="space-y-2">
      <h2 id="auto-release-heading" className="px-1 text-xs font-medium text-[#645757]">
        Anti no-show
      </h2>
      <div className="flex min-h-14 items-center gap-3 rounded-xl bg-[#eae6df] px-4 py-3">
        <TimerReset className="size-5 shrink-0 text-[#0e634f]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" id="auto-release-label">
            Libérer les créneaux non confirmés
          </span>
          <span className="block text-xs text-[#645757]">
            Le joueur confirme sa venue par e-mail ; sans réponse 4 h avant le match, le créneau impayé est remis en vente.
          </span>
        </span>
        <Switch
          checked={on}
          onCheckedChange={toggle}
          disabled={busy}
          aria-labelledby="auto-release-label"
          data-testid="auto-release-switch"
        />
      </div>
      <p className="px-1 text-xs text-[#645757]">
        Jamais pour les réservations payées, partagées, prises à l&apos;accueil ou par téléphone, ni pour une partie que d&apos;autres joueurs ont rejointe.
      </p>
    </section>
  )
}
