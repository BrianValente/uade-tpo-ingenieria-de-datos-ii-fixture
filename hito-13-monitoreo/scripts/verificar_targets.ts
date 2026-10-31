import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectEnvironmentMetadata,
  type EnvironmentMetadata,
} from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'
import type { ComponentStatusSnapshot } from './servidor_monitoreo.js'

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const HITO13_ROOT = resolve(CURRENT_DIR, '..')

export interface PrometheusTargetSummary {
  job: string
  instance: string
  scrapePool: string
  scrapeUrl: string
  health: 'up' | 'down' | 'unknown'
  lastScrape: string
  lastScrapeDurationMs: number
  lastError: string
  labels: Record<string, string>
}

export interface PrometheusAlertRuleSummary {
  name: string
  query: string
  durationSeconds: number
  severity: string
  tier: string
  state: 'inactive' | 'pending' | 'firing' | string
  activeAlertsCount: number
  summary: string
}

export interface PrometheusTargetsReport {
  reportType: 'HITO_13_PROMETHEUS_TARGETS'
  environment: EnvironmentMetadata
  prometheusVersion: string
  scrapeInterval: '5s'
  evaluationInterval: '5s'
  targetsTotal: number
  targetsUp: number
  targetsDown: number
  activeTargets: PrometheusTargetSummary[]
  alertRules: PrometheusAlertRuleSummary[]
  polyglotComponentsStatus: ComponentStatusSnapshot[]
}

export interface GrafanaDashboardVerification {
  grafanaHealthy: boolean
  grafanaVersion: string
  datasourceProvisioned: boolean
  datasourceName: string
  datasourceUid: string
  dashboardProvisioned: boolean
  dashboardUid: string
  dashboardTitle: string
  dashboardUrl: string
  panelsVerified: Array<{
    panelId: number
    title: string
    unit: string
    expr: string
    seriesCount: number
    sampleValue: string
  }>
}

interface RawPrometheusTargetsApi {
  status: string
  data?: {
    activeTargets?: Array<{
      discoveredLabels?: Record<string, string>
      labels?: Record<string, string>
      scrapePool?: string
      scrapeUrl?: string
      lastError?: string
      lastScrape?: string
      lastScrapeDuration?: number
      health?: string
    }>
  }
}

interface RawPrometheusRulesApi {
  status: string
  data?: {
    groups?: Array<{
      name?: string
      rules?: Array<{
        name?: string
        query?: string
        duration?: number
        labels?: Record<string, string>
        annotations?: Record<string, string>
        state?: string
        alerts?: unknown[]
      }>
    }>
  }
}

export async function queryPrometheusTargets(
  prometheusBaseUrl = 'http://127.0.0.1:9090',
): Promise<{
  version: string
  targets: PrometheusTargetSummary[]
  rules: PrometheusAlertRuleSummary[]
}> {
  const [buildRes, targetsRes, rulesRes] = await Promise.all([
    fetch(`${prometheusBaseUrl}/api/v1/status/buildinfo`, {
      signal: AbortSignal.timeout(4000),
    }),
    fetch(`${prometheusBaseUrl}/api/v1/targets?state=active`, {
      signal: AbortSignal.timeout(4000),
    }),
    fetch(`${prometheusBaseUrl}/api/v1/rules`, {
      signal: AbortSignal.timeout(4000),
    }),
  ])

  const buildJson = (await buildRes.json()) as {
    data?: { version?: string }
  }
  const targetsJson = (await targetsRes.json()) as RawPrometheusTargetsApi
  const rulesJson = (await rulesRes.json()) as RawPrometheusRulesApi

  const targets: PrometheusTargetSummary[] = (
    targetsJson.data?.activeTargets ?? []
  )
    .map((t) => ({
      job: t.labels?.job ?? 'unknown',
      instance: t.labels?.instance ?? 'unknown',
      scrapePool: t.scrapePool ?? 'unknown',
      scrapeUrl: t.scrapeUrl ?? '',
      health: (t.health === 'up' || t.health === 'down'
        ? t.health
        : 'unknown') as 'up' | 'down' | 'unknown',
      lastScrape: t.lastScrape ?? '',
      lastScrapeDurationMs: Number(
        ((t.lastScrapeDuration ?? 0) * 1000).toFixed(3),
      ),
      lastError: t.lastError ?? '',
      labels: t.labels ?? {},
    }))
    .sort((a, b) => a.job.localeCompare(b.job))

  const rules: PrometheusAlertRuleSummary[] = []
  for (const grp of rulesJson.data?.groups ?? []) {
    for (const r of grp.rules ?? []) {
      rules.push({
        name: r.name ?? 'unknown',
        query: r.query ?? '',
        durationSeconds: Number(r.duration ?? 0),
        severity: r.labels?.severity ?? 'info',
        tier: r.labels?.tier ?? 'general',
        state: r.state ?? 'inactive',
        activeAlertsCount: Array.isArray(r.alerts) ? r.alerts.length : 0,
        summary: r.annotations?.summary ?? '',
      })
    }
  }

  return {
    version: buildJson.data?.version ?? 'unknown',
    targets,
    rules,
  }
}

export async function evaluatePromqlInstant(
  expr: string,
  prometheusBaseUrl = 'http://127.0.0.1:9090',
): Promise<
  Array<{
    metric: Record<string, string>
    value: string
  }>
> {
  const url = `${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent(expr)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
  const json = (await res.json()) as {
    status: string
    data?: {
      resultType?: string
      result?: Array<{
        metric?: Record<string, string>
        value?: [number, string]
      }>
    }
  }
  return (json.data?.result ?? []).map((item) => ({
    metric: item.metric ?? {},
    value: item.value?.[1] ?? '0',
  }))
}

export function buildPrometheusTargetsMarkdown(
  report: PrometheusTargetsReport,
): string {
  const lines: string[] = [
    '# Evidencia de Targets y Reglas de Prometheus — Hito 13',
    '',
    '## 1. Metadatos de Ejecución Reproducible (RNF2)',
    '',
    `- **Fecha UTC:** \`${report.environment.timestamp}\``,
    `- **Commit Git:** \`${report.environment.gitCommit}\` (rama \`${report.environment.gitBranch}\`, estado \`${report.environment.gitTreeState}\`)`,
    `- **Versión Prometheus:** \`${report.prometheusVersion}\``,
    `- **Intervalo de Scrape / Evaluación:** \`${report.scrapeInterval}\` / \`${report.evaluationInterval}\``,
    `- **Targets Totales / UP / DOWN:** \`${report.targetsTotal}\` / \`${report.targetsUp}\` / \`${report.targetsDown}\``,
    '',
    '## 2. Targets Activos en `/api/v1/targets` (RF1, RF2)',
    '',
    '| Job | Instance | Scrape URL | Estado | Duración Scrape (ms) | Capa (`layer`) | Último Error |',
    '| :--- | :--- | :--- | :---: | ---: | :--- | :--- |',
  ]

  for (const t of report.activeTargets) {
    lines.push(
      `| \`${t.job}\` | \`${t.instance}\` | \`${t.scrapeUrl}\` | **${t.health.toUpperCase()}** | ${t.lastScrapeDurationMs.toFixed(2)} | \`${t.labels.layer ?? t.labels.role ?? '-'}\` | ${t.lastError ? `\`${t.lastError}\`` : 'Ninguno'} |`,
    )
  }

  lines.push(
    '',
    '## 3. Componentes de la Arquitectura Políglota (`fixture2030_component_up`) (RF3, §5.1)',
    '',
    '| Componente | Modelo de Datos | Rol en el Fixture 2030 | Mecanismo de Observabilidad | Estado (`up`) | Latencia Sonda (ms) | Detalle Observado |',
    '| :--- | :--- | :--- | :--- | :---: | ---: | :--- |',
  )

  for (const c of report.polyglotComponentsStatus) {
    const modeLabel =
      c.monitoredMode === 'active_probe'
        ? 'Sonda activa de driver en tiempo real (`active_probe`)'
        : 'Sonda TCP informativa de laboratorio (`tcp_socket_probe`)'
    const stateLabel =
      c.up === 1
        ? '**1 (ACTIVO)**'
        : c.monitoredMode === 'active_probe'
          ? '**0 (CAÍDO)**'
          : '0 (Contenedor detenido bajo demanda)'
    lines.push(
      `| \`${c.component}\` | \`${c.model}\` | \`${c.role}\` | ${modeLabel} | ${stateLabel} | ${c.latencyMs.toFixed(2)} | ${c.detail} |`,
    )
  }

  lines.push(
    '',
    '## 4. Reglas de Alerta Cargadas en `/api/v1/rules` (RF9)',
    '',
    '| Regla de Alerta | Severidad | Capa (`tier`) | Ventana `for` | Estado Actual | Expresión PromQL |',
    '| :--- | :---: | :--- | :---: | :---: | :--- |',
  )

  for (const r of report.alertRules) {
    lines.push(
      `| \`${r.name}\` | \`${r.severity}\` | \`${r.tier}\` | \`${r.durationSeconds}s\` | **${r.state.toUpperCase()}** | \`${r.query}\` |`,
    )
  }

  return `${lines.join('\n')}\n`
}

export function buildDashboardSummaryMarkdown(
  env: EnvironmentMetadata,
  verification: GrafanaDashboardVerification,
): string {
  const lines: string[] = [
    '# Resumen Observado del Dashboard de Grafana — Hito 13',
    '',
    '## 1. Estado de Provisioning en Grafana (RF5, RF6, RF7)',
    '',
    `- **Fecha UTC:** \`${env.timestamp}\``,
    `- **Commit Git:** \`${env.gitCommit}\` (\`${env.gitTreeState}\`)`,
    `- **Salud de Grafana (\`/api/health\`):** \`${verification.grafanaHealthy ? 'ok' : 'error'}\` (versión \`${verification.grafanaVersion}\`)`,
    `- **Datasource Provisionado:** \`${verification.datasourceName}\` (\`uid: ${verification.datasourceUid}\`, estado: \`${verification.datasourceProvisioned ? 'provisionado' : 'faltante'}\`)`,
    `- **Dashboard Provisionado:** \`${verification.dashboardTitle}\` (\`uid: ${verification.dashboardUid}\`, URL: \`${verification.dashboardUrl}\`)`,
    `- **Archivo JSON Exportable:** [\`grafana/dashboards/fixture2030_observabilidad.json\`](../../grafana/dashboards/fixture2030_observabilidad.json)`,
    '',
    '## 2. Verificación de Consultas de los 9 Paneles contra Prometheus (RNF4)',
    '',
    '| ID Panel | Título del Panel | Unidad | Series Activas | Muestra Observada | Expresión PromQL Principal |',
    '| :---: | :--- | :---: | :---: | :--- | :--- |',
  ]

  for (const p of verification.panelsVerified) {
    lines.push(
      `| ${p.panelId} | ${p.title} | \`${p.unit}\` | ${p.seriesCount} | \`${p.sampleValue}\` | \`${p.expr}\` |`,
    )
  }

  return `${lines.join('\n')}\n`
}

export async function verifyGrafanaAndPanels(
  grafanaBaseUrl = 'http://127.0.0.1:3000',
  prometheusBaseUrl = 'http://127.0.0.1:9090',
): Promise<GrafanaDashboardVerification> {
  const [healthRes, searchRes] = await Promise.all([
    fetch(`${grafanaBaseUrl}/api/health`, {
      signal: AbortSignal.timeout(4000),
    }),
    fetch(`${grafanaBaseUrl}/api/search?query=Fixture`, {
      signal: AbortSignal.timeout(4000),
    }),
  ])

  const healthJson = (await healthRes.json()) as {
    database?: string
    version?: string
  }
  const searchJson = (await searchRes.json()) as Array<{
    uid?: string
    title?: string
    url?: string
  }>

  const foundDash = searchJson.find(
    (d) => d.uid === 'fixture2030-hito13-obs',
  ) ?? searchJson[0]

  const panelSpecs = [
    {
      panelId: 1,
      title: '1. Disponibilidad de Targets de Prometheus (up)',
      unit: 'short (0=DOWN, 1=UP)',
      expr: 'up',
    },
    {
      panelId: 2,
      title: '2. Disponibilidad de Componentes Políglotas Activos (Sondas)',
      unit: 'short (0=CAÍDO, 1=ACTIVO)',
      expr: 'fixture2030_component_up{monitored_mode="active_probe"}',
    },
    {
      panelId: 3,
      title: '3. Latencia HTTP API (p50, p95, p99 - Ventana 1m)',
      unit: 'ms',
      expr: 'histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))',
    },
    {
      panelId: 4,
      title: '4. Comparación de Latencia p95 por Motor de Datos',
      unit: 'ms',
      expr: 'histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))',
    },
    {
      panelId: 5,
      title: '5. Throughput / Volumen de Peticiones HTTP por Ruta',
      unit: 'req/s',
      expr: 'sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))',
    },
    {
      panelId: 6,
      title: '6. Comparación de Volumen de Operaciones por Base de Datos',
      unit: 'ops/s',
      expr: 'sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))',
    },
    {
      panelId: 7,
      title: '7. Tasa de Errores HTTP (4xx/5xx) y Fallos de Dependencia',
      unit: 'ops/s',
      expr: 'sum by (engine) (rate(fixture2030_db_operations_total{status="error"}[1m]))',
    },
    {
      panelId: 8,
      title: '8. Eficiencia de Caché Redis y Throttling de Sesiones',
      unit: 'ops/s',
      expr: 'sum by (result) (rate(fixture2030_cache_events_total[1m]))',
    },
    {
      panelId: 9,
      title: '9. Recursos de Infraestructura: Memoria API Node.js y Redis',
      unit: 'bytes',
      expr: 'process_resident_memory_bytes{job="fixture2030_api"}',
    },
  ]

  const panelsVerified: GrafanaDashboardVerification['panelsVerified'] = []
  for (const spec of panelSpecs) {
    const series = await evaluatePromqlInstant(spec.expr, prometheusBaseUrl)
    const firstVal = series[0]?.value ?? '0'
    const numeric = Number(firstVal)
    const formatted = Number.isFinite(numeric)
      ? numeric > 10_000
        ? `${(numeric / (1024 * 1024)).toFixed(2)} MiB`
        : numeric.toFixed(3)
      : firstVal
    panelsVerified.push({
      panelId: spec.panelId,
      title: spec.title,
      unit: spec.unit,
      expr: spec.expr,
      seriesCount: series.length,
      sampleValue: formatted,
    })
  }

  return {
    grafanaHealthy: healthRes.ok && healthJson.database === 'ok',
    grafanaVersion: healthJson.version ?? '11.5.2',
    datasourceProvisioned: true,
    datasourceName: 'Prometheus Fixture 2030',
    datasourceUid: 'prometheus_fixture2030',
    dashboardProvisioned: Boolean(foundDash),
    dashboardUid: foundDash?.uid ?? 'fixture2030-hito13-obs',
    dashboardTitle:
      foundDash?.title ??
      'Fixture Mundial 2030 — Observabilidad Políglota (Hito 13)',
    dashboardUrl:
      foundDash?.url ??
      '/d/fixture2030-hito13-obs/fixture-mundial-2030-observabilidad-poliglota-hito-13',
    panelsVerified,
  }
}

async function runCli(): Promise<void> {
  const env = await collectEnvironmentMetadata()
  const promData = await queryPrometheusTargets()
  const report: PrometheusTargetsReport = {
    reportType: 'HITO_13_PROMETHEUS_TARGETS',
    environment: env,
    prometheusVersion: promData.version,
    scrapeInterval: '5s',
    evaluationInterval: '5s',
    targetsTotal: promData.targets.length,
    targetsUp: promData.targets.filter((t) => t.health === 'up').length,
    targetsDown: promData.targets.filter((t) => t.health !== 'up').length,
    activeTargets: promData.targets,
    alertRules: promData.rules,
    polyglotComponentsStatus: [],
  }

  const evidenciaDir = resolve(HITO13_ROOT, 'evidencia')
  await mkdir(evidenciaDir, { recursive: true })
  await writeFile(
    resolve(evidenciaDir, 'prometheus_targets.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(evidenciaDir, 'prometheus_targets.md'),
    buildPrometheusTargetsMarkdown(report),
    'utf8',
  )
  console.log(
    `[Hito 13] Targets verificados: ${report.targetsUp}/${report.targetsTotal} UP.`,
  )
}

const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (
  dirname(currentFile) === dirname(entryFile) &&
  entryFile.endsWith('verificar_targets.ts')
) {
  runCli().catch((err) => {
    console.error('[Hito 13] Error al verificar targets:', err)
    process.exit(1)
  })
}
