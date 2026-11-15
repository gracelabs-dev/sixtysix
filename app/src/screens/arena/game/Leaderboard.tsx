import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { Jericho } from '../../../ceremony/jericho/Jericho'
import { useJerichoEntries } from './jerichoEntries'
import { Standing } from './Standing'
import { usePortraitBoard } from '../usePortraitBoard'

/**
 * Arena standings between questions: the March on Jericho, for any room size
 * (the leaders as medallions, everyone else as a marching crowd). Boards add
 * the standings rail; phones add their own standing below the map.
 */
export function Leaderboard({ entries, isPlayer }: { entries: LeaderboardEntry[]; isPlayer: boolean }) {
  const room = useArenaStore((s) => s.room)
  const question = useArenaStore((s) => s.question)
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  // A host who kept the board upright on a phone gets the tall layout, not the landscape one squeezed.
  const upright = usePortraitBoard()
  const marchers = useJerichoEntries(entries, isPlayer ? myPlayerId : null)

  const total = question?.total ?? room?.questionTotal ?? 10
  const played = (question?.index ?? room?.questionIndex ?? 0) + 1

  if (!isPlayer) return <Jericho entries={marchers} played={played} total={total} wide={!upright} rail />
  // Phones: the map on top, your own standing (place, score, gaps) below.
  return (
    <div className="tr-split">
      <div className="tr-split-road">
        <Jericho entries={marchers} played={played} total={total} wide={false} rail={false} />
      </div>
      <Standing entries={entries} myPlayerId={myPlayerId} brief />
    </div>
  )
}
