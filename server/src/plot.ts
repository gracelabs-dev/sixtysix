import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  cleanLocale,
  questionIn,
  BUILDING_IDS,
  MATERIALS,
  MATERIAL_INFO,
  SCROLL_PASS,
  SCROLL_QUESTIONS,
  SPEEDUP_MAX_SHARE,
  SCROLL_COOLDOWN_MS,
  apprenticeCut,
  apprenticeFree,
  builderBuilds,
  builderCount,
  buildFullMs,
  caravanLeft,
  caravanPrice,
  checkRepair,
  resolveThreat,
  rollEvents,
  visitorsError,
  welcomeVisitors,
  THREAT_BOOK,
  THREAT_QUESTIONS,
  VISITORS_BREAD,
  BUILDING_IDS as ALL_BUILDINGS,
  type EventKind,
  type News,
  EMPTY_CITY,
  TITHE_MS,
  fundProjects,
  giftValue,
  giftable,
  taxDue,
  templeStage,
  titheError,
  titheOf,
  weekStartUtc as weekOf,
  type CityState,
  sell,
  WEEKLY_CEDAR,
  advance,
  buyPrice,
  modsOf,
  plotMods,
  scrollCutMs,
  weekStartUtc,
  checkUpgrade,
  collect,
  newPlot,
  giftError,
  isGiftFigure,
  takeGift,
  GIFT_FIGURES,
  GLEAN,
  BUILD_BREAD,
  CROPS,
  DESTINATIONS,
  FEED_BARLEY,
  FIELD_IDS,
  ROAD_QUESTIONS,
  bakeCost,
  bakeError,
  breadCut,
  expeditionError,
  expeditionPlan,
  feedBuilders,
  feedError,
  feedFold,
  giveFirstField,
  glean,
  gleanError,
  harvest,
  isCrop,
  isDestination,
  isField,
  isTrip,
  packShare,
  seedMissing,
  sellable,
  shortOf,
  sow,
  sowError,
  startBake,
  takeBread,
  unload,
  type Bake,
  type Crop,
  type DestinationId,
  type Expedition,
  type FieldId,
  type TripId,
  type Glean,
  type GiftLog,
  type AccountProfile,
  type BuildingId,
  type Material,
  type Materials,
  type PlotState,
  type ScrollQuestion,
  HELP,
  RAID_BOOK,
  RAID_HOUSE,
  RAID_ODDS,
  RAID_QUESTIONS,
  findSheep,
  helpError,
  lendHand,
  raided,
  repel,
  sheepError,
  type DayCount,
  STALL_LIST,
  STALL_MAX,
  stallRange,
  stallToll,
  stallable,
  type StallLot,
} from '@sixtysix/shared'
import { bodyOf, db, idleDaysOf, markActive, saveProfile, toAccount, userByName, userFromRequest, type UserRow } from './accounts.js'
import { pickQuestions, referenceIn, shuffle } from './bank.js'
import { atomic } from './tx.js'

/**
 * My Home in Jerusalem (docs/jerusalem-plot.md): the plot, the Market and the
 * Workers' scroll. Everything that spends coins or materials happens here, on
 * the server; the client only shows the result. Production and finished
 * builds are computed lazily from timestamps on every request (shared/plot.ts).
 */

// The `plots` table (user_id → JSON PlotState) is created in accounts.ts.

const MAX_TRADE = 10_000

// ── load / save ───────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const materials = (v: unknown): Materials => {
  const o = obj(v) ?? {}
  const out: Materials = {}
  for (const m of MATERIALS) if (num(o[m])) out[m] = Math.floor(num(o[m]))
  return out
}
const parseGlean = (v: unknown): Glean | undefined => {
  const o = obj(v)
  return o ? { day: Math.floor(num(o.day)), n: Math.floor(num(o.n)) } : undefined
}

/** Parse a stored plot defensively: unknown keys dropped, missing ones defaulted. */
export function parsePlot(raw: string, now: number): PlotState {
  const base = newPlot(now)
  let p: Partial<PlotState>
  try {
    p = JSON.parse(raw) as Partial<PlotState>
  } catch {
    return base
  }
  for (const b of BUILDING_IDS) base.levels[b] = Math.floor(num(p.levels?.[b], base.levels[b]))
  for (const m of MATERIALS) base.inventory[m] = Math.floor(num(p.inventory?.[m]))
  for (const b of BUILDING_IDS) if (p.stock?.[b] !== undefined) base.stock[b] = num(p.stock[b])
  base.builds = (Array.isArray(p.builds) ? p.builds : [])
    .filter((x) => BUILDING_IDS.includes(x?.building) && Number.isFinite(x.endsAt) && Number.isFinite(x.toLevel))
    .map((x) => ({
      building: x.building, toLevel: x.toLevel, startedAt: num(x.startedAt), endsAt: x.endsAt,
      ...(x.spedMs ? { spedMs: num(x.spedMs) } : {}),
      ...(x.helpMs ? { helpMs: num(x.helpMs) } : {}),
      ...(x.by === 'apprentice' ? { by: 'apprentice' as const } : {}),
      ...(x.repair === true ? { repair: true } : {}),
    }))
  base.updatedAt = num(p.updatedAt, now)
  if (p.boostUntil !== undefined) base.boostUntil = num(p.boostUntil)
  if (p.gifts && typeof p.gifts === 'object') {
    const last: GiftLog['last'] = {}
    for (const f of GIFT_FIGURES) if (p.gifts.last?.[f] !== undefined) last[f] = num(p.gifts.last[f])
    base.gifts = { day: Math.floor(num(p.gifts.day)), n: Math.floor(num(p.gifts.n)), last }
  }
  // The valley and the workers (shared/src/farm.ts).
  const crops = obj(p.crops)
  if (crops) {
    base.crops = {}
    for (const f of FIELD_IDS) {
      const c = obj(crops[f])
      if (c && isCrop(c.crop) && num(c.readyAt)) base.crops[f] = { crop: c.crop, sownAt: num(c.sownAt), readyAt: num(c.readyAt), amount: Math.floor(num(c.amount)), ...(c.raid === true ? { raid: true } : {}) } satisfies Crop
    }
  }
  const bake = obj(p.bake)
  if (bake && isCrop(bake.grain) && num(bake.endsAt))
    base.bake = { grain: bake.grain, amount: Math.floor(num(bake.amount)), bread: Math.floor(num(bake.bread)), startedAt: num(bake.startedAt), endsAt: num(bake.endsAt) } satisfies Bake
  if (p.fedUntil !== undefined) base.fedUntil = num(p.fedUntil)
  if (Array.isArray(p.expeditions)) {
    base.expeditions = p.expeditions.flatMap((e): Expedition[] => {
      const o = obj(e)
      if (!o || typeof o.id !== 'string' || !isDestination(o.dest) || !num(o.endsAt)) return []
      const team: Expedition = { id: o.id, dest: o.dest, workers: Math.floor(num(o.workers)), startedAt: num(o.startedAt), endsAt: num(o.endsAt), right: Math.floor(num(o.right)), haul: materials(o.haul) }
      if (isTrip(o.trip)) team.trip = o.trip
      return [team]
    })
  }
  // What happened to the homestead (shared/src/events.ts).
  const ev = obj(p.events)
  if (ev) {
    const kinds: EventKind[] = ['philistines', 'repelled', 'quake', 'drought', 'locusts', 'fire', 'fireOut', 'visitors', 'caravan', 'rain']
    const news = (Array.isArray(ev.news) ? ev.news : []).flatMap((n): News[] => {
      const o = obj(n)
      if (!o || !kinds.includes(o.kind as EventKind) || !num(o.at)) return []
      const item: News = { id: String(o.id ?? `${o.kind}-${o.at}`).slice(0, 40), kind: o.kind as EventKind, at: num(o.at) }
      if (o.lost) item.lost = materials(o.lost)
      if (Array.isArray(o.hits)) item.hits = o.hits.filter((b): b is BuildingId => ALL_BUILDINGS.includes(b))
      if (ALL_BUILDINGS.includes(o.building as BuildingId)) item.building = o.building as BuildingId
      if (FIELD_IDS.includes(o.field as FieldId)) item.field = o.field as FieldId
      if (MATERIALS.includes(o.material as Material)) item.material = o.material as Material
      if (o.right !== undefined) item.right = Math.floor(num(o.right))
      return [item]
    })
    base.events = { day: Math.floor(num(ev.day)), lastBad: num(ev.lastBad), news: news.slice(0, 8) }
  }
  const dmg = obj(p.damage)
  if (dmg) {
    base.damage = {}
    for (const b of BUILDING_IDS) if (num(dmg[b])) base.damage[b] = num(dmg[b])
  }
  const th = obj(p.threat)
  if (th && num(th.until)) base.threat = { at: num(th.at), until: num(th.until), loot: materials(th.loot), hits: (Array.isArray(th.hits) ? th.hits : []).filter((b): b is BuildingId => BUILDING_IDS.includes(b)) }
  if (num(p.drought)) base.drought = num(p.drought)
  if (num(p.visitors)) base.visitors = num(p.visitors)
  if (num(p.blessUntil)) base.blessUntil = num(p.blessUntil)
  const car = obj(p.caravan)
  if (car && MATERIALS.includes(car.material as Material) && num(car.until)) base.caravan = { material: car.material as Material, until: num(car.until), left: Math.floor(num(car.left)) }
  if (p.rain === true) base.rain = true
  if (num(p.taxWeek)) base.taxWeek = num(p.taxWeek)
  if (num(p.titheWeek)) base.titheWeek = num(p.titheWeek)
  if (num(p.titheUntil)) base.titheUntil = num(p.titheUntil)
  if (num(p.templeGiven)) base.templeGiven = Math.floor(num(p.templeGiven))
  const sold = obj(p.sold)
  if (sold) base.sold = { day: Math.floor(num(sold.day)), n: materials(sold.n) }
  base.glean = parseGlean(p.glean)
  base.gleaned = parseGlean(p.gleaned)
  if (p.fieldGift === true) base.fieldGift = true
  // Round the homestead (shared/src/homeLife.ts).
  if (p.sheepDay !== undefined) base.sheepDay = Math.floor(num(p.sheepDay))
  const count = (v: unknown): DayCount | undefined => {
    const o = obj(v)
    return o ? { day: Math.floor(num(o.day)), n: Math.floor(num(o.n)) } : undefined
  }
  base.help = count(p.help)
  base.helped = count(p.helped)
  if (Array.isArray(p.helpers))
    base.helpers = p.helpers.flatMap((h) => {
      const o = obj(h)
      return o && typeof o.name === 'string' && num(o.at) ? [{ name: o.name.slice(0, 40), at: num(o.at) }] : []
    }).slice(0, 5)
  return base
}

interface Ctx {
  row: UserRow
  profile: AccountProfile
  plot: PlotState
  now: number
}

/** Signed-in user, their profile and plot brought up to now (created with the starter gift on first visit). */
function load(req: FastifyRequest): Ctx | undefined {
  const row = userFromRequest(req)
  if (!row) return undefined
  const now = Date.now()
  const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(row.id) as { state: string } | undefined
  let plot: PlotState
  if (stored) plot = parsePlot(stored.state, now)
  else {
    plot = newPlot(now)
    db.prepare('INSERT INTO plots (user_id, state, created_at) VALUES (?, ?, ?)').run(row.id, JSON.stringify(plot), now)
  }
  const profile = toAccount(row).profile
  // Skill effects (Builder / Steward) for every rule in shared/plot.ts; the app sees them too.
  plot.mods = plotMods(profile.skills?.ranks)
  // The city's feast and aqueduct (shared/src/civic.ts), and its treasury and Temple for the app.
  const city = loadCity()
  plot.city = { treasury: city.treasury, temple: city.temple, feastUntil: city.feastUntil, aqueductUntil: city.aqueductUntil }
  advance(plot, now)
  const ctx = { row, profile, plot, now }
  // The valley opened: homesteads already at House 3 get Field 1 cleared and sown, once.
  const had = plot.fieldGift
  giveFirstField(plot, now)
  // The day's event (shared/src/events.ts): rolled when the family comes, so nobody returns to a ruin.
  const rolled = rollEvents(plot, now)
  if (plot.fieldGift !== had || rolled) savePlot(ctx)
  return ctx
}

function savePlot(c: Ctx): void {
  // mods are recomputed from the skills on every load, the city's boons read from city_state
  const { mods: _derived, city: _city, ...stored } = c.plot
  void _derived
  void _city
  db.prepare('UPDATE plots SET state = ? WHERE user_id = ?').run(JSON.stringify(stored), c.row.id)
}

function save(c: Ctx): void {
  savePlot(c)
  saveProfile(c.row.id, c.profile)
}

/** Where the homestead stands and how long its family has been away (weeds, shared/src/city.ts). */
function home(userId: number, now: number): { lot: number | null; idleDays: number } {
  const r = db.prepare('SELECT lot, last_active, created_at FROM users WHERE id = ?').get(userId) as { lot: number | null; last_active: number | null; created_at: number }
  return { lot: r.lot, idleDays: idleDaysOf(r, now) }
}

const view = (c: Ctx, extra: Record<string, unknown> = {}) => ({
  ok: true,
  plot: c.plot,
  coins: c.profile.coins,
  rev: c.profile.rev,
  now: c.now,
  home: home(c.row.id, c.now),
  ...extra,
})
const fail = (error: string) => ({ ok: false, error })

// ── The city's shared state (one row; shared/src/civic.ts) ──────────────

function loadCity(): CityState {
  const row = db.prepare('SELECT state FROM city_state WHERE id = 1').get() as { state: string } | undefined
  if (!row) return { ...EMPTY_CITY, donors: {} }
  try {
    const p = JSON.parse(row.state) as Partial<CityState>
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
    const donors: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.donors ?? {})) if (n(v)) donors[k.slice(0, 40)] = n(v)
    return { treasury: n(p.treasury), temple: n(p.temple), feastUntil: n(p.feastUntil), aqueductUntil: n(p.aqueductUntil), donors }
  } catch {
    return { ...EMPTY_CITY, donors: {} }
  }
}
function saveCity(city: CityState): void {
  db.prepare('INSERT INTO city_state (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state').run(JSON.stringify(city))
}
/** Coins into the treasury (tax, the gate toll); it pays for a feast or an aqueduct once there is enough. */
function addTreasury(coins: number, now: number): void {
  const city = loadCity()
  city.treasury += coins
  const started = fundProjects(city, now)
  if (started.length) console.log(`[city] the treasury paid for ${started.join(', ')}`)
  saveCity(city)
}
/** A gift to the Temple (coins' worth): the city's total, the family's own, the givers' list. */
function giveTemple(c: Ctx, value: number): void {
  const city = loadCity()
  city.temple += value
  city.donors[c.row.username] = (city.donors[c.row.username] ?? 0) + value
  saveCity(city)
  c.plot.templeGiven = (c.plot.templeGiven ?? 0) + value
  if (c.plot.city) c.plot.city.temple = city.temple
}

type Handler = (c: Ctx, body: Record<string, unknown>) => unknown

/** Auth + load + validation guard: a malformed request gets an error, never a crash. */
function route(app: FastifyInstance, method: 'get' | 'post', path: string, fn: Handler): void {
  app[method](path, (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const c = load(req)
      if (!c) return reply.code(401).send(fail('Signed out'))
      if (method === 'post') markActive(c.row.id) // building tends the home
      return fn(c, bodyOf(req))
    } catch (err) {
      console.error(`[plot] ${path} failed`, err)
      return reply.code(500).send(fail('Something went wrong'))
    }
  })
}

const asMaterial = (v: unknown): Material | undefined => (MATERIALS.includes(v as Material) ? (v as Material) : undefined)
const asBuilding = (v: unknown): BuildingId | undefined => (BUILDING_IDS.includes(v as BuildingId) ? (v as BuildingId) : undefined)
const asQty = (v: unknown): number => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRADE ? n : 0
}

// ── Workers' scroll: pending question sets, in memory ──────────────────

interface PendingScroll {
  id: string
  /** As sent: answers shuffled per scroll, no bank ids. */
  questions: ScrollQuestion[]
  /** Correct position within each shuffled answer list. */
  correct: number[]
  expiresAt: number
}
const scrolls = new Map<number, PendingScroll>()

/** Road questions for a team about to set out (one open set per player, like the scroll). */
interface PendingRoad {
  id: string
  dest: DestinationId
  trip: TripId
  workers: number
  questions: ScrollQuestion[]
  correct: number[]
  expiresAt: number
}
const roads = new Map<number, PendingRoad>()

/** Raiders in a field and a hand lent to a neighbour: their questions (one open set each per player). */
interface PendingRaid {
  id: string
  field: FieldId
  questions: ScrollQuestion[]
  correct: number[]
  expiresAt: number
}
const raids = new Map<number, PendingRaid>()
interface PendingHelp {
  id: string
  owner: number
  questions: ScrollQuestion[]
  correct: number[]
  expiresAt: number
}
const helps = new Map<number, PendingHelp>()
/** Philistines at the gate: their questions (one open set per player). */
interface PendingThreat {
  id: string
  questions: ScrollQuestion[]
  correct: number[]
  expiresAt: number
}
const threats = new Map<number, PendingThreat>()

/** Questions from the bank as sent to a player: answers shuffled, no bank ids. */
function asked(qs: ReturnType<typeof pickQuestions>, locale: ReturnType<typeof cleanLocale>) {
  const correct: number[] = []
  const questions: ScrollQuestion[] = qs.map((q, i) => {
    const order = shuffle([0, 1, 2, 3])
    correct.push(order.indexOf(q.correctIndex))
    const { text, answers } = questionIn(q, locale)
    return { id: String(i), reference: referenceIn(q, locale), text, answers: order.map((k) => answers[k]) as ScrollQuestion['answers'] }
  })
  return { questions, correct }
}

const asField = (v: unknown): FieldId | undefined => (typeof v === 'string' && isField(v as BuildingId) ? (v as FieldId) : undefined)

/** Pay for missing materials (when the player allows it): false when there aren't enough coins. */
function buyShort(c: Ctx, cost: Materials, allowed: boolean, extraCoins = 0): 'ok' | 'materials' | 'coins' {
  const { missing, coins } = shortOf(c.plot, cost)
  if (coins > 0 && !allowed) return 'materials'
  if (c.profile.coins < coins + extraCoins) return 'coins'
  c.profile.coins -= coins
  for (const m of MATERIALS) c.plot.inventory[m] += missing[m] ?? 0
  return 'ok'
}
const shortError = (r: 'materials' | 'coins') => fail(r === 'coins' ? 'Not enough coins' : 'Not enough materials')
/** When each player last answered a scroll (cooldown). */
const lastScroll = new Map<number, number>()
const SCROLL_TTL_MS = 10 * 60_000

// ── The families' stall ────────────────────────────────────────────────

interface StallRow {
  id: number
  user_id: number
  material: string
  qty: number
  price: number
  username: string
}

/** The stall as `meId` sees it: their own lots first, then the newest of everybody else's. */
function stallLots(meId: number): StallLot[] {
  const rows = db
    .prepare('SELECT s.*, u.username FROM stall s JOIN users u ON u.id = s.user_id ORDER BY (s.user_id = ?) DESC, s.created_at DESC LIMIT ?')
    .all(meId, STALL_LIST) as unknown as StallRow[]
  return rows.map((r) => ({ id: r.id, seller: r.username, material: r.material as Material, qty: r.qty, price: r.price, mine: r.user_id === meId }))
}

/** A deleted account's lots go with it (call inside the delete transaction). */
export function dropStallOf(userId: number): void {
  db.prepare('DELETE FROM stall WHERE user_id = ?').run(userId)
}

// ── routes ────────────────────────────────────────────────────────────

export function registerPlotRoutes(app: FastifyInstance): void {
  // Created here, not at module load: this module is part of an import cycle with accounts.ts (`db`).
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_state (id INTEGER PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stall (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      material TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)

  /** The plot (created with the starter gift on the first visit). */
  route(app, 'get', '/api/plot', (c) => {
    savePlot(c) // looking spends nothing: leave the profile (and its rev) alone
    return view(c)
  })

  route(app, 'post', '/api/plot/buy', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    if (!m || !qty) return fail('Unknown material or amount')
    const price = buyPrice(m, qty, modsOf(c.plot))
    if (c.profile.coins < price) return fail('Not enough coins')
    c.profile.coins -= price
    c.plot.inventory[m] += qty
    save(c)
    return view(c)
  })

  route(app, 'post', '/api/plot/sell', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    if (!m || !qty) return fail('Unknown material or amount')
    if (!sellable(m)) return fail('The Market doesn’t buy that')
    if (c.plot.inventory[m] < qty) return fail(`You only have ${c.plot.inventory[m]} ${MATERIAL_INFO[m].name.toLowerCase()}`)
    c.profile.coins += sell(c.plot, m, qty, c.now)
    save(c)
    return view(c)
  })

  // ── The families' stall (shared/src/stall.ts): lots of materials for coins, family to family ──

  route(app, 'get', '/api/plot/stall', (c) => ({ ok: true, lots: stallLots(c.row.id) }))

  /** Put a lot up: the goods leave the storehouse now. */
  route(app, 'post', '/api/plot/stall/offer', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    const price = Number(body.price)
    if (!m || !qty || !stallable(m)) return fail('Unknown material or amount')
    const { min, max } = stallRange(m, qty)
    if (!Number.isInteger(price) || price < min || price > max) return fail('That price is outside what the stall allows')
    if (c.plot.inventory[m] < qty) return fail('Not enough materials')
    const open = db.prepare('SELECT COUNT(*) AS n FROM stall WHERE user_id = ?').get(c.row.id) as { n: number }
    if (open.n >= STALL_MAX) return fail('Your stall is full')
    atomic(() => {
      c.plot.inventory[m] -= qty
      db.prepare('INSERT INTO stall (user_id, material, qty, price, created_at) VALUES (?, ?, ?, ?, ?)').run(c.row.id, m, qty, price, c.now)
      savePlot(c)
    })
    return view(c, { lots: stallLots(c.row.id) })
  })

  /** Buy a lot, or take your own down (`withdraw`). */
  for (const kind of ['buy', 'withdraw'] as const) {
    route(app, 'post', `/api/plot/stall/${kind}`, (c, body) => {
      const lot = db.prepare('SELECT * FROM stall WHERE id = ?').get(Number(body.id) || 0) as unknown as StallRow | undefined
      const m = lot && asMaterial(lot.material)
      const mine = lot?.user_id === c.row.id
      if (!lot || !m || mine !== (kind === 'withdraw')) return { ...fail('That lot is gone'), lots: stallLots(c.row.id) }
      if (kind === 'buy' && c.profile.coins < lot.price) return fail('Not enough coins')
      atomic(() => {
        db.prepare('DELETE FROM stall WHERE id = ?').run(lot.id)
        c.plot.inventory[m] += lot.qty
        if (kind === 'withdraw') return savePlot(c)
        c.profile.coins -= lot.price
        save(c)
        const seller = db.prepare('SELECT * FROM users WHERE id = ?').get(lot.user_id) as unknown as UserRow | undefined
        if (seller) {
          const profile = toAccount(seller).profile
          profile.coins += lot.price - stallToll(lot.price)
          addTreasury(stallToll(lot.price), c.now)
          saveProfile(seller.id, profile)
        }
      })
      return view(c, { lots: stallLots(c.row.id) })
    })
  }

  /** Start the next level. `buyMissing: true` first buys whatever is short at Market prices. */
  route(app, 'post', '/api/plot/upgrade', (c, body) => {
    const b = asBuilding(body.building)
    if (!b) return fail('Unknown building')
    const check = checkUpgrade(c.plot, b)
    if (check.maxed || !check.def || !check.toLevel) return fail('Already at the top level')
    if (check.busy) return fail('Already being built')
    if (!check.reqsMet) return fail(`Needs ${check.reqs.filter((r) => !r.met).map((r) => r.label).join(', ')}`)
    if (!check.freeBuilder) return fail('Your builders are all busy')
    if (check.missingCoins > 0 && body.buyMissing !== true) return fail('Not enough materials')
    // The land's price (fields), and whatever is missing when buying it.
    if (c.profile.coins < check.price + check.missingCoins) return fail('Not enough coins')
    c.profile.coins -= check.price
    if (check.missingCoins > 0) {
      c.profile.coins -= check.missingCoins
      for (const m of MATERIALS) c.plot.inventory[m] += check.missing[m] ?? 0
    }
    for (const m of MATERIALS) c.plot.inventory[m] -= check.cost[m] ?? 0
    const ms = check.minutes * 60_000 // skills applied (Many hands, Quick hands)
    c.plot.builds.push({ building: b, toLevel: check.toLevel, startedAt: c.now, endsAt: c.now + ms, ...(check.byApprentice ? { by: 'apprentice' as const } : {}) })
    advance(c.plot, c.now) // a zero-minute level would finish at once
    save(c)
    return view(c, { spent: check.missingCoins + check.price })
  })

  /** The Apprentice helps a builder: { building } loses APPRENTICE_HELP of its time left. */
  route(app, 'post', '/api/plot/apprentice', (c, body) => {
    const b = asBuilding(body.building)
    const build = c.plot.builds.find((x) => x.building === b)
    if (!build) return fail('That building is not being built')
    if (!modsOf(c.plot).apprentice) return fail('You have no apprentice yet')
    const cut = apprenticeCut(c.plot, build, c.now)
    if (cut <= 0) return fail('Your apprentice is busy')
    build.endsAt -= cut
    build.helpMs = cut
    advance(c.plot, c.now)
    save(c)
    return view(c, { building: build.building, cutMs: cut })
  })

  // ── What happens to the homestead (shared/src/events.ts) ──────────────

  /** Mend a damaged building: { building, buyMissing? }. A builder, or the Apprentice whatever its length. */
  route(app, 'post', '/api/plot/repair', (c, body) => {
    const b = asBuilding(body.building)
    if (!b || !c.plot.damage?.[b]) return fail('Nothing to repair there')
    const check = checkRepair(c.plot, b, builderBuilds(c.plot).length < builderCount(c.plot.levels), apprenticeFree(c.plot))
    if (check.busy) return fail('Already being built')
    if (!check.ok) return fail('Your builders are all busy')
    const paid = buyShort(c, check.cost, body.buyMissing === true)
    if (paid !== 'ok') return shortError(paid)
    for (const m of MATERIALS) c.plot.inventory[m] -= check.cost[m] ?? 0
    c.plot.builds.push({ building: b, toLevel: c.plot.levels[b], startedAt: c.now, endsAt: c.now + check.minutes * 60_000, repair: true, ...(check.byApprentice ? { by: 'apprentice' as const } : {}) })
    advance(c.plot, c.now)
    save(c)
    return view(c)
  })

  /** Philistines at the gate, step 1: { locale } → three questions from 1 Samuel. */
  route(app, 'post', '/api/plot/threat', (c, body) => {
    if (!c.plot.threat) return fail('Nobody is at the gate')
    const open = threats.get(c.row.id)
    if (open && open.expiresAt > c.now) return view(c, { threatId: open.id, questions: open.questions })
    const qs = pickQuestions(THREAT_QUESTIONS, { difficulty: 'mixed', book: THREAT_BOOK })
    const all = qs.length < THREAT_QUESTIONS ? pickQuestions(THREAT_QUESTIONS, { difficulty: 'mixed' }) : qs
    if (all.length < THREAT_QUESTIONS) return fail('No questions available')
    const { questions, correct } = asked(all, cleanLocale(body.locale))
    const pending: PendingThreat = { id: randomBytes(9).toString('base64url'), questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    threats.set(c.row.id, pending)
    return view(c, { threatId: pending.id, questions })
  })

  /** Step 2: { threatId, answers (−1 = skipped) } → they leave with what the answers didn't save. */
  route(app, 'post', '/api/plot/threat/answer', (c, body) => {
    const pending = threats.get(c.row.id)
    if (!pending || pending.id !== body.threatId || pending.expiresAt < c.now) return fail('These questions have expired')
    const answers = Array.isArray(body.answers) ? body.answers : []
    if (answers.length !== THREAT_QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) return fail('Answer all three questions')
    if (!c.plot.threat) return fail('Nobody is at the gate')
    threats.delete(c.row.id)
    const right = pending.correct.filter((ci, i) => answers[i] === ci).length
    const news = resolveThreat(c.plot, right, c.now)
    savePlot(c)
    return view(c, { right, correct: pending.correct, news })
  })

  /** Offer the three visitors bread ({ buyMissing? }): a day's blessing. */
  route(app, 'post', '/api/plot/visitors', (c, body) => {
    if (visitorsError(c.plot, c.now) === 'none') return fail('The visitors have gone on')
    const paid = buyShort(c, { bread: VISITORS_BREAD }, body.buyMissing === true)
    if (paid !== 'ok') return shortError(paid)
    welcomeVisitors(c.plot, c.now)
    save(c)
    return view(c)
  })

  /** Buy from the merchant caravan at half price: { qty }. */
  route(app, 'post', '/api/plot/caravan', (c, body) => {
    const qty = asQty(body.qty)
    const left = caravanLeft(c.plot, c.now)
    if (!left || !c.plot.caravan) return fail('The caravan has moved on')
    if (!qty || qty > left) return fail('Unknown material or amount')
    const price = caravanPrice(c.plot.caravan.material, qty)
    if (c.profile.coins < price) return fail('Not enough coins')
    c.profile.coins -= price
    c.plot.inventory[c.plot.caravan.material] += qty
    c.plot.caravan.left -= qty
    save(c)
    return view(c)
  })

  // ── The city (shared/src/civic.ts) ────────────────────────────────────

  /** Pay this week's house tax into the city treasury. */
  route(app, 'post', '/api/plot/tax', (c) => {
    const due = taxDue(c.plot, c.now)
    if (!due) return fail('Your tax is paid for this week')
    if (c.profile.coins < due) return fail('Not enough coins')
    atomic(() => {
      c.profile.coins -= due
      c.plot.taxWeek = weekOf(c.now)
      addTreasury(due, c.now)
      save(c)
    })
    return view(c, { paid: due })
  })

  /** Bring the week's tithe: a tenth of what the homestead makes, to the Temple; a week's blessing. */
  route(app, 'post', '/api/plot/tithe', (c) => {
    const why = titheError(c.plot, c.now)
    if (why === 'done') return fail('You have brought your tithe this week')
    if (why === 'little') return fail('There is too little to tithe')
    const gift = titheOf(c.plot)
    atomic(() => {
      for (const m of MATERIALS) c.plot.inventory[m] -= gift[m] ?? 0
      c.plot.titheWeek = weekOf(c.now)
      c.plot.titheUntil = c.now + TITHE_MS
      giveTemple(c, giftValue(gift))
      savePlot(c)
    })
    return view(c, { gift })
  })

  /** A gift to the Temple: { material, qty }. */
  route(app, 'post', '/api/plot/temple', (c, body) => {
    const m = asMaterial(body.material)
    const qty = asQty(body.qty)
    if (!m || !qty || !giftable(m)) return fail('Unknown material or amount')
    if (c.plot.inventory[m] < qty) return fail('Not enough materials')
    atomic(() => {
      c.plot.inventory[m] -= qty
      giveTemple(c, giftValue({ [m]: qty }))
      savePlot(c)
    })
    return view(c)
  })

  /** The city's treasury, its feast and aqueduct, the Temple and its givers (anyone may look). */
  app.get('/api/city/state', () => {
    const city = loadCity()
    const donors = Object.entries(city.donors).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, given]) => ({ name, given }))
    return { ok: true, treasury: city.treasury, temple: city.temple, stage: templeStage(city.temple), feastUntil: city.feastUntil, aqueductUntil: city.aqueductUntil, donors }
  })

  /** Collect one producer (`building`) or all of them. */
  route(app, 'post', '/api/plot/collect', (c, body) => {
    const only = body.building === undefined ? undefined : asBuilding(body.building)
    if (body.building !== undefined && !only) return fail('Unknown building')
    const collected: Materials = only === 'bake' ? {} : collect(c.plot, only)
    // "Collect all" (or the Bakehouse) also takes out baked bread.
    if (!only || only === 'bake') {
      const bread = takeBread(c.plot, c.now)
      if (bread) collected.bread = bread
    }
    save(c)
    return view(c, { collected })
  })

  // ── the valley (shared/src/farm.ts) ─────────────────────────────────

  /** Sow a field: { field, crop, buyMissing? } (the seed can be bought at the Market). */
  route(app, 'post', '/api/plot/sow', (c, body) => {
    const field = asField(body.field)
    if (!field || !isCrop(body.crop)) return fail('Unknown field or crop')
    const why = sowError(c.plot, field)
    if (why === 'notCleared') return fail('Clear the field first')
    if (why === 'growing') return fail('Something is already growing there')
    const paid = buyShort(c, { [body.crop]: CROPS[body.crop].seed }, body.buyMissing === true)
    if (paid !== 'ok') return shortError(paid)
    const crop = sow(c.plot, field, body.crop, c.now)
    // Now and then raiders will come for this harvest (Judg 6): decided here, shown when it ripens.
    if (c.plot.levels.house >= RAID_HOUSE && Math.random() * RAID_ODDS < 1) crop.raid = true
    save(c)
    return view(c)
  })

  /** Bring in one ripe field ({ field }) or all of them. */
  route(app, 'post', '/api/plot/harvest', (c, body) => {
    const field = body.field === undefined ? undefined : asField(body.field)
    if (body.field !== undefined && !field) return fail('Unknown field')
    const collected = harvest(c.plot, c.now, field)
    if (!Object.keys(collected).length) return fail(field && raided(c.plot.crops?.[field], c.now) ? 'Raiders are in that field — drive them off first' : 'Nothing is ripe yet')
    savePlot(c) // materials only
    return view(c, { collected })
  })

  /** Put a batch in the Bakehouse: { grain, amount, buyMissing? }. */
  route(app, 'post', '/api/plot/bake', (c, body) => {
    if (!isCrop(body.grain)) return fail('Unknown grain')
    const amount = Number(body.amount)
    const why = bakeError(c.plot, amount)
    if (why === 'notBuilt') return fail('Build the Bakehouse first')
    if (why === 'busy') return fail('The oven is busy')
    if (why === 'amount') return fail('That batch doesn’t fit the oven')
    const paid = buyShort(c, bakeCost(body.grain, amount).cost, body.buyMissing === true)
    if (paid !== 'ok') return shortError(paid)
    startBake(c.plot, body.grain, amount, c.now)
    save(c)
    return view(c)
  })

  /** Barley for the flock ({ target: 'fold' }) or bread for the builders ({ target: 'build', building }). */
  route(app, 'post', '/api/plot/feed', (c, body) => {
    if (body.target === 'fold') {
      const why = feedError(c.plot, c.now)
      if (why === 'noFold') return fail('Build the sheepfold first')
      if (why === 'full') return fail('The flock has had enough for now')
      const paid = buyShort(c, { barley: FEED_BARLEY }, body.buyMissing === true)
      if (paid !== 'ok') return shortError(paid)
      feedFold(c.plot, c.now)
      save(c)
      return view(c)
    }
    if (body.target === 'build') {
      const b = asBuilding(body.building)
      const build = c.plot.builds.find((x) => x.building === b)
      if (!build) return fail('That building is not being built')
      if (breadCut(build, c.now) <= 0) return fail('The builders can’t go any faster')
      const paid = buyShort(c, { bread: BUILD_BREAD }, body.buyMissing === true)
      if (paid !== 'ok') return shortError(paid)
      const cutMs = feedBuilders(c.plot, build, c.now)
      advance(c.plot, c.now)
      save(c)
      return view(c, { building: build.building, cutMs })
    }
    return fail('Feed whom?')
  })

  /**
   * Expeditions, step 1: { dest, trip?, workers, locale } → three road questions from
   * the destination's book. Nothing is paid yet. One open set per player.
   */
  route(app, 'post', '/api/plot/expedition', (c, body) => {
    if (!isDestination(body.dest) || (body.trip !== undefined && !isTrip(body.trip))) return fail('Unknown destination')
    const trip: TripId = body.trip ?? 'short'
    const workers = Number(body.workers)
    const why = expeditionError(c.plot, body.dest, workers)
    if (why === 'house') return fail('Your house isn’t big enough to hire for that yet')
    if (why === 'count') return fail('That many workers can’t go there')
    if (why === 'workers') return fail('Not enough free workers')
    const open = roads.get(c.row.id)
    if (open && open.expiresAt > c.now && open.dest === body.dest && open.trip === trip && open.workers === workers) return view(c, { roadId: open.id, questions: open.questions })
    const qs = pickQuestions(ROAD_QUESTIONS, { difficulty: 'mixed', book: DESTINATIONS[body.dest].book })
    // A book without enough questions: any questions will do.
    const all = qs.length < ROAD_QUESTIONS ? pickQuestions(ROAD_QUESTIONS, { difficulty: 'mixed' }) : qs
    if (all.length < ROAD_QUESTIONS) return fail('No questions available')
    const { questions, correct } = asked(all, cleanLocale(body.locale))
    const pending: PendingRoad = { id: randomBytes(9).toString('base64url'), dest: body.dest, trip, workers, questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    roads.set(c.row.id, pending)
    return view(c, { roadId: pending.id, questions })
  })

  /** Step 2: { roadId, answers (−1 = skipped), buyMissing? } → wages and provisions paid, the team sets out. */
  route(app, 'post', '/api/plot/expedition/start', (c, body) => {
    const pending = roads.get(c.row.id)
    if (!pending || pending.id !== body.roadId || pending.expiresAt < c.now) return fail('These questions have expired')
    const answers = Array.isArray(body.answers) ? body.answers : []
    if (answers.length !== ROAD_QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) return fail('Answer all three questions')
    const why = expeditionError(c.plot, pending.dest, pending.workers)
    if (why) return fail('Not enough free workers')
    const right = pending.correct.filter((ci, i) => answers[i] === ci).length
    // The Stable as it stands now: its animals' share and their barley.
    const plan = expeditionPlan(pending.dest, pending.workers, { trip: pending.trip, right, pack: packShare(c.plot) })
    const paid = buyShort(c, plan.provisions, body.buyMissing === true, plan.wages)
    if (paid !== 'ok') return shortError(paid)
    roads.delete(c.row.id) // one use per set
    c.profile.coins -= plan.wages
    for (const m of MATERIALS) c.plot.inventory[m] -= plan.provisions[m] ?? 0
    const e: Expedition = {
      id: randomBytes(6).toString('base64url'),
      dest: pending.dest,
      trip: pending.trip,
      workers: pending.workers,
      startedAt: c.now,
      endsAt: c.now + plan.minutes * 60_000,
      right,
      haul: plan.haul,
    }
    c.plot.expeditions = [...(c.plot.expeditions ?? []), e]
    save(c)
    return view(c, { right, correct: pending.correct, references: pending.questions.map((q) => q.reference), expedition: e.id })
  })

  /** A team is back: { id } → its haul into the inventory. */
  route(app, 'post', '/api/plot/expedition/unload', (c, body) => {
    const got = typeof body.id === 'string' ? unload(c.plot, body.id, c.now) : null
    if (!got) return fail('That team isn’t back yet')
    savePlot(c)
    return view(c, { collected: got })
  })

  /** Gleaning (Ruth 2): { username } → a little barley for you and for them, once a day. */
  route(app, 'post', '/api/plot/glean', (c, body) => {
    const owner = typeof body.username === 'string' ? userByName(body.username) : undefined
    if (!owner) return fail('No such player')
    if (owner.id === c.row.id) return fail('These are your own fields')
    const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(owner.id) as { state: string } | undefined
    if (!stored) return fail('They have no fields yet')
    const theirs = parsePlot(stored.state, c.now)
    const why = gleanError(c.plot, theirs, c.now)
    if (why === 'noFields') return fail('They have no fields yet')
    if (why === 'visitorDone') return fail('You have gleaned enough for today')
    if (why === 'ownerFull') return fail('Their fields have had enough gleaners today')
    glean(c.plot, theirs, c.now)
    // Their plot is written as stored, only with the barley and the count added (no production run).
    db.prepare('UPDATE plots SET state = ? WHERE user_id = ?').run(JSON.stringify(theirs), owner.id)
    savePlot(c)
    return view(c, { collected: { barley: GLEAN.visitor } })
  })

  // ── round the homestead (shared/src/homeLife.ts) ─────────────────────

  /** The lost sheep, found in the hills (once a UTC day): wool. */
  route(app, 'post', '/api/plot/sheep', (c) => {
    const why = sheepError(c.plot, c.now)
    if (why === 'noFold') return fail('You have no sheep yet')
    if (why === 'found') return fail('Today’s sheep is already home')
    const got = findSheep(c.plot, c.now)
    savePlot(c)
    return view(c, { collected: got })
  })

  /** Raiders in a ripe field, step 1: { field, locale } → three questions from Judges. */
  route(app, 'post', '/api/plot/raid', (c, body) => {
    const field = asField(body.field)
    if (!field || !raided(c.plot.crops?.[field], c.now)) return fail('No raiders there')
    const open = raids.get(c.row.id)
    if (open && open.expiresAt > c.now && open.field === field) return view(c, { raidId: open.id, questions: open.questions })
    const qs = pickQuestions(RAID_QUESTIONS, { difficulty: 'mixed', book: RAID_BOOK })
    const all = qs.length < RAID_QUESTIONS ? pickQuestions(RAID_QUESTIONS, { difficulty: 'mixed' }) : qs
    if (all.length < RAID_QUESTIONS) return fail('No questions available')
    const { questions, correct } = asked(all, cleanLocale(body.locale))
    const pending: PendingRaid = { id: randomBytes(9).toString('base64url'), field, questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    raids.set(c.row.id, pending)
    return view(c, { raidId: pending.id, questions })
  })

  /** Step 2: { raidId, answers (−1 = skipped) } → the raiders leave with their share, the rest is harvested. */
  route(app, 'post', '/api/plot/raid/answer', (c, body) => {
    const pending = raids.get(c.row.id)
    if (!pending || pending.id !== body.raidId || pending.expiresAt < c.now) return fail('These questions have expired')
    const answers = Array.isArray(body.answers) ? body.answers : []
    if (answers.length !== RAID_QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) return fail('Answer all three questions')
    if (!raided(c.plot.crops?.[pending.field], c.now)) return fail('No raiders there')
    raids.delete(c.row.id)
    const right = pending.correct.filter((ci, i) => answers[i] === ci).length
    const lost = repel(c.plot, pending.field, right)
    const collected = harvest(c.plot, c.now, pending.field)
    savePlot(c)
    return view(c, { right, correct: pending.correct, lost, collected })
  })

  /** Lending a neighbour a hand, step 1: { username, locale } → one question. */
  route(app, 'post', '/api/plot/help', (c, body) => {
    const owner = typeof body.username === 'string' ? userByName(body.username) : undefined
    if (!owner) return fail('No such player')
    if (owner.id === c.row.id) return fail('This is your own home')
    const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(owner.id) as { state: string } | undefined
    if (!stored) return fail('They have not started building yet')
    const why = helpError(c.plot, parsePlot(stored.state, c.now), c.now)
    if (why === 'visitorDone') return fail('You have lent enough hands for today')
    if (why === 'ownerFull') return fail('They have had enough helpers today')
    const open = helps.get(c.row.id)
    if (open && open.expiresAt > c.now && open.owner === owner.id) return view(c, { helpId: open.id, questions: open.questions })
    const qs = pickQuestions(1, { difficulty: 'mixed' })
    if (!qs.length) return fail('No questions available')
    const { questions, correct } = asked(qs, cleanLocale(body.locale))
    const pending: PendingHelp = { id: randomBytes(9).toString('base64url'), owner: owner.id, questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    helps.set(c.row.id, pending)
    return view(c, { helpId: pending.id, questions })
  })

  /** Step 2: { helpId, answer } → right: time off their longest build (or a little stone for them), stone for you. */
  route(app, 'post', '/api/plot/help/answer', (c, body) => {
    const pending = helps.get(c.row.id)
    if (!pending || pending.id !== body.helpId || pending.expiresAt < c.now) return fail('This question has expired')
    if (!Number.isInteger(body.answer) || (body.answer as number) < -1 || (body.answer as number) > 3) return fail('Pick an answer')
    const stored = db.prepare('SELECT state FROM plots WHERE user_id = ?').get(pending.owner) as { state: string } | undefined
    if (!stored) return fail('They have not started building yet')
    const theirs = parsePlot(stored.state, c.now)
    if (helpError(c.plot, theirs, c.now)) return fail('They have had enough helpers today')
    helps.delete(c.row.id)
    const right = body.answer === pending.correct[0]
    const done = lendHand(c.plot, theirs, c.row.username, right, c.now)
    // Their plot is written as stored, with the help added (no production run), like gleaning.
    if (right) db.prepare('UPDATE plots SET state = ? WHERE user_id = ?').run(JSON.stringify(theirs), pending.owner)
    savePlot(c)
    return view(c, { right, correct: pending.correct[0], cutMs: done.cutMs, building: done.building, collected: done.stone ? { stone: done.stone } : {} })
  })

  /**
   * Workers' scroll, step 1: three questions (without answers) while something
   * is being built. One open scroll per player: asking again returns the same
   * questions, so they can't be rerolled until answered or expired.
   */
  route(app, 'post', '/api/plot/scroll', (c, body) => {
    const locale = cleanLocale(body.locale)
    if (c.plot.builds.length === 0) return fail('Nothing is being built')
    const open = scrolls.get(c.row.id)
    if (open && open.expiresAt > c.now) return view(c, { scrollId: open.id, questions: open.questions })
    const wait = (lastScroll.get(c.row.id) ?? 0) + SCROLL_COOLDOWN_MS - c.now
    if (wait > 0) return fail(`The workers are resting — next scroll in ${Math.ceil(wait / 1000)} s`)
    const qs = pickQuestions(SCROLL_QUESTIONS, { difficulty: 'mixed' })
    if (qs.length < SCROLL_QUESTIONS) return fail('No questions available')
    const { questions, correct } = asked(qs, locale)
    const pending: PendingScroll = { id: randomBytes(9).toString('base64url'), questions, correct, expiresAt: c.now + SCROLL_TTL_MS }
    scrolls.set(c.row.id, pending)
    return view(c, { scrollId: pending.id, questions })
  })

  /** Step 2: check the answers; with SCROLL_PASS right, the chosen (or soonest) build loses five minutes. */
  route(app, 'post', '/api/plot/scroll/answer', (c, body) => {
    const pending = scrolls.get(c.row.id)
    if (!pending || pending.id !== body.scrollId || pending.expiresAt < c.now) return fail('This scroll has expired')
    const answers = Array.isArray(body.answers) ? body.answers : []
    if (answers.length !== SCROLL_QUESTIONS || !answers.every((a) => Number.isInteger(a) && a >= -1 && a <= 3)) {
      return fail('Answer all three questions')
    }
    scrolls.delete(c.row.id) // one use per scroll
    lastScroll.set(c.row.id, c.now)
    const right = pending.correct.filter((ci, i) => answers[i] === ci).length
    const passed = right >= SCROLL_PASS
    let target: BuildingId | undefined
    let cutMs = 0
    if (passed) {
      const wanted = asBuilding(body.building)
      const build = c.plot.builds.find((x) => x.building === wanted) ?? [...c.plot.builds].sort((a, b) => a.endsAt - b.endsAt)[0]
      if (build) {
        // Never more than SPEEDUP_MAX_SHARE of the build's full time in total.
        const sped = build.spedMs ?? 0
        const full = buildFullMs(build)
        const cut = Math.max(0, Math.min(scrollCutMs(modsOf(c.plot)), full * SPEEDUP_MAX_SHARE - sped, build.endsAt - c.now))
        build.endsAt -= cut
        build.spedMs = sped + cut
        cutMs = cut
        target = build.building
        advance(c.plot, c.now)
        save(c)
      }
    }
    return view(c, { right, passed, building: target, cutMs, correct: pending.correct, references: pending.questions.map((q) => q.reference) })
  })

  /**
   * A carrier in the yard hands over what they carry (shared/src/life.ts):
   * { figure }. Capped per day and per carrier; only on your own plot.
   */
  route(app, 'post', '/api/plot/gift', (c, body) => {
    if (!isGiftFigure(body.figure)) return fail('Unknown figure')
    const why = giftError(c.plot, body.figure, c.now)
    if (why === 'absent') return fail('Nobody like that lives here yet')
    if (why === 'daily') return fail('That’s all the gifts for today')
    if (why === 'cooldown') return fail('They have nothing left to give — come back later')
    const got = takeGift(c.plot, body.figure, c.now)
    savePlot(c) // materials only: the coins (and the profile's rev) stay as they are
    return view(c, { collected: { [got.material]: got.qty } })
  })

  // ── weekly skill perks (the week's use is kept in profile.skills) ────

  /** Cedar from Lebanon: WEEKLY_CEDAR free cedar, once per week (Monday 00:00 UTC). */
  route(app, 'post', '/api/plot/cedar', (c) => {
    const skills = c.profile.skills
    if (!skills || !modsOf(c.plot).weeklyCedar) return fail('Learn Cedar from Lebanon first')
    const week = weekStartUtc(c.now)
    if (skills.cedarWeek === week) return fail('Already collected this week')
    skills.cedarWeek = week
    c.plot.inventory.cedar += WEEKLY_CEDAR
    save(c)
    return view(c, { collected: { cedar: WEEKLY_CEDAR } })
  })

  /** Master builder: finish one build now, once per week. { building } or the one that ends last. */
  route(app, 'post', '/api/plot/instant', (c, body) => {
    const skills = c.profile.skills
    if (!skills || !modsOf(c.plot).masterBuilder) return fail('Learn Master builder first')
    const week = weekStartUtc(c.now)
    if (skills.masterWeek === week) return fail('Already used this week')
    const wanted = asBuilding(body.building)
    if (body.building !== undefined && !wanted) return fail('Unknown building')
    const build = wanted ? c.plot.builds.find((x) => x.building === wanted) : [...c.plot.builds].sort((a, b) => b.endsAt - a.endsAt)[0]
    if (!build) return fail(wanted ? 'That building is not being built' : 'Nothing is being built')
    skills.masterWeek = week
    build.endsAt = c.now
    advance(c.plot, c.now)
    save(c)
    return view(c, { building: build.building, toLevel: build.toLevel })
  })
}

// ── public: building levels for the city and player pages ─────────────

const plotStmt = () => db.prepare('SELECT state FROM plots WHERE user_id = ?')

/** A player's building levels (finished builds applied), or null when they never opened My Home. */
export function publicLevels(userId: number): Record<BuildingId, number> | null {
  const row = plotStmt().get(userId) as { state: string } | undefined
  if (!row) return null
  const now = Date.now()
  const plot = parsePlot(row.state, now)
  advance(plot, now)
  return plot.levels
}

/** House and wall level per user id for the city (1 = tent, 0 = no fence; also for players without a plot). */
export function cityLevels(): Map<number, { house: number; wall: number }> {
  const now = Date.now()
  const out = new Map<number, { house: number; wall: number }>()
  for (const r of db.prepare('SELECT user_id, state FROM plots').all() as unknown as { user_id: number; state: string }[]) {
    const plot = parsePlot(r.state, now)
    // Only finished builds count; no need to run production here.
    for (const b of plot.builds) if (b.endsAt <= now) plot.levels[b.building] = Math.max(plot.levels[b.building], b.toLevel)
    out.set(r.user_id, { house: plot.levels.house, wall: plot.levels.wall })
  }
  return out
}
