import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { PaintedPortrait } from '../../art/PaintedPortrait'
import { AnimatedNumber } from '../../motion'
import { playSfx } from '../../game/sfx'
import { useT } from '../../i18n'
import { nameTag } from '../names'
import '../../theme/jericho.css'
import {
  ROAD_D,
  ROAD_FROM_CAMP_D,
  ROAD_LENGTH,
  RUNWAY_LENGTH,
  WALL,
  WORLD_H,
  crackOrigin,
  crackPath,
  hashUnit,
  hornsAfter,
  layoutPacks,
  packsFit,
  pointAt,
  progressScale,
  type Slot,
} from './geometry'

/**
 * The March on Jericho (Joshua 6): the arena's standings between questions.
 * Jericho is painted from above; a road leaves the camp, circles the city and
 * ends at its gate. The leading players march along it as portrait medallions
 * (further along = ahead), everyone else as a crowd of coloured dots; one horn
 * sounds and the wall cracks a little more as the game goes on, and after the
 * last question (`final`, played before the Crowning) the walls fall.
 * Design notes and timings: docs/jericho.md.
 */

export interface JerichoEntry {
  id: string
  name: string
  avatar: string
  before: number
  after: number
  rankBefore: number
  rankAfter: number
  gain: number
  /** Join order: picks the player's colour, the same all game. */
  color: number
  you: boolean
}

interface Props {
  entries: JerichoEntry[]
  played: number
  total: number
  /** Landscape board (projector): the map on the left, the standings rail on the right. */
  wide: boolean
  /** Show the standings rail (boards); phones have their own standing panel below. */
  rail: boolean
  /** The walls fall: played once at the end, then `onDone`. */
  final?: boolean
  onDone?: () => void
}

/** Eight rim colours, so a full road of medallions never repeats one. */
const JERICHO_COLORS = ['#d2332f', '#2f6fd8', '#2f9a45', '#8a3fc0', '#1fa3a0', '#c9ced6', '#e08a1e', '#d65a9a']
const colorOf = (e: JerichoEntry) => JERICHO_COLORS[((e.color % JERICHO_COLORS.length) + JERICHO_COLORS.length) % JERICHO_COLORS.length]

/** Medallions on the map: boards show the top 8; phones the top 6 and you. */
const BOARD_TOKENS = 8
const PHONE_TOKENS = 6
/** Never fewer medallions than this (a crowded start may squeeze them). */
const MIN_TOKENS = 3
const RAIL_ROWS_WIDE = 8
const RAIL_ROWS_UPRIGHT = 5

/** Visible part of the painting, in world units: boards see all of it, phones a near-square crop. */
const VIEW_WIDE = { x0: 0, w: 100 }
const VIEW_PHONE = { x0: 0, w: 100 }

/** Beat timings (ms). The server holds the standings for 6 s, the scene slide eats ~0.4 s. */
const T_GAIN = 250
const T_MARCH = 650
const MARCH_MS = 2200
const T_SETTLE = T_MARCH + MARCH_MS + 50
const T_WALL = T_SETTLE + 450
/** Finale beats (ms from mount). */
const F_HORNS = T_SETTLE + 150
const F_SHOUT = F_HORNS + 7 * 90 + 100
const F_FALL = F_SHOUT + 650
const F_LIGHT = F_FALL + 900
const F_DONE = F_LIGHT + 2300

type Stage = 'start' | 'march' | 'settled' | 'wall' | 'horns' | 'shout' | 'fall' | 'light'

interface Token {
  e: JerichoEntry
  from: Slot
  to: Slot
  scale: number
}

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

export function Jericho({ entries, played, total, wide, rail, final = false, onDone }: Props) {
  const t = useT()
  const reduce = useReducedMotion() ?? false
  const view = wide ? VIEW_WIDE : VIEW_PHONE
  const D = wide ? 8 : 10 // medallion diameter, world units
  const LEAD = 1.2
  const YOU = 1.3

  // ── who stands where ──────────────────────────────────────────────────
  const byAfter = useMemo(() => [...entries].sort((a, b) => a.rankAfter - b.rankAfter), [entries])
  const me = entries.find((e) => e.you)
  const leaderAfter = byAfter[0]
  const leaderBefore = useMemo(() => [...entries].sort((a, b) => a.rankBefore - b.rankBefore)[0], [entries])

  const { tokens, crowd, goldFrom, goldTo } = useMemo(() => {
    const scale = progressScale(leaderAfter?.after ?? 0, total, final)
    const sizeOf = (e: JerichoEntry) => (e.you && !wide ? YOU : e.id === leaderAfter?.id ? LEAD : 1)
    // As many medallions as fit on the road without piling up (early in a game the leaders are
    // still near the camp); the rest march as the crowd and are named in the list.
    // Medallions go to players who have scored (at least the top MIN_TOKENS); those still on 0 wait in the camp.
    const pick = (k: number) => {
      const ids = new Set(byAfter.filter((e, i) => i < k && (e.after > 0 || i < MIN_TOKENS)).map((e) => e.id))
      if (!wide && me) ids.add(me.id)
      return ids
    }
    let count = Math.min(entries.length, wide ? BOARD_TOKENS : PHONE_TOKENS)
    while (count > MIN_TOKENS) {
      const ordered = entries.filter((e) => pick(count).has(e.id)).sort((a, b) => a.rankAfter - b.rankAfter)
      if (packsFit(ordered.map((e) => e.after * scale), D, sizeOf(ordered[0]), final)) break
      count--
    }
    const shown = pick(count)
    const list = entries.filter((e) => shown.has(e.id))
    const lay = (key: 'before' | 'after', rank: 'rankBefore' | 'rankAfter', isFinal: boolean) => {
      const ordered = [...list].sort((a, b) => a[rank] - b[rank])
      const slots = layoutPacks(
        ordered.map((e) => e[key] * scale),
        D,
        sizeOf(ordered[0] ?? list[0]),
        isFinal,
      )
      return new Map(ordered.map((e, i) => [e.id, slots[i]]))
    }
    const before = lay('before', 'rankBefore', false)
    const after = lay('after', 'rankAfter', final)
    const tokens: Token[] = list.map((e) => ({ e, from: before.get(e.id)!, to: after.get(e.id)!, scale: sizeOf(e) }))
    // Everyone else: a dot in their colour. They rank below the top medallions, so they march
    // behind the last of them (whose pack may stand further back than its score), in rows of three.
    const topIds = new Set([...shown].filter((id) => !(me && id === me.id && me.rankAfter > count)))
    const others = entries.filter((e) => !shown.has(e.id))
    const tailOf = (m: Map<string, Slot>) => Math.min(...[...m].filter(([id]) => topIds.has(id)).map(([, s]) => s.dist))
    const queue = (key: 'before' | 'after', tail: number) => {
      const out = new Map<string, { dist: number; side: number }>()
      let cursor = (Number.isFinite(tail) ? tail : ROAD_LENGTH) - 0.8 * D
      let k = 0
      for (const e of [...others].sort((a, b) => b[key] - a[key])) {
        const want = e[key] * scale
        if (want <= cursor) {
          out.set(e.id, { dist: want, side: hashUnit(e.id) })
          cursor = want
          k = 0
          continue
        }
        out.set(e.id, { dist: Math.max(-RUNWAY_LENGTH, cursor), side: (k % 3) - 1 })
        k++
        if (k % 3 === 0) cursor -= 1.9
      }
      return out
    }
    const qBefore = queue('before', tailOf(before))
    const qAfter = queue('after', tailOf(after))
    const crowd = others.map((e) => ({
      color: colorOf(e),
      from: qBefore.get(e.id)!.dist,
      to: qAfter.get(e.id)!.dist,
      sideFrom: qBefore.get(e.id)!.side,
      sideTo: qAfter.get(e.id)!.side,
    }))
    return {
      tokens,
      crowd,
      goldFrom: Math.max(0, (leaderBefore?.before ?? 0) * scale),
      goldTo: Math.max(0, (leaderAfter?.after ?? 0) * scale),
    }
  }, [entries, byAfter, me, leaderAfter, leaderBefore, total, final, wide, D])

  // ── the stage's size (world units → px) ─────────────────────────────────
  // Boards fit the map into their box; tall layouts (phones, upright boards) fit it to the width,
  // leaving room under it for the list.
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const root = rootRef.current
    const box = boxRef.current
    if (!root || !box) return
    const aspect = view.w / WORLD_H
    const fit = () => {
      let w: number
      if (wide) {
        const cw = box.clientWidth
        const ch = box.clientHeight
        if (!cw || !ch) return
        w = Math.min(cw, ch * aspect)
      } else {
        const rw = root.clientWidth
        const rh = root.clientHeight
        if (!rw || !rh) return
        const below = rail ? rh * 0.32 : Math.min(150, rh * 0.22)
        const head = headRef.current?.offsetHeight ?? 0
        w = Math.max(0, Math.min(rw, (rh - head - below) * aspect))
      }
      setSize((s) => (Math.abs(s.w - w) < 0.5 ? s : { w, h: w / aspect }))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(root)
    ro.observe(box)
    return () => ro.disconnect()
  }, [view.w, wide, rail])
  const unit = size.w / view.w // px per world unit
  const unitRef = useRef(unit)
  useLayoutEffect(() => {
    unitRef.current = unit
  }, [unit])

  // ── timeline ──────────────────────────────────────────────────────────
  const prevHorns = hornsAfter(played - 1, total)
  const nextHorns = final ? 7 : hornsAfter(played, total)
  const [stage, setStage] = useState<Stage>(reduce ? (final ? 'light' : 'wall') : 'start')
  const settled = stage !== 'start' && stage !== 'march'
  const hornsLit = stage === 'wall' || stage === 'horns' || stage === 'shout' || stage === 'fall' || stage === 'light' ? nextHorns : prevHorns
  const fallen = stage === 'fall' || stage === 'light'

  const tokenEls = useRef(new Map<string, HTMLDivElement>())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const goldRef = useRef<SVGPathElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  const progress = useRef(reduce ? 1 : 0) // 0 = before, 1 = after
  const marching = useRef(false)

  /** Write every medallion's transform, the crowd and the gold road for the current progress. */
  const drawRef = useRef<(now: number) => void>(() => {})
  useLayoutEffect(() => {
    drawRef.current = (now: number) => {
    const u = unitRef.current
    if (!u) return
    const k = progress.current
    for (const tk of tokens) {
      const el = tokenEls.current.get(tk.e.id)
      if (!el) continue
      const dist = tk.from.dist + (tk.to.dist - tk.from.dist) * k
      // In the camp queue (before the road starts) the two files stand closer together.
      const lane = (tk.from.lane + (tk.to.lane - tk.from.lane) * k) * (dist < 0 ? 0.55 : 1)
      const p = pointAt(dist)
      let bob = 0
      if (marching.current && tk.to.dist - tk.from.dist > 0.2) bob = Math.abs(Math.sin((now / 1000) * 2.5 * Math.PI)) * D * 0.07 * Math.sin(Math.PI * k)
      // Never past the picture's edges, wherever the road and lanes put it.
      const r = D * tk.scale * 0.62
      const wx = Math.min(view.x0 + view.w - r, Math.max(view.x0 + r, p.x + p.nx * lane))
      const wy = Math.min(WORLD_H - r, Math.max(r, p.y + p.ny * lane))
      const x = wx * u
      const y = (wy - bob) * u
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      // Keep the name ribbon on screen: below the medallion near the top, nudged inward at the sides.
      el.classList.toggle('top', wy < D * (0.5 * tk.scale + 0.55))
      const rel = wx - view.x0
      const edge = 12
      const rx = rel < edge ? (edge - rel) * u : rel > view.w - edge ? -(rel - (view.w - edge)) * u : 0
      el.style.setProperty('--rx', `${rx.toFixed(1)}px`)
      // Nearer the bottom = in front; the leader and you above everyone.
      el.style.zIndex = String(Math.round(wy * 10) + (tk.e.you ? 2000 : tk.e.id === leaderAfter?.id ? 1000 : 0))
    }
    const gold = goldRef.current
    if (gold) gold.style.strokeDasharray = `${(goldFrom + (goldTo - goldFrom) * k).toFixed(2)} ${ROAD_LENGTH + 50}`
    const cv = canvasRef.current
    if (cv) {
      const ctx = cv.getContext('2d')
      if (ctx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const W = Math.round(100 * u * dpr)
        const H = Math.round(WORLD_H * u * dpr)
        if (cv.width !== W || cv.height !== H) {
          cv.width = W
          cv.height = H
        }
        ctx.setTransform(dpr * u, 0, 0, dpr * u, 0, 0)
        ctx.clearRect(0, 0, 100, WORLD_H)
        const r = wide ? 0.85 : 1.1
        ctx.lineWidth = 0.22
        ctx.strokeStyle = '#2a1406'
        for (const c of crowd) {
          const p = pointAt(c.from + (c.to - c.from) * k)
          const side = (c.sideFrom + (c.sideTo - c.sideFrom) * k) * 2.4
          const x = p.x + p.nx * side
          const y = p.y + p.ny * side
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fillStyle = c.color
          ctx.fill()
          ctx.stroke()
        }
      }
    }
  }
  })

  // Redraw the still picture whenever the size or the cast changes.
  useLayoutEffect(() => {
    drawRef.current(0)
  }, [unit, tokens, crowd])

  /** A puff of sand at a world point (capped, removed when done). */
  const puff = (x: number, y: number, size: number, ms: number, drift: number) => {
    const layer = fxRef.current
    if (!layer || layer.childElementCount > 80) return
    const img = document.createElement('img')
    img.src = '/art/fx-dust.webp'
    img.alt = ''
    img.className = 'jr-dust'
    img.style.left = `${x}%`
    img.style.top = `${(y / WORLD_H) * 100}%`
    img.style.width = `${size}%`
    layer.appendChild(img)
    const a = Math.random() * 360
    const anim = img.animate(
      [
        { opacity: 0.9, transform: `translate(-50%, -50%) scale(0.4) rotate(${a}deg)` },
        { opacity: 0, transform: `translate(calc(-50% + ${(Math.random() - 0.5) * drift}cqw), calc(-50% - ${drift}cqw)) scale(1.4) rotate(${a + 40}deg)` },
      ],
      { duration: ms, easing: 'ease-out' },
    )
    anim.onfinish = () => img.remove()
  }

  useEffect(() => {
    if (reduce) {
      progress.current = 1
      drawRef.current(performance.now())
      if (final && onDone) {
        const id = window.setTimeout(onDone, 3500)
        return () => window.clearTimeout(id)
      }
      return
    }
    let raf = 0
    let dead = false
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !dead && fn(), ms))

    at(T_MARCH, () => {
      setStage('march')
      marching.current = true
      if (final) playSfx('drumroll')
      const t0 = performance.now()
      const step = (now: number) => {
        if (dead) return
        const k = Math.min(1, (now - t0) / MARCH_MS)
        progress.current = easeInOut(k)
        drawRef.current(now)
        // Sand at the feet of the movers.
        if (k < 0.85 && Math.random() < 0.35) {
          const movers = tokens.filter((tk) => tk.to.dist - tk.from.dist > 0.5)
          const tk = movers[Math.floor(Math.random() * movers.length)]
          if (tk) {
            const d = tk.from.dist + (tk.to.dist - tk.from.dist) * progress.current
            const p = pointAt(d)
            puff(p.x, p.y + D * 0.42, wide ? 3 : 4.2, 700, 2)
          }
        }
        if (k < 1) raf = requestAnimationFrame(step)
        else {
          marching.current = false
          drawRef.current(now)
        }
      }
      raf = requestAnimationFrame(step)
    })
    at(T_SETTLE, () => setStage('settled'))

    if (!final) {
      if (nextHorns > prevHorns) {
        at(T_WALL, () => {
          setStage('wall')
          playSfx('horn')
          worldRef.current?.animate(
            [{ transform: 'translate(0,0)' }, { transform: 'translate(2px,-2px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }],
            { duration: 300 },
          )
          for (let i = prevHorns; i < nextHorns; i++) {
            const o = crackOrigin(i)
            puff(o.x, o.y + 3, wide ? 4 : 5.5, 1000, 2)
          }
        })
        at(T_WALL + 350, () => playSfx('crumble'))
      }
    } else {
      at(F_HORNS, () => {
        setStage('horns')
        playSfx('horn')
      })
      at(F_SHOUT, () => setStage('shout'))
      at(F_FALL, () => {
        setStage('fall')
        playSfx('fall')
        worldRef.current?.animate(
          [{ transform: 'translate(0,0)' }, { transform: 'translate(6px,-5px)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(4px,5px)' }, { transform: 'translate(-3px,-3px)' }, { transform: 'translate(0,0)' }],
          { duration: 650 },
        )
        for (let i = 0; i < 32; i++) {
          at(i * 15, () => {
            const a = Math.PI / 2 + (i / 32) * Math.PI * 2
            puff(WALL.x + WALL.rx * Math.cos(a), WALL.y + WALL.ry * Math.sin(a), (wide ? 7 : 9) + Math.random() * 4, 1700, 5)
          })
        }
      })
      at(F_LIGHT, () => setStage('light'))
      if (onDone) at(F_DONE, onDone)
    }
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      timers.forEach((id) => window.clearTimeout(id))
    }
    // The beat runs once per mount (each standings phase is a fresh scene).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── rendering ─────────────────────────────────────────────────────────
  const railRows = byAfter.length ? (settled ? byAfter : [...entries].sort((a, b) => a.rankBefore - b.rankBefore)) : []
  const maxRows = wide ? RAIL_ROWS_WIDE : RAIL_ROWS_UPRIGHT
  const shownRows = railRows.slice(0, maxRows)
  const more = entries.length - maxRows
  const leaderNow = settled ? leaderAfter : leaderBefore
  // Phones: the top three by name, and you if you're further back.
  const mini = railRows.slice(0, 3)
  const youRow = railRows.find((e) => e.you)
  if (youRow && !mini.includes(youRow)) mini.push(youRow)
  const header = (
    <div className="jr-head" ref={headRef}>
      <div className="jr-title">
        {t('ceremony.jericho.title')}
        <small>{final && stage === 'light' && !wide ? t('ceremony.jericho.verse') : t('ceremony.jericho.after', { played, total })}</small>
      </div>
      <div className="jr-horns" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <img key={i} src="/art/fx-shofar.webp" alt="" className={i < hornsLit ? (i >= prevHorns && stage !== 'start' ? 'lit pop' : 'lit') : ''} style={{ animationDelay: final && i >= prevHorns ? `${(i - prevHorns) * 90}ms` : undefined }} />
        ))}
      </div>
    </div>
  )

  return (
    <div className={`jch ${wide ? 'wide' : 'tall'} ${rail ? 'has-rail' : ''} ${final ? 'final' : ''}`} ref={rootRef}>
      {!wide && header}
      <div className="jr-box" ref={boxRef} style={wide ? undefined : { height: size.h }}>
        <div className="jr-stage" style={{ width: size.w, height: size.h }} role="img" aria-label={t('ceremony.jericho.alt')}>
          <div
            className="jr-world"
            ref={worldRef}
            style={{ width: 100 * unit, height: WORLD_H * unit, left: -view.x0 * unit, '--u': `${unit}px`, '--d': `${D * unit}px` } as React.CSSProperties}
          >
            <div className="jr-bg" />
            {/* The ruins only for the finale (loaded ~4 s before they show), so phones skip them every other beat. */}
            {final && <div className={`jr-bg fallen ${fallen ? 'on' : ''}`} />}
            <svg className="jr-svg" viewBox={`0 0 100 ${WORLD_H}`} preserveAspectRatio="none" aria-hidden>
              <defs>
                <filter id="jr-rough" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
                  <feDisplacementMap in="SourceGraphic" scale="1.2" />
                </filter>
                <linearGradient id="jr-gold" x1="0" x2="1">
                  <stop offset="0" stopColor="#f5c242" />
                  <stop offset="1" stopColor="#ffdf7a" />
                </linearGradient>
              </defs>
              <g className={fallen ? 'jr-cracks gone' : 'jr-cracks'}>
                {Array.from({ length: Math.min(6, hornsLit) }, (_, i) => (
                  <g key={i} className={i >= prevHorns ? 'new' : ''}>
                    <path d={crackPath(i)} pathLength={1} className="jr-crack-dark" />
                    <path d={crackPath(i)} pathLength={1} className="jr-crack-light" transform="translate(0.25,0)" />
                  </g>
                ))}
              </g>
              <path d={ROAD_D} className="jr-road-edge" filter="url(#jr-rough)" />
              <path d={ROAD_D} className="jr-road-bed" filter="url(#jr-rough)" />
              <path d={ROAD_FROM_CAMP_D} className="jr-road-gold" ref={goldRef} style={{ strokeDasharray: `${goldFrom} ${ROAD_LENGTH + 50}` }} />
              <path d={ROAD_D} className="jr-road-dash" />
            </svg>
            <div className="jr-gate-glow" />
            <canvas className="jr-crowd" ref={canvasRef} />
            {tokens.map((tk) => {
              const isLeader = tk.e.id === leaderNow?.id
              return (
                <div
                  key={tk.e.id}
                  className={`jr-tok ${isLeader ? 'leader' : ''} ${tk.e.you ? 'you' : ''}`}
                  ref={(el) => {
                    if (el) tokenEls.current.set(tk.e.id, el)
                    else tokenEls.current.delete(tk.e.id)
                  }}
                  style={{ '--c': colorOf(tk.e), '--s': tk.scale } as React.CSSProperties}
                >
                  <div className={`jr-in ${final && stage === 'light' && tk.e.id === leaderAfter?.id ? 'champion' : ''} ${final && (stage === 'shout' || stage === 'horns') ? 'hop' : ''}`}>
                    {isLeader && <div className="jr-rays" />}
                    <div className="jr-shadow" />
                    <div className="jr-spike" />
                    <PaintedPortrait id={tk.e.avatar} className="jr-med" />
                    {isLeader && <img className="jr-badge" src="/art/fx-shofar.webp" alt="" />}
                    <div className={`jr-chip ${settled && tk.e.rankAfter < tk.e.rankBefore ? 'up' : ''}`}>{settled ? tk.e.rankAfter : tk.e.rankBefore}</div>
                    {tk.e.gain > 0 && <div className="jr-gain" style={{ animationDelay: `${T_GAIN}ms` }}>+{tk.e.gain.toLocaleString()}</div>}
                    {(isLeader || tk.e.you) && <div className="jr-ribbon">{tk.e.you && !wide ? t('ceremony.youAlone') : nameTag(t, { name: tk.e.name, you: tk.e.you })}</div>}
                  </div>
                </div>
              )
            })}
            <div className="jr-fx" ref={fxRef} />
          </div>
          {final && (
            <>
              <div className={`jr-shaft ${stage === 'light' ? 'on' : ''}`} />
              <div className={`jr-flash ${stage === 'fall' ? 'on' : ''}`} />
              <div className={`jr-shout ${stage === 'shout' || stage === 'fall' ? 'on' : ''}`}>{t('ceremony.jericho.shout')}</div>
              {wide && <div className={`jr-verse ${stage === 'light' ? 'on' : ''}`}>{t('ceremony.jericho.verse')}</div>}
            </>
          )}
        </div>
      </div>
      {!rail && (
        <div className="jr-mini">
          {mini.map((e) => (
            <div key={e.id} className={`jr-mrow ${e.you ? 'you' : ''}`} style={{ '--c': colorOf(e) } as React.CSSProperties}>
              <span className="jr-rk">{settled ? e.rankAfter : e.rankBefore}</span>
              <PaintedPortrait id={e.avatar} className="jr-pf" />
              <span className="jr-nm">{nameTag(t, { name: e.name, you: e.you })}</span>
              <span className="jr-sc">
                <AnimatedNumber value={e.after} from={reduce ? e.after : e.before} delay={T_MARCH / 1000} duration={MARCH_MS / 1000} />
              </span>
            </div>
          ))}
        </div>
      )}
      {rail && (
        <div className="jr-rail">
          {wide && header}
          <div className="jr-rows" style={{ '--rows': maxRows } as React.CSSProperties}>
            {shownRows.map((e) => {
              const i = railRows.indexOf(e)
              const delta = settled ? e.rankBefore - e.rankAfter : 0
              return (
                <div key={e.id} className={`jr-row ${i === 0 ? 'first' : ''}`} style={{ '--c': colorOf(e), top: `calc(${i} * 100% / var(--rows))` } as React.CSSProperties}>
                  <span className="jr-rk">{settled ? e.rankAfter : e.rankBefore}</span>
                  <PaintedPortrait id={e.avatar} className="jr-pf" />
                  <span className="jr-nm">{e.name}</span>
                  {delta !== 0 && <span className={`jr-mv ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `▲${delta}` : `▼${-delta}`}</span>}
                  <span className="jr-sc">
                    <AnimatedNumber value={e.after} from={reduce ? e.after : e.before} delay={T_MARCH / 1000} duration={MARCH_MS / 1000} />
                  </span>
                </div>
              )
            })}
          </div>
          {more > 0 && <div className="jr-more">{t('ceremony.jericho.more', { count: more })}</div>}
        </div>
      )}
    </div>
  )
}
