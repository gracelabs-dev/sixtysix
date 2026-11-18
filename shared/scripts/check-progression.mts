/**
 * Checks the house ladder (docs/jerusalem-progression.md §3) for dead ends:
 * every house level's requirements can be built before it (their own house
 * level is lower), and the water they use fits the best well the player can
 * have by then — even with every field irrigated as far as that house allows.
 * Run after changing levels, needs or water in shared/src/plot.ts:
 *
 *   npx tsx shared/scripts/check-progression.mts
 */
import { BUILDINGS, BUILDING_IDS, WATER_USERS, levelDef, maxLevel, type BuildingId } from '../src/index'

/** The house level a building level can first be built at, following its needs (and its own lower levels). */
const memo = new Map<string, number>()
function houseOf(b: BuildingId, lv: number): number {
  if (lv <= 0) return 1
  const key = `${b}${lv}`
  if (!memo.has(key)) {
    const d = levelDef(b, lv)!
    let h = b === 'house' ? lv : Math.max(1, houseOf(b, lv - 1))
    for (const [r, n] of Object.entries(d.needs) as [BuildingId, number][]) h = Math.max(h, r === 'house' ? n : houseOf(r, n))
    memo.set(key, h)
  }
  return memo.get(key)!
}
let fail = false
const bad = (msg: string) => {
  fail = true
  console.log('✗', msg)
}

// What every house level so far required (it stays built).
const needs: Partial<Record<BuildingId, number>> = {}
for (let h = 2; h <= maxLevel('house'); h++) {
  for (const [b, lv] of Object.entries(levelDef('house', h)!.needs) as [BuildingId, number][]) needs[b] = Math.max(needs[b] ?? 0, lv)
  // Everything the player may have built while at House h−1: the required levels at least, the rest as high as allowed.
  const have = Object.fromEntries(
    BUILDING_IDS.map((b) => {
      let n = 0
      BUILDINGS[b].levels.forEach((_, i) => {
        if (houseOf(b, i + 1) <= h - 1) n = i + 1
      })
      return [b, n]
    }),
  ) as Record<BuildingId, number>
  for (const [b, lv] of Object.entries(needs) as [BuildingId, number][]) {
    if (lv > maxLevel(b)) bad(`House ${h} needs ${b} ${lv}, but its top is ${maxLevel(b)}`)
    else if (houseOf(b, lv) >= h) bad(`House ${h} needs ${b} ${lv}, which itself needs House ${houseOf(b, lv)}`)
  }
  // Water: the required levels, every other water user at its most (fields irrigated), against the best well by then.
  const supply = levelDef('well', have.well)?.water ?? 0
  const used = WATER_USERS.reduce((n, b) => n + (levelDef(b, Math.max(needs[b] ?? 0, isOptional(b) ? have[b] : needs[b] ?? 0))?.water ?? 0), 0)
  const line = `House ${h}: water ${used}/${supply} (well ${have.well})`
  if (used > supply) bad(`${line}: the required buildings and irrigated fields need more water than the well gives`)
  else console.log('✓', line)
}
// Producers are only built as far as needed; fields are often irrigated, so count them in full.
function isOptional(b: BuildingId) {
  return b.startsWith('field')
}
if (fail) process.exit(1)
console.log('House ladder ok.')
