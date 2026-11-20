import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createDeterministicPrng,
  generateVirtualUserSessions,
  nextWorkloadOperation,
} from '../datos-o-generadores/generador_escenario.js'
import {
  formatLoadReportMarkdown,
  resolveLoadScenarioConfig,
  runLoadScenario,
  type LoadExecutionReport,
} from './ejecutar_carga.js'
import { HITO12_ROOT } from './entorno_y_recursos.js'
import { prepareTestData } from './preparar_datos.js'
import {
  resolveBenchmarkServerConfig,
  type BenchmarkMode,
} from './servidor_optimizado.js'

function pctDelta(before: number, after: number): string {
  if (before === 0) return 'N/A'
  const delta = ((after - before) / before) * 100
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)} %`
}

export function generateIsolatedComparisonMarkdown(
  base: LoadExecutionReport,
  iso: LoadExecutionReport,
): string {
  const bw = base.measuredWindow
  const iw = iso.measuredWindow
  const bl = bw.overallLatencyE2E
  const il = iw.overallLatencyE2E
  const bDep = base.layerTelemetry.dependencies
  const iDep = iso.layerTelemetry.dependencies

  const singleVariableDescription =
    iso.mode === 'isolated_o1'
      ? '**Solo O1 (Pools & Proyecciones):** Pools ampliados a 25 en MongoDB y Neo4j, proyecciones BSON explícitas y lote $in. Caché Read-Aside desactivada (0 hits) y renovación de sesión por request.'
      : iso.mode === 'isolated_o3'
        ? '**Solo O3 (Throttling de Sesión):** Script Lua de sesión con amortización de 60 s. Pools en 5 (línea base) y sin caché Read-Aside.'
        : iso.mode === 'isolated_o2'
          ? '**Solo O2 (Caché Read-Aside):** Caché Read-Aside en Redis activa con TTLs. Pools en 5 y sin throttling de sesión.'
          : 'Optimización Aislada'

  return [
    `# Comparación Experimental Aislada: Línea Base vs. ${iso.mode.toUpperCase()}`,
    '',
    iso.mode === 'isolated_o1'
      ? 'Esta comparación evalúa el paquete O1 (pools, proyección y batching). No separa la contribución individual de sus tres cambios.'
      : 'Esta comparación cambia solo una política respecto de la línea base; los valores observados pertenecen a este laboratorio y no establecen capacidad de producción.',
    '',
    `> **Política o paquete aplicado:** ${singleVariableDescription}`,
    '',
    `- **Fecha corrida Línea Base:** \`${base.environment.timestamp}\` (Commit \`${base.environment.gitCommit}\`)`,
    `- **Fecha corrida Aislada:** \`${iso.environment.timestamp}\` (Commit \`${iso.environment.gitCommit}\`)`,
    `- **Condiciones invariantes:** Concurrencia = **${base.scenario.concurrency} VUs**, Semilla PRNG = \`${base.scenario.seed}\`, Duración = ~${bw.durationSeconds.toFixed(1)} s, Distribución Pareto 80/20.`,
    '',
    '---',
    '',
    '## 1. Comparación E2E observada',
    '',
    '| Métrica E2E | Línea Base (`baseline`) | Prueba Aislada (`' +
      iso.mode +
      '`) | Variación Observada | Interpretación |',
    '|:---|---:|---:|---:|:---|',
    `| **Throughput Sostenido** | ${bw.throughputOpsPerSec} ops/s | **${iw.throughputOpsPerSec} ops/s** | **${pctDelta(bw.throughputOpsPerSec, iw.throughputOpsPerSec)}** | Variación de caudal bajo el perfil configurado |`,
    `| **Latencia p50 (Mediana)** | ${bl.p50Ms} ms | **${il.p50Ms} ms** | **${pctDelta(bl.p50Ms, il.p50Ms)}** | Variación de mediana observada |`,
    `| **Latencia p95** | ${bl.p95Ms} ms | **${il.p95Ms} ms** | **${pctDelta(bl.p95Ms, il.p95Ms)}** | Variación de latencia de cola observada |`,
    `| **Tasa de Errores** | ${bw.errorRatePct} % | **${iw.errorRatePct} %** | ${(iw.errorRatePct - bw.errorRatePct).toFixed(2)} pp | Payloads íntegros: ${iw.payloadIntegrityVerified}/${iw.successfulRequests}; errores de integridad: ${iw.payloadIntegrityErrors} |`,
    '',
    '---',
    '',
    '## 2. Telemetría de Capas y Dependencias',
    '',
    '| Capa / Motor | Métrica | Línea Base | Prueba Aislada | Variación |',
    '|:---|:---|---:|---:|:---|',
    `| **MongoDB** | Operaciones al motor | ${bDep.mongodb.operationsCount} | **${iDep.mongodb.operationsCount}** | ${pctDelta(bDep.mongodb.operationsCount, iDep.mongodb.operationsCount)} |`,
    `| **MongoDB** | Latencia p95 driver | ${bDep.mongodb.latency.p95Ms} ms | **${iDep.mongodb.latency.p95Ms} ms** | ${pctDelta(bDep.mongodb.latency.p95Ms, iDep.mongodb.latency.p95Ms)} |`,
    `| **Neo4j** | Operaciones Cypher | ${bDep.neo4j.operationsCount} | **${iDep.neo4j.operationsCount}** | ${pctDelta(bDep.neo4j.operationsCount, iDep.neo4j.operationsCount)} |`,
    `| **Neo4j** | Latencia p95 driver | ${bDep.neo4j.latency.p95Ms} ms | **${iDep.neo4j.latency.p95Ms} ms** | ${pctDelta(bDep.neo4j.latency.p95Ms, iDep.neo4j.latency.p95Ms)} |`,
    `| **Redis Sesión** | Escrituras HSET ejecutadas | ${bDep.redisSession.renewWritesExecuted} | **${iDep.redisSession.renewWritesExecuted}** | ${bDep.redisSession.renewWritesExecuted - iDep.redisSession.renewWritesExecuted} escrituras omitidas |`,
    `| **Redis Caché** | Hit ratio | 0 % | **${iDep.redisCache.hitRatioPct} %** | ${iDep.redisCache.cacheHits} hits / ${iDep.redisCache.cacheMisses} misses |`,
    '',
  ].join('\n')
}

export async function runIsolatedBenchmark(
  targetMode: BenchmarkMode = 'isolated_o1',
) {
  console.log('='.repeat(80))
  console.log(
    `Hito 12 — Ejecución de Optimización Aislada: ${targetMode.toUpperCase()} (RF8, RF9)`,
  )
  console.log('='.repeat(80))

  console.log(
    '\n[1/3] Reinicializando condiciones comparables en MongoDB, Neo4j y Redis...',
  )
  const prep = await prepareTestData()
  console.log(
    `Entorno preparado: ${prep.redis.cacheKeysCleared} claves de caché previas limpiadas; ${prep.redis.virtualSessionsSeeded} sesiones listas.`,
  )

  console.log(
    `\n[2/3] Ejecutando escenario de carga en modo AISLADO (${targetMode})...`,
  )
  const isoReport = await runLoadScenario(targetMode)
  const isoMarkdown = formatLoadReportMarkdown(isoReport)

  const jsonFilename = `resultados_${targetMode}.json`
  const mdFilename = `resultados_${targetMode}.md`
  const isoJsonPath = resolve(HITO12_ROOT, 'docs/evidencia', jsonFilename)
  const isoMdPath = resolve(HITO12_ROOT, 'docs/evidencia', mdFilename)

  await mkdir(dirname(isoJsonPath), { recursive: true })
  await writeFile(isoJsonPath, JSON.stringify(isoReport, null, 2), 'utf8')
  await writeFile(isoMdPath, isoMarkdown, 'utf8')

  console.log(`\nEvidencia Aislada JSON guardada en: ${isoJsonPath}`)
  console.log(`Evidencia Aislada Markdown guardada en: ${isoMdPath}`)

  const baseJsonPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/resultados_linea_base.json',
  )
  try {
    const baseRaw = await readFile(baseJsonPath, 'utf8')
    const baseReport = JSON.parse(baseRaw) as LoadExecutionReport
    console.log(
      '\n[3/3] Generando reporte comparativo de Aislamiento Causal...',
    )
    const compMarkdown = generateIsolatedComparisonMarkdown(
      baseReport,
      isoReport,
    )
    await writeFile(
      resolve(HITO12_ROOT, 'docs/evidencia', `comparacion_${targetMode}.md`),
      compMarkdown,
      'utf8',
    )
    console.log(compMarkdown)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error
    console.log(
      '\nNota: No se encontró resultados_linea_base.json previo para generar la comparativa.',
    )
    console.log(isoMarkdown)
  }

  return isoReport
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--smoke')) {
    const emptyEnv: Record<string, string | undefined> = {}
    const srvCfg = resolveBenchmarkServerConfig('isolated_o1', emptyEnv)
    const scnCfg = resolveLoadScenarioConfig('isolated_o1', emptyEnv, srvCfg)
    const sessions = generateVirtualUserSessions(
      scnCfg.virtualSessionsCount,
      scnCfg.seed,
    )
    const prng = createDeterministicPrng(scnCfg.seed)
    const sampleOps = Array.from({ length: 5 }, (_, i) =>
      nextWorkloadOperation(i, prng, sessions.length),
    )
    console.log(
      JSON.stringify(
        {
          smokeTest: 'OK',
          mode: 'isolated_o1',
          features: srvCfg.features,
          mongoMaxPoolSize: srvCfg.mongoMaxPoolSize,
          neo4jMaxConnectionPoolSize: srvCfg.neo4jMaxConnectionPoolSize,
          cacheEnabled: srvCfg.cacheTtlSeconds.match > 0,
          sessionThrottleSeconds: srvCfg.sessionRenewThrottleSeconds,
          deterministicSampleCount: sampleOps.length,
          firstOperation: sampleOps[0],
        },
        null,
        2,
      ),
    )
    return
  }

  const modeArg = args.find((a) => a.startsWith('--mode='))?.split('=')[1]
  const mode: BenchmarkMode =
    modeArg === 'isolated_o3'
      ? 'isolated_o3'
      : modeArg === 'isolated_o2'
        ? 'isolated_o2'
        : 'isolated_o1'

  await runIsolatedBenchmark(mode)
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  main().catch((err: unknown) => {
    console.error(
      'Error en ejecución de prueba aislada:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
