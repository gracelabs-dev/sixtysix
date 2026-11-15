// Arena load test: several hosted games at once, each with many simulated phones, over the
// production /ws protocol (cloudflare/test/ws-client.mjs wire format).
//
//   node scripts/load-test.mjs [base] [--rooms=25,60,100,100] [--questions=5] [--modes=classic,goliath,wall,classic]
//                              [--board] [--rejoin=0.05] [--ramp=20]
//
// base defaults to http://127.0.0.1:8787 (npm run cf:dev). Every simulated player joins over
// --ramp seconds, answers at a human-ish random moment, a few drop and rejoin mid-game, and
// each room gets one spectator board with --board. Reports join/answer round-trip latency,
// broadcast skew across a room and any event a phone should have received but didn't.
import { connect } from '../cloudflare/test/ws-client.mjs'

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=')
  return [k, v ?? 'true']
}))
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:8787'
const sizes = (args.rooms ?? '25,60,100,100').split(',').map(Number)
const modes = (args.modes ?? 'classic,goliath,wall,classic').split(',')
const questions = Number(args.questions ?? 5)
const rejoinShare = Number(args.rejoin ?? 0.05)
const rampMs = Number(args.ramp ?? 20) * 1000
const board = args.board !== 'false'

const t0 = Date.now()
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rid = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
const pct = (xs, p) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const fmt = (xs) => xs.length ? `p50 ${pct(xs, 50)} ms · p95 ${pct(xs, 95)} ms · max ${Math.max(...xs)} ms (n=${xs.length})` : '—'

const stats = {
  joinMs: [], answerEchoMs: [], questionSkewMs: [], revealSkewMs: [], joinErrors: [], connectErrors: 0,
  closedUnexpectedly: 0, bytes: 0, frames: 0, rejoins: 0, rejoinMs: [], answerLost: 0,
}

/** One phone. Records when each event arrived, answers like a person. */
async function player(room, i) {
  const secret = rid()
  const name = `Load ${room.label}-${i}`
  let sock
  let publicId = ''
  const got = { question: 0, reveal: 0, yourResult: 0, leaderboard: 0, podium: 0 }
  let answeredAt = 0
  let pendingAnswerQ = -1
  let currentQ = -1
  let done = false

  const wire = (s) => {
    s.on('game:question', (q, phase) => {
      if (phase !== 'question') return
      if (q.index === currentQ) return // re-sent after a rejoin
      ;(room.qArrivals[q.index] ??= []).push(Date.now())
      currentQ = q.index
      got.question++
      // Most answer within 3–12 s, a few late, ~5 % never.
      if (Math.random() < 0.05) return
      const delay = Math.random() < 0.85 ? 3000 + Math.random() * 9000 : 12000 + Math.random() * 7000
      setTimeout(() => {
        if (currentQ !== q.index || done) return
        answeredAt = Date.now()
        pendingAnswerQ = q.index
        sock.emit('player:answer', { index: Math.floor(Math.random() * 4) })
      }, delay)
    })
    s.on('game:answerCount', (_n, ids) => {
      if (pendingAnswerQ >= 0 && ids.includes(publicId)) {
        stats.answerEchoMs.push(Date.now() - answeredAt)
        pendingAnswerQ = -1
      }
    })
    s.on('game:reveal', () => {
      got.reveal++
      ;(room.revealArrivals[currentQ] ??= []).push(Date.now())
      if (pendingAnswerQ >= 0) { stats.answerLost++; pendingAnswerQ = -1 }
    })
    s.on('game:yourResult', () => got.yourResult++)
    s.on('game:leaderboard', () => got.leaderboard++)
    s.on('game:podium', () => { got.podium++; done = true })
    s.on('room:closed', () => { done = true })
  }

  const open = async () => {
    const s = connect(base)
    try { await s.ready; s.keepAlive() } catch { stats.connectErrors++; return null }
    // Count every frame the phone receives (bandwidth the server pushes).
    const raw = s.log
    let seen = 0
    s.on('room:state', () => {})
    const meter = setInterval(() => { stats.frames += raw.length - seen; seen = raw.length }, 1000)
    s.meter = meter
    wire(s)
    return s
  }

  sock = await open()
  if (!sock) return { ok: false, got }
  const tj = Date.now()
  const res = await sock.call('room:join', { code: room.code, name, avatar: 'david', playerId: secret, xp: Math.floor(Math.random() * 5000) })
  if (!res.ok) { stats.joinErrors.push(res.error); sock.close(); clearInterval(sock.meter); return { ok: false, got } }
  stats.joinMs.push(Date.now() - tj)
  publicId = res.playerId

  // Some phones lose the connection once mid-game (screen lock, wifi hop) and come back.
  if (Math.random() < rejoinShare) {
    room.started.then(async () => {
      await sleep(15000 + Math.random() * 40000)
      if (done) return
      sock.close(); clearInterval(sock.meter)
      await sleep(1000 + Math.random() * 3000)
      sock = await open()
      if (!sock) return
      const tr = Date.now()
      const r = await sock.call('room:join', { code: room.code, name, avatar: 'david', playerId: secret })
      if (r.ok) { stats.rejoins++; stats.rejoinMs.push(Date.now() - tr) } else stats.joinErrors.push('rejoin: ' + r.error)
    })
  }

  await room.finished
  await sleep(500)
  sock.close(); clearInterval(sock.meter)
  return { ok: true, got }
}

async function runRoom(size, mode, label) {
  const host = (await connect(base).ready).keepAlive()
  const created = await host.call('room:create', { hostId: rid(), config: { questionCount: questions, roomType: 'in-person', mode } })
  if (!created.ok) throw new Error('create: ' + created.error)
  const room = { code: created.state.code, label, qArrivals: [], revealArrivals: [] }
  let startedResolve, finishedResolve
  room.started = new Promise((r) => (startedResolve = r))
  room.finished = new Promise((r) => (finishedResolve = r))
  host.on('room:state', (st) => { if (st.phase === 'podium') finishedResolve() })
  host.on('room:closed', () => finishedResolve())
  console.log(ts(), `room ${label} ${room.code}: ${mode}, ${size} players`)

  let watcher
  if (board) { watcher = (await connect(base).ready).keepAlive(); await watcher.call('room:watch', { code: room.code }) }

  const phones = []
  for (let i = 0; i < size; i++) {
    phones.push(player(room, i))
    await sleep(rampMs / size)
  }
  await sleep(1500)
  host.emit('host:start')
  startedResolve()
  console.log(ts(), `room ${label}: started`)
  const timeout = sleep((10 + questions * 40) * 1000).then(() => 'timeout')
  const end = await Promise.race([room.finished.then(() => 'podium'), timeout])
  console.log(ts(), `room ${label}: ${end}`)
  finishedResolve()
  const results = await Promise.all(phones)
  host.close(); watcher?.close()

  for (const arr of room.qArrivals) if (arr?.length) stats.questionSkewMs.push(Math.max(...arr) - Math.min(...arr))
  for (const arr of room.revealArrivals) if (arr?.length) stats.revealSkewMs.push(Math.max(...arr) - Math.min(...arr))
  const joined = results.filter((r) => r.ok)
  const short = (k, want) => joined.filter((r) => r.got[k] < want).length
  return {
    label, code: room.code, mode, size, end, joined: joined.length,
    missing: {
      question: short('question', questions), reveal: short('reveal', questions),
      yourResult: short('yourResult', questions), podium: short('podium', 1),
    },
  }
}

console.log(ts(), `target ${base} · rooms ${sizes.join(', ')} · ${questions} questions · rejoin ${rejoinShare * 100}% · board ${board}`)
const runs = await Promise.all(sizes.map((n, i) => runRoom(n, modes[i % modes.length], String.fromCharCode(65 + i))))

console.log('\n── results ─────────────────────────────────────────────')
for (const r of runs) {
  const miss = Object.entries(r.missing).filter(([, n]) => n).map(([k, n]) => `${n} short of ${k}`).join(', ') || 'every phone got every event'
  console.log(`room ${r.label} ${r.code} (${r.mode}): ${r.joined}/${r.size} joined, ended ${r.end}; ${miss}`)
}
console.log(`total phones          ${sizes.reduce((a, b) => a + b, 0)} (+ ${sizes.length} hosts${board ? ` + ${sizes.length} boards` : ''})`)
console.log(`join ack              ${fmt(stats.joinMs)}`)
console.log(`answer → seen echo    ${fmt(stats.answerEchoMs)}`)
console.log(`question skew in room ${fmt(stats.questionSkewMs)}`)
console.log(`reveal skew in room   ${fmt(stats.revealSkewMs)}`)
console.log(`rejoins               ${stats.rejoins} ok, ${fmt(stats.rejoinMs)}`)
console.log(`answers not echoed    ${stats.answerLost}`)
console.log(`connect errors        ${stats.connectErrors}`)
console.log(`join errors           ${stats.joinErrors.length}${stats.joinErrors.length ? ': ' + [...new Set(stats.joinErrors)].join('; ') : ''}`)
console.log(`frames received       ${stats.frames}`)
process.exit(0)
