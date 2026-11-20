import { afterEach, expect, it, vi } from 'vitest'

import { RequestTelemetry } from '../../../hito-13-monitoreo/scripts/telemetria.js'

afterEach(() => vi.unstubAllGlobals())

it('correlaciona un hit y un miss simultáneos sin publicar datos privados del pedido', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null))
  vi.stubGlobal('fetch', send)
  const telemetry = new RequestTelemetry(
    'http://tempo/traces',
    'http://loki/logs',
  )
  const pending = (['miss', 'hit'] as const).map((cache) => {
    const request = {
      id: 'request-' + cache,
      method: 'GET',
      routeOptions: { url: '/partidos/:id' },
      url: '/partidos/partido-privado?usuario=perfil-privado',
      headers: { authorization: 'Bearer token-privado' },
      body: { comentario: 'comentario-privado' },
    }
    const headers = new Headers()
    const done = new Promise<void>((resolve) => {
      telemetry.begin(request, { header: headers.set.bind(headers) }, () => {
        // Los dos pedidos empiezan antes de que termine la primera lectura.
        queueMicrotask(() => {
          telemetry.operation('redis.cache.get', performance.now(), true, cache)
          if (cache === 'miss')
            telemetry.operation('neo4j.match', performance.now(), true)
          telemetry.finish(request, 200)
          resolve()
        })
      })
    })
    return { cache, headers, done, request }
  })
  await Promise.all(pending.map((p) => p.done))
  await telemetry.drain()

  const batches = send.mock.calls.map(([url, init]) => ({
    url: String(url),
    body: String(init?.body),
  }))
  expect(batches).toHaveLength(4)
  expect(JSON.stringify(batches)).not.toMatch(
    /partido-privado|perfil-privado|token-privado|comentario-privado/,
  )
  const ids = pending.map((p) => p.headers.get('x-trace-id'))
  expect(new Set(ids).size).toBe(2)
  for (const { cache, headers, request } of pending) {
    const id = headers.get('x-trace-id')!
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    const payload = (url: string) =>
      JSON.parse(
        batches.find((batch) => batch.url === url && batch.body.includes(id))!
          .body,
      )
    const spans = payload('http://tempo/traces').resourceSpans[0].scopeSpans[0]
      .spans as Array<{ name: string; spanId: string }>
    const [root, ...children] = spans
    expect(root).toMatchObject({ name: 'GET /partidos/:id', traceId: id })
    expect(children.map((child) => child.name)).toEqual(
      cache === 'hit'
        ? ['redis.cache.get']
        : ['redis.cache.get', 'neo4j.match'],
    )
    for (const child of children)
      expect(child).toMatchObject({ traceId: id, parentSpanId: root!.spanId })
    const [log] =
      payload('http://loki/logs').resourceLogs[0].scopeLogs[0].logRecords
    expect(log).toMatchObject({ traceId: id, spanId: root!.spanId })
    expect(JSON.parse(log.body.stringValue)).toMatchObject({
      trace_id: id,
      request_id: request.id,
      route: '/partidos/:id',
      cache_result: cache,
    })
  }
})
