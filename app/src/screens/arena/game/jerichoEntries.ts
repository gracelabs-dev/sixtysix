import { useMemo } from 'react'
import type { LeaderboardEntry } from '@sixtysix/shared'
import { useArenaStore } from '../../../arena/arenaStore'
import type { JerichoEntry } from '../../../ceremony/jericho/Jericho'

/** Leaderboard entries → the March on Jericho's (colour = join order, so it stays all game). */
export function useJerichoEntries(entries: LeaderboardEntry[], me: string | null): JerichoEntry[] {
  const players = useArenaStore((s) => s.room?.players)
  const joinOrder = useMemo(() => new Map(players?.map((p, i) => [p.id, i]) ?? []), [players])
  return useMemo(
    () =>
      entries.map((e) => ({
        id: e.playerId,
        name: e.name,
        avatar: e.avatar,
        before: e.score - e.gain,
        after: e.score,
        rankBefore: e.rank + e.delta,
        rankAfter: e.rank,
        gain: e.gain,
        color: joinOrder.get(e.playerId) ?? 0,
        you: e.playerId === me,
      })),
    [entries, joinOrder, me],
  )
}
