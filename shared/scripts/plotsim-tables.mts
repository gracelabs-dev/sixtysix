/** Prints plotsim.py's tables (docs/balance/plotsim_tables.py) from the game's own numbers in shared/src/plot.ts. */
import { BUILDINGS, BUILDING_IDS, MATERIAL_INFO, MATERIALS } from '../src/index.ts'
const py = (o: Record<string, unknown>) => '{' + Object.entries(o).map(([k, v]) => `'${k}': ${typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `(${v.map((x) => (typeof x === 'string' ? `'${x}'` : x)).join(', ')})` : v}`).join(', ') + '}'
const out: string[] = []
out.push('PRICE = dict(' + MATERIALS.map((m) => `${m}=${MATERIAL_INFO[m].buy}`).join(', ') + ')')
out.push('SELL = dict(' + MATERIALS.filter((m) => MATERIAL_INFO[m].sell).map((m) => `${m}=${MATERIAL_INFO[m].sell}`).join(', ') + ')  # the rest is never sold')
out.push('# name: levels in order; each = (materials, build hours, requirements, effects). Generated from shared/src/plot.ts.')
out.push('B = {')
for (const b of BUILDING_IDS) {
  out.push(` '${b}': [`)
  for (const l of BUILDINGS[b].levels) {
    const fx: Record<string, unknown> = {}
    if (l.make) fx.make = [l.make.material, l.make.perHour]
    if (l.water) fx.water = l.water
    if (l.cap) fx.cap = l.cap
    if (l.price !== undefined) fx.price = l.price
    if (l.yield) fx.field = l.yield
    if (l.grainBonus !== undefined) fx.grain = l.grainBonus
    if (l.batch) fx.bake = [l.batch.grain, l.batch.minutes / 60]
    if (l.pack) fx.pack = l.pack
    out.push(`  (${py(l.cost as Record<string, unknown>)}, ${+(l.minutes / 60).toFixed(3)}, ${py(l.needs as Record<string, unknown>)}, ${py(fx)}),`)
  }
  out.push(' ],')
}
out.push('}')
console.log(out.join('\n'))
