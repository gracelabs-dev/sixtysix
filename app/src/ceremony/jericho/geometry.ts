/**
 * The March on Jericho: geometry in world units. The painting (bg-jericho.webp,
 * 4:3) is 100 units wide and 75 tall; x and y use the same unit. Measured on a
 * 5 % grid of the painting: re-measure if it is regenerated.
 */

export const WORLD_W = 100
export const WORLD_H = 75

export interface Pt {
  x: number
  y: number
}

/** The road's ellipse round the city, the city gate where it ends, the camp where it starts. */
const C = { x: 50, y: 38.5 }
const RX = 38
const RY = 27.5
export const GATE: Pt = { x: 50, y: 60 }
export const CAMP: Pt = { x: 25.5, y: 63.5 }
/** Where everyone waits before they have scored: by the camp, along the open sand under the walls. */
const RUNWAY: Pt[] = [
  { x: 40, y: 69.4 },
  { x: 34, y: 68.6 },
  { x: 29, y: 66.6 },
]

function buildPath(): { pts: Pt[]; start: number } {
  const pts: Pt[] = [...RUNWAY, CAMP]
  const deg = Math.PI / 180
  for (let a = 150; a <= 418; a += 2) pts.push({ x: C.x + RX * Math.cos(a * deg), y: C.y + RY * Math.sin(a * deg) })
  // The spur: from the lower right of the ring curl in to the gate.
  const from = pts[pts.length - 1]
  const ctrl = { x: 62, y: 70 }
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    pts.push({
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * ctrl.x + t * t * GATE.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * ctrl.y + t * t * GATE.y,
    })
  }
  return { pts, start: RUNWAY.length }
}

const { pts: PTS, start: START_INDEX } = buildPath()
const CUM: number[] = [0]
for (let i = 1; i < PTS.length; i++) CUM.push(CUM[i - 1] + Math.hypot(PTS[i].x - PTS[i - 1].x, PTS[i].y - PTS[i - 1].y))
/** Distance along the polyline where the road proper begins (the camp); the runway lies before it. */
const ORIGIN = CUM[START_INDEX]
/** Length of the road from the camp to the gate. */
export const ROAD_LENGTH = CUM[CUM.length - 1] - ORIGIN
/** How far back into the camp a queue may stand. */
export const RUNWAY_LENGTH = ORIGIN

/** SVG path data of the whole road (runway included). */
export const ROAD_D = PTS.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('')
/** SVG path data from the camp on (the part that turns gold). */
export const ROAD_FROM_CAMP_D = PTS.slice(START_INDEX)
  .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  .join('')

export interface RoadPoint extends Pt {
  /** Unit normal (to the left of the direction of travel). */
  nx: number
  ny: number
}

/** The point `dist` units along the road from the camp (negative = back into the camp). */
export function pointAt(dist: number): RoadPoint {
  const s = Math.max(0, Math.min(CUM[CUM.length - 1], dist + ORIGIN))
  let lo = 1
  let hi = CUM.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (CUM[mid] < s) lo = mid + 1
    else hi = mid
  }
  const a = PTS[lo - 1]
  const b = PTS[lo]
  const seg = CUM[lo] - CUM[lo - 1] || 1
  const k = (s - CUM[lo - 1]) / seg
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: a.x + dx * k, y: a.y + dy * k, nx: -dy / len, ny: dx / len }
}

// ── progress ──────────────────────────────────────────────────────────────

/** Points a strong answer is worth on average; `questions × this` = the whole road. */
const POINTS_PER_QUESTION = 800
/** Before the last question the leader stops short of the gate. */
const LEAD_CAP = 0.94

/**
 * Scale from score to distance, shared by the "before" and "after" layouts of a
 * beat so that nobody moves backwards. Final: the leader ends exactly at the gate.
 */
export function progressScale(leaderScore: number, total: number, final: boolean): number {
  const max = Math.max(1, total) * POINTS_PER_QUESTION
  const lead = leaderScore / max
  if (lead <= 0) return ROAD_LENGTH / max
  if (final) return ROAD_LENGTH / leaderScore
  return (Math.min(LEAD_CAP, lead) / lead) * (ROAD_LENGTH / max)
}

// ── packs ─────────────────────────────────────────────────────────────────

export interface Slot {
  /** Along the road from the camp. */
  dist: number
  /** Sideways off the centre line, in units (signed). */
  lane: number
}

/**
 * Lay medallions out on the road in rank order. Each wants the distance its
 * score earns; anyone who would stand on the one ahead joins its pack, and a
 * pack walks two by two behind its head (the head alone in the middle). Tokens
 * are only ever pushed back, never forward, so the order on the road is always
 * the rank order. `d` = medallion diameter; `leadScale` = how much bigger the
 * leader is drawn.
 */
export function layoutPacks(wanted: number[], d: number, leadScale: number, final = false): Slot[] {
  return squeeze(rawPacks(wanted, d, leadScale, final))
}

/**
 * Whether these medallions fit without piling up: everyone who has scored stands on the road
 * itself (the camp queue is only for those still on 0, and only as long as it is).
 */
export function packsFit(wanted: number[], d: number, leadScale: number, final = false): boolean {
  const { out } = rawPacks(wanted, d, leadScale, final)
  return out.every((s, i) => s.dist >= (wanted[i] > 0 ? -0.5 : -RUNWAY_LENGTH))
}

function rawPacks(wanted: number[], d: number, leadScale: number, final: boolean): { out: Slot[]; head: number } {
  // A medallion's rings make it ~1.2 d across on screen.
  const lane = 0.62 * d
  const row = 1.1 * d
  const behindLeader = (final ? 1.75 : 1.05) * d * leadScale
  const out: Slot[] = []
  let head = 0 // index of the current pack's head
  for (let i = 0; i < wanted.length; i++) {
    const want = wanted[i]
    if (i === 0) {
      out.push({ dist: want, lane: 0 })
      continue
    }
    const tail = out[i - 1].dist
    const firstRow = head === 0 ? behindLeader : row
    const needed = i - 1 === head ? firstRow : row
    if (want > tail - needed) {
      // Joins the pack in front: rows of two behind its head.
      const k = i - head // 1, 2 → first row; 3, 4 → second …
      const r = Math.ceil(k / 2)
      out.push({ dist: out[head].dist - firstRow - (r - 1) * row, lane: k % 2 === 1 ? -lane : lane })
    } else {
      head = i
      out.push({ dist: want, lane: 0 })
    }
  }
  // Someone alone in their row walks in the middle.
  for (let i = 0; i < out.length; i++) {
    const partner = out.some((s, j) => j !== i && Math.abs(s.dist - out[i].dist) < 1e-6)
    if (!partner) out[i] = { ...out[i], lane: 0 }
  }
  return { out, head }
}

/** The last pack may queue back into the camp, but no further than the runway: squeeze it to fit. */
function squeeze({ out, head }: { out: Slot[]; head: number }): Slot[] {
  const floor = -RUNWAY_LENGTH
  const min = Math.min(...out.map((s) => s.dist))
  if (out.length && min < floor) {
    const h = out[head].dist
    const f = h > floor ? (h - floor) / (h - min) : 0
    for (let i = head; i < out.length; i++) out[i] = { ...out[i], dist: h > floor ? h + (out[i].dist - h) * f : floor }
  }
  return out
}

// ── the crowd (players without a medallion) ───────────────────────────────

/** A stable sideways offset in −1…1 for a player id. */
export function hashUnit(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967295) * 2 - 1
}

// ── walls ─────────────────────────────────────────────────────────────────

/** How many of the seven horns have sounded after `played` of `total` questions (7 only at the end). */
export function hornsAfter(played: number, total: number): number {
  if (played >= total) return 7
  if (played <= 0) return 0
  return Math.min(6, Math.ceil((7 * played) / Math.max(1, total)))
}

/** Where each stage's crack starts, on the near face of the wall. */
const CRACK_AT: Pt[] = [
  { x: 20, y: 40 },
  { x: 72.5, y: 49.5 },
  { x: 36.5, y: 52.5 },
  { x: 80, y: 40 },
  { x: 27, y: 49.5 },
  { x: 63, y: 52.5 },
  { x: 24, y: 35 },
]

/** A deterministic zig-zag crack per stage (same on every device and every beat). */
export function crackPath(i: number): string {
  const at = CRACK_AT[i % CRACK_AT.length]
  let seed = 9301 * (i + 7)
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  let x = at.x
  let y = at.y
  let d = `M${x.toFixed(2)},${y.toFixed(2)}`
  for (let k = 0; k < 5; k++) {
    x += (rnd() - 0.5) * 2.2
    y += 0.55 + rnd() * 0.6
    d += ` L${x.toFixed(2)},${y.toFixed(2)}`
  }
  return d
}
export const crackOrigin = (i: number): Pt => CRACK_AT[i % CRACK_AT.length]

/** The wall's ellipse (for the dust ring when it falls). */
export const WALL = { x: 50, y: 36, rx: 34, ry: 23 }
