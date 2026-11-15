import { useState, type ReactNode } from 'react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import { Crowning } from '../../../ceremony/Crowning'
import { Jericho } from '../../../ceremony/jericho/Jericho'
import { useJerichoEntries } from './jerichoEntries'
import { usePortraitBoard } from '../usePortraitBoard'

interface Props {
  entries: LeaderboardEntry[]
  isPlayer: boolean
  /** End-game buttons (Play again / End game / Leave). */
  actions: ReactNode
}

/**
 * End of a classic arena game: the last march on Jericho ends at its gate and
 * the walls fall, then The Crowning, which stays until the host plays again or
 * ends it (or a player leaves).
 */
export function Podium({ entries, isPlayer, actions }: Props) {
  const myPlayerId = useArenaStore((s) => s.myPlayerId)
  const total = useArenaStore((s) => s.room?.questionTotal ?? 10)
  const me = isPlayer ? myPlayerId : null
  const coinsEarned = useArenaStore((s) => s.coinsEarned)
  const upright = usePortraitBoard()
  const marchers = useJerichoEntries(entries, me)
  const [walls, setWalls] = useState(entries.length > 0)

  if (walls) {
    return <Jericho entries={marchers} played={total} total={total} wide={!isPlayer && !upright} rail={!isPlayer} final onDone={() => setWalls(false)} />
  }
  return (
    <Crowning
      entries={entries.map((e) => ({ id: e.playerId, name: e.name, avatar: e.avatar, score: e.score, you: e.playerId === me }))}
      wide={!isPlayer}
      coins={isPlayer ? coinsEarned : undefined}
      actions={actions}
    />
  )
}
