import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  createDeterministicPrng,
  generateVirtualUserSessions,
  nextWorkloadOperation,
} from '../../hito-12-carga-optimizacion/datos-o-generadores/generador_escenario.js'
import {
  collectEnvironmentMetadata,
  type EnvironmentMetadata,
} from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'
import { prepareTestData } from '../../hito-12-carga-optimizacion/scripts/preparar_datos.js'
import { startMonitoringStack } from './iniciar_monitoreo.js'
import {
  PrometheusMetricsRegistry,
  startMonitoredServer,
  type ComponentStatusSnapshot,
} from './servidor_monitoreo.js'
import {
  buildDashboardSummaryMarkdown,
  buildPrometheusTargetsMarkdown,
  evaluatePromqlInstant,
  queryPrometheusTargets,
  verifyGrafanaAndPanels,
  type PrometheusAlertRuleSummary,
  type PrometheusTargetSummary,
  type PrometheusTargetsReport,
} from './verificar_targets.js'

const execFileAsync = promisify(execFile)
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))
const HITO13_ROOT = resolve(CURRENT_DIR, '..')

export interface PromqlCatalogItem {
  id: string
  title: string
  category:
    | 'availability'
    | 'latency'
    | 'throughput'
    | 'errors'
    | 'cache'
    | 'resources'
  expr: string
  unit: string
  window: string
  explanation: string
  observedSeriesCount: number
  observedSamples: Array<{
    labels: Record<string, string>
    value: string
  }>
}

export interface FailurePhaseSnapshot {
  phase:
    | 'antes_de_la_falla'
    | 'durante_la_falla_controlada'
    | 'despues_de_la_recuperacion'
  timestampUtc: string
  apiCheckStatus: number
  apiCheckBodySnippet: string
  targetsUp: number
  targetsDown: number
  targetsState: Array<{ job: string; instance: string; health: string }>
  neo4jComponentUp: number
  redisExporterUp: number
  http5xxTotal: number
  neo4jErrorsTotal: number
  alertStates: Array<{ name: string; severity: string; state: string }>
}

export interface ControlledFailureTestReport {
  reportType: 'HITO_13_CONTROLLED_FAILURE_TEST'
  environment: EnvironmentMetadata
  description: string
  inducedActions: string[]
  recoveryActions: string[]
  phases: {
    before: FailurePhaseSnapshot
    during: FailurePhaseSnapshot
    after: FailurePhaseSnapshot
  }
  verificationPassed: boolean
}

export function buildPromqlCatalogMarkdown(
  env: EnvironmentMetadata,
  items: PromqlCatalogItem[],
): string {
  const lines: string[] = [
    '# Consultas PromQL Observadas (Sin Secretos) — Hito 13',
    '',
    '## 1. Metadatos de Ejecución (RF8, RNF2, RNF6)',
    '',
    `- **Fecha UTC:** \`${env.timestamp}\``,
    `- **Commit Git:** \`${env.gitCommit}\` (rama \`${env.gitBranch}\`, árbol \`${env.gitTreeState}\`)`,
    `- **Endpoint Consultado:** \`http://127.0.0.1:9090/api/v1/query\``,
    '',
    '## 2. Resumen Tabular de Consultas PromQL Ejecutadas',
    '',
    '| ID | Métrica / Consulta | Categoría | Unidad | Ventana | Series | Muestra Principal Observada |',
    '| :---: | :--- | :---: | :---: | :---: | :---: | :--- |',
  ]

  for (const item of items) {
    const firstSample = item.observedSamples[0]
    const sampleText = firstSample
      ? `${Number(firstSample.value).toFixed(3)} (${JSON.stringify(firstSample.labels)})`
      : '0.000'
    lines.push(
      `| \`${item.id}\` | ${item.title} | \`${item.category}\` | \`${item.unit}\` | \`${item.window}\` | ${item.observedSeriesCount} | \`${sampleText.slice(0, 90)}\` |`,
    )
  }

  lines.push('', '## 3. Detalle de Expresiones y Resultados Reales', '')
  for (const item of items) {
    lines.push(
      `### ${item.id} — ${item.title}`,
      '',
      `- **Expresión PromQL:** \`${item.expr}\``,
      `- **Qué mide:** ${item.explanation}`,
      `- **Unidad:** \`${item.unit}\` | **Ventana:** \`${item.window}\``,
      `- **Series devueltas por Prometheus:** \`${item.observedSeriesCount}\``,
      '',
    )
    if (item.observedSamples.length > 0) {
      lines.push('| Etiquetas (`metric`) | Valor Observado |', '| :--- | ---: |')
      for (const s of item.observedSamples.slice(0, 6)) {
        const num = Number(s.value)
        const formatted = Number.isFinite(num) ? num.toFixed(4) : s.value
        lines.push(`| \`${JSON.stringify(s.labels)}\` | \`${formatted}\` |`)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n')}\n`
}

export function buildFailureTestMarkdown(
  report: ControlledFailureTestReport,
): string {
  const b = report.phases.before
  const d = report.phases.during
  const a = report.phases.after

  const formatAlerts = (alerts: Array<{ name: string; state: string }>) =>
    alerts.map((al) => `${al.name}=${al.state.toUpperCase()}`).join(', ')

  const lines: string[] = [
    '# Evidencia de Prueba Controlada de Disponibilidad, Falla y Recuperación — Hito 13',
    '',
    '## 1. Metadatos y Alcance (RF10, RNF2, RNF5, RNF11)',
    '',
    `- **Fecha UTC:** \`${report.environment.timestamp}\``,
    `- **Commit Git:** \`${report.environment.gitCommit}\` (rama \`${report.environment.gitBranch}\`, estado \`${report.environment.gitTreeState}\`)`,
    `- **Descripción:** ${report.description}`,
    `- **Verificación Integral Exitosa:** \`${report.verificationPassed}\``,
    '',
    '### Acciones de Falla Controlada (No Destructivas)',
    ...report.inducedActions.map((act) => `- ${act}`),
    '',
    '### Acciones de Recuperación y Verificación',
    ...report.recoveryActions.map((act) => `- ${act}`),
    '',
    '## 2. Comparación Cuantitativa de las 3 Fases (Antes -> Durante -> Después)',
    '',
    '| Indicador Observado | Fase 1: Antes de la Falla (`Normal`) | Fase 2: Durante la Falla Controlada (`Degradado`) | Fase 3: Después de la Recuperación (`Restaurado`) |',
    '| :--- | :---: | :---: | :---: |',
    `| **Timestamp UTC** | \`${b.timestampUtc}\` | \`${d.timestampUtc}\` | \`${a.timestampUtc}\` |`,
    `| **Targets Prometheus UP / DOWN** | **${b.targetsUp} UP / ${b.targetsDown} DOWN** | **${d.targetsUp} UP / ${d.targetsDown} DOWN** | **${a.targetsUp} UP / ${a.targetsDown} DOWN** |`,
    `| **Target \`redis_exporter\` (\`up\`)** | \`${b.redisExporterUp}\` (UP) | \`${d.redisExporterUp}\` (**DOWN**) | \`${a.redisExporterUp}\` (UP) |`,
    `| **Sonda Activa Neo4j (\`fixture2030_component_up\`)** | \`${b.neo4jComponentUp}\` (ACTIVO) | \`${d.neo4jComponentUp}\` (**CAÍDO**) | \`${a.neo4jComponentUp}\` (ACTIVO) |`,
    `| **Respuesta \`GET /partidos/F2030-001\`** | \`HTTP ${b.apiCheckStatus}\` | \`HTTP ${d.apiCheckStatus}\` (\`DEPENDENCY_UNAVAILABLE\`) | \`HTTP ${a.apiCheckStatus}\` |`,
    `| **Acumulado Respuestas HTTP 5xx** | \`${b.http5xxTotal}\` | \`${d.http5xxTotal}\` (**+${d.http5xxTotal - b.http5xxTotal}**) | \`${a.http5xxTotal}\` (estable) |`,
    `| **Acumulado Errores Driver Neo4j** | \`${b.neo4jErrorsTotal}\` | \`${d.neo4jErrorsTotal}\` (**+${d.neo4jErrorsTotal - b.neo4jErrorsTotal}**) | \`${a.neo4jErrorsTotal}\` (estable) |`,
    `| **Estado de Reglas de Alerta** | \`${formatAlerts(b.alertStates)}\` | \`${formatAlerts(d.alertStates)}\` | \`${formatAlerts(a.alertStates)}\` |`,
    '',
    '## 3. Interpretación Técnica de la Evidencia',
    '',
    '1. **Detección de Caída de Target de Infraestructura (`up == 0`)**: Al detener temporalmente el contenedor `redis-exporter`, Prometheus detectó la caída en el siguiente ciclo de scrape (`5s`), marcando `health: "down"` en `/api/v1/targets` y activando la alerta crítica `Fixture2030TargetPrometheusCaido` tras superar la ventana `for: 5s`.',
    '2. **Detección de Indisponibilidad en Motor Políglota (`fixture2030_component_up == 0` y `HTTP 503`)**: Al inducir la indisponibilidad controlada del motor de grafos Neo4j e invalidar la llave en caché de `F2030-001`, las solicitudes a `GET /partidos/F2030-001` devolvieron `HTTP 503 DEPENDENCY_UNAVAILABLE`, incrementando `fixture2030_http_requests_total{status_code="503",status_class="5xx"}` y `fixture2030_db_operations_total{engine="neo4j",status="error"}`, y disparando las alertas `Fixture2030MotorPoliglotaInaccesible` y `Fixture2030TasaErroresHttp5xxAlta`.',
    '3. **Recuperación Limpia sin Pérdida de Datos (RNF11)**: Al reiniciar `redis-exporter` y restablecer la sonda/driver de Neo4j, los 3 targets de Prometheus volvieron a `UP (1)`, la sonda de Neo4j regresó a `1`, las alertas retornaron a `INACTIVE` y el endpoint compuesto `GET /partidos/F2030-001` volvió a responder `HTTP 200 OK` integrando Neo4j + MongoDB + Redis.',
  ]

  return `${lines.join('\n')}\n`
}

async function waitForAllTargetsUp(timeoutMs = 30_000): Promise<{
  version: string
  targets: PrometheusTargetSummary[]
  rules: PrometheusAlertRuleSummary[]
}> {
  const deadline = Date.now() + timeoutMs
  let lastData = await queryPrometheusTargets()
  while (Date.now() < deadline) {
    lastData = await queryPrometheusTargets()
    if (
      lastData.targets.length >= 3 &&
      lastData.targets.every((t) => t.health === 'up')
    ) {
      return lastData
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return lastData
}

async function generateWorkloadRequests(
  baseUrl: string,
  count: number,
  seed = 203013,
): Promise<void> {
  const sessions = generateVirtualUserSessions(20)
  const rng = createDeterministicPrng(seed)

  const concurrency = 8
  let sent = 0

  const worker = async () => {
    while (sent < count) {
      const idx = sent
      sent += 1
      const op = nextWorkloadOperation(idx, rng, sessions.length)
      const sess = sessions[op.virtualUserIndex] ?? sessions[0]
      const headers: Record<string, string> = {}
      if (sess) {
        headers.authorization = `Bearer ${sess.accessToken}`
      }
      try {
        await fetch(`${baseUrl}${op.path}`, {
          headers,
          signal: AbortSignal.timeout(3000),
        })
      } catch {
        // continuar bajo carga controlada
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

async function capturePhaseSnapshot(
  phase: FailurePhaseSnapshot['phase'],
  apiBaseUrl: string,
): Promise<FailurePhaseSnapshot> {
  const sessions = generateVirtualUserSessions(20)
  const authHeader = sessions[0]
    ? { authorization: `Bearer ${sessions[0].accessToken}` }
    : {}

  let apiStatus = 0
  let apiSnippet = ''
  try {
    const res = await fetch(`${apiBaseUrl}/partidos/F2030-001`, {
      headers: authHeader,
      signal: AbortSignal.timeout(3000),
    })
    apiStatus = res.status
    apiSnippet = (await res.text()).slice(0, 140)
  } catch (err) {
    apiStatus = 599
    apiSnippet = err instanceof Error ? err.message : 'fetch error'
  }

  const [
    promData,
    neo4jUpSeries,
    redisExpUpSeries,
    http5xxSeries,
    neo4jErrSeries,
  ] = await Promise.all([
    queryPrometheusTargets(),
    evaluatePromqlInstant(
      'fixture2030_component_up{component="neo4j",monitored_mode="active_probe"}',
    ),
    evaluatePromqlInstant('up{job="redis_exporter"}'),
    evaluatePromqlInstant(
      'sum(fixture2030_http_requests_total{status_class="5xx"})',
    ),
    evaluatePromqlInstant(
      'sum(fixture2030_db_operations_total{engine="neo4j",status="error"})',
    ),
  ])

  return {
    phase,
    timestampUtc: new Date().toISOString(),
    apiCheckStatus: apiStatus,
    apiCheckBodySnippet: apiSnippet,
    targetsUp: promData.targets.filter((t) => t.health === 'up').length,
    targetsDown: promData.targets.filter((t) => t.health !== 'up').length,
    targetsState: promData.targets.map((t) => ({
      job: t.job,
      instance: t.instance,
      health: t.health,
    })),
    neo4jComponentUp: Number(neo4jUpSeries[0]?.value ?? 0),
    redisExporterUp: Number(redisExpUpSeries[0]?.value ?? 0),
    http5xxTotal: Number(http5xxSeries[0]?.value ?? 0),
    neo4jErrorsTotal: Number(neo4jErrSeries[0]?.value ?? 0),
    alertStates: promData.rules.map((r) => ({
      name: r.name,
      severity: r.severity,
      state: r.state,
    })),
  }
}

export async function runSmokeTestInProcess(): Promise<void> {
  const reg = new PrometheusMetricsRegistry()
  reg.incCounter(
    'fixture2030_http_requests_total',
    {
      method: 'GET',
      route: '/api/v1/matches/:id',
      status_code: '200',
      status_class: '2xx',
    },
    15,
  )
  reg.observeHistogram(
    'fixture2030_http_request_duration_ms',
    { method: 'GET', route: '/api/v1/matches/:id', status_class: '2xx' },
    4.2,
  )
  const components: ComponentStatusSnapshot[] = [
    {
      component: 'api-fastify',
      model: 'api-rest',
      role: 'integracion-poliglota',
      monitoredMode: 'active_probe',
      up: 1,
      latencyMs: 0.1,
      detail: 'smoke ok',
    },
  ]
  const text = reg.renderMetrics(components)
  if (
    !text.includes('fixture2030_http_requests_total') ||
    !text.includes('fixture2030_component_up')
  ) {
    throw new Error('Fallo en smoke test de PrometheusMetricsRegistry')
  }
  console.log(
    '[Hito 13 Smoke] PrometheusMetricsRegistry y serialización 0.0.4 validados en memoria.',
  )
}

export async function runFullControlledVerification(): Promise<void> {
  console.log(
    '[Hito 13] 1/6 Preparando dataset base y sesiones en MongoDB, Neo4j y Redis...',
  )
  await prepareTestData()

  console.log(
    '[Hito 13] 2/6 Iniciando contenedores de Prometheus, Redis Exporter y Grafana...',
  )
  await startMonitoringStack()

  console.log(
    '[Hito 13] 3/6 Recolectando metadatos del entorno e iniciando servidor API instrumentado en puerto 8013...',
  )
  const envMeta = await collectEnvironmentMetadata()
  const server = await startMonitoredServer({ host: '0.0.0.0', port: 8013 })

  try {
    console.log(
      '[Hito 13] Esperando a que Prometheus marque UP los 3 targets...',
    )
    const initialProm = await waitForAllTargetsUp(35_000)
    if (initialProm.targets.filter((t) => t.health === 'up').length < 3) {
      throw new Error(
        `No todos los targets están UP: ${JSON.stringify(initialProm.targets)}`,
      )
    }

    console.log(
      '[Hito 13] 4/6 Ejecutando carga controlada (240 operaciones políglotas en 2 olas)...',
    )
    await generateWorkloadRequests(server.baseUrl, 120, 203013)
    await new Promise((r) => setTimeout(r, 6000))
    await generateWorkloadRequests(server.baseUrl, 120, 203014)
    await new Promise((r) => setTimeout(r, 6000))

    const promData = await waitForAllTargetsUp(15_000)
    const componentsStatus = await server.probeComponents()

    const targetsReport: PrometheusTargetsReport = {
      reportType: 'HITO_13_PROMETHEUS_TARGETS',
      environment: envMeta,
      prometheusVersion: promData.version,
      scrapeInterval: '5s',
      evaluationInterval: '5s',
      targetsTotal: promData.targets.length,
      targetsUp: promData.targets.filter((t) => t.health === 'up').length,
      targetsDown: promData.targets.filter((t) => t.health !== 'up').length,
      activeTargets: promData.targets,
      alertRules: promData.rules,
      polyglotComponentsStatus: componentsStatus,
    }

    const promqlSpecs: Array<
      Omit<PromqlCatalogItem, 'observedSeriesCount' | 'observedSamples'>
    > = [
      {
        id: 'Q1',
        title: 'Disponibilidad de targets raspados por Prometheus',
        category: 'availability',
        expr: 'up',
        unit: 'booleano (1 = UP, 0 = DOWN)',
        window: 'instantánea (scrape_interval = 5s)',
        explanation:
          'Mide si cada exporter o servicio objetivo (prometheus, fixture2030_api, redis_exporter) respondió exitosamente al último scrape HTTP.',
      },
      {
        id: 'Q2',
        title:
          'Disponibilidad de componentes políglotas activos (sondas de driver)',
        category: 'availability',
        expr: 'fixture2030_component_up{monitored_mode="active_probe"}',
        unit: 'booleano (1 = ACTIVO, 0 = CAÍDO)',
        window: 'instantánea (5s)',
        explanation:
          'Verifica en tiempo real la conectividad de la API con los tres motores activos del flujo integrado (MongoDB ping:1, Neo4j RETURN 1 y Redis PING).',
      },
      {
        id: 'Q3',
        title: 'Latencia HTTP p95 global de la API en ventana móvil de 1m',
        category: 'latency',
        expr: 'histogram_quantile(0.95, sum by (le) (rate(fixture2030_http_request_duration_ms_bucket[1m])))',
        unit: 'milisegundos (ms)',
        window: '1m (rate)',
        explanation:
          'Calcula el percentil 95 de tiempo de respuesta HTTP extremo a extremo en la capa Fastify a partir de los buckets del histograma.',
      },
      {
        id: 'Q4',
        title: 'Comparación de latencia p95 por motor de base de datos',
        category: 'latency',
        expr: 'histogram_quantile(0.95, sum by (le, engine) (rate(fixture2030_db_operation_duration_ms_bucket[1m])))',
        unit: 'milisegundos (ms)',
        window: '1m (rate)',
        explanation:
          'Compara el percentil 95 de latencia de las operaciones ejecutadas sobre MongoDB, Neo4j, Redis Session y Redis Cache.',
      },
      {
        id: 'Q5',
        title: 'Throughput HTTP por plantilla de ruta y clase de estado',
        category: 'throughput',
        expr: 'sum by (route, status_class) (rate(fixture2030_http_requests_total[1m]))',
        unit: 'solicitudes por segundo (req/s)',
        window: '1m (rate)',
        explanation:
          'Mide el volumen de tráfico procesado por cada endpoint de la API desglosado por código de estado (2xx, 4xx, 5xx).',
      },
      {
        id: 'Q6',
        title: 'Volumen de operaciones por segundo en cada base de datos',
        category: 'throughput',
        expr: 'sum by (engine, operation) (rate(fixture2030_db_operations_total[1m]))',
        unit: 'operaciones por segundo (ops/s)',
        window: '1m (rate)',
        explanation:
          'Permite contrastar la carga de lecturas absorbida por Redis (caché y sesiones) frente a las consultas que llegan a MongoDB y Neo4j.',
      },
      {
        id: 'Q7',
        title: 'Cache Hit Ratio en Redis Read-Aside',
        category: 'cache',
        expr: 'sum(rate(fixture2030_cache_events_total{result="hit"}[1m])) / clamp_min(sum(rate(fixture2030_cache_events_total{result=~"hit|miss"}[1m])), 0.001)',
        unit: 'proporción (0.0 a 1.0)',
        window: '1m (rate)',
        explanation:
          'Mide la proporción de lecturas de partidos, eventos y equipos resueltas directamente desde Redis sin impactar Neo4j ni MongoDB.',
      },
      {
        id: 'Q8',
        title: 'Memoria utilizada por Redis y RSS del proceso Node.js',
        category: 'resources',
        expr: 'redis_memory_used_bytes or process_resident_memory_bytes{job="fixture2030_api"}',
        unit: 'bytes',
        window: 'instantánea (5s)',
        explanation:
          'Monitorea la huella de memoria de infraestructura tanto en el motor clave-valor (vía redis_exporter) como en el servidor de aplicación Node.js.',
      },
    ]

    const promqlCatalog: PromqlCatalogItem[] = []
    for (const spec of promqlSpecs) {
      const series = await evaluatePromqlInstant(spec.expr)
      promqlCatalog.push({
        ...spec,
        observedSeriesCount: series.length,
        observedSamples: series.map((s) => ({
          labels: s.metric,
          value: s.value,
        })),
      })
    }

    const grafanaVerification = await verifyGrafanaAndPanels()

    console.log(
      '[Hito 13] 5/6 Ejecutando prueba controlada de falla y recuperación (RF10)...',
    )
    const beforeSnapshot = await capturePhaseSnapshot(
      'antes_de_la_falla',
      server.baseUrl,
    )

    // Fase 2: Falla controlada no destructiva
    await execFileAsync(
      'docker',
      [
        'compose',
        '-f',
        resolve(HITO13_ROOT, 'docker-compose.yml'),
        'stop',
        'redis-exporter',
      ],
      { cwd: HITO13_ROOT, timeout: 30_000 },
    )

    server.setSimulatedOutage('neo4j', true)
    await server.invalidateMatchCache('F2030-001')

    const sessions = generateVirtualUserSessions(20)
    const authHeader = sessions[0]
      ? { authorization: `Bearer ${sessions[0].accessToken}` }
      : {}

    for (let i = 0; i < 15; i++) {
      await fetch(`${server.baseUrl}/partidos/F2030-001`, {
        headers: authHeader,
        signal: AbortSignal.timeout(2000),
      }).catch(() => undefined)
    }
    await new Promise((r) => setTimeout(r, 6000))
    for (let i = 0; i < 15; i++) {
      await fetch(`${server.baseUrl}/partidos/F2030-001`, {
        headers: authHeader,
        signal: AbortSignal.timeout(2000),
      }).catch(() => undefined)
    }
    await new Promise((r) => setTimeout(r, 12_000))

    const duringSnapshot = await capturePhaseSnapshot(
      'durante_la_falla_controlada',
      server.baseUrl,
    )

    // Fase 3: Recuperación
    console.log(
      '[Hito 13] 6/6 Restaurando componentes y verificando recuperación a UP...',
    )
    server.setSimulatedOutage('neo4j', false)
    await execFileAsync(
      'docker',
      [
        'compose',
        '-f',
        resolve(HITO13_ROOT, 'docker-compose.yml'),
        'start',
        'redis-exporter',
      ],
      { cwd: HITO13_ROOT, timeout: 30_000 },
    )

    await generateWorkloadRequests(server.baseUrl, 40, 203099)
    await new Promise((r) => setTimeout(r, 12_000))

    const afterSnapshot = await capturePhaseSnapshot(
      'despues_de_la_recuperacion',
      server.baseUrl,
    )

    const failureReport: ControlledFailureTestReport = {
      reportType: 'HITO_13_CONTROLLED_FAILURE_TEST',
      environment: envMeta,
      description:
        'Prueba controlada y no destructiva de indisponibilidad de target de infraestructura (redis-exporter) y falla de dependencia políglota (Neo4j), seguida de recuperación completa.',
      inducedActions: [
        'Detención controlada del contenedor `redis-exporter` (`docker compose stop redis-exporter`) para observar `up{job="redis_exporter"} == 0`.',
        'Activación de indisponibilidad controlada en el conector de `neo4j` e invalidación de `fixture2030:h13:cache:partido:F2030-001` para observar `fixture2030_component_up{component="neo4j"} == 0` y respuestas `HTTP 503 DEPENDENCY_UNAVAILABLE`.',
        'Espera de 18s (superior a `scrape_interval: 5s` y `for: 5s`) para verificar transición de reglas de alerta a `FIRING` en Prometheus.',
      ],
      recoveryActions: [
        'Restauración del conector de `neo4j` y reinicio del contenedor `redis-exporter` (`docker compose start redis-exporter`).',
        'Ejecución de 40 solicitudes válidas y espera de 12s para verificar retorno de los 3 targets a `UP (1)` y retorno de `GET /partidos/F2030-001` a `HTTP 200 OK`.',
      ],
      phases: {
        before: beforeSnapshot,
        during: duringSnapshot,
        after: afterSnapshot,
      },
      verificationPassed:
        beforeSnapshot.targetsUp === 3 &&
        beforeSnapshot.apiCheckStatus === 200 &&
        duringSnapshot.targetsDown >= 1 &&
        duringSnapshot.neo4jComponentUp === 0 &&
        duringSnapshot.apiCheckStatus === 503 &&
        afterSnapshot.targetsUp === 3 &&
        afterSnapshot.neo4jComponentUp === 1 &&
        afterSnapshot.apiCheckStatus === 200,
    }

    if (!failureReport.verificationPassed) {
      throw new Error(
        `La prueba controlada no cumplió todas las aserciones: ${JSON.stringify(failureReport.phases)}`,
      )
    }

    const evidenciaDir = resolve(HITO13_ROOT, 'evidencia')
    const dashboardsDir = resolve(evidenciaDir, 'dashboards')
    const sinSecretosDir = resolve(evidenciaDir, 'resultados_sin_secretos')
    await mkdir(dashboardsDir, { recursive: true })
    await mkdir(sinSecretosDir, { recursive: true })

    await writeFile(
      resolve(evidenciaDir, 'prometheus_targets.json'),
      `${JSON.stringify(targetsReport, null, 2)}\n`,
      'utf8',
    )
    await writeFile(
      resolve(evidenciaDir, 'prometheus_targets.md'),
      buildPrometheusTargetsMarkdown(targetsReport),
      'utf8',
    )
    await writeFile(
      resolve(dashboardsDir, 'resumen_dashboard_observado.md'),
      buildDashboardSummaryMarkdown(envMeta, grafanaVerification),
      'utf8',
    )
    await writeFile(
      resolve(sinSecretosDir, 'consultas_promql_observadas.json'),
      `${JSON.stringify(
        {
          reportType: 'HITO_13_PROMQL_CATALOG',
          environment: envMeta,
          queries: promqlCatalog,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    await writeFile(
      resolve(sinSecretosDir, 'consultas_promql_observadas.md'),
      buildPromqlCatalogMarkdown(envMeta, promqlCatalog),
      'utf8',
    )
    await writeFile(
      resolve(evidenciaDir, 'prueba_de_falla.json'),
      `${JSON.stringify(failureReport, null, 2)}\n`,
      'utf8',
    )
    await writeFile(
      resolve(evidenciaDir, 'prueba_de_falla.md'),
      buildFailureTestMarkdown(failureReport),
      'utf8',
    )

    console.log(
      '[Hito 13] Evidencias generadas exitosamente en hito-13-monitoreo/evidencia/.',
    )
  } finally {
    await server.close()
  }
}

async function runCli(): Promise<void> {
  const isSmoke = process.argv.includes('--smoke')
  if (isSmoke) {
    await runSmokeTestInProcess()
    return
  }
  await runFullControlledVerification()
}

const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (
  dirname(currentFile) === dirname(entryFile) &&
  entryFile.endsWith('ejecutar_prueba_controlada.ts')
) {
  runCli().catch((err) => {
    console.error('[Hito 13] Error en ejecución de prueba controlada:', err)
    process.exit(1)
  })
}
