import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { verifyGrafanaAndPanels } from '../../../hito-13-monitoreo/scripts/verificar_targets.js'

const grafana = 'http://grafana.invalid'
const datasourceUid = 'prometheus_fixture2030'
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
        expr: string
        hide?: boolean
        datasource?: { uid: string }
      }>
    }>
  }
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
          ]),
        )
      if (url.pathname.startsWith('/api/dashboards/uid/'))
        return Promise.resolve(
          Response.json({ dashboard: { ...dashboard, id: 1 } }),
        )
      if (url.pathname.includes('/proxy/')) {
        if (options.proxyNetworkError)
          return Promise.reject(new Error('Grafana proxy unreachable'))
        const expr = url.searchParams.get('query')!
        queried.push(expr)
        if (options.proxyStatus)
          return Promise.resolve(
            Response.json(
              { error: 'proxy failure' },
              { status: options.proxyStatus },
            ),
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
        .map((target) => target.expr),
    )
    const report = await verifyGrafanaAndPanels(grafana)
    expect(queried).toEqual(expected)
    expect(report.panelsVerified.map((target) => target.expr)).toEqual(expected)
    expect(
      new Set(report.panelsVerified.map((target) => target.panelId)).size,
    ).toBe(9)
    expect(
      report.panelsVerified.every((target) => target.refId.length > 0),
    ).toBe(true)
    expect(requests.every((url) => url.startsWith(grafana))).toBe(true)
    expect(report.panelsVerified[0]!.sampleValue).toBe('12345.000')
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
  ])('rechaza una verificación incompleta o fallida: %j', async (options) => {
    const { requests } = await fakeGrafana(options)
    await expect(verifyGrafanaAndPanels(grafana)).rejects.toThrow()
    expect(requests.every((url) => url.startsWith(grafana))).toBe(true)
  })
})
