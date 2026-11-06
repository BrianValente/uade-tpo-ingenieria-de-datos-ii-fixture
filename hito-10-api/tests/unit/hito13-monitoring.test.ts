import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildFailureTestMarkdown,
  buildPromqlCatalogMarkdown,
  type ControlledFailureTestReport,
  type PromqlCatalogItem,
} from '../../../hito-13-monitoreo/scripts/ejecutar_prueba_controlada.js'
import {
  PrometheusMetricsRegistry,
  type ComponentStatusSnapshot,
} from '../../../hito-13-monitoreo/scripts/servidor_monitoreo.js'
import {
  buildDashboardSummaryMarkdown,
  buildPrometheusTargetsMarkdown,
  type GrafanaDashboardVerification,
  type PrometheusTargetsReport,
} from '../../../hito-13-monitoreo/scripts/verificar_targets.js'

const MOCK_ENV = {
  timestamp: '2026-10-31T00:00:00.000Z',
  gitCommit: 'cec2936',
  gitBranch: 'feature/hito-13-monitoreo-defensa',
  gitTreeState: 'clean' as const,
  host: {
    platform: 'win32',
    release: '10.0.26200',
    arch: 'x64',
    cpuModel: 'AMD Ryzen 5',
    logicalCpus: 12,
    totalMemoryGiB: 15.71,
    freeMemoryGiB: 4.5,
    nodeVersion: 'v24.0.0',
  },
  products: {
    mongodbVersion: '7.0.31',
    neo4jVersion: '5.26.24',
    neo4jClientVersion: '5.26.24',
    redisVersion: '7.2.7',
    fastifyVersion: '5.12.7',
  },
}

describe('Hito 13 — Monitoreo, Prometheus, Grafana y Defensa Final', () => {
  it('serializa contadores, histogramas y sondas en formato Prometheus 0.0.4', () => {
    const registry = new PrometheusMetricsRegistry()
    registry.incCounter(
      'fixture2030_http_requests_total',
      {
        method: 'GET',
        route: '/partidos/:id',
        status_code: '200',
        status_class: '2xx',
      },
      12,
    )
    registry.observeHistogram(
      'fixture2030_http_request_duration_ms',
      {
        method: 'GET',
        route: '/partidos/:id',
        status_class: '2xx',
      },
      3.2,
    )
    registry.observeHistogram(
      'fixture2030_db_operation_duration_ms',
      {
        engine: 'neo4j',
        operation: 'match',
      },
      7.8,
    )

    const components: ComponentStatusSnapshot[] = [
      {
        component: 'mongodb',
        model: 'documental',
        role: 'equipos-jugadores-auditoria',
        monitoredMode: 'active_probe',
        up: 1,
        latencyMs: 1.25,
        detail: 'MongoDB ping:1 ok',
      },
      {
        component: 'cassandra',
        model: 'columnar',
        role: 'eventos-y-consultas-por-particion',
        monitoredMode: 'tcp_socket_probe',
        up: 0,
        latencyMs: 2.1,
        detail: 'TCP 127.0.0.1:9042 ECONNREFUSED',
      },
    ]

    const rendered = registry.renderMetrics(components)
    expect(rendered).toContain('# TYPE fixture2030_component_up gauge')
    expect(rendered).toContain(
      'fixture2030_component_up{component="mongodb",model="documental",monitored_mode="active_probe",role="equipos-jugadores-auditoria"} 1',
    )
    expect(rendered).toContain(
      'fixture2030_component_up{component="cassandra",model="columnar",monitored_mode="tcp_socket_probe",role="eventos-y-consultas-por-particion"} 0',
    )
    expect(rendered).toContain(
      'fixture2030_http_requests_total{method="GET",route="/partidos/:id",status_class="2xx",status_code="200"} 12',
    )
    expect(rendered).toContain(
      'fixture2030_http_request_duration_ms_bucket{le="5",method="GET",route="/partidos/:id",status_class="2xx"} 1',
    )
    expect(rendered).toContain(
      'fixture2030_db_operation_duration_ms_count{engine="neo4j",operation="match"} 1',
    )
  })

  it('genera los reportes Markdown de targets, consultas PromQL, dashboard y prueba controlada', () => {
    const targetsReport: PrometheusTargetsReport = {
      reportType: 'HITO_13_PROMETHEUS_TARGETS',
      environment: MOCK_ENV,
      prometheusVersion: '3.2.1',
      scrapeInterval: '5s',
      evaluationInterval: '5s',
      targetsTotal: 3,
      targetsUp: 3,
      targetsDown: 0,
      activeTargets: [
        {
          job: 'fixture2030_api',
          instance: 'host.docker.internal:8013',
          scrapePool: 'fixture2030_api',
          scrapeUrl: 'http://host.docker.internal:8013/metrics',
          health: 'up',
          lastScrape: '2026-10-31T00:00:00Z',
          lastScrapeDurationMs: 4.5,
          lastError: '',
          labels: { role: 'api-rest-poliglota' },
        },
      ],
      alertRules: [
        {
          name: 'Fixture2030TargetPrometheusCaido',
          query: 'up == 0',
          durationSeconds: 5,
          severity: 'critical',
          tier: 'infrastructure',
          state: 'inactive',
          activeAlertsCount: 0,
          summary: 'Target de Prometheus caído',
        },
      ],
      polyglotComponentsStatus: [
        {
          component: 'neo4j',
          model: 'grafo',
          role: 'fixture-sedes-eventos',
          monitoredMode: 'active_probe',
          up: 1,
          latencyMs: 2.3,
          detail: 'Neo4j Bolt RETURN 1 ok',
        },
      ],
    }

    const targetsMd = buildPrometheusTargetsMarkdown(targetsReport)
    expect(targetsMd).toContain('`fixture2030_api`')
    expect(targetsMd).toContain('**1 (ACTIVO)**')
    expect(targetsMd).toContain('`Fixture2030TargetPrometheusCaido`')

    const promqlItems: PromqlCatalogItem[] = [
      {
        id: 'Q1',
        title: 'Disponibilidad de targets',
        category: 'availability',
        expr: 'up',
        unit: 'booleano',
        window: '5s',
        explanation: 'Verifica scrape exitoso.',
        observedSeriesCount: 3,
        observedSamples: [{ labels: { job: 'prometheus' }, value: '1' }],
      },
    ]
    const promqlMd = buildPromqlCatalogMarkdown(MOCK_ENV, promqlItems)
    expect(promqlMd).toContain('`Q1`')
    expect(promqlMd).toContain('`up`')

    const dashVerif: GrafanaDashboardVerification = {
      grafanaHealthy: true,
      grafanaVersion: '11.5.2',
      datasourceProvisioned: true,
      datasourceName: 'Prometheus Fixture 2030',
      datasourceUid: 'prometheus_fixture2030',
      dashboardProvisioned: true,
      dashboardUid: 'fixture2030-hito13-obs',
      dashboardTitle:
        'Fixture Mundial 2030 — Observabilidad Políglota (Hito 13)',
      dashboardUrl: '/d/fixture2030-hito13-obs',
      panelsVerified: [
        {
          panelId: 1,
          title: '1. Disponibilidad de Targets',
          unit: 'short',
          expr: 'up',
          refId: 'A',
          seriesCount: 3,
          sampleValue: '1.000',
        },
      ],
    }
    const dashMd = buildDashboardSummaryMarkdown(MOCK_ENV, dashVerif)
    expect(dashMd).toContain('`uid: prometheus_fixture2030`')
    expect(dashMd).toContain('`uid: fixture2030-hito13-obs`')

    const failureReport: ControlledFailureTestReport = {
      reportType: 'HITO_13_CONTROLLED_FAILURE_TEST',
      environment: MOCK_ENV,
      description: 'Prueba controlada en 3 fases',
      inducedActions: ['Stop redis-exporter'],
      recoveryActions: ['Start redis-exporter'],
      phases: {
        before: {
          phase: 'antes_de_la_falla',
          timestampUtc: '2026-10-31T00:00:00Z',
          apiCheckStatus: 200,
          apiCheckBodySnippet: '{"id":"F2030-001"}',
          targetsUp: 3,
          targetsDown: 0,
          targetsState: [],
          neo4jComponentUp: 1,
          redisExporterUp: 1,
          redisNativeUp: 1,
          http5xxTotal: 0,
          neo4jErrorsTotal: 0,
          alertStates: [
            { name: 'A1', severity: 'critical', state: 'inactive' },
          ],
        },
        during: {
          phase: 'durante_la_falla_controlada',
          timestampUtc: '2026-10-31T00:00:15Z',
          apiCheckStatus: 503,
          apiCheckBodySnippet: '{"code":"DEPENDENCY_UNAVAILABLE"}',
          targetsUp: 2,
          targetsDown: 1,
          targetsState: [],
          neo4jComponentUp: 0,
          redisExporterUp: 0,
          redisNativeUp: 0,
          http5xxTotal: 25,
          neo4jErrorsTotal: 25,
          alertStates: [{ name: 'A1', severity: 'critical', state: 'firing' }],
        },
        after: {
          phase: 'despues_de_la_recuperacion',
          timestampUtc: '2026-10-31T00:00:30Z',
          apiCheckStatus: 200,
          apiCheckBodySnippet: '{"id":"F2030-001"}',
          targetsUp: 3,
          targetsDown: 0,
          targetsState: [],
          neo4jComponentUp: 1,
          redisExporterUp: 1,
          redisNativeUp: 1,
          http5xxTotal: 25,
          neo4jErrorsTotal: 25,
          alertStates: [
            { name: 'A1', severity: 'critical', state: 'inactive' },
          ],
        },
      },
      verificationPassed: true,
    }
    const failMd = buildFailureTestMarkdown(failureReport)
    expect(failMd).toContain('**3 UP / 0 DOWN**')
    expect(failMd).toContain('**2 UP / 1 DOWN**')
    expect(failMd).toContain('`HTTP 503`')
  })

  it('valida la estructura del dashboard exportable de Grafana y los 9 paneles requeridos (RF6, RF7)', async () => {
    const dashPath = resolve(
      process.cwd(),
      '../hito-13-monitoreo/grafana/dashboards/fixture2030_observabilidad.json',
    )
    const raw = await readFile(dashPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      uid: string
      title: string
      panels: Array<{
        id: number
        title: string
        type: string
        fieldConfig?: { defaults?: { unit?: string } }
        targets?: Array<{ expr?: string; legendFormat?: string }>
      }>
    }

    expect(parsed.uid).toBe('fixture2030-hito13-obs')
    expect(parsed.panels.length).toBeGreaterThanOrEqual(9)
    expect(parsed.panels[0]?.targets?.[0]?.legendFormat).toBe(
      '{{job}} ({{service_target}})',
    )
    for (const panel of parsed.panels) {
      expect(panel.title.length).toBeGreaterThan(5)
      expect(panel.fieldConfig?.defaults?.unit).toBeDefined()
      expect((panel.targets ?? []).length).toBeGreaterThan(0)
    }
  })

  it('verifica consistencia entre archivos JSON y Markdown de evidencia y enlaces relativos del Hito 13', async () => {
    const h13Root = resolve(process.cwd(), '../hito-13-monitoreo')

    const targetsJson = JSON.parse(
      await readFile(
        resolve(h13Root, 'evidencia/prometheus_targets.json'),
        'utf8',
      ),
    ) as PrometheusTargetsReport
    const targetsMd = (
      await readFile(
        resolve(h13Root, 'evidencia/prometheus_targets.md'),
        'utf8',
      )
    ).replace(/\r\n/g, '\n')
    expect(targetsMd).toBe(buildPrometheusTargetsMarkdown(targetsJson))

    const failJson = JSON.parse(
      await readFile(
        resolve(h13Root, 'evidencia/prueba_de_falla.json'),
        'utf8',
      ),
    ) as ControlledFailureTestReport
    const failMd = (
      await readFile(resolve(h13Root, 'evidencia/prueba_de_falla.md'), 'utf8')
    ).replace(/\r\n/g, '\n')
    expect(failMd).toBe(buildFailureTestMarkdown(failJson))

    const promqlJson = JSON.parse(
      await readFile(
        resolve(
          h13Root,
          'evidencia/resultados_sin_secretos/consultas_promql_observadas.json',
        ),
        'utf8',
      ),
    ) as {
      environment: typeof MOCK_ENV
      queries: PromqlCatalogItem[]
    }
    const promqlMd = (
      await readFile(
        resolve(
          h13Root,
          'evidencia/resultados_sin_secretos/consultas_promql_observadas.md',
        ),
        'utf8',
      )
    ).replace(/\r\n/g, '\n')
    expect(promqlMd).toBe(
      buildPromqlCatalogMarkdown(promqlJson.environment, promqlJson.queries),
    )

    async function collectMarkdownFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true })
      const files: string[] = []
      for (const entry of entries) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...(await collectMarkdownFiles(full)))
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(full)
        }
      }
      return files
    }

    const mdFiles = await collectMarkdownFiles(h13Root)
    const linkRegex = /\[[^\]]+\]\(([^)#\s]+)(?:#[^)]*)?\)/g
    for (const mdFile of mdFiles) {
      const content = await readFile(mdFile, 'utf8')
      for (const match of content.matchAll(linkRegex)) {
        const target = match[1]
        if (
          !target ||
          target.startsWith('http://') ||
          target.startsWith('https://')
        ) {
          continue
        }
        const resolvedTarget = resolve(dirname(mdFile), target)
        await expect(access(resolvedTarget)).resolves.toBeUndefined()
      }
    }
  })
})
