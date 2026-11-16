import { useState } from 'react'
import { seasonDeck, seasonDecksNow, type RoomConfig } from '@sixtysix/shared'
import { useLocale, useT } from '../i18n'
import { DeckSheet } from './DeckSheet'
import '../theme/decks.css'

/**
 * Where the questions come from: the Bible (default) or a player deck in one row, then each season's decks
 * (one tap, in season only) under its own heading. `own: false` leaves out the player-deck pill, and with
 * nothing in season (and no player deck chosen) the whole block.
 */
export function QuestionSource({ value, onChange, own: showOwn = true }: { value: RoomConfig; onChange: (next: RoomConfig) => void; own?: boolean }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const [picking, setPicking] = useState(false)
  const decks = seasonDecksNow()
  const seasons = [...new Set(decks.map((d) => d.season))]
  const id = value.deckId || ''
  const own = id && !seasonDeck(id) ? value.deckTitle : undefined
  if (!showOwn && !own && decks.length === 0) return null
  const pick = (deckId: string, deckTitle: string | undefined, questionCount: number) => onChange({ ...value, deckId, deckTitle, questionCount })

  return (
    <div className="q-source">
      <div className="profile-label">{t('decks.source')}</div>
      <div className="q-source-pills">
        <button className={`q-pill ${!id ? 'selected' : ''}`} aria-pressed={!id} onClick={() => pick('', undefined, 10)}>
          {t('decks.bible')}
        </button>
        {(showOwn || own) && (
          <button className={`q-pill own ${own ? 'selected' : ''}`} aria-pressed={!!own} onClick={() => setPicking(true)}>
            {own ? `🗂️ ${own}` : t('decks.own')}
          </button>
        )}
      </div>
      {seasons.map((season) => (
        <div key={season} className="q-season">
          <div className="q-season-head">{t(`decks.seasons.${season}`)}</div>
          <div className="q-source-pills">
            {decks
              .filter((d) => d.season === season)
              .map((d) => (
                <button
                  key={d.id}
                  className={`q-pill ${id === d.id ? 'selected' : ''}`}
                  aria-pressed={id === d.id}
                  title={d.title[locale]}
                  onClick={() => pick(d.id, d.title[locale], d.questions.length)}
                >
                  {d.short[locale]}
                </button>
              ))}
          </div>
        </div>
      ))}
      {picking && (
        <DeckSheet
          onClose={() => setPicking(false)}
          onPick={(d) => {
            pick(d.id, d.title, d.count)
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
