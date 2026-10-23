import { CalendarPlus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Shown in place of "Prochain match" when the player has nothing booked: two ways to get on court. Same
 * Forest Depths room as the next-match ticket, kept compact: one line of copy and the two actions side by
 * side at every width ("Réserver" | "Rejoindre"). "Réserver" is the page's Lime Pulse action and jumps to
 * the clubs; "Rejoindre" jumps to the open matches.
 */
export function PlayHero({ openCount }: { openCount: number }) {
  return (
    <section
      aria-labelledby="play-hero-heading"
      className="relative overflow-hidden rounded-xl bg-forest-depths p-4 text-bone-linen md:p-5"
      data-testid="next-booking-empty"
    >
      {/* Two quiet court lines: texture, not decoration that competes with the actions. */}
      <svg aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-bone-linen/[0.07] md:h-48 md:w-48" viewBox="0 0 200 200" fill="none">
        <rect x="20" y="20" width="160" height="160" rx="6" stroke="currentColor" strokeWidth="4" />
        <line x1="100" y1="20" x2="100" y2="180" stroke="currentColor" strokeWidth="4" />
        <circle cx="100" cy="100" r="28" stroke="currentColor" strokeWidth="4" />
      </svg>

      <p className="relative text-xs text-bone-linen/70">Aucun match prévu</p>
      <h2 id="play-hero-heading" className="relative mt-1 max-w-[28ch] text-lg font-semibold leading-tight tracking-tight md:text-xl">
        Organisez votre match ou rejoignez une partie
      </h2>
      <div className="relative mt-3 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
        <Button asChild className="h-11 px-4 text-base font-semibold sm:px-5">
          <a href="#clubs">
            <CalendarPlus aria-hidden />
            Réserver<span className="sr-only"> un terrain</span>
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 border-bone-linen/40 bg-transparent px-4 text-base text-bone-linen hover:bg-bone-linen/10 hover:text-bone-linen sm:px-5"
        >
          <a href="#parties-ouvertes">
            <Users aria-hidden />
            Rejoindre<span className="sr-only"> une partie</span>
            {openCount > 0 && (
              <span className="ml-1 rounded-full bg-bone-linen px-2 text-xs font-semibold leading-5 text-forest-depths tabular-nums">{openCount}</span>
            )}
          </a>
        </Button>
      </div>
    </section>
  )
}
