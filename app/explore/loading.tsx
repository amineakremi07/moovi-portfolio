import { PlayerTabBar } from '@/components/player/player-tab-bar'
import { ExploreSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <>
      <ExploreSkeleton />
      <PlayerTabBar current="explore" />
    </>
  )
}
