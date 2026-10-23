'use client'

import { Columns3, GanttChart, type LucideIcon } from 'lucide-react'

import { writeBoardView, useBoardView, type BoardView } from '@/lib/board-view'
import { cn } from '@/lib/utils'

const VIEWS: { value: BoardView; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'timeline', label: 'Grille', hint: 'Heures × terrains, une case par réservation', icon: GanttChart },
  { value: 'columns', label: 'Détails', hint: 'Chaque réservation avec ses actions, par terrain', icon: Columns3 },
]

/** How the bookings board draws the day on this device (the board itself no longer carries the switch). */
export function BoardViewSetting() {
  const view = useBoardView()
  return (
    <section aria-labelledby="board-view-heading" className="space-y-2">
      <h2 id="board-view-heading" className="px-1 text-xs font-medium text-[#645757]">
        Affichage du planning
      </h2>
      <div role="radiogroup" aria-labelledby="board-view-heading" className="divide-y divide-[#d7d2cc] overflow-hidden rounded-xl bg-[#eae6df]">
        {VIEWS.map(({ value, label, hint, icon: Icon }) => {
          const checked = view === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              data-testid={`board-view-${value}`}
              onClick={() => writeBoardView(value)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[#e2ddd5] focus-visible:bg-[#e2ddd5] focus-visible:outline-none active:bg-[#dcd6cd]"
            >
              <Icon className="size-5 shrink-0 text-[#0e634f]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-[#645757]">{hint}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150',
                  checked ? 'border-[#1d3023] bg-[#1d3023]' : 'border-[#645757]/50'
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-[#f7f5f2]" />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="px-1 text-xs text-[#645757]">Enregistré sur cet appareil.</p>
    </section>
  )
}
