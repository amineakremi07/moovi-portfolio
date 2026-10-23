import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export type SettingsRow = { href: string; title: string; hint: string; icon: LucideIcon }

/** One grouped list of rows (iOS Settings style): flat Oat Milk panel, hairline separators, a chevron each. */
export function SettingsGroup({ label, rows }: { label: string; rows: SettingsRow[] }) {
  return (
    <section aria-label={label} className="space-y-2">
      <h2 className="px-1 text-xs font-medium text-[#645757]">{label}</h2>
      <ul className="divide-y divide-[#d7d2cc] overflow-hidden rounded-xl bg-[#eae6df]">
        {rows.map(({ href, title, hint, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[#e2ddd5] focus-visible:bg-[#e2ddd5] focus-visible:outline-none active:bg-[#dcd6cd]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1d3023] text-[#f7f5f2]">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{title}</span>
                <span className="block truncate text-xs text-[#645757]">{hint}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[#645757]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
