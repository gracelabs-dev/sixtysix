/**
 * What happens to the homestead (docs/jerusalem-progression.md §4 and §9.4):
 * one roll a UTC day, made when the family opens My Home (so nobody comes back
 * to a ruin after a holiday), at most one bad event every BAD_GAP days. Bad
 * events never take a level away and their losses are capped; good events are
 * as common. The server (server/src/plot.ts) rolls and resolves them; the app
 * shows the news and the choices.
 */
import { DAY_MS } from './city'
import {
  LATE_MATERIALS,
  MATERIAL_INFO,
  MATERIALS,
  PRODUCERS,
  buildMinutes,
  levelDef,
  modsOf,
  type BuildingId,
  type EventKind,
  type FieldId,
  type Material,
  type Materials,
  type News,
  type PlotState,
} from './plot'

const day = (now: number) => Math.floor(now / DAY_MS)
const HOUR = 3_600_000

/** Days between two bad events, at least. */
export const BAD_GAP = 3
/** The day's chances: something bad (when allowed), otherwise something good. */
export const BAD_ODDS = 0.3
export const GOOD_ODDS = 0.3
/** News is kept this long, at most this many. */
const NEWS_DAYS = 7
const NEWS_MAX = 8

// ── the Philistines (1 Sam 13:17–20; 23:1) ──────────────────────────────

export const RAID_HOUSE_FROM = 5
/** Questions from this book drive them off: each right answer saves a third of the loot and spares a building. */
export const THREAT_QUESTIONS = 3
export const THREAT_BOOK = '1 Samuel'
/** They wait a day at the gate; then they take all they came for. */
export const THREAT_WAIT = DAY_MS
/** The share of each of three materials they are after (Wall 5+: less), at most this many units each. */
export const raidShare = (wall: number) => (wall >= 5 ? 0.1 : 0.15)
const RAID_CAP = 200
/** Wall 7 (the Tower of Hananel): the watch turns back half the raids before they reach the gate. */
export const WATCH_WALL = 7
/** Wall 6 (the gatehouse): the watch puts out fires. */
export const FIRE_WALL = 6

/** What driving them off with `right` answers leaves them: the loot less a third per right answer, and fewer buildings wrecked. */
export function raidOutcome(t: { loot: Materials; hits: BuildingId[] }, right: number) {
  const keep = (THREAT_QUESTIONS - Math.min(THREAT_QUESTIONS, right)) / THREAT_QUESTIONS
  const lost: Materials = {}
  for (const [m, n] of Object.entries(t.loot) as [Material, number][]) {
    const k = Math.round(n * keep)
    if (k > 0) lost[m] = k
  }
  return { lost, hits: t.hits.slice(0, Math.max(0, t.hits.length - right)) }
}

// ── repairs ─────────────────────────────────────────────────────────────

/** Mending a damaged building: stone and wood by its level, half an hour a level (at most 6 h). Builders or the Apprentice. */
export const repairCost = (level: number): Materials => ({ stone: 4 + 4 * level, wood: 3 + 3 * level })
export const repairMinutes = (level: number) => Math.min(360, 30 * Math.max(1, level))

export interface RepairCheck {
  ok: boolean
  /** Builders are busy but the Apprentice is free (he takes any repair). */
  byApprentice: boolean
  freeBuilder: boolean
  busy: boolean
  minutes: number
  cost: Materials
}
export function checkRepair(s: PlotState, b: BuildingId, buildersFree: boolean, apprenticeFree: boolean): RepairCheck {
  const level = s.levels[b]
  const busy = s.builds.some((x) => x.building === b)
  const byApprentice = !buildersFree && apprenticeFree
  return {
    ok: !!s.damage?.[b] && !busy && (buildersFree || byApprentice),
    byApprentice,
    freeBuilder: buildersFree || byApprentice,
    busy,
    minutes: buildMinutes(repairMinutes(level), modsOf(s)),
    cost: repairCost(level),
  }
}

// ── the visitors and the caravan ────────────────────────────────────────

/** Abraham's three visitors (Gen 18:1–8): offer them bread for a blessing. */
export const VISITORS_BREAD = 10
export const VISITORS_WAIT = 12 * HOUR
export const BLESS_MS = DAY_MS
/** A merchant caravan (Gen 37:25): one rare material at half the Market's price, this many, this long. */
export const CARAVAN = { left: 30, ms: 8 * HOUR, share: 0.5 }
export const caravanPrice = (m: Material, qty: number) => Math.ceil(MATERIAL_INFO[m].buy * CARAVAN.share * qty - 1e-9)
export const DROUGHT_MS = 2 * DAY_MS

// ── the day's roll ──────────────────────────────────────────────────────

/** Built producers (what raiders and earthquakes can damage, fires burn). */
const builtProducers = (s: PlotState) => PRODUCERS.filter((b) => s.levels[b] > 0)
const pick = <T,>(xs: readonly T[], rand: () => number): T | undefined => xs[Math.floor(rand() * xs.length)]
const pickN = <T,>(xs: readonly T[], n: number, rand: () => number): T[] => {
  const pool = [...xs]
  const out: T[] = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  return out
}

function news(s: PlotState, n: Omit<News, 'id'>): News {
  const item: News = { id: `${n.kind}-${n.at}`, ...n }
  const ev = (s.events ??= { day: 0, lastBad: 0, news: [] })
  ev.news = [item, ...ev.news.filter((x) => x.at > n.at - NEWS_DAYS * DAY_MS)].slice(0, NEWS_MAX)
  return item
}

/** Bad events possible for this plot now, with their weights. */
function badKinds(s: PlotState, now: number): [EventKind, number][] {
  const out: [EventKind, number][] = []
  const h = s.levels.house
  const growing = Object.values(s.crops ?? {}).some((c) => c && c.readyAt > now)
  if (h >= RAID_HOUSE_FROM && builtProducers(s).length >= 2 && !s.threat) out.push(['philistines', 3])
  if (h >= 4 && builtProducers(s).length) out.push(['quake', 1])
  if (h >= 3 && !(s.drought && s.drought > now)) out.push(['drought', 2])
  if (growing) out.push(['locusts', 2])
  if (builtProducers(s).some((b) => (s.stock[b] ?? 0) >= 5)) out.push(['fire', 2])
  return out
}
function goodKinds(s: PlotState, now: number): [EventKind, number][] {
  const out: [EventKind, number][] = []
  const h = s.levels.house
  if (h >= 3 && !(s.visitors && s.visitors > now) && !(s.blessUntil && s.blessUntil > now)) out.push(['visitors', 3])
  if (h >= 5 && !(s.caravan && s.caravan.until > now)) out.push(['caravan', 2])
  if (s.levels.field1 >= 1 && !s.rain) out.push(['rain', 2])
  return out
}
const weighted = (ks: [EventKind, number][], rand: () => number): EventKind | undefined => {
  let r = rand() * ks.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of ks) if ((r -= w) < 0) return k
  return undefined
}

/**
 * Today's roll, once a UTC day from House 3 (the caller saves the plot when it
 * returns true). Also lets the Philistines take what they came for once their
 * day at the gate is over.
 */
export function rollEvents(s: PlotState, now: number, rand: () => number = Math.random): boolean {
  let changed = false
  if (s.threat && s.threat.until <= now) {
    resolveThreat(s, 0, s.threat.until)
    changed = true
  }
  if (s.levels.house < 3 || s.events?.day === day(now)) return changed
  const ev = (s.events ??= { day: 0, lastBad: 0, news: [] })
  ev.day = day(now)
  const bad = now - ev.lastBad >= BAD_GAP * DAY_MS && rand() < BAD_ODDS ? weighted(badKinds(s, now), rand) : undefined
  if (bad) {
    ev.lastBad = now
    happen(s, bad, now, rand)
  } else if (rand() < GOOD_ODDS) {
    const good = weighted(goodKinds(s, now), rand)
    if (good) happen(s, good, now, rand)
  }
  return true
}

/** Make an event happen now (also used by the dev route that triggers one). */
export function happen(s: PlotState, kind: EventKind, now: number, rand: () => number = Math.random): News | undefined {
  switch (kind) {
    case 'philistines': {
      if (s.levels.wall >= WATCH_WALL && rand() < 0.5) return news(s, { kind: 'repelled', at: now })
      const share = raidShare(s.levels.wall)
      const have = MATERIALS.filter((m) => !LATE_MATERIALS.includes(m) && s.inventory[m] >= 10)
      const loot: Materials = {}
      for (const m of pickN(have, 3, rand)) loot[m] = Math.min(RAID_CAP, Math.max(1, Math.floor(s.inventory[m] * share)))
      s.threat = { at: now, until: now + THREAT_WAIT, loot, hits: pickN(builtProducers(s), 2, rand) }
      return undefined // the news comes when they leave (resolveThreat)
    }
    case 'quake': {
      const b = pick(builtProducers(s).filter((x) => !s.damage?.[x]), rand)
      if (!b) return undefined
      s.damage = { ...s.damage, [b]: now }
      return news(s, { kind, at: now, hits: [b] })
    }
    case 'drought':
      s.drought = now + DROUGHT_MS
      return news(s, { kind, at: now })
    case 'locusts': {
      const field = pick((Object.entries(s.crops ?? {}) as [FieldId, NonNullable<PlotState['crops']>[FieldId]][]).filter(([, c]) => c && c.readyAt > now).map(([f]) => f), rand)
      const c = field && s.crops?.[field]
      if (!field || !c) return undefined
      const eaten = Math.floor(c.amount / 2)
      c.amount -= eaten
      return news(s, { kind, at: now, field, lost: { [c.crop]: eaten } })
    }
    case 'fire': {
      const b = pick(builtProducers(s).filter((x) => (s.stock[x] ?? 0) >= 5), rand)
      if (!b) return undefined
      if (s.levels.wall >= FIRE_WALL) return news(s, { kind: 'fireOut', at: now, building: b })
      const m = levelDef(b, s.levels[b])!.make!.material
      const burnt = Math.floor(s.stock[b] ?? 0)
      s.stock[b] = (s.stock[b] ?? 0) - burnt
      return news(s, { kind, at: now, building: b, lost: { [m]: burnt } })
    }
    case 'visitors':
      s.visitors = now + VISITORS_WAIT
      return news(s, { kind, at: now })
    case 'caravan': {
      const pool: Material[] = ['cedar', 'copper', ...(s.levels.house >= 7 ? (['linen', 'tools', 'wine', 'honey'] as Material[]) : [])]
      const material = pick(pool, rand)!
      s.caravan = { material, until: now + CARAVAN.ms, left: CARAVAN.left }
      return news(s, { kind, at: now, material })
    }
    case 'rain':
      s.rain = true
      return news(s, { kind, at: now })
    default:
      return undefined
  }
}

/** The Philistines leave with what `right` answers didn't save; the buildings they reach are damaged. */
export function resolveThreat(s: PlotState, right: number, now: number): News | undefined {
  const t = s.threat
  if (!t) return undefined
  const { lost, hits } = raidOutcome(t, right)
  for (const [m, n] of Object.entries(lost) as [Material, number][]) {
    const take = Math.min(n, s.inventory[m])
    if (take > 0) s.inventory[m] -= take
    lost[m] = take
  }
  for (const b of hits) s.damage = { ...s.damage, [b]: now }
  delete s.threat
  return news(s, { kind: 'philistines', at: now, lost, hits, right })
}

// ── the good events' choices ────────────────────────────────────────────

export type VisitorsError = 'none' | 'bread'
export const visitorsError = (s: PlotState, now: number): VisitorsError | null => (!s.visitors || s.visitors <= now ? 'none' : s.inventory.bread < VISITORS_BREAD ? 'bread' : null)
/** Offer the visitors bread: the homestead is blessed for a day. */
export function welcomeVisitors(s: PlotState, now: number): void {
  s.inventory.bread -= VISITORS_BREAD
  delete s.visitors
  s.blessUntil = now + BLESS_MS
}

/** How many the caravan still sells now (0 when it has gone). */
export const caravanLeft = (s: PlotState, now: number) => (s.caravan && s.caravan.until > now ? s.caravan.left : 0)

/** Weather on the fields: a drought takes off what the well can't make up, early rain adds half (used once, by the next sowing). */
export function weather(s: PlotState, now: number): number {
  const dry = s.drought && s.drought > now ? 1 - 1.2 * (s.levels.well >= 7 ? 0 : s.levels.well >= 5 ? 0.125 : 0.25) : 1
  return dry * (s.rain ? 1.5 : 1)
}
