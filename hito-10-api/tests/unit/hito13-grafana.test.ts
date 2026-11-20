import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyGrafanaAndPanels } from '../../../hito-13-monitoreo/scripts/verificar_targets.js'

const grafana = 'http://grafana.invalid'
const datasourceUid = 'prometheus_fixture2030'
const traceId = '0d30438e96e63d748f37c7b14a910429'
const dashboardUid = 'fixture2030-hito13-obs'

async function fakeGrafana(
  options: {
    datasource?: string
    dashboard?: string
    targetDatasource?: string
    invalidSecondTarget?: boolean
    proxyNetworkError?: boolean
    proxyStatus?: number
    malformedProxy?: boolean
    missingSource?: string
    wrongSourceType?: string
    missingPanel?: number
    malformedResult?: 'loki' | 'tempo' | 'prometheus'
    empty?: boolean
    health?: string
  } = {},
) {
  const dashboard = JSON.parse(
    await readFile(
      new URL(
        '../../../hito-13-monitoreo/grafana/dashboards/fixture2030_observabilidad.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    uid: string
    panels: Array<{
      id: number
      targets: Array<{
        refId: string
        expr?: string
        query?: string
        hide?: boolean
        datasource?: { uid: string }
      }>
    }>
  }
  dashboard.panels = dashboard.panels.filter(
    (p) => p.id !== options.missingPanel,
  )
  if (options.targetDatasource)
    dashboard.panels[0]!.targets[0]!.datasource = {
      uid: options.targetDatasource,
    }
  const secondTarget = dashboard.panels.find(
    (panel) => panel.targets.length > 1,
  )!.targets[1]!
  if (options.invalidSecondTarget) secondTarget.expr = 'invalid_second_target('
  const queried: string[] = []
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      requests.push(url.href)
      if (url.pathname === '/api/health')
        return Promise.resolve(
          Response.json({
            database: options.health ?? 'ok',
            version: 'test-double',
          }),
        )
      if (url.pathname === '/api/search')
        return Promise.resolve(
          Response.json([{ uid: options.dashboard ?? dashboardUid }]),
        )
      if (url.pathname === '/api/datasources')
        return Promise.resolve(
          Response.json([
            { uid: options.datasource ?? datasourceUid, type: 'prometheus' },
            ...['loki', 'tempo']
              .filter((type) => type !== options.missingSource)
              .map((type) => ({
                uid: type + '_fixture2030',
                type: type === options.wrongSourceType ? 'prometheus' : type,
              })),
          ]),
        )
      if (url.pathname.startsWith('/api/dashboards/uid/'))
        return Promise.resolve(
          Response.json({ dashboard: { ...dashboard, id: 1 } }),
        )
      if (url.pathname.includes('/proxy/')) {
        if (options.proxyNetworkError)
          return Promise.reject(new Error('Grafana proxy unreachable'))
        const expr = (url.searchParams.get('query') ??
          url.searchParams.get('q'))!
        queried.push(expr)
        if (options.proxyStatus)
          return Promise.resolve(
            Response.json(
              { error: 'proxy failure' },
              { status: options.proxyStatus },
            ),
          )
        if (
          url.pathname ===
          '/api/datasources/proxy/uid/loki_fixture2030/loki/api/v1/query_range'
        ) {
          expect(url.searchParams.get('query')).toBe(expr)
          expect(url.searchParams.get('limit')).toBe('50')
          expect(
            Number(url.searchParams.get('end')) -
              Number(url.searchParams.get('start')),
          ).toBe(900)
          const row = [
            '1795193183310549586',
            JSON.stringify({ trace_id: traceId }),
          ]
          return Promise.resolve(
            Response.json({
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
                          row,
                        ],
                      },
                    ],
              },
            }),
          )
        }
        if (
          url.pathname ===
          '/api/datasources/proxy/uid/tempo_fixture2030/api/search'
        ) {
          expect(url.searchParams.get('q')).toBe(expr)
          expect(url.searchParams.get('limit')).toBe('30')
          expect(
            Number(url.searchParams.get('end')) -
              Number(url.searchParams.get('start')),
          ).toBe(900)
          return Promise.resolve(
            Response.json({
              traces: options.empty
                ? []
                : [
                    {
                      traceID:
                        options.malformedResult === 'tempo'
                          ? 'not-hex'
                          : traceId.slice(1),
                    },
                  ],
            }),
          )
        }
        if (options.malformedResult === 'prometheus')
          return Promise.resolve(
            Response.json({
              status: 'success',
              data: {
                resultType: 'vector',
                result: [{ metric: {}, value: [1, 'not a number'] }],
              },
            }),
          )
        if (expr === 'invalid_second_target(')
          return Promise.resolve(
            Response.json({ status: 'error', error: 'parse error' }),
          )
        if (options.malformedProxy)
          return Promise.resolve(Response.json({ status: 'success' }))
      }
      // El Prometheus directo permanece sano: no debe rescatar un proxy de Grafana roto.
      return Promise.resolve(
        Response.json({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [{ metric: {}, value: [1, '12345'] }],
          },
        }),
      )
    }),
  )
  return { dashboard, queried, requests }
}

afterEach(() => vi.unstubAllGlobals())

describe('Verificación de Grafana (dobles HTTP, no integración real)', () => {
  it('consulta y registra todas las expresiones habilitadas a través del datasource real del dashboard', async () => {
    const { dashboard, queried, requests } = await fakeGrafana()
    const expected = dashboard.panels.flatMap((panel) =>
      panel.targets
        .filter((target) => !target.hide)
        .map((target) => target.expr ?? target.query),
    )
    const report = await verifyGrafanaAndPanels(grafana)
    expect(queried).toEqual(expected)
    expect(report.panelsVerified.map((target) => target.expr)).toEqual(expected)
    expect(
      new Set(
        report.panelsVerified
          .filter((p) => p.datasource === 'prometheus')
          .map((target) => target.panelId),
      ).size,
    ).toBe(9)
    expect(
      report.panelsVerified.every((target) => target.refId.length > 0),
    ).toBe(true)
    expect(requests.every((url) => url.startsWith(grafana))).toBe(true)
    expect(report.panelsVerified[0]!.sampleValue).toBe('12345.000')
    expect(
      report.panelsVerified.find((p) => p.datasource === 'loki'),
    ).toMatchObject({ panelId: 10, seriesCount: 2, sampleValue: traceId })
    expect(
      report.panelsVerified.find((p) => p.datasource === 'tempo'),
    ).toMatchObject({ panelId: 11, seriesCount: 1, sampleValue: traceId })
  })

  it('informa ventanas sin tráfico con cero logs y cero trazas', async () => {
    await fakeGrafana({ empty: true })
    const report = await verifyGrafanaAndPanels(grafana)
    for (const source of ['loki', 'tempo']) {
      expect(
        report.panelsVerified.find((p) => p.datasource === source),
      ).toMatchObject({ seriesCount: 0, sampleValue: 'sin muestras' })
    }
  })

  it.each([
    { datasource: 'another-prometheus' },
    { dashboard: 'another-dashboard' },
    { targetDatasource: 'another-prometheus' },
    { invalidSecondTarget: true },
    { proxyNetworkError: true },
    { proxyStatus: 500 },
    { malformedProxy: true },
    { health: 'error' },
    { missingSource: 'loki' },
    { wrongSourceType: 'tempo' },
    { missingPanel: 9 },
    { missingPanel: 10 },
    { missingPanel: 11 },
    { malformedResult: 'loki' as const },
    { malformedResult: 'tempo' as const },
    { malformedResult: 'prometheus' as const },
  ])('rechaza una verificación incompleta o fallida: %j', async (options) => {
    const { requests } = await fakeGrafana(options)
    await expect(verifyGrafanaAndPanels(grafana)).rejects.toThrow()
    expect(requests.every((url) => url.startsWith(grafana))).toBe(true)
  })
})
