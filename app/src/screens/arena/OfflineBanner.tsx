import { useArenaStore } from '../../arena/arenaStore'
import { useT } from '../../i18n'

/** The connection is gone (church wifi); the store rejoins by itself. CSS holds it back 1.5 s so a blip doesn't flash it. */
export function OfflineBanner() {
  const t = useT()
  const online = useArenaStore((s) => s.online)
  if (online) return null
  return (
    <div className="arena-offline" role="status">
      <span className="arena-offline-dot" /> {t('arena.game.reconnecting')}
    </div>
  )
}
