import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * One empty state for the whole app: what is missing, why it matters or what to do next, and at most
 * one action. Flat (no shadow): `card` sits on the canvas as an Oat Milk panel, `outline` is a dashed
 * frame for white or already-carded surfaces. `compact` for sidebars and narrow widgets.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'card',
  compact = false,
  className,
  ...props
}: {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** A single follow-up (a Button or Link). */
  action?: React.ReactNode
  variant?: 'card' | 'outline'
  compact?: boolean
} & Omit<React.ComponentProps<'div'>, 'title'>) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl text-center',
        variant === 'card' ? 'bg-card' : 'border border-dashed border-border',
        compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-10 md:py-12',
        className
      )}
      {...props}
    >
      {Icon && (
        <span
          className={cn(
            'mb-1 flex items-center justify-center rounded-full text-success',
            variant === 'card' ? 'bg-background' : 'bg-card',
            compact ? 'size-9' : 'size-11'
          )}
        >
          <Icon className={compact ? 'size-4' : 'size-5'} aria-hidden />
        </span>
      )}
      <p className={cn('font-semibold tracking-[-0.01em] text-foreground', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {description && <p className="max-w-[44ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
