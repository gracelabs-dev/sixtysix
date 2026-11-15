import { useMemo, useState } from 'react'
import { CHARACTERS, SKIN_TONES } from '@sixtysix/shared'
import { Jericho, type JerichoEntry } from './Jericho'

/**
 * Dev-only page `/jericho-lab`: the March on Jericho with a simulated room.
 * ?n=200&total=10&layout=board|phone|upright&me=37 (phone: whose phone it is).
 * "Next question" plays a beat; after the last one the walls fall.
 */
const NAMES = ['Anna', 'Bela', 'Christoph', 'Dora', 'Elias', 'Fritzi', 'Gábor', 'Hanna', 'Ilona', 'Jonas', 'Katalin', 'Lukas', 'Marta', 'Noémi', 'Oskar', 'Petra']

interface Sim {
  id: string
  name: string
  avatar: string
  skill: number
  score: number
}

function makeRoom(n: number): Sim[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: i < NAMES.length ? NAMES[i] : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
    avatar: `${CHARACTERS[i % CHARACTERS.length]}.${SKIN_TONES[i % 3]}`,
    skill: 0.35 + ((i * 37) % 55) / 100,
    score: 0,
  }))
}

function rankOf(list: { id: string; score: number }[]): Map<string, number> {
  return new Map([...list].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((p, i) => [p.id, i + 1]))
}

export function JerichoLab() {
  const q = new URLSearchParams(location.search)
  const [n, setN] = useState(Math.max(1, Math.min(200, Number(q.get('n') ?? 8))))
  const [total, setTotal] = useState(Math.max(3, Math.min(30, Number(q.get('total') ?? 10))))
  const [layout, setLayout] = useState(q.get('layout') ?? 'board')
  const [meIndex, setMeIndex] = useState(Number(q.get('me') ?? 0))
  const [room, setRoom] = useState(() => makeRoom(n))
  const [played, setPlayed] = useState(0)
  const [beat, setBeat] = useState<{ entries: JerichoEntry[]; key: number } | null>(null)

  const reset = (count = n) => {
    setRoom(makeRoom(count))
    setPlayed(0)
    setBeat(null)
  }

  const next = () => {
    if (played >= total) return
    const before = rankOf(room)
    const gains = new Map(room.map((p) => [p.id, Math.random() < p.skill ? 500 + Math.round(Math.random() * 480) : 0]))
    const after = room.map((p) => ({ ...p, score: p.score + gains.get(p.id)! }))
    const rAfter = rankOf(after)
    const entries: JerichoEntry[] = after.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      before: p.score - gains.get(p.id)!,
      after: p.score,
      rankBefore: before.get(p.id)!,
      rankAfter: rAfter.get(p.id)!,
      gain: gains.get(p.id)!,
      color: i,
      you: layout === 'phone' && i === meIndex,
    }))
    setRoom(after)
    setPlayed(played + 1)
    setBeat((b) => ({ entries, key: (b?.key ?? 0) + 1 }))
  }

  const final = played === total
  const wide = layout === 'board'
  const frame = useMemo(
    () => (layout === 'phone' ? { width: 390, height: 844 } : layout === 'upright' ? { width: 600, height: 960 } : { width: 1600, height: 900 }),
    [layout],
  )

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', fontFamily: 'system-ui', padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <b>Jericho lab</b>
        <label>
          players{' '}
          <select value={n} onChange={(e) => { const v = Number(e.target.value); setN(v); reset(v) }}>
            {[1, 2, 3, 5, 8, 9, 12, 25, 40, 100, 150, 200].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>
          questions{' '}
          <select value={total} onChange={(e) => { setTotal(Number(e.target.value)); reset() }}>
            {[3, 5, 10, 15, 20, 30].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>
          layout{' '}
          <select value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option>board</option>
            <option>phone</option>
            <option>upright</option>
          </select>
        </label>
        {layout === 'phone' && (
          <label>
            me #<input type="number" value={meIndex} min={0} max={n - 1} style={{ width: 60 }} onChange={(e) => setMeIndex(Number(e.target.value))} />
          </label>
        )}
        <button onClick={next} disabled={played >= total} data-testid="next">
          {played + 1 >= total ? 'Last question → walls fall' : `Next question (${played + 1}/${total})`}
        </button>
        <button onClick={() => reset()}>Reset</button>
      </div>
      <div style={{ position: 'relative', ...frame, maxWidth: '100%', border: '1px solid #333', overflow: 'hidden' }} className={wide ? 'app-wide' : ''}>
        {beat && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Jericho
                key={beat.key}
                entries={beat.entries}
                played={played}
                total={total}
                wide={wide}
                rail={layout !== 'phone'}
                final={final}
                onDone={() => console.info('[jericho-lab] finale done')}
              />
            </div>
            {layout === 'phone' && <div style={{ height: 150, background: '#2a160b', borderTop: '2px solid #b9822a', display: 'grid', placeItems: 'center', color: '#c9a' }}>(your standing panel)</div>}
          </div>
        )}
        {!beat && <div style={{ padding: 40 }}>Press “Next question”.</div>}
      </div>
    </div>
  )
}
