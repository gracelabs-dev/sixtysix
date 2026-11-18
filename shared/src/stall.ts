import { MATERIAL_INFO, sellable, type Material } from './plot'

/**
 * The families' stall at the Market: a player puts a lot of one material up
 * for a price in coins, any other player buys the whole lot. The goods leave
 * the seller's storehouse when the lot goes up and come back if it is taken
 * down. The price must lie between what the Market pays for the lot and
 * halfway to what it asks, so a lot can't be used to hand coins over for
 * nothing; the seller pays a toll on what sells.
 */

/** Open lots one family may have. */
export const STALL_MAX = 5
/** Lots the stall lists (newest first; your own always). */
export const STALL_LIST = 60

export interface StallLot {
  id: number
  seller: string
  material: Material
  qty: number
  /** Coins for the whole lot. */
  price: number
  mine: boolean
}

/** May this material be put on the stall? (What the Market buys, it also lets families trade.) */
export const stallable = (m: Material) => sellable(m)

/**
 * The lowest and highest price for a lot: the Market's own sell price up to
 * halfway to its buy price (without skills), so families can't skip the
 * Market's spread by trading at full price.
 */
export const stallRange = (m: Material, qty: number) => ({ min: MATERIAL_INFO[m].sell * qty, max: Math.floor(((MATERIAL_INFO[m].sell + MATERIAL_INFO[m].buy) / 2) * qty) })

/** The toll at the gate: the seller pays this share of a sold lot's price. */
export const STALL_TOLL = 0.1
export const stallToll = (price: number) => Math.ceil(price * STALL_TOLL - 1e-9)
