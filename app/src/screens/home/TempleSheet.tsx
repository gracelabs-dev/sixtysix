import { useEffect, useState } from 'react'
import { MATERIAL_INFO, MATERIALS, PROJECTS, TEMPLE_FOR_HOUSE, TEMPLE_STAGES, giftable, giftValue, templeStage, type Material, type PlotState } from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { fireConfetti } from '../../motion'
import { t as tNow, useLocale, useT } from '../../i18n'
import { Sheet } from './parts'
import { listMaterials, materialName } from './plotText'

/**
 * The city of Jerusalem (shared/src/civic.ts): the treasury and what it pays
 * for, the Temple the whole city raises by its gifts, its givers, and a gift
 * of your own.
 */

interface CityInfo {
  treasury: number
  temple: number
  stage: number
  feastUntil: number
  aqueductUntil: number
  donors: { name: string; given: number }[]
}

const AMOUNTS = [10, 50, 200]

export function TempleSheet({ plot }: { plot: PlotState }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const { setTempleOpen, giveTemple, busy, say } = usePlotStore()
  const [info, setInfo] = useState<CityInfo | null>(null)
  const [m, setM] = useState<Material>(() => MATERIALS.find((x) => giftable(x) && plot.inventory[x] > 0) ?? 'stone')
  const [qty, setQty] = useState(10)
  const refresh = () =>
    void fetch('/api/city/state')
      .then((r) => r.json() as Promise<CityInfo & { ok: boolean }>)
      .then((d) => d.ok && setInfo(d))
      .catch(() => undefined)
  useEffect(refresh, [])

  const temple = info?.temple ?? plot.city?.temple ?? 0
  const stage = templeStage(temple)
  const next = TEMPLE_STAGES[stage]
  const prev = stage ? TEMPLE_STAGES[stage - 1] : 0
  const pct = next ? Math.min(100, ((temple - prev) / (next - prev)) * 100) : 100
  const have = plot.inventory[m]
  const n = Math.min(qty, have)
  const num = (x: number) => Math.round(x).toLocaleString(locale)
  const mine = plot.templeGiven ?? 0
  const needs = Object.entries(TEMPLE_FOR_HOUSE)
    .filter(([h]) => Number(h) > plot.levels.house)
    .map(([h, v]) => t('home.civic.templeNeed', { house: h, n: num(v ?? 0) }))

  return (
    <Sheet closeTitle={t('home.close')} onClose={() => setTempleOpen(false)}>
      <div className="hp-sheet-body tpl">
        <h3>{t('home.civic.templeTitle')}</h3>
        <p className="hp-what">
          {t('home.civic.templeWhat')} <em>1 Chr 29:9</em>
        </p>
        <div className="tpl-stage">
          <strong>{stage ? t(`home.civic.stage.${stage}`) : t('home.civic.stage.0')}</strong>
          <span className="hp-bar big">
            <span style={{ width: `${pct}%` }} />
          </span>
          <small>{next ? t('home.civic.templeNext', { n: num(temple), next: num(next), name: t(`home.civic.stage.${stage + 1}`) }) : t('home.civic.templeDone')}</small>
        </div>
        <p className="hp-what">
          {t('home.civic.yourGifts', { n: num(mine) })} {needs.join(' · ')}
        </p>

        <div className="hp-row-box tpl-give">
          <select value={m} onChange={(e) => setM(e.target.value as Material)}>
            {MATERIALS.filter((x) => giftable(x) && plot.inventory[x] > 0).map((x) => (
              <option key={x} value={x}>
                {MATERIAL_INFO[x].icon} {materialName(x)} ({plot.inventory[x]})
              </option>
            ))}
          </select>
          <span className="seg-row">
            {AMOUNTS.map((a) => (
              <button key={a} className={`seg-btn ${qty === a ? 'selected' : ''}`} onClick={() => setQty(a)}>
                ×{a}
              </button>
            ))}
          </span>
          <button
            className="hp-btn gold"
            disabled={busy || n <= 0}
            onClick={async () => {
              if (await giveTemple(m, n)) {
                say(tNow('home.civic.gave', { list: listMaterials({ [m]: n }), n: num(giftValue({ [m]: n })) }))
                fireConfetti({ y: 0.5, count: 40 })
                refresh()
              }
            }}
          >
            {t('home.civic.give', { list: listMaterials({ [m]: n }) })}
          </button>
        </div>

        <h4>{t('home.civic.treasuryTitle', { n: num(info?.treasury ?? plot.city?.treasury ?? 0) })}</h4>
        <p className="hp-what">{t('home.civic.treasuryWhat', { feast: num(PROJECTS.feast.cost), aqueduct: num(PROJECTS.aqueduct.cost) })}</p>

        {info && info.donors.length > 0 && (
          <>
            <h4>{t('home.civic.donors')}</h4>
            <ol className="tpl-donors">
              {info.donors.map((d) => (
                <li key={d.name}>
                  <span>{d.name}</span> <b>{num(d.given)}</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Sheet>
  )
}
