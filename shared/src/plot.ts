/**
 * My Home in Jerusalem (docs/jerusalem-plot.md): buildings, materials, the
 * Market and the rules of the plot. The numbers are ported 1:1 from
 * docs/balance/plotsim.py (dict `B` and `PRICE`); change them there and here
 * together. The server is the authority (server/src/plot.ts); the app uses the
 * same functions to project timers and production between requests.
 *
 * Skill-tree effects (Builder and Steward paths) arrive as PlotMods
 * (shared/skills.ts): the server puts the owner's mods on the plot it loads
 * (`PlotState.mods`), and every rule below reads them from there.
 */
import { NO_MODS, SEVEN_YEARS_MS, type PlotMods } from './skills'
import type { GiftLog } from './life'
import type { Bake, Crop, Expedition, Glean } from './farm'
import type { DayCount, Helper } from './homeLife'
import { AQUEDUCT_WATER, FEAST_BOOST, TEMPLE_FOR_HOUSE, TITHE_BLESSING, taxDue, type CityBoons } from './civic'

export const MATERIALS = ['wood', 'bricks', 'stone', 'wool', 'oil', 'cedar', 'gold', 'barley', 'wheat', 'bread', 'copper', 'wine', 'linen', 'tools', 'honey'] as const
export type Material = (typeof MATERIALS)[number]
export type Materials = Partial<Record<Material, number>>

/**
 * Market prices. `sell: 0` can't be sold: grain, bread, copper and what the
 * late buildings make only ever become buildings (docs/jerusalem-expansion.md §3.4).
 */
export const MATERIAL_INFO: Record<Material, { name: string; icon: string; buy: number; sell: number }> = {
  wood: { name: 'Wood', icon: '🪵', buy: 4, sell: 2 },
  bricks: { name: 'Bricks', icon: '🧱', buy: 3, sell: 1 },
  stone: { name: 'Stone', icon: '🪨', buy: 5, sell: 2 },
  wool: { name: 'Wool', icon: '🧶', buy: 6, sell: 3 },
  oil: { name: 'Olive oil', icon: '🫙', buy: 8, sell: 4 },
  cedar: { name: 'Cedar of Lebanon', icon: '🌲', buy: 30, sell: 15 },
  gold: { name: 'Gold', icon: '✨', buy: 80, sell: 40 },
  // Barley costs half as much as wheat (2 Kgs 7:1).
  barley: { name: 'Barley', icon: '🌾', buy: 1, sell: 0 },
  wheat: { name: 'Wheat', icon: '🌻', buy: 2, sell: 0 },
  bread: { name: 'Bread', icon: '🍞', buy: 3, sell: 0 },
  copper: { name: 'Copper', icon: '🔶', buy: 15, sell: 0 },
  // Made by the buildings that open from House 7 (docs/jerusalem-progression.md §9).
  wine: { name: 'Wine', icon: '🍷', buy: 8, sell: 0 },
  linen: { name: 'Linen', icon: '🧵', buy: 10, sell: 0 },
  tools: { name: 'Tools', icon: '🔨', buy: 14, sell: 0 },
  honey: { name: 'Honey', icon: '🍯', buy: 6, sell: 0 },
}
/** What the buildings from House 7 make (never sold either). */
export const LATE_MATERIALS: readonly Material[] = ['wine', 'linen', 'tools', 'honey']
/** Materials the Market buys back. */
export const sellable = (m: Material) => MATERIAL_INFO[m].sell > 0

export const FIELD_IDS = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6'] as const
export type FieldId = (typeof FIELD_IDS)[number]
/** The homestead's spots (the Bakehouse on the old courtyard, the Stable by the gate, four more from House 7), then the valley: the threshing floor and six fields. */
export const BUILDING_IDS = ['house', 'well', 'wall', 'store', 'workshop', 'fold', 'grove', 'kiln', 'bake', 'stable', 'vineyard', 'weaver', 'smithy', 'apiary', 'thresh', ...FIELD_IDS] as const
export type BuildingId = (typeof BUILDING_IDS)[number]
export const isField = (b: BuildingId): b is FieldId => (FIELD_IDS as readonly string[]).includes(b)

export interface LevelDef {
  name: string
  icon: string
  cost: Materials
  minutes: number
  /** Other buildings' minimum levels (the house gates almost everything). */
  needs: Partial<Record<BuildingId, number>>
  /** Well: water points supplied. Kiln, sheepfold, grove: water points used. */
  water?: number
  /** Producers: material made per hour. */
  make?: { material: Material; perHour: number }
  /** Storehouse: how much each producer can hold before it waits. */
  cap?: number
  /** Fields: the land's price in coins (paid with level 1). */
  price?: number
  /** Fields: harvest × this. */
  yield?: number
  /** Threshing floor: every harvest + this share. */
  grainBonus?: number
  /** Bakehouse: grain per batch, its wood (per 10 grain) and baking time. */
  batch?: { grain: number; minutes: number }
  /** Stable: the pack animals carry this share more home from every expedition (shared/src/farm.ts). */
  pack?: number
}

export interface BuildingDef {
  id: BuildingId
  name: string
  what: string
  verse: string
  /** levels[0] is level 1. The house starts at level 1 (the tent); everything else at 0. */
  levels: LevelDef[]
}

const L = (
  name: string,
  icon: string,
  cost: Materials,
  minutes: number,
  needs: LevelDef['needs'] = {},
  extra: Partial<LevelDef> = {},
): LevelDef => ({ name, icon, cost, minutes, needs, ...extra })
const H = 60

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  house: {
    id: 'house',
    name: 'House',
    what: 'The heart of your plot. Each house level unlocks the next level of every other building.',
    verse: 'Matt 7:24',
    levels: [
      L('Tent', '⛺', {}, 0),
      L('Mud-brick house', '🛖', { bricks: 15, wood: 5 }, 10),
      L('Stone house', '🏠', { stone: 20, bricks: 15, wood: 10 }, 2 * H, { well: 1, wall: 1 }),
      L('Courtyard house', '🏡', { stone: 40, wood: 20, wool: 10 }, 6 * H, { workshop: 2, fold: 1 }),
      L('Two storeys with a roof terrace', '🏘️', { stone: 75, wood: 40, bricks: 20, oil: 10 }, 12 * H, { store: 2, grove: 2 }),
      L('Villa with an upper room', '🏛️', { stone: 125, wood: 60, wool: 30, oil: 20, cedar: 5 }, 24 * H, { wall: 3, well: 3 }),
      L('House of cedar', '🏰', { stone: 150, cedar: 30, wool: 50, oil: 30, gold: 5 }, 48 * H, {
        workshop: 4, fold: 4, grove: 4, kiln: 4, store: 4, well: 4, wall: 4,
      }),
      // From here on each level needs the whole homestead first (docs/jerusalem-progression.md §3).
      L('House with an upper room for guests', '🛏️', { stone: 240, bricks: 120, cedar: 45, wool: 60, oil: 40, copper: 12, bread: 50, linen: 15, wine: 15 }, 72 * H, {
        well: 6, wall: 5, store: 6, workshop: 6, fold: 6, grove: 6, kiln: 5, bake: 3, stable: 2, thresh: 3, field2: 2, vineyard: 1, weaver: 1,
      }),
      L("Elder's house by the gate", '⚖️', { stone: 380, cedar: 70, wool: 80, oil: 60, copper: 20, gold: 10, bread: 80, linen: 30, wine: 30, tools: 10 }, 96 * H, {
        well: 7, wall: 6, store: 7, workshop: 7, fold: 7, grove: 7, kiln: 6, bake: 4, stable: 3, thresh: 4, field3: 3, vineyard: 2, weaver: 2, smithy: 1,
      }),
      L("Steward's house", '🗝️', { stone: 600, cedar: 110, oil: 90, copper: 30, gold: 16, bread: 120, linen: 50, wine: 50, tools: 25, honey: 20 }, 120 * H, {
        well: 8, wall: 7, store: 8, workshop: 8, fold: 8, grove: 8, kiln: 7, bake: 5, stable: 4, thresh: 4, field4: 3, vineyard: 3, weaver: 3, smithy: 2, apiary: 1,
      }),
      L('House of hewn stone', '🏯', { stone: 950, cedar: 170, wool: 120, gold: 25, copper: 45, bread: 180, linen: 80, wine: 80, tools: 45, honey: 40 }, 168 * H, {
        wall: 8, kiln: 8, bake: 6, stable: 6, thresh: 5, field1: 4, field6: 3, vineyard: 4, weaver: 4, smithy: 4, apiary: 3,
      }),
      L("Solomon's house", '👑', { stone: 1500, cedar: 270, oil: 150, gold: 40, copper: 70, bread: 280, linen: 130, wine: 130, tools: 70, honey: 70 }, 240 * H, {
        well: 9, store: 9, workshop: 9, fold: 9, grove: 9, vineyard: 5, weaver: 5, smithy: 5, apiary: 5,
        field2: 4, field3: 4, field4: 4, field5: 4, field6: 4,
      }),
    ],
  },
  well: {
    id: 'well',
    name: 'Well',
    what: 'Supplies water points. The brick kiln, sheepfold and olive grove each use some, so deepen the well to grow them.',
    verse: 'Gen 26:22',
    levels: [
      L('Dug pit', '🕳️', { stone: 10 }, 5, {}, { water: 2 }),
      L('Stone-lined well', '🪣', { stone: 20, wood: 5 }, 1 * H, { house: 2 }, { water: 4 }),
      L('Well with pulley and trough', '🪣', { stone: 40, wood: 15, wool: 5 }, 4 * H, { house: 3 }, { water: 7 }),
      L('Covered well and cistern', '⛲', { stone: 80, bricks: 20 }, 12 * H, { house: 4 }, { water: 10 }),
      L('Cistern with channels', '⛲', { stone: 125, bricks: 30, cedar: 10 }, 24 * H, { house: 5 }, { water: 14 }),
      L("Hezekiah's tunnel", '⛲', { stone: 150, bricks: 40, cedar: 15, bread: 40 }, 36 * H, { house: 7, field2: 2 }, { water: 22 }),
      L('Pool of Bethesda', '⛲', { stone: 240, bricks: 70, cedar: 25, bread: 60 }, 48 * H, { house: 8 }, { water: 28 }),
      L('Conduit of the upper pool', '⛲', { stone: 380, bricks: 110, cedar: 40, tools: 10 }, 60 * H, { house: 9 }, { water: 34 }),
      L("Solomon's pools", '⛲', { stone: 600, bricks: 170, cedar: 60, tools: 25, bread: 120 }, 72 * H, { house: 11 }, { water: 42 }),
    ],
  },
  wall: {
    id: 'wall',
    name: 'Fence & wall',
    what: 'Encloses your plot, from a thorn hedge to a wall with a gate and watchtower.',
    verse: 'Neh 2:17',
    levels: [
      L('Thorn hedge', '🌿', { wood: 5 }, 5),
      L('Wooden fence', '🪵', { wood: 15 }, 30, { house: 2 }),
      L('Stone wall', '🧱', { stone: 40 }, 3 * H, { house: 3 }),
      L('Wall with gate', '🚪', { stone: 75, wood: 15, cedar: 2 }, 8 * H, { house: 4 }),
      L('Wall with watchtower', '🗼', { stone: 125, wood: 30, cedar: 5 }, 20 * H, { house: 6 }),
      L('Wall with a gatehouse', '🏯', { stone: 200, wood: 50, cedar: 10, copper: 10 }, 30 * H, { house: 8 }),
      L('Tower of Hananel', '🗼', { stone: 320, cedar: 20, tools: 10, bread: 40 }, 48 * H, { house: 9 }),
      L('Wall of hewn stone with towers', '🏰', { stone: 500, cedar: 35, tools: 20, bread: 70 }, 72 * H, { house: 10 }),
    ],
  },
  store: {
    id: 'store',
    name: 'Storehouse',
    what: 'Sets how much each producer can hold before you collect. When it is full, production waits.',
    verse: 'Gen 41:48',
    levels: [
      L('Granary pit', '🌾', { bricks: 10 }, 10, { house: 2 }, { cap: 20 }),
      L('Granary', '🌾', { bricks: 25, wood: 10 }, 1 * H, { house: 3 }, { cap: 40 }),
      L('Barn', '🛖', { wood: 40, bricks: 30 }, 4 * H, { house: 4 }, { cap: 80 }),
      L('Storehouse', '🏚️', { stone: 60, wood: 40 }, 10 * H, { house: 5 }, { cap: 150 }),
      L("Joseph's storehouse", '🏛️', { stone: 100, cedar: 10 }, 20 * H, { house: 6 }, { cap: 300 }),
      L('Royal store city', '🏛️', { stone: 150, cedar: 15, copper: 10, bread: 30 }, 30 * H, { house: 7 }, { cap: 500 }),
      L('Stores for grain, wine and oil', '🏛️', { stone: 240, cedar: 25, copper: 15, bread: 50 }, 36 * H, { house: 8 }, { cap: 750 }),
      L('Treasury', '🏛️', { stone: 380, cedar: 40, tools: 10, gold: 5 }, 48 * H, { house: 9 }, { cap: 1000 }),
      L("Hezekiah's treasuries", '🏛️', { stone: 600, cedar: 65, tools: 25, gold: 10, bread: 120 }, 72 * H, { house: 11 }, { cap: 1500 }),
    ],
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    what: 'Makes wood. Needs no water.',
    verse: 'Ex 31:3–5',
    levels: [
      L("Carpenter's bench", '🪚', { wood: 10, bricks: 5 }, 10, {}, { make: { material: 'wood', perHour: 2 } }),
      L("Carpenter's shop", '🪚', { wood: 20, bricks: 15 }, 1 * H, { house: 2 }, { make: { material: 'wood', perHour: 3 } }),
      L('Shop with lathe', '🪓', { stone: 30, wood: 30 }, 4 * H, { house: 3 }, { make: { material: 'wood', perHour: 4 } }),
      L('Shop with apprentice', '🪓', { stone: 60, wood: 40, wool: 10 }, 10 * H, { house: 4 }, { make: { material: 'wood', perHour: 6 } }),
      L("Master's workshop", '🛠️', { stone: 100, cedar: 10, oil: 10 }, 20 * H, { house: 6 }, { make: { material: 'wood', perHour: 8 } }),
      L("Shipwright's yard", '🛠️', { stone: 150, cedar: 15, copper: 12, bread: 30 }, 30 * H, { house: 7 }, { make: { material: 'wood', perHour: 10 } }),
      L("Hiram's carpenters", '🛠️', { stone: 240, cedar: 25, copper: 18, bread: 50 }, 36 * H, { house: 8 }, { make: { material: 'wood', perHour: 12 } }),
      L("Carpenter's house in Nazareth", '🛠️', { stone: 380, cedar: 40, tools: 10, bread: 80 }, 48 * H, { house: 9 }, { make: { material: 'wood', perHour: 14 } }),
      L('Craftsmen of the Temple', '🛠️', { stone: 600, cedar: 65, tools: 25, bread: 130, honey: 15 }, 72 * H, { house: 11 }, { make: { material: 'wood', perHour: 16 } }),
    ],
  },
  fold: {
    id: 'fold',
    name: 'Sheepfold',
    what: 'Makes wool. The animals drink, so it uses water.',
    verse: 'John 10:11',
    levels: [
      L('Pen with 2 sheep', '🐑', { wood: 10 }, 10, { house: 2 }, { make: { material: 'wool', perHour: 0.5 }, water: 1 }),
      L('Small flock', '🐑', { wood: 20, stone: 10 }, 1 * H, { house: 3 }, { make: { material: 'wool', perHour: 1 }, water: 2 }),
      L('Flock with goats', '🐐', { wood: 40, stone: 30 }, 4 * H, { house: 4 }, { make: { material: 'wool', perHour: 1.5 }, water: 3 }),
      L("Sheepfold with shepherd's hut", '🐏', { stone: 60, wood: 40, oil: 10 }, 10 * H, { house: 5 }, { make: { material: 'wool', perHour: 2.5 }, water: 4 }),
      L('Great flock, donkey and camel', '🐪', { stone: 100, wood: 60, cedar: 10 }, 20 * H, { house: 6 }, { make: { material: 'wool', perHour: 3.5 }, water: 5 }),
      L('Shearing house', '🐏', { stone: 150, wood: 80, copper: 8, bread: 30 }, 30 * H, { house: 7 }, { make: { material: 'wool', perHour: 4.5 }, water: 6 }),
      L('Tower of the flock', '🐏', { stone: 240, wood: 120, copper: 12, bread: 45 }, 36 * H, { house: 8 }, { make: { material: 'wool', perHour: 5.5 }, water: 7 }),
      L('Flocks of Kedar', '🐏', { stone: 380, cedar: 30, tools: 10, bread: 75 }, 48 * H, { house: 9 }, { make: { material: 'wool', perHour: 6.5 }, water: 8 }),
      L("Job's flocks", '🐏', { stone: 600, cedar: 50, tools: 25, bread: 120, honey: 15 }, 72 * H, { house: 11 }, { make: { material: 'wool', perHour: 7.5 }, water: 9 }),
    ],
  },
  grove: {
    id: 'grove',
    name: 'Olive grove',
    what: 'Makes olive oil. The trees need water.',
    verse: 'Ps 52:8',
    levels: [
      L('Two young olive trees', '🌱', { wood: 10 }, 10, { house: 2 }, { make: { material: 'oil', perHour: 0.25 }, water: 1 }),
      L('Small grove', '🫒', { wood: 20, bricks: 10 }, 1 * H, { house: 3 }, { make: { material: 'oil', perHour: 0.5 }, water: 1 }),
      L('Grove with oil press', '🫒', { stone: 40, wood: 20 }, 4 * H, { house: 4 }, { make: { material: 'oil', perHour: 1 }, water: 2 }),
      L('Large grove', '🌳', { stone: 60, wood: 30, wool: 10 }, 10 * H, { house: 5 }, { make: { material: 'oil', perHour: 1.5 }, water: 3 }),
      L('Grove with vineyard terraces', '🍇', { stone: 100, wood: 40, cedar: 10 }, 20 * H, { house: 6 }, { make: { material: 'oil', perHour: 2 }, water: 4 }),
      L('Oil press of Gethsemane', '🫒', { stone: 150, wood: 60, copper: 10, bread: 30 }, 30 * H, { house: 7 }, { make: { material: 'oil', perHour: 2.5 }, water: 5 }),
      L('Terraced olive hills', '🫒', { stone: 240, wood: 90, copper: 15, bread: 45 }, 36 * H, { house: 8 }, { make: { material: 'oil', perHour: 3 }, water: 6 }),
      L('Groves of the Mount of Olives', '🫒', { stone: 380, cedar: 30, tools: 10, bread: 75 }, 48 * H, { house: 9 }, { make: { material: 'oil', perHour: 3.5 }, water: 7 }),
      L('Oil for the lampstand', '🫒', { stone: 600, cedar: 50, tools: 25, bread: 120, honey: 15 }, 72 * H, { house: 11 }, { make: { material: 'oil', perHour: 4 }, water: 8 }),
    ],
  },
  kiln: {
    id: 'kiln',
    name: 'Brick kiln',
    what: 'Makes bricks from clay and straw. It uses water.',
    verse: 'Ex 5:7',
    levels: [
      L('Clay pit', '🟫', { stone: 5 }, 10, { house: 2 }, { make: { material: 'bricks', perHour: 2 }, water: 1 }),
      L('Kiln', '🔥', { stone: 20, wood: 10 }, 1 * H, { house: 3 }, { make: { material: 'bricks', perHour: 4 }, water: 1 }),
      L('Double kiln', '🔥', { stone: 40, wood: 20 }, 4 * H, { house: 4 }, { make: { material: 'bricks', perHour: 6 }, water: 2 }),
      L('Brickworks', '🏭', { stone: 75, wood: 30 }, 10 * H, { house: 5 }, { make: { material: 'bricks', perHour: 9 }, water: 3 }),
      L("Potter's house", '🏺', { stone: 120, wood: 50, copper: 8, bread: 20 }, 24 * H, { house: 6 }, { make: { material: 'bricks', perHour: 12 }, water: 4 }),
      L("Potter's wheel and workshop", '🏺', { stone: 190, wood: 80, copper: 12, bread: 35 }, 36 * H, { house: 8 }, { make: { material: 'bricks', perHour: 14 }, water: 5 }),
      L("The king's potters", '🏺', { stone: 300, cedar: 15, tools: 10, bread: 60 }, 48 * H, { house: 9 }, { make: { material: 'bricks', perHour: 16 }, water: 6 }),
      L('Brickfields of the city', '🏺', { stone: 480, cedar: 25, tools: 20, bread: 90 }, 72 * H, { house: 10 }, { make: { material: 'bricks', perHour: 18 }, water: 7 }),
    ],
  },
  bake: {
    id: 'bake',
    name: 'Bakehouse',
    what: 'Grinds your grain and bakes it into bread, a batch at a time. Builders and workers eat bread.',
    verse: 'Matt 24:41',
    levels: [
      L('Hand mill and clay oven', '🫓', { bricks: 15, stone: 10 }, 1 * H, { house: 3, field1: 1 }, { batch: { grain: 10, minutes: 2 * H } }),
      L('Two millstones', '🫓', { bricks: 30, wood: 20 }, 4 * H, { house: 4 }, { batch: { grain: 20, minutes: 2 * H } }),
      L('Bakehouse', '🍞', { bricks: 60, stone: 40, wood: 10, bread: 20 }, 10 * H, { house: 5 }, { batch: { grain: 40, minutes: 3 * H } }),
      L('Donkey mill', '🍞', { stone: 80, cedar: 10, wool: 10, bread: 40 }, 20 * H, { house: 6 }, { batch: { grain: 80, minutes: 4 * H } }),
      L("Bakers' street", '🍞', { stone: 140, bricks: 100, cedar: 15, bread: 60 }, 36 * H, { house: 8 }, { batch: { grain: 120, minutes: 4 * H } }),
      L("The king's bakery", '🍞', { stone: 230, cedar: 25, tools: 10, bread: 100 }, 48 * H, { house: 10 }, { batch: { grain: 160, minutes: 4 * H } }),
    ],
  },
  stable: {
    id: 'stable',
    name: 'Stable',
    what: 'Donkeys and camels for your workers. With pack animals every team brings more home; the animals eat barley on the road.',
    verse: 'Gen 24:10',
    levels: [
      L('Donkey and manger', '🐴', { wood: 20, bricks: 10 }, 1 * H, { house: 4 }, { pack: 0.15 }),
      L('Two donkeys', '🐴', { wood: 40, stone: 20, barley: 20 }, 4 * H, { house: 5 }, { pack: 0.3 }),
      L('Camel shed', '🐪', { stone: 50, wood: 40, wool: 10, bread: 20 }, 10 * H, { house: 6 }, { pack: 0.5 }),
      L('Caravan yard', '🐪', { stone: 100, cedar: 10, copper: 8, bread: 30 }, 24 * H, { house: 7 }, { pack: 0.75 }),
      L('Horses and chariots', '🐎', { stone: 160, cedar: 15, copper: 12, bread: 50 }, 36 * H, { house: 8 }, { pack: 1 }),
      L("Solomon's stables", '🐎', { stone: 260, cedar: 25, tools: 12, bread: 80 }, 48 * H, { house: 10 }, { pack: 1.3 }),
    ],
  },
  // ── From House 7: what the higher house levels are made of ──
  vineyard: {
    id: 'vineyard',
    name: 'Vineyard',
    what: 'Vines and a winepress. Makes wine. The vines need water.',
    verse: 'Isa 5:1–2',
    levels: [
      L('Young vines', '🌱', { wood: 60, stone: 40, bricks: 30 }, 4 * H, { house: 7 }, { make: { material: 'wine', perHour: 0.5 }, water: 1 }),
      L('Vineyard with a hedge', '🍇', { stone: 100, wood: 60, bread: 20 }, 12 * H, { house: 8 }, { make: { material: 'wine', perHour: 1 }, water: 2 }),
      L('Vineyard with a winepress', '🍇', { stone: 180, cedar: 10, copper: 8, bread: 40 }, 24 * H, { house: 9 }, { make: { material: 'wine', perHour: 1.5 }, water: 3 }),
      L('Vineyard with a watchtower', '🍇', { stone: 300, cedar: 20, tools: 12, bread: 60 }, 48 * H, { house: 10 }, { make: { material: 'wine', perHour: 2 }, water: 4 }),
      L('Vineyards of En-gedi', '🍷', { stone: 480, cedar: 35, tools: 25, honey: 15, bread: 100 }, 72 * H, { house: 11 }, { make: { material: 'wine', perHour: 3 }, water: 5 }),
    ],
  },
  weaver: {
    id: 'weaver',
    name: "Weaver's house",
    what: 'Spins and weaves fine linen. Needs no water.',
    verse: 'Prov 31:13',
    levels: [
      L('A loom', '🧶', { wood: 60, bricks: 40, wool: 30 }, 4 * H, { house: 7 }, { make: { material: 'linen', perHour: 0.4 } }),
      L("Weaver's shed", '🧵', { stone: 100, wood: 60, wool: 40 }, 12 * H, { house: 8 }, { make: { material: 'linen', perHour: 0.8 } }),
      L("Lydia's dye works", '🧵', { stone: 180, cedar: 10, copper: 8, wool: 60 }, 24 * H, { house: 9 }, { make: { material: 'linen', perHour: 1.2 } }),
      L("Embroiderers' house", '🧵', { stone: 300, cedar: 20, tools: 12, wool: 80 }, 48 * H, { house: 10 }, { make: { material: 'linen', perHour: 1.8 } }),
      L('Fine linen and purple', '🧵', { stone: 480, cedar: 35, tools: 25, honey: 15, wool: 120 }, 72 * H, { house: 11 }, { make: { material: 'linen', perHour: 2.5 } }),
    ],
  },
  smithy: {
    id: 'smithy',
    name: 'Smithy',
    what: 'Forges tools from copper. Needs no water.',
    verse: '1 Sam 13:19–20',
    levels: [
      L('A forge', '🔥', { stone: 120, wood: 80, copper: 10 }, 8 * H, { house: 8 }, { make: { material: 'tools', perHour: 0.25 } }),
      L('Smithy with bellows', '⚒️', { stone: 200, cedar: 10, copper: 16, bread: 30 }, 24 * H, { house: 9 }, { make: { material: 'tools', perHour: 0.5 } }),
      L("Bezalel's workshop", '⚒️', { stone: 320, cedar: 20, copper: 25, bread: 50 }, 36 * H, { house: 10 }, { make: { material: 'tools', perHour: 0.8 } }),
      L("Hiram's bronze foundry", '⚒️', { stone: 450, cedar: 30, copper: 35, bread: 70 }, 48 * H, { house: 10 }, { make: { material: 'tools', perHour: 1.2 } }),
      L('Swords into ploughshares', '⚒️', { stone: 650, cedar: 45, copper: 50, honey: 20, bread: 110 }, 72 * H, { house: 11 }, { make: { material: 'tools', perHour: 1.6 } }),
    ],
  },
  apiary: {
    id: 'apiary',
    name: 'Apiary',
    what: 'Bees in clay hives. Makes honey. The bees need a little water.',
    verse: 'Ex 3:8',
    levels: [
      L('Wild bees in the rock', '🐝', { stone: 120, wood: 80, bread: 20 }, 8 * H, { house: 9 }, { make: { material: 'honey', perHour: 0.5 }, water: 1 }),
      L('Clay hives', '🐝', { stone: 180, bricks: 120, linen: 10 }, 24 * H, { house: 9 }, { make: { material: 'honey', perHour: 1 }, water: 1 }),
      L('Bee garden', '🍯', { stone: 280, cedar: 15, tools: 10, linen: 20 }, 36 * H, { house: 10 }, { make: { material: 'honey', perHour: 1.5 }, water: 1 }),
      L('Hives among the flowers', '🍯', { stone: 420, cedar: 25, tools: 20, linen: 35 }, 48 * H, { house: 11 }, { make: { material: 'honey', perHour: 2 }, water: 2 }),
      L('Milk and honey', '🍯', { stone: 620, cedar: 40, tools: 30, linen: 50, wine: 30 }, 72 * H, { house: 11 }, { make: { material: 'honey', perHour: 3 }, water: 2 }),
    ],
  },
  thresh: {
    id: 'thresh',
    name: 'Threshing floor',
    what: 'Where the harvest is threshed and winnowed. A better floor gets more grain out of every harvest.',
    verse: '2 Sam 24:24',
    levels: [
      L('Old threshing floor', '🌾', {}, 0, { field1: 1 }, { grainBonus: 0 }),
      L('Paved floor', '🌾', { stone: 30, wood: 20 }, 4 * H, { house: 4 }, { grainBonus: 0.1 }),
      L('Floor with winnowing wind', '🌬️', { stone: 60, cedar: 2, bread: 20 }, 10 * H, { house: 5 }, { grainBonus: 0.2 }),
      L("Araunah's threshing floor", '🌾', { stone: 100, cedar: 5, bread: 40 }, 20 * H, { house: 6 }, { grainBonus: 0.3 }),
      L('Threshing sledge with iron teeth', '🌾', { stone: 160, cedar: 10, tools: 8, bread: 60 }, 36 * H, { house: 9 }, { grainBonus: 0.4 }),
    ],
  },
  ...fields(),
}

/**
 * The six fields in the Valley of Rephaim (Isa 17:5): bought one by one (the
 * first is a gift), cleared, terraced, irrigated. A field is a building like
 * the others (builders, scrolls), with crops on top (shared/src/farm.ts).
 */
function fields(): Record<FieldId, BuildingDef> {
  const land: [number, number][] = [
    // [price, house level]
    [0, 3],
    [600, 4],
    [1200, 5],
    [2000, 6],
    [3000, 7],
    [4500, 7],
  ]
  return Object.fromEntries(
    FIELD_IDS.map((id, i) => {
      const [price, house] = land[i]
      const needs: LevelDef['needs'] = i ? { house, [FIELD_IDS[i - 1]]: 1 } : { house }
      const def: BuildingDef = {
        id,
        name: `Field ${i + 1}`,
        what: 'A field in the valley. Sow barley or wheat; terrace and water it for bigger harvests.',
        verse: 'Prov 31:16',
        levels: [
          L('Cleared field', '🟫', {}, 2 * H, needs, { price, yield: 1 }),
          L('Terraced field', '🧱', { stone: 40, bricks: 30 }, 6 * H, { thresh: 2 }, { yield: 1.5 }),
          L('Irrigated terrace', '💧', { stone: 60, bricks: 40, bread: 20 }, 12 * H, { thresh: 3, well: 4 }, { yield: 2, water: 1 }),
          L('Hedged field with a watchtower', '🗼', { stone: 120, bricks: 80, bread: 40, tools: 5 }, 24 * H, { house: 9 }, { yield: 2.5, water: 1 }),
        ],
      }
      return [id, def]
    }),
  ) as Record<FieldId, BuildingDef>
}

/** The homestead's fixed spots (docs/jerusalem-plot.md §2): the Bakehouse on the old courtyard, the Stable inside the gate, then the four from House 7. */
export const SPOTS = ['grove', 'house', 'store', 'fold', 'bake', 'well', 'workshop', 'kiln', 'stable', 'vineyard', 'weaver', 'smithy', 'apiary', 'wall'] as const
export type YardSpot = (typeof SPOTS)[number]
/** The valley's buildings (the Fields scene). */
export const VALLEY: readonly BuildingId[] = ['thresh', ...FIELD_IDS]

export const PRODUCERS: readonly BuildingId[] = ['workshop', 'kiln', 'fold', 'grove', 'vineyard', 'weaver', 'smithy', 'apiary']
export const WATER_USERS: readonly BuildingId[] = ['kiln', 'fold', 'grove', 'vineyard', 'apiary', ...FIELD_IDS]

export const STARTER_GIFT: Materials = { wood: 20, bricks: 20, stone: 20 }
/** What a producer holds with no storehouse yet. */
export const BASE_CAP = 10
export const SECOND_BUILDER_HOUSE = 4
/** Workers' scroll: answer this many, get this many right, and the build loses scrollCutMs (5 min, more with Skilled workers). */
export const SCROLL_QUESTIONS = 3
export const SCROLL_PASS = 2
/** Scrolls can take at most this share of a build's time off, in total. */
export const SPEEDUP_MAX_SHARE = 0.5
/** Minimum time between two Workers' scrolls (per player). */
export const SCROLL_COOLDOWN_MS = 60_000
/** The Apprentice (skill): builds on his own only what takes this long or less (after skills)… */
export const APPRENTICE_MAX_MIN = 120
/** …or helps a builder: this share of the time left comes off. */
export const APPRENTICE_HELP = 0.25

/**
 * The flooded market: each unit of a material sold on a UTC day pays this
 * much less than the one before, never below FLOOD_FLOOR of the full price.
 */
export const FLOOD = 0.95
export const FLOOD_FLOOR = 0.2

// ── state ─────────────────────────────────────────────────────────────

export interface Build {
  building: BuildingId
  toLevel: number
  startedAt: number
  endsAt: number
  /** Time already taken off by Workers' scrolls, bread and helping hands (capped by SPEEDUP_MAX_SHARE). */
  spedMs?: number
  /** Built by the Apprentice on his own (a short build). */
  by?: 'apprentice'
  /** Time the Apprentice took off by helping (outside the speed-up cap). */
  helpMs?: number
  /** A repair of damage (shared/src/events.ts), not a new level: `toLevel` is the level it has. */
  repair?: boolean
}

/** A build's full length before anything was taken off. */
export const buildFullMs = (b: Build) => b.endsAt + (b.spedMs ?? 0) + (b.helpMs ?? 0) - b.startedAt

export interface PlotState {
  levels: Record<BuildingId, number>
  inventory: Record<Material, number>
  builds: Build[]
  /** Made but not yet collected, per producer (fractions carry over). */
  stock: Partial<Record<BuildingId, number>>
  /** Production is computed up to this time. */
  updatedAt: number
  /** The owner's skill effects. Set by the server on every load, never trusted from storage. */
  mods?: PlotMods
  /** Seven good years: producers +50 % until then. */
  boostUntil?: number
  /** Gifts from the people in the yard (shared/src/life.ts). */
  gifts?: GiftLog
  // The valley and the workers (shared/src/farm.ts):
  /** What grows on each field. */
  crops?: Partial<Record<FieldId, Crop>>
  /** The Bakehouse's batch (in the oven, or baked and waiting). */
  bake?: Bake
  /** Barley for the flock: the sheepfold makes +50 % until then. */
  fedUntil?: number
  /** Teams of workers out on expeditions. */
  expeditions?: Expedition[]
  /** Gleaning (Ruth 2): this plot's owner gleaned elsewhere today / gleaners in these fields today. */
  glean?: Glean
  gleaned?: Glean
  /** Existing homesteads (House 3+) got Field 1 cleared and sown once, at launch. */
  fieldGift?: boolean
  // Round the homestead (shared/src/homeLife.ts):
  /** The UTC day the lost sheep was last found. */
  sheepDay?: number
  /** Hands this plot's owner lent elsewhere today / hands lent here today, and who lent them lately. */
  help?: DayCount
  helped?: DayCount
  helpers?: Helper[]
  /** Sold at the Market today (the flooded market): UTC day number and units per material. */
  sold?: { day: number; n: Materials }
  // What happens to the homestead (shared/src/events.ts):
  /** The day's roll, the last bad event, and what happened lately. */
  events?: { day: number; lastBad: number; news: News[] }
  /** Damaged producers make half until repaired: building → when it was damaged. */
  damage?: Partial<Record<BuildingId, number>>
  /** Philistines at the gate, waiting to be driven off (or until `until`, when they take everything they came for). */
  threat?: Threat
  /** Drought until then: producers that use water make less, crops sown then yield less. */
  drought?: number
  /** Three visitors wait at the door until then (offer bread for a blessing). */
  visitors?: number
  /** The visitors' blessing: producers +25 % until then. */
  blessUntil?: number
  /** A merchant caravan sells one material at half price until `until`. */
  caravan?: { material: Material; until: number; left: number }
  /** Early rain: the next sowing yields more. */
  rain?: boolean
  // The city (shared/src/civic.ts):
  /** The week (its Monday, ms) the house tax was last paid, and the tithe last brought. */
  taxWeek?: number
  titheWeek?: number
  /** The tithe's blessing: producers +15 % until then. */
  titheUntil?: number
  /** Coins' worth this family gave to the Temple (tithes included). */
  templeGiven?: number
  /** The city's running boons, set by the server on every load, never stored. */
  city?: CityBoons
}

export type EventKind = 'philistines' | 'repelled' | 'quake' | 'drought' | 'locusts' | 'fire' | 'fireOut' | 'visitors' | 'caravan' | 'rain'
/** One thing that happened, for the news on My Home. */
export interface News {
  id: string
  kind: EventKind
  at: number
  /** Taken (raid), burnt (fire), eaten (locusts). */
  lost?: Materials
  /** Damaged buildings (raid, earthquake). */
  hits?: BuildingId[]
  building?: BuildingId
  field?: FieldId
  material?: Material
  /** Raid: questions answered right. */
  right?: number
}
export interface Threat {
  at: number
  until: number
  /** What they came for, and the buildings they would wreck. */
  loot: Materials
  hits: BuildingId[]
}

/** Drought: the share producers that use water lose (a deeper well holds out). */
export const droughtCut = (levels: Record<BuildingId, number>) => (levels.well >= 7 ? 0 : levels.well >= 5 ? 0.125 : 0.25)
/** The visitors' blessing and a damaged building's share of production. */
export const BLESSING = 0.25
export const DAMAGED = 0.5

export const modsOf = (s: Pick<PlotState, 'mods'>): PlotMods => s.mods ?? NO_MODS

export function newPlot(now: number): PlotState {
  const levels = Object.fromEntries(BUILDING_IDS.map((b) => [b, b === 'house' ? 1 : 0])) as Record<BuildingId, number>
  const inventory = Object.fromEntries(MATERIALS.map((m) => [m, STARTER_GIFT[m] ?? 0])) as Record<Material, number>
  return { levels, inventory, builds: [], stock: {}, updatedAt: now }
}

/** Definition of a building at a level (undefined at level 0 or past the top). */
export const levelDef = (b: BuildingId, level: number): LevelDef | undefined => BUILDINGS[b].levels[level - 1]
export const maxLevel = (b: BuildingId) => BUILDINGS[b].levels.length

/** Market price for `qty` of a material (Haggler takes a share off). */
export const buyPrice = (m: Material, qty: number, mods: PlotMods = NO_MODS) => Math.ceil(MATERIAL_INFO[m].buy * qty * (1 - mods.buyDiscount) - 1e-9)
/** One unit's full sell price: the listed half price, or more of the buy price with Fair trader. */
export const unitSellPrice = (m: Material, mods: PlotMods = NO_MODS) => {
  if (!sellable(m)) return 0
  const base = MATERIAL_INFO[m].sell
  return mods.sellRate > NO_MODS.sellRate ? Math.max(base, MATERIAL_INFO[m].buy * mods.sellRate) : base
}

/** Units of a material already sold today (the flooded market). */
export const soldToday = (s: Pick<PlotState, 'sold'>, m: Material, now: number) =>
  s.sold && s.sold.day === Math.floor(now / 86_400_000) ? (s.sold.n[m] ?? 0) : 0

/** What selling `qty` pays after `already` units sold today: each unit FLOOD × the one before, down to FLOOD_FLOOR. */
export function sellPrice(m: Material, qty: number, mods: PlotMods = NO_MODS, already = 0): number {
  const unit = unitSellPrice(m, mods)
  if (!unit) return 0
  // Units past the floor all pay the floor; sum the falling part as a geometric series.
  const floorAt = Math.ceil(Math.log(FLOOD_FLOOR) / Math.log(FLOOD))
  const falling = Math.max(0, Math.min(qty, floorAt - already))
  const fallingSum = falling ? (FLOOD ** already * (1 - FLOOD ** falling)) / (1 - FLOOD) : 0
  return Math.floor(unit * (fallingSum + (qty - falling) * FLOOD_FLOOR) + 1e-9)
}

/** Sell from the plot: what it pays now, counted towards today's flood. */
export function sell(s: PlotState, m: Material, qty: number, now: number): number {
  const day = Math.floor(now / 86_400_000)
  const coins = sellPrice(m, qty, modsOf(s), soldToday(s, m, now))
  if (!s.sold || s.sold.day !== day) s.sold = { day, n: {} }
  s.sold.n[m] = (s.sold.n[m] ?? 0) + qty
  s.inventory[m] -= qty
  return coins
}

export const coinValue = (m: Materials, mods: PlotMods = NO_MODS) => MATERIALS.reduce((sum, k) => sum + (m[k] ? buyPrice(k, m[k], mods) : 0), 0)

/** Builders (the Apprentice is extra, see `apprenticeFree`). */
export const builderCount = (levels: Record<BuildingId, number>) => (levels.house >= SECOND_BUILDER_HOUSE ? 2 : 1)
/** Builds the builders are working on (not the Apprentice's own). */
export const builderBuilds = (s: Pick<PlotState, 'builds'>) => s.builds.filter((b) => b.by !== 'apprentice')
/** The Apprentice is learned and neither building nor helping. */
export const apprenticeFree = (s: PlotState) => modsOf(s).apprentice && !s.builds.some((b) => b.by === 'apprentice' || b.helpMs)
/** What the Apprentice's help would take off a build now (0 when he can't). */
export function apprenticeCut(s: PlotState, b: Build, now: number): number {
  if (!apprenticeFree(s) || b.by === 'apprentice') return 0
  return Math.max(0, (b.endsAt - now) * APPRENTICE_HELP)
}
export const storeCap = (levels: Record<BuildingId, number>, mods: PlotMods = NO_MODS) =>
  Math.floor((levelDef('store', levels.store)?.cap ?? BASE_CAP) * (1 + mods.storage))
export const waterSupply = (levels: Record<BuildingId, number>, mods: PlotMods = NO_MODS) => {
  const base = levelDef('well', levels.well)?.water ?? 0
  return base ? base + mods.water : 0
}
/** The plot's water: its well, and the city's aqueduct while it runs (a well needed). */
export const waterOf = (s: Pick<PlotState, 'levels' | 'mods' | 'city' | 'updatedAt'>) => {
  const w = waterSupply(s.levels, modsOf(s))
  return w && s.city && s.city.aqueductUntil > s.updatedAt ? w + AQUEDUCT_WATER : w
}

/** Real build time: Many hands takes a share off; Quick hands finishes short builds at once. */
export function buildMinutes(minutes: number, mods: PlotMods = NO_MODS): number {
  const m = minutes * (1 - mods.buildTime)
  return mods.instantMin && m <= mods.instantMin ? 0 : m
}

/** Time one passed Workers' scroll takes off (Skilled workers: more). */
export const scrollCutMs = (mods: PlotMods = NO_MODS) => mods.scrollMin * 60_000

/** Water points in use: built consumers, plus what builds in progress will need (reserved). */
export function waterUsed(s: PlotState): number {
  let used = 0
  for (const b of WATER_USERS) {
    const pending = s.builds.find((x) => x.building === b)
    used += levelDef(b, pending ? pending.toLevel : s.levels[b])?.water ?? 0
  }
  return used
}

// ── time: finish builds and produce, lazily ───────────────────────────

function produce(s: PlotState, from: number, to: number): void {
  const ms = to - from
  if (ms <= 0) return
  const mods = modsOf(s)
  const cap = storeCap(s.levels, mods)
  // Seven good years: the boosted part of this segment counts 1.5×.
  // Only while the skill is still learned (a re-spec ends the boost).
  const boosted = s.boostUntil && mods.sevenYears ? Math.max(0, Math.min(to, s.boostUntil) - from) : 0
  const effMs = (ms + 0.5 * boosted) * (1 + mods.production)
  // Fed with barley: the sheepfold's fed part of this segment counts 1.5× as well.
  const fed = s.fedUntil ? Math.max(0, Math.min(to, s.fedUntil) - from) : 0
  // Events (shared/src/events.ts): the visitors' blessing, a drought.
  const blessed = s.blessUntil ? Math.max(0, Math.min(to, s.blessUntil) - from) : 0
  // The city (shared/src/civic.ts): a feast for everyone, the family's own tithe.
  const feast = s.city?.feastUntil ? Math.max(0, Math.min(to, s.city.feastUntil) - from) : 0
  const tithed = s.titheUntil ? Math.max(0, Math.min(to, s.titheUntil) - from) : 0
  const dry = s.drought ? Math.max(0, Math.min(to, s.drought) - from) * droughtCut(s.levels) : 0
  for (const b of PRODUCERS) {
    const make = levelDef(b, s.levels[b])?.make
    if (!make) continue
    const cur = s.stock[b] ?? 0
    let ms = b === 'fold' ? effMs + 0.5 * fed * (1 + mods.production) : effMs
    ms += (BLESSING * blessed + FEAST_BOOST * feast + TITHE_BLESSING * tithed) * (1 + mods.production)
    if (WATER_USERS.includes(b)) ms -= dry * (1 + mods.production)
    if (s.damage?.[b]) ms *= DAMAGED
    s.stock[b] = Math.max(cur, Math.min(cap, cur + (make.perHour * Math.max(0, ms)) / 3_600_000))
  }
}

/** Stone turned up clearing a field ("he dug it and cleared it of stones", Isa 5:2). */
export const CLEARING_STONE = 10

/** What finishing a level brings besides the level: a cleared field's stones, Field 1's old threshing floor. */
function finished(s: PlotState, b: BuildingId, toLevel: number): void {
  if (isField(b) && toLevel === 1) s.inventory.stone += CLEARING_STONE
  if (b === 'field1') s.levels.thresh = Math.max(s.levels.thresh, 1)
}

/** Bring the plot up to `now`: production in segments, each finished build applied at its own time. */
export function advance(s: PlotState, now: number): void {
  let t = s.updatedAt
  for (;;) {
    const next = s.builds.filter((x) => x.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt)[0]
    const segEnd = next ? Math.max(t, next.endsAt) : now
    produce(s, t, segEnd)
    t = Math.max(t, segEnd)
    if (!next) break
    if (s.levels[next.building] < next.toLevel) finished(s, next.building, next.toLevel)
    s.levels[next.building] = Math.max(s.levels[next.building], next.toLevel)
    // A repair, or a new level, mends what the raiders or the earthquake broke.
    if (s.damage?.[next.building]) delete s.damage[next.building]
    if (next.building === 'house' && modsOf(s).sevenYears) s.boostUntil = next.endsAt + SEVEN_YEARS_MS
    s.builds = s.builds.filter((x) => x !== next)
  }
  s.updatedAt = Math.max(s.updatedAt, now)
}

/** Whole units waiting in a producer. */
export const ready = (s: PlotState, b: BuildingId) => Math.floor((s.stock[b] ?? 0) + 1e-9)

/** Move whole units from producers into the inventory. Returns what was collected. */
export function collect(s: PlotState, only?: BuildingId): Materials {
  const got: Materials = {}
  for (const b of PRODUCERS) {
    if (only && only !== b) continue
    const make = levelDef(b, s.levels[b])?.make ?? levelDef(b, 1)?.make
    const n = ready(s, b)
    if (!make || n <= 0) continue
    s.inventory[make.material] += n
    s.stock[b] = Math.max(0, (s.stock[b] ?? 0) - n)
    got[make.material] = (got[make.material] ?? 0) + n
  }
  return got
}

// ── upgrades ──────────────────────────────────────────────────────────

export interface Requirement {
  label: string
  met: boolean
}

export interface UpgradeCheck {
  building: BuildingId
  /** The level it would become (undefined when maxed). */
  toLevel?: number
  def?: LevelDef
  /** Build time in minutes with skills applied (0 = instant). */
  minutes: number
  /** Building is at its top level. */
  maxed: boolean
  /** Already under construction. */
  busy: boolean
  /** Builders are all busy, but the Apprentice can take this one (a short build). */
  byApprentice: boolean
  /** House / building / water requirements (not materials, not builders). */
  reqs: Requirement[]
  reqsMet: boolean
  freeBuilder: boolean
  cost: Materials
  missing: Materials
  /** Coins to buy everything missing at the Market. */
  missingCoins: number
  /** House 11 and 12: the family's gifts to the Temple needed (coins' worth), and the house tax still owed. */
  temple?: number
  tax?: number
  /** Coins for the land itself (fields), paid on top. */
  price: number
  waterNeeded: number
}

export function checkUpgrade(s: PlotState, b: BuildingId): UpgradeCheck {
  const toLevel = s.levels[b] + 1
  const def = levelDef(b, toLevel)
  const mods = modsOf(s)
  const busy = s.builds.some((x) => x.building === b)
  const buildersFree = builderBuilds(s).length < builderCount(s.levels)
  if (!def) {
    return { building: b, minutes: 0, maxed: true, busy, byApprentice: false, reqs: [], reqsMet: false, freeBuilder: buildersFree, cost: {}, missing: {}, missingCoins: 0, price: 0, waterNeeded: 0 }
  }
  const minutes = buildMinutes(def.minutes, mods)
  const byApprentice = !buildersFree && apprenticeFree(s) && minutes <= APPRENTICE_MAX_MIN
  const freeBuilder = buildersFree || byApprentice
  const reqs: Requirement[] = []
  for (const [r, lvl] of Object.entries(def.needs) as [BuildingId, number][]) {
    reqs.push({ label: `${BUILDINGS[r].name} ${lvl}`, met: s.levels[r] >= lvl })
  }
  let waterNeeded = 0
  if (WATER_USERS.includes(b)) {
    waterNeeded = (def.water ?? 0) - (levelDef(b, s.levels[b])?.water ?? 0)
    if (waterNeeded > 0) {
      const free = waterOf(s) - waterUsed(s)
      reqs.push({ label: `${waterNeeded} water free (you have ${Math.max(0, free)})`, met: free >= waterNeeded })
    }
  }
  // The house also needs the family's gifts to the Temple (House 11, 12) and this week's tax paid (shared/src/civic.ts).
  const temple = b === 'house' ? TEMPLE_FOR_HOUSE[toLevel] : undefined
  if (temple) reqs.push({ label: `Temple gifts ${temple}`, met: (s.templeGiven ?? 0) >= temple })
  const tax = b === 'house' ? taxDue(s, s.updatedAt) : 0
  if (tax) reqs.push({ label: 'House tax paid', met: false })
  const missing: Materials = {}
  for (const m of MATERIALS) {
    const need = (def.cost[m] ?? 0) - s.inventory[m]
    if (need > 0) missing[m] = need
  }
  return {
    temple,
    tax,
    building: b,
    toLevel,
    def,
    minutes,
    maxed: false,
    busy,
    byApprentice,
    reqs,
    reqsMet: reqs.every((r) => r.met),
    freeBuilder,
    cost: def.cost,
    missing,
    missingCoins: coinValue(missing, mods),
    price: def.price ?? 0,
    waterNeeded,
  }
}

/**
 * The one upgrade to suggest: the cheapest (in coins still to spend) that the
 * player may build now, with producers and the well favoured like the
 * balance sim. Ignores builders, so there is always a next step to show.
 */
export function suggestNext(s: PlotState): UpgradeCheck | null {
  let best: { prio: number; c: UpgradeCheck } | null = null
  for (const b of BUILDING_IDS) {
    const c = checkUpgrade(s, b)
    if (c.maxed || c.busy || !c.reqsMet) continue
    const favoured = PRODUCERS.includes(b) || b === 'well'
    const prio = (c.missingCoins + c.price) * (favoured ? 0.6 : 1) + c.minutes / 600
    if (!best || prio < best.prio) best = { prio, c }
  }
  return best?.c ?? null
}

export const formatMinutes = (min: number): string => {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

// ── wire types (server/src/plot.ts ↔ app/src/plot) ──────────────────────

export interface ScrollQuestion {
  /** Position in this scroll ("0".."2"), not a bank id. */
  id: string
  reference: string
  text: string
  answers: [string, string, string, string]
}
