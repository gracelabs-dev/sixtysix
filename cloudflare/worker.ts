// Entry Worker for 66.gracelabs.dev. Static app files come straight from Cloudflare's asset
// store (run_worker_first in wrangler.jsonc limits this script to the dynamic paths);
// /api, the WebSocket and the health check go to the single GameHost Durable Object.
import { GameHost, VERSION_HEADER, type Env } from './game-server'

export { GameHost }

const MAX_BODY = 1024 * 1024 // same cap Fastify had

const main = (env: Env) => env.GAME.get(env.GAME.idFromName('main'))

async function toGame(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return new Response('Payload too large', { status: 413 })
  // Buffered so the request can be sent again if the object restarts to pick up a new version.
  const body = request.body ? await request.arrayBuffer() : null
  if (body && body.byteLength > MAX_BODY) return new Response('Payload too large', { status: 413 })
  const headers = new Headers(request.headers)
  if (env.CF_VERSION) headers.set(VERSION_HEADER, env.CF_VERSION.id)
  const send = () => main(env).fetch(new Request(request.url, { method: request.method, headers, body }))
  try {
    return await send()
  } catch {
    return send()
  }
}

// The asset store ignores Range, and Safari plays <video> only from byte ranges (206).
async function withRange(request: Request, res: Response): Promise<Response> {
  const buf = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.set('accept-ranges', 'bytes')
  headers.delete('content-encoding')
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!m || (!m[1] && !m[2])) {
    headers.set('content-length', String(buf.byteLength))
    return new Response(request.method === 'HEAD' ? null : buf, { status: 200, headers })
  }
  const size = buf.byteLength
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  headers.set('content-range', `bytes ${start}-${end}/${size}`)
  headers.set('content-length', String(end - start + 1))
  return new Response(request.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers })
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/') || pathname === '/ws' || pathname === '/healthz') return toGame(request, env)
    const isHtml = (r: Response) => (r.headers.get('content-type') ?? '').includes('text/html')
    if (pathname.endsWith('.mp4')) {
      const file = await env.ASSETS.fetch(new Request(request.url, { headers: request.headers }))
      if (file.status === 200 && !isHtml(file)) return withRange(request, file)
      return new Response('Not found', { status: 404 })
    }
    const res = await env.ASSETS.fetch(request)
    // A missing build file must be a 404, not the app page (the single-page fallback): the service
    // worker would cache that page as if it were the script.
    if (pathname.startsWith('/assets/') && isHtml(res)) {
      return new Response('Not found', { status: 404 })
    }
    return res
  },

  async scheduled(_controller, env) {
    await main(env).tick()
  },
} satisfies ExportedHandler<Env>
