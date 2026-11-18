import { useState } from 'react'
import { CARAVAN, MATERIAL_INFO, TEMPLE_STAGES, VISITORS_BREAD, caravanLeft, caravanPrice, taxDue, templeStage, titheError, titheOf, type News, type PlotState } from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { useGameStore } from '../../game/store'
import { PaintedCoin } from '../../art/PaintedPortrait'
import { fireConfetti } from '../../motion'
import { t as tNow, useT } from '../../i18n'
import { countdown } from './homeUtil'
import { PayButton } from './FarmPanels'
import { WorkCard } from './WorkSheet'
import { buildingName, listMaterials, materialName } from './plotText'

/**
 * What happens to the homestead (shared/src/events.ts), above the scene:
 * Philistines at the gate, visitors at the door, a caravan, the weather, and
 * the news of the last days (each dismissed once, on this device).
 */

const SEEN_KEY = 'sixtysix.homeNews.v1'
function loadSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** `actions` (above the scene): what asks for a choice now. `status` (below it): work, the city, what runs, the news. */
export function EventsPanel({ plot, now, part }: { plot: PlotState; now: number; part: 'actions' | 'status' }) {
  const t = useT()
  const left = (ms: number) => (ms > 2 * 86_400_000 ? t('home.work.days', { count: Math.ceil(ms / 86_400_000), n: Math.ceil(ms / 86_400_000) }) : countdown(ms))
  const [seen, setSeen] = useState(loadSeen)
  // The three latest not yet dismissed, so the homestead stays high on the screen.
  const news = (plot.events?.news ?? []).filter((n) => !seen.includes(n.id)).slice(0, 3)
  const dismiss = (id: string) => {
    const next = [id, ...seen].slice(0, 40)
    setSeen(next)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
    } catch {
      // Private mode: it shows again next time.
    }
  }
  const threat = plot.threat && plot.threat.until > now ? plot.threat : undefined
  const visitors = plot.visitors && plot.visitors > now
  const caravan = caravanLeft(plot, now) > 0
  const tax = taxDue(plot, now)
  const tithe = !titheError(plot, now)
  const city = plot.city
  const chips = [
    city && city.feastUntil > now ? t('home.civic.feastChip', { time: left(city.feastUntil - now) }) : '',
    city && city.aqueductUntil > now ? t('home.civic.aqueductChip', { time: left(city.aqueductUntil - now) }) : '',
    plot.titheUntil && plot.titheUntil > now ? t('home.civic.titheChip', { time: left(plot.titheUntil - now) }) : '',
    plot.drought && plot.drought > now ? t('home.events.droughtChip', { time: left(plot.drought - now) }) : '',
    plot.blessUntil && plot.blessUntil > now ? t('home.events.blessChip', { time: left(plot.blessUntil - now) }) : '',
    plot.rain ? t('home.events.rainChip') : '',
    Object.keys(plot.damage ?? {}).length ? t('home.events.damageChip', { list: Object.keys(plot.damage ?? {}).map((b) => buildingName(b as never)).join(', ') }) : '',
  ].filter(Boolean)
  if (part === 'actions') {
    if (!threat && !tax && !tithe && !visitors && !caravan) return null
    return (
      <div className="hev">
        {threat && <Threat until={threat.until} now={now} />}
        {tax > 0 && <Tax due={tax} />}
        {visitors && <Visitors />}
        {caravan && <Caravan plot={plot} now={now} />}
        {tithe && <Tithe plot={plot} />}
      </div>
    )
  }
  return (
    <div className="hev">
      <WorkCard plot={plot} now={now} />
      {chips.length > 0 && (
        <div className="hev-chips">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      {city && <CityLine plot={plot} />}
      {news.map((n) => (
        <div key={n.id} className={`hev-news ${n.kind}`}>
          <span>{newsText(n)}</span>
          <button className="hev-x" onClick={() => dismiss(n.id)} title={t('home.close')}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/** One line for a piece of news. */
function newsText(n: News): string {
  const lost = n.lost && Object.values(n.lost).some((x) => x) ? listMaterials(n.lost) : ''
  const hits = (n.hits ?? []).map(buildingName).join(', ')
  switch (n.kind) {
    case 'philistines':
      if (!lost && !hits) return tNow('home.events.news.raidSaved')
      return hits ? tNow('home.events.news.raid', { lost: lost || '—', hits }) : tNow('home.events.news.raidLoot', { lost })
    case 'repelled':
      return tNow('home.events.news.repelled')
    case 'quake':
      return tNow('home.events.news.quake', { hits })
    case 'drought':
      return tNow('home.events.news.drought')
    case 'locusts':
      return tNow('home.events.news.locusts', { field: n.field ? buildingName(n.field) : '', lost })
    case 'fire':
      return tNow('home.events.news.fire', { building: n.building ? buildingName(n.building) : '', lost })
    case 'fireOut':
      return tNow('home.events.news.fireOut', { building: n.building ? buildingName(n.building) : '' })
    case 'visitors':
      return tNow('home.events.news.visitors')
    case 'caravan':
      return tNow('home.events.news.caravan', { material: n.material ? materialName(n.material) : '' })
    case 'rain':
      return tNow('home.events.news.rain')
  }
}

function Threat({ until, now }: { until: number; now: number }) {
  const t = useT()
  const { startThreat, busy } = usePlotStore()
  return (
    <div className="hev-card threat">
      <span>
        <strong>{t('home.events.threatCard')}</strong>
        <small>{t('home.events.threatCardSub', { time: countdown(until - now) })}</small>
      </span>
      <button className="hp-btn gold" disabled={busy} onClick={() => void startThreat()}>
        {t('home.events.threatGo')}
      </button>
    </div>
  )
}

function Visitors() {
  const t = useT()
  const { welcomeVisitors, say } = usePlotStore()
  return (
    <div className="hev-card">
      <span>
        <strong>{t('home.events.visitorsCard')}</strong>
        <small>{t('home.events.visitorsSub', { n: VISITORS_BREAD })}</small>
      </span>
      <PayButton
        className="hp-btn gold"
        cost={{ bread: VISITORS_BREAD }}
        label={t('home.events.visitorsGo', { n: VISITORS_BREAD })}
        run={async (buyMissing) => {
          if (await welcomeVisitors(buyMissing)) {
            say(tNow('home.events.visitorsDone'))
            fireConfetti({ y: 0.4, count: 50 })
          }
        }}
      />
    </div>
  )
}

function Caravan({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const { buyCaravan, busy, say } = usePlotStore()
  const coins = useGameStore((s) => s.player.coins)
  const c = plot.caravan!
  const left = caravanLeft(plot, now)
  const qty = Math.min(10, left)
  const price = caravanPrice(c.material, qty)
  return (
    <div className="hev-card">
      <span>
        <strong>{t('home.events.caravanCard', { icon: MATERIAL_INFO[c.material].icon, material: materialName(c.material) })}</strong>
        <small>{t('home.events.caravanSub', { left, pct: Math.round(CARAVAN.share * 100), time: countdown(c.until - now) })}</small>
      </span>
      <button
        className="hp-btn gold"
        disabled={busy || coins < price}
        onClick={async () => {
          if (await buyCaravan(qty)) say(tNow('market.bought', { amount: listMaterials({ [c.material]: qty }) }))
        }}
      >
        ×{qty} <PaintedCoin size={14} /> {price}
      </button>
    </div>
  )
}

/** The tax collector comes on Monday (Luke 19:2): this week's house tax, into the city treasury. */
function Tax({ due }: { due: number }) {
  const t = useT()
  const { payTax, busy, say } = usePlotStore()
  const coins = useGameStore((s) => s.player.coins)
  return (
    <div className="hev-card">
      <span>
        <strong>{t('home.civic.taxCard')}</strong>
        <small>{t('home.civic.taxSub')}</small>
      </span>
      <button
        className="hp-btn gold"
        disabled={busy || coins < due}
        onClick={async () => {
          if (await payTax()) say(tNow('home.civic.taxPaid', { n: due }))
        }}
      >
        <PaintedCoin size={14} /> {due}
      </button>
    </div>
  )
}

/** The week's tithe: a tenth of the homestead's goods to the Temple, a week's blessing. */
function Tithe({ plot }: { plot: PlotState }) {
  const t = useT()
  const { bringTithe, busy, say } = usePlotStore()
  return (
    <div className="hev-card">
      <span>
        <strong>{t('home.civic.titheCard')}</strong>
        <small>{t('home.civic.titheSub', { list: listMaterials(titheOf(plot)) })}</small>
      </span>
      <button
        className="hp-btn gold"
        disabled={busy}
        onClick={async () => {
          const gift = await bringTithe()
          if (gift) {
            say(tNow('home.civic.titheDone'))
            fireConfetti({ y: 0.4, count: 50 })
          }
        }}
      >
        {t('home.civic.titheGo')}
      </button>
    </div>
  )
}

/** The city in one line: its treasury and the Temple's stage; opens the Temple sheet. */
function CityLine({ plot }: { plot: PlotState }) {
  const t = useT()
  const setTempleOpen = usePlotStore((s) => s.setTempleOpen)
  const c = plot.city!
  return (
    <button className="hev-city" onClick={() => setTempleOpen(true)}>
      {t('home.civic.cityLine', { treasury: c.treasury, stage: templeStage(c.temple), stages: TEMPLE_STAGES.length })} ›
    </button>
  )
}
