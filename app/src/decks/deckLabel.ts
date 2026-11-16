import { seasonDeck, type Locale, type RoomConfig } from '@sixtysix/shared'

/** What a room's deck is called in the app's language: a seasonal deck by its own title, a player deck by the room's. */
export function deckLabel(config: Pick<RoomConfig, 'deckId' | 'deckTitle'>, locale: Locale): string | undefined {
  const season = seasonDeck(config.deckId)
  if (season) return `${season.emoji} ${season.title[locale]}`
  return config.deckId && config.deckTitle ? `🗂️ ${config.deckTitle}` : undefined
}
