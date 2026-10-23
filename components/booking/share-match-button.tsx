import { MessageCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * "Partager le match": opens WhatsApp with the match details pre-filled (see `matchShareLink`); the
 * player picks who to send it to. `tone` matches the card it sits on.
 */
export function ShareMatchButton({ href, tone = 'light', className }: { href: string; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="share-match"
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-3',
        tone === 'dark'
          ? 'border-bone-linen/40 text-bone-linen hover:bg-bone-linen/10 active:bg-bone-linen/15 focus-visible:ring-bone-linen/40'
          : 'border-black/[0.08] bg-white text-foreground hover:border-black/20 active:bg-black/[0.04] focus-visible:ring-ring/50',
        className
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      Partager le match
    </a>
  )
}
