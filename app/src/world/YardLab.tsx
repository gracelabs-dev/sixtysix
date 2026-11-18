import { useState } from 'react'
import { BUILDINGS, BUILDING_IDS, maxLevel, newPlot, type BuildingId } from '@sixtysix/shared'
import { PlotView } from './PlotView'
import '../theme/home.css'

/**
 * Dev-only: the homestead in 3D from made-up levels, no account needed.
 * `/yard-lab?house=9` builds everything as far as House 9 allows;
 * `?lv=3` puts every building at level 3 (capped at its top); `?build=1`
 * shows scaffolding on every spot that has a next level.
 */
function levelsFor(house: number, lv: number | null): Record<BuildingId, number> {
  return Object.fromEntries(
    BUILDING_IDS.map((b) => {
      if (b === 'house') return [b, Math.min(maxLevel('house'), Math.max(1, lv ?? house))]
      if (lv !== null) return [b, Math.min(maxLevel(b), lv)]
      // The highest level whose house requirement is met.
      let n = 0
      BUILDINGS[b].levels.forEach((d, i) => {
        if ((d.needs.house ?? 1) <= house) n = i + 1
      })
      return [b, n]
    }),
  ) as Record<BuildingId, number>
}

export function YardLab() {
  const q = new URLSearchParams(window.location.search)
  const [house, setHouse] = useState(Number(q.get('house') ?? 7))
  const lv = q.get('lv') === null ? null : Number(q.get('lv'))
  const levels = levelsFor(house, lv)
  const [now] = useState(() => Date.now())
  const plot = newPlot(now)
  plot.levels = levels
  if (q.get('build')) {
    plot.builds = BUILDING_IDS.filter((b) => levels[b] < maxLevel(b)).map((b) => ({ building: b, toLevel: levels[b] + 1, startedAt: now - 3_600_000, endsAt: now + 3_600_000 }))
  }
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#e9d9b2' }}>
      <div style={{ display: 'flex', gap: 6, padding: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: maxLevel('house') }, (_, i) => i + 1).map((h) => (
          <button key={h} onClick={() => setHouse(h)} style={{ fontWeight: h === house ? 700 : 400 }}>
            House {h}
          </button>
        ))}
      </div>
      <PlotView levels={levels} plot={plot} now={now} className="yard-lab" onSelect={(b) => console.log('select', b, levels[b])} />
    </div>
  )
}
