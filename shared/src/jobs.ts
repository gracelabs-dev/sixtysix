/**
 * Work in the city (docs/jerusalem-progression.md §7, §9.5): a job is a
 * daily shift of questions from its part of the Bible, paid in coins and a
 * little material; the governor is the top job, hard to get, well paid, with
 * a few powers over the city. The server (server/src/plot.ts) runs the
 * shifts and the governor's seat (in `city_state`).
 */
import { DAY_MS } from './city'
import { levelForXp } from './skills'
import type { Materials, PlotState } from './plot'

export const JOB_IDS = ['scribe', 'gatekeeper', 'shepherd', 'watercarrier', 'taxman', 'messenger'] as const
export type JobId = (typeof JOB_IDS)[number]
export const isJob = (v: unknown): v is JobId => (JOB_IDS as readonly unknown[]).includes(v)

export interface JobDef {
  icon: string
  verse: string
  /** The bank's category the shift's questions come from. */
  category: 'torah' | 'history' | 'wisdom' | 'prophets' | 'gospels' | 'epistles'
  /** A little material per right answer, beside the coins. */
  bonus: Materials
}
export const JOBS: Record<JobId, JobDef> = {
  scribe: { icon: '📜', verse: 'Ezra 7:6', category: 'torah', bonus: { linen: 1 } },
  gatekeeper: { icon: '🚪', verse: 'Neh 7:1', category: 'history', bonus: { stone: 3 } },
  shepherd: { icon: '🐑', verse: 'Ps 23:1', category: 'wisdom', bonus: { wool: 2 } },
  watercarrier: { icon: '🏺', verse: 'Josh 9:21', category: 'prophets', bonus: { bricks: 4 } },
  taxman: { icon: '🪙', verse: 'Luke 19:2', category: 'gospels', bonus: { oil: 1 } },
  messenger: { icon: '✉️', verse: 'Rom 10:15', category: 'epistles', bonus: { wood: 4 } },
}

/** Jobs open from this house level; one shift a UTC day; a new job at most once a week. */
export const JOB_HOUSE = 5
export const SHIFT_QUESTIONS = 5
/** Coins per right answer in a shift (the governor earns GOVERNOR.payFactor × this). */
export const SHIFT_PAY = 6
/** A shift counts as worked with this many right. */
export const SHIFT_PASS = 3
export const JOB_SWITCH_MS = 7 * DAY_MS

export interface JobState {
  id: JobId
  /** When this job was taken (switching waits JOB_SWITCH_MS). */
  since: number
  /** UTC day of the last shift. */
  day: number
  /** Shifts worked (passed) in all jobs, ever: the governor needs GOVERNOR.shifts. */
  shifts: number
  /** UTC week (Monday ms) of the last governor's exam. */
  examWeek?: number
}

const day = (now: number) => Math.floor(now / DAY_MS)

export type JobError = 'house' | 'switch'
export function takeJobError(s: Pick<PlotState, 'levels' | 'job'>, id: JobId, now: number): JobError | null {
  if (s.levels.house < JOB_HOUSE) return 'house'
  if (s.job && s.job.id !== id && now - s.job.since < JOB_SWITCH_MS) return 'switch'
  return null
}
export type ShiftError = 'noJob' | 'done'
export function shiftError(s: Pick<PlotState, 'job'>, now: number): ShiftError | null {
  if (!s.job) return 'noJob'
  if (s.job.day === day(now)) return 'done'
  return null
}
/** What a shift with `right` answers pays. */
export function shiftPay(id: JobId, right: number, governor: boolean) {
  const coins = right * SHIFT_PAY * (governor ? GOVERNOR.payFactor : 1)
  const goods: Materials = {}
  for (const [m, n] of Object.entries(JOBS[id].bonus)) goods[m as keyof Materials] = (n ?? 0) * right
  return { coins, goods }
}

// ── the governor (Neh 5:14) ─────────────────────────────────────────────

export const GOVERNOR = {
  house: 10,
  level: 30,
  shifts: 50,
  fee: 2_000,
  examQuestions: 10,
  examPass: 9,
  termMs: 28 * DAY_MS,
  payFactor: 5,
  /** Every week in office: a stipend for the governor's house. */
  stipend: { cedar: 5, gold: 1 } as Materials,
  /** The gate toll the governor may set, and how often a feast may be declared. */
  tollMin: 0.05,
  tollMax: 0.15,
  feastEveryMs: 28 * DAY_MS,
}

/** Why this family can't sit the governor's exam now (null: it may). */
export type GovernorError = 'house' | 'level' | 'shifts' | 'coins' | 'week' | 'already'
export function governorError(s: Pick<PlotState, 'levels' | 'job'>, xp: number, coins: number, week: number, isGovernor: boolean): GovernorError | null {
  if (isGovernor) return 'already'
  if (s.levels.house < GOVERNOR.house) return 'house'
  if (levelForXp(xp) < GOVERNOR.level) return 'level'
  if ((s.job?.shifts ?? 0) < GOVERNOR.shifts) return 'shifts'
  if (coins < GOVERNOR.fee) return 'coins'
  if (s.job?.examWeek === week) return 'week'
  return null
}

/** The seat, kept in the city's state. */
export interface GovernorSeat {
  username: string
  since: number
  until: number
  /** Weeks (Monday ms) the stipend was paid for. */
  paidWeek?: number
  /** Last feast declared. */
  feastAt?: number
}
