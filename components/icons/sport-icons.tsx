import * as React from 'react'

import type { Sport } from '@/lib/slot-duration'

/**
 * Sport icons in lucide-react's style (24 grid, 2px round strokes, currentColor), which has no padel,
 * tennis or football glyph. Decorative by default: pass `aria-label` + `aria-hidden={false}` to name one.
 */
type IconProps = React.SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Padel: the solid, perforated paddle (no strings) on a short handle. */
export function PadelIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5c3.7 0 6.2 2.6 6.2 6.1 0 3.9-2.8 6.6-6.2 6.6s-6.2-2.7-6.2-6.6C5.8 5.1 8.3 2.5 12 2.5Z" />
      <path d="M10.6 15.1 10.2 18M13.4 15.1l.4 2.9" />
      <rect x="10" y="18" width="4" height="3.5" rx="1" />
      <g fill="currentColor" stroke="none">
        <circle cx="9.6" cy="7.4" r="0.95" />
        <circle cx="14.4" cy="7.4" r="0.95" />
        <circle cx="12" cy="9.6" r="0.95" />
        <circle cx="9.6" cy="11.6" r="0.95" />
        <circle cx="14.4" cy="11.6" r="0.95" />
      </g>
    </Svg>
  )
}

/** Tennis: the ball with its two curved seams. */
export function TennisIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M5.2 5.4C7.4 7 8.7 9.4 8.7 12s-1.3 5-3.5 6.6" />
      <path d="M18.8 5.4C16.6 7 15.3 9.4 15.3 12s1.3 5 3.5 6.6" />
    </Svg>
  )
}

/** Football: the classic ball, a pentagon in the middle and its seams to the edge. */
export function FootballIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8.3l3.5 2.5-1.3 4.1H9.8l-1.3-4.1Z" />
      <path d="M12 8.3V2.6M15.5 10.8l5.4-1.8M14.2 14.9l3.4 4.7M9.8 14.9l-3.4 4.7M8.5 10.8 3.1 9" />
    </Svg>
  )
}

export const SPORT_ICON: Record<Sport, (props: IconProps) => React.JSX.Element> = {
  padel: PadelIcon,
  tennis: TennisIcon,
  football: FootballIcon,
}
