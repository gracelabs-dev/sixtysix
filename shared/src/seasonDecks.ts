import type { Locale } from './question'

/**
 * Built-in seasonal decks: bank questions (so verses, every language, flags), offered as pills in the
 * room options while their window is open. Ids never match player decks (DECK_ID is 10 letters/digits).
 */
export interface SeasonDeck {
  id: string
  /** Decks of one season are grouped under its heading (app i18n `decks.seasons.<season>`). */
  season: 'christmas'
  emoji: string
  /** 'MM-DD', inclusive, every year (UTC); `from` after `until` wraps the new year. */
  from: string
  until: string
  title: Record<Locale, string>
  /** Pill label. */
  short: Record<Locale, string>
  questions: string[]
}

const CHRISTMAS = { season: 'christmas' as const, from: '11-01', until: '01-06' }

export const SEASON_DECKS: SeasonDeck[] = [
  {
    id: 's-advent', emoji: '🕯️', ...CHRISTMAS,
    title: { de: 'Advent: Die Verheissung', en: 'Advent: The Promise', hu: 'Advent: Az ígéret' },
    short: { de: 'Advent', en: 'Advent', hu: 'Advent' },
    questions: ['q_b22_025', 'q_b189_012', 'q_b04_005', 'q_b189_013', 'q_b28_027', 'q_b22_036', 'q_b23_022', 'q_b203_005',
      'q_b29_008', 'q_b28_018', 'q_b203_006', 'q_b203_008', 'q_b05_030', 'q_b203_010', 'q_b30_028'],
  },
  {
    id: 's-night', emoji: '⭐', ...CHRISTMAS,
    title: { de: 'Weihnachten: Die Heilige Nacht', en: 'Christmas: The Holy Night', hu: 'Karácsony: A szent éjszaka' },
    short: { de: 'Heilige Nacht', en: 'Holy Night', hu: 'Szent éjszaka' },
    questions: ['q_seed_007', 'q_b28_002', 'q_b203_013', 'q_b27_028', 'q_b27_029', 'q_b203_014', 'q_b203_015', 'q_b203_016',
      'q_b200_006', 'q_b200_008', 'q_b05_011', 'q_b27_002', 'q_b27_003', 'q_b200_014', 'q_b204_002'],
  },
  {
    id: 's-pros', emoji: '👑', ...CHRISTMAS,
    title: { de: 'Weihnachten: Für Profis', en: 'Christmas: For Pros', hu: 'Karácsony: Profiknak' },
    short: { de: 'Für Profis', en: 'For Pros', hu: 'Profiknak' },
    questions: ['q_b188_006', 'q_b200_002', 'q_b200_004', 'q_b200_005', 'q_b200_015', 'q_b200_013', 'q_b203_001', 'q_b30_025',
      'q_b31_022', 'q_b203_017', 'q_b30_029', 'q_b203_018', 'q_b31_023', 'q_b31_043', 'q_b225_047'],
  },
]

export const seasonDeck = (id: unknown): SeasonDeck | undefined => SEASON_DECKS.find((d) => d.id === id)

export function seasonDecksNow(now = new Date()): SeasonDeck[] {
  const today = now.toISOString().slice(5, 10)
  return SEASON_DECKS.filter((d) => (d.from <= d.until ? d.from <= today && today <= d.until : today >= d.from || today <= d.until))
}
