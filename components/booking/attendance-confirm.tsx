'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { confirmAttendance } from '@/lib/actions/matchmaking'
import { formatVenueTime } from '@/lib/court-time'
import { cn } from '@/lib/utils'

const DEADLINE_MS = 4 * 60 * 60 * 1000

/**
 * "Je confirme ma venue", shown while the club's H-4 agent waits for an answer (check_in_status =
 * awaiting_confirmation). Without it the unpaid slot is released 4 h before kick-off.
 */
export function AttendanceConfirm({ bookingId, startsAt, tone = 'light', className }: { bookingId: string; startsAt: string; tone?: 'light' | 'dark'; className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const deadline = formatVenueTime(new Date(Date.parse(startsAt) - DEADLINE_MS).toISOString())

  const confirm = async () => {
    setBusy(true)
    const result = await confirmAttendance({ bookingId })
    setBusy(false)
    if (!result.success) return void toast.error(result.error)
    toast.success('Merci, votre venue est confirmée. Le terrain vous attend.')
    router.refresh()
  }

  return (
    <div
      role="status"
      data-testid="attendance-confirm"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4',
        tone === 'dark' ? 'border-bone-linen/30 text-bone-linen' : 'border-border',
        className
      )}
    >
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Confirmez votre venue avant {deadline}.</span>{' '}
        <span className={tone === 'dark' ? 'text-bone-linen/75' : 'text-muted-foreground'}>Sans réponse, le club remet le créneau en vente.</span>
      </p>
      <Button className="h-11 px-5" onClick={confirm} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
        Je confirme ma venue
      </Button>
    </div>
  )
}
