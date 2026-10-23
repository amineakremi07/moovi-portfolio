import { BadgeCheck, Coins, Lock, ShieldCheck, type LucideIcon } from 'lucide-react'

import { t, type MessageKey } from '@/lib/i18n/messages'

/* ==========================================================================
   Trust signals: only promises the product actually keeps (GiST slot lock,
   manual club verification, one price function, Law 2004-63 + self-service
   deletion). No invented figures or testimonials.
   ========================================================================== */

const ITEMS: { icon: LucideIcon; key: string }[] = [
  { icon: Lock, key: 'trust.t1' },
  { icon: BadgeCheck, key: 'trust.t2' },
  { icon: Coins, key: 'trust.t3' },
  { icon: ShieldCheck, key: 'trust.t4' },
]

export function TrustSignals() {
  return (
    <section aria-labelledby="trust-title" className="border-t border-border/40">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-20 sm:px-6 md:py-24 lg:px-8 xl:px-12">
        <h2 id="trust-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t('trust.title')}
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ icon: Icon, key }) => (
            <li key={key} className="border-t border-border pt-5">
              <Icon className="size-5 text-peacock-teal" aria-hidden />
              <h3 className="mt-3 font-semibold leading-snug">{t(`${key}.title` as MessageKey)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`${key}.body` as MessageKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
