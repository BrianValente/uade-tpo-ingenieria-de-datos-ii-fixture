import { readdir, readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyGrafanaAndPanels } from '../../../hito-13-monitoreo/scripts/verificar_targets.js'

const grafana = 'http://grafana.invalid'
const healthUid = 'fixture2030-hito13-obs'
const traceId = '0d30438e96e63d748f37c7b14a910429'

interface Dashboard {
  uid: string
  panels: Array<{
    id: number
    targets: Array<{
      expr?: string
      datasource?: { uid: string }
      hide?: boolean
    }>
  }>
}

async function fakeGrafana(
  options: {
    missingSource?: string
    wrongSourceType?: string
    missingDashboard?: string
    missingPanel?: number
    targetDatasource?: string
    invalidSecondTarget?: boolean
    proxyNetworkError?: boolean
    proxyStatus?: number
    malformedResult?: 'loki' | 'tempo' | 'prometheus'
    wrongDetailLog?: boolean
    empty?: boolean
    health?: string
  } = {},
) {
  const dir = new URL(
    '../../../hito-13-monitoreo/grafana/dashboards/',
    import.meta.url,
  )
  const dashboards: Dashboard[] = await Promise.all(
    (await readdir(dir))
      .filter((name) => name.endsWith('.json'))
      .map(async (name) =>
        JSON.parse(await readFile(new URL(name, dir), 'utf8')),
      ),
  )
  const health = dashboards.find((d) => d.uid === healthUid)!
  if (options.missingPanel)
    health.panels = health.panels.filter((p) => p.id !== options.missingPanel)
  if (options.targetDatasource)
    health.panels[0]!.targets[0]!.datasource = { uid: options.targetDatasource }
  if (options.invalidSecondTarget)
    health.panels.find((p) => p.targets.length > 1)!.targets[1]!.expr =
      'invalid_second_target('
  const requests: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      requests.push(url)
      if (url.origin !== grafana) throw new Error('Consulta fuera de Grafana')
      if (url.pathname === '/api/health')
        return Response.json({ database: options.health ?? 'ok' })
      if (url.pathname === '/api/search')
        return Response.json(
          dashboards
            .filter((d) => d.uid !== options.missingDashboard)
            .map((d) => ({ uid: d.uid })),
        )
      if (url.pathname === '/api/datasources')
        return Response.json(
          ['prometheus', 'loki', 'tempo']
            .filter((type) => type !== options.missingSource)
            .map((type) => ({
              uid: type + '_fixture2030',
              type: type === options.wrongSourceType ? 'invalid' : type,
            })),
        )
      if (url.pathname.startsWith('/api/dashboards/uid/')) {
        const dashboard = dashboards.find(
          (d) => d.uid === url.pathname.split('/').pop(),
        )
        return Response.json({ dashboard: { ...dashboard, id: 1 } })
      }
      if (options.proxyNetworkError)
        throw new Error('Grafana proxy unreachable')
      if (options.proxyStatus)
        return new Response(null, { status: options.proxyStatus })
      const expr = url.searchParams.get('query')
      const proxy = '/api/datasources/proxy/uid/'
      if (url.pathname === proxy + 'prometheus_fixture2030/api/v1/query') {
        if (expr === 'invalid_second_target(')
          return Response.json({ status: 'error' })
        return Response.json({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [
              {
                metric: {},
                value: [
                  1,
                  options.malformedResult === 'prometheus' ? 'bad' : '12345',
                ],
              },
            ],
          },
        })
      }
      if (url.pathname === proxy + 'loki_fixture2030/loki/api/v1/query_range') {
        expect(expr).not.toContain('${')
        const detail = url.searchParams.get('limit') === '1'
        if (detail) expect(expr).toContain(traceId)
        else {
          expect(url.searchParams.get('limit')).toBe('200')
          expect(expr).toContain('endpoint =~ `.*`')
        }
        const id = options.wrongDetailLog && detail ? 'f'.repeat(32) : traceId
        const row = ['1795193183310549586', JSON.stringify({ trace_id: id })]
        return Response.json({
          status: 'success',
          data: {
            resultType: 'streams',
            result: options.empty
              ? []
              : [
                  {
                    stream: { service_name: 'fixture2030-api' },
                    values: [
                      options.malformedResult === 'loki'
                        ? ['bad', 'invalid-log']
                        : row,
                    ],
                  },
                ],
          },
        })
      }
      if (url.pathname === proxy + 'tempo_fixture2030/api/traces/' + traceId) {
        return Response.json({
          batches: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId:
                        options.malformedResult === 'tempo'
                          ? 'bad'
                          : Buffer.from(traceId, 'hex').toString('base64'),
                    },
                  ],
                },
              ],
            },
          ],
        })
      }
      throw new Error('Ruta de prueba desconocida ' + url.pathname)
    }),
  )
  return { health, requests }
}

afterEach(() => vi.unstubAllGlobals())

describe('Verificación de dashboards mediante el proxy de Grafana', () => {
  it('ejecuta cada PromQL de salud, resuelve los filtros de los listados y abre la misma traza en el detalle', async () => {
    const { health, requests } = await fakeGrafana()
    const report = await verifyGrafanaAndPanels(grafana)
    const expected = health.panels.flatMap((panel) =>
      panel.targets.filter((t) => !t.hide).map((t) => t.expr),
    )
    expect(
      requests
        .filter((u) => u.pathname.endsWith('/api/v1/query'))
        .map((u) => u.searchParams.get('query')),
    ).toEqual(expected)
    expect(
      report.panelsVerified
        .filter((p) => p.dashboardUid === healthUid)
        .map((p) => p.expr),
    ).toEqual(expected)
    expect(report.panelsVerified[0]!.sampleValue).toBe('12345.000')
    expect(
      report.panelsVerified
        .filter((p) => p.datasource !== 'prometheus')
        .map((p) => [p.dashboardUid, p.datasource, p.sampleValue]),
    ).toEqual([
      ['fixture2030-trazas', 'loki', traceId],
      ['fixture2030-logs', 'loki', traceId],
      ['fixture2030-pedido', 'loki', traceId],
      ['fixture2030-pedido', 'tempo', traceId],
    ])
  })

  it('informa una ventana sin tráfico y no inventa un ID de traza para abrir el detalle', async () => {
    const { requests } = await fakeGrafana({ empty: true })
    const report = await verifyGrafanaAndPanels(grafana)
    expect(
      report.panelsVerified
        .filter((p) => p.datasource !== 'prometheus')
        .every((p) => p.seriesCount === 0 && p.sampleValue === 'sin muestras'),
    ).toBe(true)
    expect(requests.some((u) => u.pathname.includes('/api/traces/'))).toBe(
      false,
    )
  })

  it.each([
    { missingDashboard: 'fixture2030-hito13-obs' },
    { missingDashboard: 'fixture2030-trazas' },
    { missingDashboard: 'fixture2030-logs' },
    { missingDashboard: 'fixture2030-pedido' },
    { targetDatasource: 'another-prometheus' },
    { invalidSecondTarget: true },
    { proxyNetworkError: true },
    { proxyStatus: 500 },
    { health: 'error' },
    { missingSource: 'loki' },
    { wrongSourceType: 'tempo' },
    { missingPanel: 9 },
    { malformedResult: 'loki' as const },
    { malformedResult: 'tempo' as const },
    { malformedResult: 'prometheus' as const },
    { wrongDetailLog: true },
  ])('rechaza una verificación incompleta o fallida: %j', async (options) => {
    await fakeGrafana(options)
    await expect(verifyGrafanaAndPanels(grafana)).rejects.toThrow()
  })
})
