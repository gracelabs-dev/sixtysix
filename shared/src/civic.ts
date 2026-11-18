/**
 * Jerusalem as a city (docs/jerusalem-progression.md §5–§6): the weekly house
 * tax, the voluntary tithe, the city treasury and what it pays for, and the
 * Temple the whole city raises. The server (server/src/plot.ts, table
 * `city_state`) keeps the shared part; each plot carries its own share
 * (`taxWeek`, `titheWeek`, `templeGiven`) and, on every load, the city's
 * running boons (`PlotState.city`, never stored).
 */
import { DAY_MS } from './city'
import { weekStartUtc } from './skills'
import { MATERIAL_INFO, MATERIALS, type Material, type Materials, type PlotState } from './plot'

// ── the house tax (Matt 17:24–27; 22:21) ───────────────────────────────

/** Homesteads pay from this house level on, every week (Monday 00:00 UTC). */
export const TAX_FROM_HOUSE = 3
export const houseTax = (house: number) => (house >= TAX_FROM_HOUSE ? house * house * 4 : 0)
/** The first week anybody owed tax (the week after it came in): nothing is due before. */
export const TAX_START = Date.UTC(2026, 10, 23)
/** Coins due this week (0 when paid or exempt). Unpaid, it only stops the next house level from being started. */
export function taxDue(s: Pick<PlotState, 'levels' | 'taxWeek'>, now: number): number {
  const week = weekStartUtc(now)
  if (week < TAX_START || s.taxWeek === week) return 0
  return houseTax(s.levels.house)
}

// ── the tithe (Mal 3:10; Deut 14:22) ────────────────────────────────────

/** What a tithe takes a tenth of. */
export const TITHE_MATERIALS: readonly Material[] = ['wood', 'bricks', 'wool', 'oil', 'barley', 'wheat', 'bread', 'wine', 'linen', 'honey']
/** The blessing: producers make this much more for a week. */
export const TITHE_BLESSING = 0.15
export const TITHE_MS = 7 * DAY_MS
/** A tithe worth less than this (in Market coins) isn't brought. */
export const TITHE_MIN = 10
export function titheOf(s: Pick<PlotState, 'inventory'>): Materials {
  const out: Materials = {}
  for (const m of TITHE_MATERIALS) {
    const n = Math.floor(s.inventory[m] * 0.1)
    if (n > 0) out[m] = n
  }
  return out
}
export const giftValue = (m: Materials) => MATERIALS.reduce((n, k) => n + (m[k] ?? 0) * MATERIAL_INFO[k].buy, 0)
export type TitheError = 'done' | 'little'
export function titheError(s: Pick<PlotState, 'inventory' | 'titheWeek'>, now: number): TitheError | null {
  if (s.titheWeek === weekStartUtc(now)) return 'done'
  if (giftValue(titheOf(s)) < TITHE_MIN) return 'little'
  return null
}

// ── the Temple (1 Chr 29:2–9; Hag 1:8) ──────────────────────────────────

/** What the city's gifts (in Market coins) raise the Temple to: foundation, walls, Jachin and Boaz, the Holy Place, dedication. */
export const TEMPLE_STAGES = [10_000, 30_000, 60_000, 100_000, 150_000] as const
export const templeStage = (given: number) => TEMPLE_STAGES.filter((n) => given >= n).length
/** House 11 and 12 need a family's own gifts to the Temple (coins' worth, tithes included). */
export const TEMPLE_FOR_HOUSE: Partial<Record<number, number>> = { 11: 3_000, 12: 8_000 }
/** Gifts: any material the Market prices, valued at its buy price. */
export const giftable = (m: Material) => MATERIAL_INFO[m].buy > 0

// ── the city treasury and its projects ──────────────────────────────────

export const PROJECT_IDS = ['feast', 'aqueduct'] as const
export type ProjectId = (typeof PROJECT_IDS)[number]
/** A feast (Deut 16:13–15): producers +25 % for every family for a week. An aqueduct (2 Kgs 20:20): every well +2 water for 30 days. */
export const PROJECTS: Record<ProjectId, { cost: number; ms: number }> = {
  feast: { cost: 1_500, ms: 7 * DAY_MS },
  aqueduct: { cost: 2_500, ms: 30 * DAY_MS },
}
export const FEAST_BOOST = 0.25
export const AQUEDUCT_WATER = 2

/** The city's shared state (one row on the server). */
export interface CityState {
  treasury: number
  temple: number
  feastUntil: number
  aqueductUntil: number
  /** Coins' worth given to the Temple, by username. */
  donors: Record<string, number>
}
export const EMPTY_CITY: CityState = { treasury: 0, temple: 0, feastUntil: 0, aqueductUntil: 0, donors: {} }

/** The treasury pays for what isn't running yet, the feast first. Returns what started. */
export function fundProjects(c: CityState, now: number): ProjectId[] {
  const started: ProjectId[] = []
  for (const id of PROJECT_IDS) {
    const key = id === 'feast' ? 'feastUntil' : 'aqueductUntil'
    if (c[key] > now || c.treasury < PROJECTS[id].cost) continue
    c.treasury -= PROJECTS[id].cost
    c[key] = now + PROJECTS[id].ms
    started.push(id)
  }
  return started
}

/** What a plot is told about the city on every load (never stored with the plot). */
export interface CityBoons {
  treasury: number
  temple: number
  feastUntil: number
  aqueductUntil: number
}

/** Water from the well, with the city's aqueduct while it runs (the plot's clock is its `updatedAt`). */
export const aqueductWater = (s: Pick<PlotState, 'city' | 'updatedAt'>) => (s.city && s.city.aqueductUntil > s.updatedAt ? AQUEDUCT_WATER : 0)
