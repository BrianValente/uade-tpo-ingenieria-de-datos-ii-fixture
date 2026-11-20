import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'

type CacheResult = 'hit' | 'miss' | 'error'

const resource = { attributes: [attribute('service.name', 'fixture2030-api')] }
const scope = { name: 'fixture2030.h13' }

function attribute(key: string, value: string | number) {
  return {
    key,
    value:
      typeof value === 'string'
        ? { stringValue: value }
        : { intValue: String(value) },
  }
}

function unixNano(ms: number) {
  return String(
    BigInt(Math.round(performance.timeOrigin * 1e3)) * 1000n +
      BigInt(Math.round(ms * 1e6)),
  )
}

interface RequestContext {
  traceId: string
  spanId: string
  start: number
  method: string
  route: string
  requestId: string
  cacheResult?: CacheResult
  children: ClientSpan[]
}

interface ClientSpan {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: ReturnType<typeof attribute>[]
  status: { code: number }
}

export class RequestTelemetry {
  private readonly active = new AsyncLocalStorage<RequestContext>()
  private readonly requests = new WeakMap<object, RequestContext>()
  private readonly sending = new Set<Promise<void>>()
  private readonly tempo: string
  private readonly loki: string
  private nextWarningAt = 0

  constructor(tempo: string, loki: string) {
    this.tempo = tempo
    this.loki = loki
  }

  begin(
    request: { id: string; method: string; routeOptions?: { url?: string } },
    reply: { header: (key: string, value: string) => unknown },
    done: () => void,
  ) {
    const route = request.routeOptions?.url
    if (
      !route ||
      route === '/metrics' ||
      route === '/health' ||
      route.startsWith('/docs')
    )
      return done()
    const ctx: RequestContext = {
      traceId: randomBytes(16).toString('hex'),
      spanId: randomBytes(8).toString('hex'),
      start: performance.now(),
      method: request.method,
      route,
      requestId: request.id,
      children: [],
    }
    this.requests.set(request, ctx)
    reply.header('x-trace-id', ctx.traceId)
    this.active.run(ctx, done)
  }

  operation(
    name: string,
    start: number,
    ok: boolean,
    cacheResult?: CacheResult,
  ) {
    const ctx = this.active.getStore()
    if (!ctx) return
    if (cacheResult) ctx.cacheResult = cacheResult
    ctx.children.push({
      traceId: ctx.traceId,
      spanId: randomBytes(8).toString('hex'),
      parentSpanId: ctx.spanId,
      name,
      kind: 3,
      startTimeUnixNano: unixNano(start),
      endTimeUnixNano: unixNano(performance.now()),
      attributes: cacheResult ? [attribute('cache.result', cacheResult)] : [],
      status: { code: ok ? 0 : 2 },
    })
  }

  finish(request: object, status: number) {
    const ctx = this.requests.get(request)
    if (!ctx) return
    this.requests.delete(request)
    // Un receptor lento puede perder telemetría sin bloquear las respuestas de la API.
    if (this.sending.size >= 16) {
      this.warn('exportador saturado')
      return
    }
    const end = performance.now()
    const endTimeUnixNano = unixNano(end)
    const attributes = [
      attribute('http.route', ctx.route),
      attribute('http.request.method', ctx.method),
      attribute('http.response.status_code', status),
      attribute('request.id', ctx.requestId),
    ]
    if (ctx.cacheResult)
      attributes.push(attribute('cache.result', ctx.cacheResult))
    const root = {
      name: ctx.method + ' ' + ctx.route,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      kind: 2,
      startTimeUnixNano: unixNano(ctx.start),
      endTimeUnixNano,
      attributes,
      status: { code: status >= 500 ? 2 : 0 },
    }
    const record = {
      timeUnixNano: endTimeUnixNano,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      severityNumber: status >= 500 ? 17 : 9,
      severityText: status >= 500 ? 'ERROR' : 'INFO',
      body: {
        stringValue: JSON.stringify({
          trace_id: ctx.traceId,
          request_id: ctx.requestId,
          method: ctx.method,
          route: ctx.route,
          status_code: status,
          duration_ms: Math.round((end - ctx.start) * 100) / 100,
          cache_result: ctx.cacheResult,
        }),
      },
    }
    const sending = Promise.all([
      this.post(this.tempo, {
        resourceSpans: [
          { resource, scopeSpans: [{ scope, spans: [root, ...ctx.children] }] },
        ],
      }),
      this.post(this.loki, {
        resourceLogs: [
          { resource, scopeLogs: [{ scope, logRecords: [record] }] },
        ],
      }),
    ]).then(() => {
      this.sending.delete(sending)
    })
    this.sending.add(sending)
  }

  private async post(endpoint: string, payload: unknown) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2000),
        redirect: 'error',
      })
      await response.body?.cancel()
      if (!response.ok) this.warn('el receptor rechazó el envío')
    } catch {
      this.warn('receptor inaccesible')
    }
  }

  private warn(reason: string) {
    if (Date.now() < this.nextWarningAt) return
    this.nextWarningAt = Date.now() + 60_000
    console.warn('[Hito 13] Telemetría incompleta:', reason)
  }

  async drain() {
    await Promise.all(this.sending)
  }
}
