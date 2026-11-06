import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectEnvironmentMetadata,
  loadLocalEnvironment,
  type EnvironmentMetadata,
} from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'
import type {
  ComponentStatusSnapshot,
  MonitoredComponentId,
} from './servidor_monitoreo.js'

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
    refId: string
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
  if (!res.ok) {
    throw new Error(
      `Prometheus PromQL HTTP ${res.status}: ${res.statusText} for query: ${expr}`,
    )
  }
  const json = (await res.json()) as {
    status: string
    errorType?: string
    error?: string
    data?: {
      resultType?: string
      result?: Array<{
        metric?: Record<string, string>
        value?: [number, string]
      }>
    }
  }
  if (json.status !== 'success') {
    throw new Error(
      `Prometheus PromQL query failed (${json.errorType ?? 'unknown'}): ${json.error ?? 'error'} for query: ${expr}`,
    )
  }
  return (json.data?.result ?? []).map((item) => ({
    metric: item.metric ?? {},
    value: item.value?.[1] ?? '0',
  }))
}

export async function queryPolyglotComponentsFromPrometheus(
  prometheusBaseUrl = 'http://127.0.0.1:9090',
): Promise<ComponentStatusSnapshot[]> {
  const [upSeries, latencySeries] = await Promise.all([
    evaluatePromqlInstant('fixture2030_component_up', prometheusBaseUrl),
    evaluatePromqlInstant(
      'fixture2030_component_probe_latency_ms',
      prometheusBaseUrl,
    ),
  ])

  const latencyByComponent = new Map<string, number>()
  for (const item of latencySeries) {
    const comp = item.metric.component
    if (comp) {
      latencyByComponent.set(comp, Number(Number(item.value).toFixed(3)))
    }
  }

  return upSeries.map((item) => {
    const comp = (item.metric.component ??
      'api-fastify') as MonitoredComponentId
    const upVal: 0 | 1 = Number(item.value) >= 1 ? 1 : 0
    const mode =
      item.metric.monitored_mode === 'tcp_socket_probe'
        ? 'tcp_socket_probe'
        : 'active_probe'
    return {
      component: comp,
      model: item.metric.model ?? 'unknown',
      role: item.metric.role ?? 'unknown',
      monitoredMode: mode,
      up: upVal,
      latencyMs: latencyByComponent.get(comp) ?? 0,
      detail:
        upVal === 1
          ? `${comp} probe ok (scraped by Prometheus)`
          : mode === 'tcp_socket_probe'
            ? `TCP probe down (contenedor bajo demanda)`
            : `${comp} probe down`,
    }
  })
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
    '## 2. Consultas habilitadas de los paneles mediante el datasource de Grafana (RNF4)',
    '',
    '| ID Panel / Target | Título del Panel | Unidad | Series Activas | Muestra Observada | Expresión PromQL |',
    '| :---: | :--- | :---: | :---: | :--- | :--- |',
  ]

  for (const p of verification.panelsVerified) {
    lines.push(
      `| ${p.panelId} / ${p.refId} | ${p.title} | \`${p.unit}\` | ${p.seriesCount} | \`${p.sampleValue}\` | \`${p.expr}\` |`,
    )
  }

  return `${lines.join('\n')}\n`
}

async function evaluatePromqlViaGrafanaProxy(
  grafanaBaseUrl: string,
  dsUid: string,
  expr: string,
): Promise<Array<{ metric: Record<string, string>; value: string }>> {
  const proxyUrl = `${grafanaBaseUrl}/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${encodeURIComponent(expr)}`
  let res = await fetch(proxyUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })

  if (res.status === 401 || res.status === 403) {
    const env = await loadLocalEnvironment()
    res = await fetch(proxyUrl, {
      headers: {
        accept: 'application/json',
        authorization: `Basic ${Buffer.from(`${env.GF_SECURITY_ADMIN_USER ?? 'admin'}:${env.GF_SECURITY_ADMIN_PASSWORD ?? 'fixture2030_grafana_local'}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(5000),
    })
  }

  if (!res.ok) {
    throw new Error(
      `Grafana datasource proxy error HTTP ${res.status} para expresión: ${expr}`,
    )
  }

  const json = (await res.json()) as {
    status?: string
    error?: string
    data?: {
      resultType?: string
      result?: Array<{
        metric: Record<string, string>
        value: [number, string]
      }>
    }
  }
  if (
    json.status !== 'success' ||
    json.data?.resultType !== 'vector' ||
    !Array.isArray(json.data.result)
  ) {
    throw new Error(
      `PromQL error vía Grafana proxy para expresión "${expr}": ${json.error ?? 'error'}`,
    )
  }

  return json.data.result.map((item) => ({
    metric: item.metric,
    value: item.value[1],
  }))
}

export async function verifyGrafanaAndPanels(
  grafanaBaseUrl = 'http://127.0.0.1:3000',
): Promise<GrafanaDashboardVerification> {
  const [healthRes, searchRes, dsRes] = await Promise.all([
    fetch(`${grafanaBaseUrl}/api/health`, {
      signal: AbortSignal.timeout(4000),
    }),
    fetch(`${grafanaBaseUrl}/api/search?query=Fixture`, {
      signal: AbortSignal.timeout(4000),
    }),
    fetch(`${grafanaBaseUrl}/api/datasources`, {
      signal: AbortSignal.timeout(4000),
    }),
  ])

  if (!healthRes.ok) {
    throw new Error(`Grafana health check failed with HTTP ${healthRes.status}`)
  }
  if (!searchRes.ok) {
    throw new Error(
      `Grafana dashboard search failed with HTTP ${searchRes.status}`,
    )
  }
  if (!dsRes.ok) {
    throw new Error(
      `Grafana datasources query failed with HTTP ${dsRes.status}`,
    )
  }

  const healthJson = (await healthRes.json()) as {
    database?: string
    version?: string
  }
  if (healthJson.database !== 'ok')
    throw new Error('Grafana database is not healthy')
  const searchJson = (await searchRes.json()) as Array<{
    uid?: string
    title?: string
    url?: string
  }>
  const dsJson = (await dsRes.json()) as Array<{
    id?: number
    uid?: string
    name?: string
    type?: string
  }>

  const foundDs = dsJson.find((ds) => ds.uid === 'prometheus_fixture2030')
  if (!foundDs || !foundDs.uid || foundDs.type !== 'prometheus') {
    throw new Error(
      'Datasource exacto con UID "prometheus_fixture2030" no encontrado en Grafana /api/datasources',
    )
  }

  const foundDash = searchJson.find((d) => d.uid === 'fixture2030-hito13-obs')
  if (!foundDash?.uid) {
    throw new Error(
      'Dashboard exacto con UID "fixture2030-hito13-obs" no encontrado en Grafana /api/search',
    )
  }

  const dashRes = await fetch(
    `${grafanaBaseUrl}/api/dashboards/uid/${foundDash.uid}`,
    { signal: AbortSignal.timeout(4000) },
  )
  if (!dashRes.ok) {
    throw new Error(
      `Grafana dashboard fetch failed with HTTP ${dashRes.status} for uid ${foundDash.uid}`,
    )
  }
  const dashJson = (await dashRes.json()) as {
    dashboard: {
      id?: number
      uid?: string
      title?: string
      panels?: Array<{
        id: number
        title: string
        datasource?: { type?: string; uid?: string }
        targets?: Array<{
          refId?: string
          expr?: string
          hide?: boolean
          datasource?: { type?: string; uid?: string }
        }>
        fieldConfig?: { defaults?: { unit?: string } }
      }>
    }
    meta?: { url?: string }
  }

  if (dashJson.dashboard.uid !== 'fixture2030-hito13-obs') {
    throw new Error(
      `UID de dashboard inesperado: esperado "fixture2030-hito13-obs", recibido "${dashJson.dashboard.uid}"`,
    )
  }

  const rawPanels = dashJson.dashboard?.panels ?? []
  const panelsVerified: GrafanaDashboardVerification['panelsVerified'] = []

  for (const panel of rawPanels) {
    if (panel.datasource?.uid && panel.datasource.uid !== foundDs.uid) {
      throw new Error(
        `Panel ${panel.id} ("${panel.title}") tiene asignado un datasource ajeno: "${panel.datasource.uid}"`,
      )
    }

    const targets = (panel.targets ?? []).filter((t) => !t.hide)
    if (targets.length === 0) continue

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      if (!target) continue
      const datasourceUid = target.datasource?.uid ?? panel.datasource?.uid
      if (datasourceUid !== foundDs.uid) {
        throw new Error(
          `Target ${i + 1} del panel ${panel.id} ("${panel.title}") no referencia el datasource esperado: "${datasourceUid}"`,
        )
      }
      const expr = target.expr
      if (!expr) continue

      const series = await evaluatePromqlViaGrafanaProxy(
        grafanaBaseUrl,
        foundDs.uid,
        expr,
      )

      const firstVal = series[0]?.value
      let sampleValue = 'sin muestras'
      if (firstVal !== undefined) {
        const numeric = Number(firstVal)
        sampleValue = Number.isFinite(numeric) ? numeric.toFixed(3) : firstVal
      }
      panelsVerified.push({
        panelId: panel.id,
        title: panel.title,
        unit: panel.fieldConfig?.defaults?.unit ?? 'none',
        refId: target.refId ?? String(i + 1),
        expr,
        seriesCount: series.length,
        sampleValue,
      })
    }
  }

  if (panelsVerified.length === 0) {
    throw new Error(
      'El dashboard provisionado en Grafana no contiene paneles con consultas PromQL válidas',
    )
  }

  return {
    grafanaHealthy: healthRes.ok && healthJson.database === 'ok',
    grafanaVersion: healthJson.version ?? '11.5.2',
    datasourceProvisioned: Boolean(foundDs),
    datasourceName: foundDs.name ?? 'Prometheus Fixture 2030',
    datasourceUid: foundDs.uid ?? 'prometheus_fixture2030',
    dashboardProvisioned: Boolean(dashJson.dashboard?.id),
    dashboardUid: dashJson.dashboard?.uid ?? foundDash.uid,
    dashboardTitle:
      dashJson.dashboard?.title ??
      foundDash.title ??
      'Fixture Mundial 2030 — Observabilidad Políglota (Hito 13)',
    dashboardUrl:
      dashJson.meta?.url ??
      foundDash.url ??
      '/d/fixture2030-hito13-obs/fixture-mundial-2030-observabilidad-poliglota-hito-13',
    panelsVerified,
  }
}

async function runCli(): Promise<void> {
  const [env, promData, polyglotComponentsStatus] = await Promise.all([
    collectEnvironmentMetadata(),
    queryPrometheusTargets(),
    queryPolyglotComponentsFromPrometheus().catch(() => []),
  ])
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
    polyglotComponentsStatus,
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
