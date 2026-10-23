import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { ReservationsSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <>
      <ReservationsSkeleton />
      <PlayerTabBar current="reservations" />
    </>
  )
}
