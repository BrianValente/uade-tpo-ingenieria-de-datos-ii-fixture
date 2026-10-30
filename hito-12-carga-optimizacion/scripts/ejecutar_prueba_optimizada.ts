import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  formatLoadReportMarkdown,
  runLoadScenario,
  type LoadExecutionReport,
} from './ejecutar_carga.js'
import { HITO12_ROOT } from './entorno_y_recursos.js'
import { prepareTestData } from './preparar_datos.js'

function pctDelta(before: number, after: number): string {
  if (before === 0) return 'N/A'
  const delta = ((after - before) / before) * 100
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)} %`
}

export function generateComparisonMarkdown(
  base: LoadExecutionReport,
  opt: LoadExecutionReport,
): string {
  const bw = base.measuredWindow
  const ow = opt.measuredWindow
  const bl = bw.overallLatencyE2E
  const ol = ow.overallLatencyE2E
  const bDep = base.layerTelemetry.dependencies
  const oDep = opt.layerTelemetry.dependencies

  const profileComparisonRows = bw.profiles
    .map((bp) => {
      const op = ow.profiles.find((p) => p.profileId === bp.profileId)
      if (!op) return ''
      return `| \`${bp.endpointTemplate}\` | ${bp.throughputOpsPerSec} | **${op.throughputOpsPerSec}** (${pctDelta(bp.throughputOpsPerSec, op.throughputOpsPerSec)}) | ${bp.latencyE2E.p50Ms} | **${op.latencyE2E.p50Ms}** (${pctDelta(bp.latencyE2E.p50Ms, op.latencyE2E.p50Ms)}) | ${bp.latencyE2E.p95Ms} | **${op.latencyE2E.p95Ms}** (${pctDelta(bp.latencyE2E.p95Ms, op.latencyE2E.p95Ms)}) | ${bp.latencyE2E.p99Ms} | **${op.latencyE2E.p99Ms}** (${pctDelta(bp.latencyE2E.p99Ms, op.latencyE2E.p99Ms)}) |`
    })
    .filter(Boolean)
    .join('\n')

  const baseSuccessPct =
    bw.totalRequestsGenerated > 0
      ? ((bw.successfulRequests / bw.totalRequestsGenerated) * 100).toFixed(2)
      : '0.00'
  const optSuccessPct =
    ow.totalRequestsGenerated > 0
      ? ((ow.successfulRequests / ow.totalRequestsGenerated) * 100).toFixed(2)
      : '0.00'
  const successInterpretation =
    bw.failedRequests === 0 &&
    ow.failedRequests === 0 &&
    bw.payloadIntegrityErrors === 0 &&
    ow.payloadIntegrityErrors === 0
      ? `${baseSuccessPct} % base vs. ${optSuccessPct} % opt de respuestas válidas con integridad comprobada (0 fallos en ambas corridas)`
      : `Éxito HTTP 200: ${baseSuccessPct} % base (${bw.payloadIntegrityVerified}/${bw.successfulRequests} íntegras) vs. ${optSuccessPct} % opt (${ow.payloadIntegrityVerified}/${ow.successfulRequests} íntegras)`
  const errorInterpretation =
    bw.failedRequests === 0 &&
    ow.failedRequests === 0 &&
    bw.payloadIntegrityErrors === 0 &&
    ow.payloadIntegrityErrors === 0
      ? '0 errores HTTP y 0 errores de integridad observados en ambas corridas'
      : `Fallos HTTP: ${bw.failedRequests} base vs. ${ow.failedRequests} opt; errores de integridad de payload: ${bw.payloadIntegrityErrors} base vs. ${ow.payloadIntegrityErrors} opt`

  return [
    '# Tablas y Gráficos Comparativos: Línea Base vs. Optimizado (Hito 12)',
    '',
    'Este documento consolida la comparación verificable entre la **Línea Base** (`baseline`) y la **Prueba Optimizada** (`optimized`) bajo el mismo escenario reproducible de carga (RF9, RF10, RNF3, RNF5).',
    '',
    `- **Fecha corrida Línea Base:** \`${base.environment.timestamp}\` (Commit \`${base.environment.gitCommit}\`, estado: \`${base.environment.gitTreeState}\`)`,
    `- **Fecha corrida Optimizada:** \`${opt.environment.timestamp}\` (Commit \`${opt.environment.gitCommit}\`, estado: \`${opt.environment.gitTreeState}\`)`,
    `- **Condiciones configuradas:** Concurrencia = **${base.scenario.concurrency} VUs**, Semilla PRNG = \`${base.scenario.seed}\`, Warm-up = ${base.scenario.warmupSeconds} s, Ramp-up = ${base.scenario.rampupSeconds} s, Sostenimiento = ${base.scenario.steadySeconds} s, Tope de seguridad = ${base.scenario.maxOperations} ops, Distribución Hotspot 80/20.`,
    `- **Ventana observada Línea Base:** \`${bw.durationSeconds} s\` (Ramp-up observado: \`${bw.phasesReached.observedRampupSeconds} s\`, Sostenimiento observado: \`${bw.phasesReached.observedSteadySeconds} s\`, Motivo de cierre: \`${bw.terminationReason}\`)`,
    `- **Ventana observada Optimizada:** \`${ow.durationSeconds} s\` (Ramp-up observado: \`${ow.phasesReached.observedRampupSeconds} s\`, Sostenimiento observado: \`${ow.phasesReached.observedSteadySeconds} s\`, Motivo de cierre: \`${ow.terminationReason}\`)`,
    '',
    '---',
    '',
    '## 1. Tabla Comparativa Global (Antes vs. Después) (RF10)',
    '',
    '| Métrica / Indicador | Unidad | Línea Base (`baseline`) | Flujo Optimizado (`optimized`) | Variación Relativa | Interpretación |',
    '|:---|:---:|---:|---:|---:|:---|',
    `| **Duración de Ventana Medida** | s | ${bw.durationSeconds} | **${ow.durationSeconds}** | **${pctDelta(bw.durationSeconds, ow.durationSeconds)}** | Cierre: \`${bw.terminationReason}\` vs. \`${ow.terminationReason}\` (sostenimiento completo: \`${bw.phasesReached.steadyCompleted}\` / \`${ow.phasesReached.steadyCompleted}\`) |`,
    `| **Operaciones Totales Generadas** | ops | ${bw.totalRequestsGenerated} | **${ow.totalRequestsGenerated}** | **${pctDelta(bw.totalRequestsGenerated, ow.totalRequestsGenerated)}** | Volumen procesado en ventana observada (${bw.durationSeconds.toFixed(1)} s base vs. ${ow.durationSeconds.toFixed(1)} s opt) |`,
    `| **Operaciones Exitosas (\`HTTP 200\`)** | ops | ${bw.successfulRequests} | **${ow.successfulRequests}** | **${pctDelta(bw.successfulRequests, ow.successfulRequests)}** | ${successInterpretation} |`,
    `| **Tasa de Error** | % | ${bw.errorRatePct} % | **${ow.errorRatePct} %** | ${(ow.errorRatePct - bw.errorRatePct).toFixed(2)} pp | ${errorInterpretation} |`,
    `| **Throughput Global Sostenido** | ops/s | ${bw.throughputOpsPerSec} | **${ow.throughputOpsPerSec}** | **${pctDelta(bw.throughputOpsPerSec, ow.throughputOpsPerSec)}** | Variación de caudal medida bajo efecto conjunto del paquete aplicado (O1+O2+O3) |`,
    `| **Latencia Media E2E** | ms | ${bl.avgMs} | **${ol.avgMs}** | **${pctDelta(bl.avgMs, ol.avgMs)}** | Variación del tiempo medio de respuesta al cliente (efecto conjunto O1–O3) |`,
    `| **Latencia p50 (Mediana) E2E** | ms | ${bl.p50Ms} | **${ol.p50Ms}** | **${pctDelta(bl.p50Ms, ol.p50Ms)}** | Variación en la mediana de latencia bajo distribución Pareto 80/20 |`,
    `| **Latencia p90 E2E** | ms | ${bl.p90Ms} | **${ol.p90Ms}** | **${pctDelta(bl.p90Ms, ol.p90Ms)}** | Variación del percentil 90 bajo ${base.scenario.concurrency} VUs concurrentes (efecto conjunto O1–O3) |`,
    `| **Latencia p95 E2E** | ms | ${bl.p95Ms} | **${ol.p95Ms}** | **${pctDelta(bl.p95Ms, ol.p95Ms)}** | Variación del percentil 95 extremo a extremo bajo efecto conjunto (O1–O3) |`,
    `| **Latencia p99 E2E** | ms | ${bl.p99Ms} | **${ol.p99Ms}** | **${pctDelta(bl.p99Ms, ol.p99Ms)}** | Variación del percentil 99 de cola extremo a extremo (efecto conjunto O1–O3) |`,
    `| **Latencia Máxima E2E** | ms | ${bl.maxMs} | **${ol.maxMs}** | **${pctDelta(bl.maxMs, ol.maxMs)}** | Valor extremo puntual observado en la muestra (sin aislamiento individual de causa) |`,
    `| **Latencia p95 Claves Calientes (80 %)** | ms | ${bw.hotKeysLatencyE2E.p95Ms} | **${ow.hotKeysLatencyE2E.p95Ms}** | **${pctDelta(bw.hotKeysLatencyE2E.p95Ms, ow.hotKeysLatencyE2E.p95Ms)}** | Tráfico concentrado en 4 partidos y 8 equipos; servido mayoritariamente desde caché Read-Aside tras el primer miss |`,
    `| **Latencia p95 Claves Frías (20 %)** | ms | ${bw.coldKeysLatencyE2E.p95Ms} | **${ow.coldKeysLatencyE2E.p95Ms}** | **${pctDelta(bw.coldKeysLatencyE2E.p95Ms, ow.coldKeysLatencyE2E.p95Ms)}** | Efecto conjunto (O1+O2+O3): claves de baja frecuencia de selección PRNG que se cachean tras su primer acceso y comparten motores descargados |`,
    '',
    '---',
    '',
    '## 2. Comparación por Perfil de Endpoint HTTP',
    '',
    '| Endpoint | Throughput Base (ops/s) | Throughput Opt. (ops/s) | p50 Base (ms) | p50 Opt. (ms) | p95 Base (ms) | p95 Opt. (ms) | p99 Base (ms) | p99 Opt. (ms) |',
    '|:---|---:|---:|---:|---:|---:|---:|---:|---:|',
    profileComparisonRows,
    '',
    '---',
    '',
    '## 3. Comparación de Carga Interna sobre Motores NoSQL y Recursos (Instantáneas Snapshot Post-Prueba) (RF6, RF10, RF11)',
    '',
    '| Motor / Recurso | Métrica | Línea Base (`baseline`) | Flujo Optimizado (`optimized`) | Variación / Efecto |',
    '|:---|:---|---:|---:|:---|',
    `| **MongoDB** | Consultas ejecutadas al motor | ${bDep.mongodb.operationsCount} | **${oDep.mongodb.operationsCount}** | **${pctDelta(bDep.mongodb.operationsCount, oDep.mongodb.operationsCount)}** de variación en llamadas al motor documental |`,
    `| **MongoDB** | Latencia p95 del driver | ${bDep.mongodb.latency.p95Ms} ms | **${oDep.mongodb.latency.p95Ms} ms** | **${pctDelta(bDep.mongodb.latency.p95Ms, oDep.mongodb.latency.p95Ms)}** en las consultas restantes (efecto conjunto O1+O2, pool \`${base.scenario.mongoMaxPoolSize}\` -> \`${opt.scenario.mongoMaxPoolSize}\`) |`,
    `| **Neo4j** | Consultas Cypher ejecutadas | ${bDep.neo4j.operationsCount} | **${oDep.neo4j.operationsCount}** | **${pctDelta(bDep.neo4j.operationsCount, oDep.neo4j.operationsCount)}** de variación en llamadas al motor de grafos |`,
    `| **Neo4j** | Latencia p95 del driver Bolt | ${bDep.neo4j.latency.p95Ms} ms | **${oDep.neo4j.latency.p95Ms} ms** | **${pctDelta(bDep.neo4j.latency.p95Ms, oDep.neo4j.latency.p95Ms)}** en las consultas restantes (efecto conjunto O1+O2, pool \`${base.scenario.neo4jMaxConnectionPoolSize}\` -> \`${opt.scenario.neo4jMaxConnectionPoolSize}\`) |`,
    `| **Redis (Sesiones)** | Evaluaciones Lua de sesión | ${bDep.redisSession.operationsCount} | **${oDep.redisSession.operationsCount}** | ${pctDelta(bDep.redisSession.operationsCount, oDep.redisSession.operationsCount)} (1 por request HTTP) |`,
    `| **Redis (Sesiones)** | Escrituras \`HSET\`+\`EXPIRE\` ejecutadas | ${bDep.redisSession.renewWritesExecuted} | **${oDep.redisSession.renewWritesExecuted}** | **${bDep.redisSession.renewWritesSkippedByThrottle} -> ${oDep.redisSession.renewWritesSkippedByThrottle}** escrituras omitidas por ventana de throttle (${opt.scenario.sessionRenewThrottleSeconds} s) |`,
    `| **Redis (Caché Read-Aside)** | Hit Ratio de Caché | 0 % (Inactivo) | **${oDep.redisCache.hitRatioPct} %** | **${oDep.redisCache.cacheHits} hits** / ${oDep.redisCache.cacheMisses} misses (${oDep.redisCache.cacheWrites} escrituras) |`,
    `| **Redis (Memoria)** | Memoria usada post-prueba (\`used_memory\`) | ${base.resources.redisMetricsAfter?.usedMemoryHuman ?? 'N/A'} (${base.resources.redisMetricsAfter?.usedMemoryBytes ?? 0} B) | **${opt.resources.redisMetricsAfter?.usedMemoryHuman ?? 'N/A'} (${opt.resources.redisMetricsAfter?.usedMemoryBytes ?? 0} B)** | Instantánea post-prueba (\`INFO memory\`) con claves de caché activas |`,
    `| **Node.js (Proceso)** | Memoria RSS final | ${base.resources.processAfter.rssMiB} MiB | **${opt.resources.processAfter.rssMiB} MiB** | Instantánea RSS al cierre del proceso (${pctDelta(base.resources.processAfter.rssMiB, opt.resources.processAfter.rssMiB)}, sin atribución aislada) |`,
    '',
    '---',
    '',
    '## 4. Representación Gráfica de Resultados (Mermaid XY Charts)',
    '',
    '### 4.1. Comparación de Percentiles de Latencia E2E (ms — menor es mejor)',
    '',
    '```mermaid',
    'xychart-beta',
    '    title "Latencia Extremo a Extremo (ms): Linea Base vs Optimizado"',
    '    x-axis ["Media", "p50 (Mediana)", "p90", "p95", "p99"]',
    `    y-axis "Latencia (ms)" 0 --> ${Math.ceil(Math.max(bl.p99Ms, ol.p99Ms, 10) * 1.15)}`,
    `    bar [${bl.avgMs}, ${bl.p50Ms}, ${bl.p90Ms}, ${bl.p95Ms}, ${bl.p99Ms}]`,
    `    bar [${ol.avgMs}, ${ol.p50Ms}, ${ol.p90Ms}, ${ol.p95Ms}, ${ol.p99Ms}]`,
    '```',
    '',
    '> *Primera serie de barras: Línea Base (`baseline`). Segunda serie de barras: Flujo Optimizado (`optimized`).*',
    '',
    '### 4.2. Comparación de Throughput por Perfil (ops/s — mayor es mejor)',
    '',
    '```mermaid',
    'xychart-beta',
    '    title "Throughput Sostenido (ops/s): Linea Base vs Optimizado"',
    '    x-axis ["Global", "GET /partidos/:id", "GET /jugadores", "GET /eventos", "GET /equipos/:cod"]',
    `    y-axis "Operaciones / seg" 0 --> ${Math.ceil(Math.max(bw.throughputOpsPerSec, ow.throughputOpsPerSec, 50) * 1.15)}`,
    `    bar [${bw.throughputOpsPerSec}, ${bw.profiles[0]?.throughputOpsPerSec ?? 0}, ${bw.profiles[1]?.throughputOpsPerSec ?? 0}, ${bw.profiles[2]?.throughputOpsPerSec ?? 0}, ${bw.profiles[3]?.throughputOpsPerSec ?? 0}]`,
    `    bar [${ow.throughputOpsPerSec}, ${ow.profiles[0]?.throughputOpsPerSec ?? 0}, ${ow.profiles[1]?.throughputOpsPerSec ?? 0}, ${ow.profiles[2]?.throughputOpsPerSec ?? 0}, ${ow.profiles[3]?.throughputOpsPerSec ?? 0}]`,
    '```',
    '',
    '---',
    '*Generado automáticamente por `ejecutar_prueba_optimizada.ts` a partir de las mediciones reales de laboratorio (RNF14).*',
  ].join('\n')
}

export async function runOptimizedBenchmark() {
  console.log('='.repeat(80))
  console.log('Hito 12 — Ejecución de Prueba Optimizada y Comparación (RF8, RF9, RF10)')
  console.log('='.repeat(80))

  console.log('\n[1/3] Reinicializando condiciones comparables en MongoDB, Neo4j y Redis...')
  const prep = await prepareTestData()
  console.log(
    `Entorno preparado: ${prep.redis.cacheKeysCleared} claves de caché previas limpiadas; ${prep.redis.virtualSessionsSeeded} sesiones listas.`,
  )

  console.log('\n[2/3] Ejecutando escenario de carga en modo OPTIMIZADO (optimized)...')
  const optReport = await runLoadScenario('optimized')
  const optMarkdown = formatLoadReportMarkdown(optReport)

  const optJsonPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/resultados_optimizados.json',
  )
  const optMdPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/resultados_optimizados.md',
  )
  await mkdir(dirname(optJsonPath), { recursive: true })
  await writeFile(optJsonPath, JSON.stringify(optReport, null, 2), 'utf8')
  await writeFile(optMdPath, optMarkdown, 'utf8')

  console.log(`\nEvidencia Optimizada JSON guardada en: ${optJsonPath}`)
  console.log(`Evidencia Optimizada Markdown guardada en: ${optMdPath}`)

  const baseJsonPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/resultados_linea_base.json',
  )
  try {
    const baseRaw = await readFile(baseJsonPath, 'utf8')
    const baseReport = JSON.parse(baseRaw) as LoadExecutionReport
    console.log('\n[3/3] Generando reporte comparativo Antes vs. Después...')
    const compMarkdown = generateComparisonMarkdown(baseReport, optReport)
    const compPath = resolve(
      HITO12_ROOT,
      'docs/evidencia/tablas_o_graficos.md',
    )
    await writeFile(compPath, compMarkdown, 'utf8')
    console.log(`Reporte comparativo guardado en: ${compPath}\n`)
    console.log(compMarkdown)
  } catch {
    console.log(
      '\nNota: No se encontró resultados_linea_base.json previo para generar tablas_o_graficos.md. Ejecute primero ejecutar_linea_base.ts.',
    )
    console.log(optMarkdown)
  }

  return optReport
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  runOptimizedBenchmark().catch((err: unknown) => {
    console.error(
      'Error en ejecución de prueba optimizada:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
