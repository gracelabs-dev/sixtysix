import { GOVERNOR, JOB_HOUSE, JOB_IDS, JOBS, SHIFT_PAY, SHIFT_QUESTIONS, governorError, levelForXp, shiftError, takeJobError, weekStartUtc, type PlotState } from '@sixtysix/shared'
import { usePlotStore } from '../../plot/plotStore'
import { useAccountStore } from '../../account/accountStore'
import { useGameStore } from '../../game/store'
import { t as tNow, tServer, useLocale, useT } from '../../i18n'
import { countdown } from './homeUtil'
import { Sheet } from './parts'
import { listMaterials } from './plotText'

/**
 * Work in the city (shared/src/jobs.ts): pick a job, work today's shift,
 * and the governor's seat: who holds it, what it takes, and, for the
 * governor, the city's toll, its first project and a feast.
 */

/** The card above the scene: your job and today's shift, or an offer of work. */
export function WorkCard({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const { startShift, setWorkOpen, busy } = usePlotStore()
  if (plot.levels.house < JOB_HOUSE) return null
  const job = plot.job
  const open = job && !shiftError(plot, now)
  return (
    <div className="hev-card">
      <span>
        <strong>{job ? t('home.work.jobLine', { icon: JOBS[job.id].icon, job: t(`home.work.jobs.${job.id}.name`) }) : t('home.work.findWork')}</strong>
        <small>{job ? (open ? t('home.work.shiftReady', { n: SHIFT_QUESTIONS, pay: SHIFT_PAY }) : t('home.work.shiftToday')) : t('home.work.findSub')}</small>
      </span>
      <span className="hev-btns">
        {open && (
          <button className="hp-btn gold" disabled={busy} onClick={() => void startShift()}>
            {t('home.work.shiftGo')}
          </button>
        )}
        <button className="hp-btn" onClick={() => setWorkOpen(true)}>
          {t('home.work.more')}
        </button>
      </span>
    </div>
  )
}

export function WorkSheet({ plot, now }: { plot: PlotState; now: number }) {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const { setWorkOpen, takeJob, startExam, startShift, govern, busy, say, error } = usePlotStore()
  const username = useAccountStore((s) => s.account?.username ?? '')
  const xp = useGameStore((s) => s.player.xp)
  const coins = useGameStore((s) => s.player.coins)
  const city = plot.city
  const isGovernor = !!city?.governor && city.governor === username && (city.governorUntil ?? 0) > now
  const why = governorError(plot, xp, coins, weekStartUtc(now), isGovernor)
  const shifts = plot.job?.shifts ?? 0
  const num = (n: number) => n.toLocaleString(locale)
  // Long spans in days, short ones as a clock.
  const left = (ms: number) => (ms > 2 * 86_400_000 ? t('home.work.days', { count: Math.ceil(ms / 86_400_000), n: Math.ceil(ms / 86_400_000) }) : countdown(ms))
  const reqs = [
    { ok: plot.levels.house >= GOVERNOR.house, text: t('home.work.reqHouse', { n: GOVERNOR.house }) },
    { ok: levelForXp(xp) >= GOVERNOR.level, text: t('home.work.reqLevel', { n: GOVERNOR.level, have: levelForXp(xp) }) },
    { ok: shifts >= GOVERNOR.shifts, text: t('home.work.reqShifts', { n: GOVERNOR.shifts, have: shifts }) },
    { ok: coins >= GOVERNOR.fee, text: t('home.work.reqFee', { n: num(GOVERNOR.fee) }) },
    { ok: true, text: t('home.work.reqExam', { n: GOVERNOR.examPass, total: GOVERNOR.examQuestions }) },
  ]

  return (
    <Sheet closeTitle={t('home.close')} onClose={() => setWorkOpen(false)}>
      <div className="hp-sheet-body work">
        <h3>{t('home.work.title')}</h3>
        <p className="hp-what">{t('home.work.what', { n: SHIFT_QUESTIONS, pay: SHIFT_PAY })}</p>
        {plot.job && !shiftError(plot, now) && (
          <button className="hp-btn gold big" disabled={busy} onClick={() => void startShift()}>
            {t('home.work.shiftGo')} · {t('home.work.shiftReady', { n: SHIFT_QUESTIONS, pay: SHIFT_PAY })}
          </button>
        )}
        <ul className="work-jobs">
          {JOB_IDS.map((id) => {
            const mine = plot.job?.id === id
            const no = takeJobError(plot, id, now)
            return (
              <li key={id} className={mine ? 'mine' : ''}>
                <span className="work-icon">{JOBS[id].icon}</span>
                <span className="work-name">
                  <strong>{t(`home.work.jobs.${id}.name`)}</strong>
                  <small>
                    {t(`home.work.jobs.${id}.what`)} · {listMaterials(JOBS[id].bonus)} · <em>{JOBS[id].verse}</em>
                  </small>
                </span>
                {mine ? (
                  <b className="work-mine">{t('home.work.yours')}</b>
                ) : (
                  <button
                    className="hp-btn small"
                    disabled={busy || !!no}
                    title={no === 'switch' ? t('home.work.switchWait', { time: left(plot.job!.since + 7 * 86_400_000 - now) }) : undefined}
                    onClick={async () => {
                      if (await takeJob(id)) say(tNow('home.work.taken', { job: tNow(`home.work.jobs.${id}.name`) }))
                    }}
                  >
                    {t('home.work.take')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="hp-what">{t('home.work.shifts', { n: shifts })}</p>

        <h4>{t('home.work.governorTitle')}</h4>
        <p className="hp-what">
          {city?.governor && (city.governorUntil ?? 0) > now
            ? t('home.work.governorIs', { name: city.governor, time: left((city.governorUntil ?? now) - now) })
            : t('home.work.governorNone')}{' '}
          {t('home.work.governorWhat', { factor: GOVERNOR.payFactor })} <em>Neh 5:14</em>
        </p>
        {isGovernor ? (
          <div className="work-powers">
            <span>{t('home.work.toll', { pct: Math.round((city?.toll ?? 0.1) * 100) })}</span>
            <span className="seg-row">
              {[0.05, 0.1, 0.15].map((x) => (
                <button key={x} className={`seg-btn ${Math.abs((city?.toll ?? 0.1) - x) < 0.001 ? 'selected' : ''}`} disabled={busy} onClick={() => void govern({ toll: x })}>
                  {Math.round(x * 100)} %
                </button>
              ))}
            </span>
            <span>{t('home.work.first')}</span>
            <span className="seg-row">
              {(['feast', 'aqueduct'] as const).map((p) => (
                <button key={p} className="seg-btn" disabled={busy} onClick={async () => (await govern({ first: p })) && say(tNow('home.work.firstSet', { project: tNow(`home.work.projects.${p}`) }))}>
                  {t(`home.work.projects.${p}`)}
                </button>
              ))}
            </span>
            <button className="hp-btn gold" disabled={busy} onClick={async () => (await govern({ feast: true })) && say(tNow('home.work.feastDeclared'))}>
              {t('home.work.declareFeast')}
            </button>
          </div>
        ) : (
          <>
            <ul className="hp-reqs">
              {reqs.map((r) => (
                <li key={r.text} className={r.ok ? 'ok' : 'short'}>
                  {r.ok ? '✓' : '✗'} {r.text}
                </li>
              ))}
            </ul>
            <button className="hp-btn gold big" disabled={busy || !!why} onClick={() => void startExam()}>
              {why === 'week' ? t('home.work.examWeek') : why === 'already' ? t('home.work.examAlready') : t('home.work.examGo')}
            </button>
          </>
        )}
        {error && <p className="hp-error">{tServer(error)}</p>}
      </div>
    </Sheet>
  )
}
