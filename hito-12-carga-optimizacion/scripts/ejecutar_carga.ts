import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  createDeterministicPrng,
  generateVirtualUserSessions,
  nextWorkloadOperation,
  type WorkloadProfileId,
} from '../datos-o-generadores/generador_escenario.js'
import {
  calculateLatencyDistribution,
  collectDockerContainerStats,
  collectEnvironmentMetadata,
  collectRedisEngineMetrics,
  loadLocalEnvironment,
  takeProcessSnapshot,
  type ContainerResourceStat,
  type EnvironmentMetadata,
  type LatencyDistribution,
  type ProcessResourceSnapshot,
  type RedisEngineMetrics,
} from './entorno_y_recursos.js'
import {
  startBenchmarkServer,
  type BenchmarkMode,
  type ServerTelemetrySummary,
} from './servidor_optimizado.js'

export interface LoadScenarioConfig {
  mode: BenchmarkMode
  concurrency: number
  warmupSeconds: number
  warmupConcurrency: number
  rampupSeconds: number
  steadySeconds: number
  maxOperations: number
  abortErrorRate: number
  requestTimeoutMs: number
  seed: number
  virtualSessionsCount: number
}

export interface ProfileResultSummary {
  profileId: WorkloadProfileId
  endpointTemplate: string
  expectedSources: string[]
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  payloadIntegrityValid: number
  payloadIntegrityFailed: number
  throughputOpsPerSec: number
  bytesReceivedTotal: number
  latencyE2E: LatencyDistribution
  hotKeysLatency: LatencyDistribution
  coldKeysLatency: LatencyDistribution
}

export interface LoadExecutionReport {
  reportType: 'HITO_12_LOAD_TEST'
  mode: BenchmarkMode
  environment: EnvironmentMetadata
  scenario: LoadScenarioConfig
  warmupSummary: {
    durationMs: number
    requestsExecuted: number
    successfulRequests: number
    avgLatencyMs: number
  }
  measuredWindow: {
    startedAt: string
    finishedAt: string
    durationSeconds: number
    abortedEarly: boolean
    abortReason: string | null
    totalRequestsGenerated: number
    successfulRequests: number
    failedRequests: number
    errorRatePct: number
    errorsByType: Record<string, number>
    payloadIntegrityVerified: number
    payloadIntegrityErrors: number
    totalBytesTransferred: number
    throughputOpsPerSec: number
    overallLatencyE2E: LatencyDistribution
    hotKeysLatencyE2E: LatencyDistribution
    coldKeysLatencyE2E: LatencyDistribution
    profiles: ProfileResultSummary[]
  }
  layerTelemetry: ServerTelemetrySummary
  resources: {
    processBefore: ProcessResourceSnapshot
    processAfter: ProcessResourceSnapshot
    dockerContainersAfter: ContainerResourceStat[]
    redisMetricsBefore: RedisEngineMetrics | null
    redisMetricsAfter: RedisEngineMetrics | null
  }
}

function verifyPayloadIntegrity(
  profileId: WorkloadProfileId,
  targetKey: string,
  body: unknown,
): boolean {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>
  if (profileId === 'match_composite') {
    const home = obj.home as Record<string, unknown> | undefined
    const away = obj.away as Record<string, unknown> | undefined
    const venue = obj.venue as Record<string, unknown> | undefined
    return (
      obj.id === targetKey &&
      Boolean(home && typeof home.code === 'string') &&
      Boolean(away && typeof away.code === 'string') &&
      Boolean(venue && typeof venue.id === 'string')
    )
  }
  if (profileId === 'team_players') {
    return (
      Array.isArray(obj.items) &&
      obj.items.length === 24 &&
      obj.total === 24 &&
      (obj.items[0] as Record<string, unknown> | undefined)?.teamCode === targetKey
    )
  }
  if (profileId === 'match_events') {
    return Array.isArray(obj.items) && obj.items.length > 0 && typeof obj.limit === 'number'
  }
  if (profileId === 'team_profile') {
    return obj.code === targetKey && typeof obj.id === 'string' && obj.participates === true
  }
  return false
}

export async function runLoadScenario(
  modeOffset?: BenchmarkMode,
): Promise<LoadExecutionReport> {
  const env = await loadLocalEnvironment()
  const mode: BenchmarkMode =
    modeOffset ?? (env.H12_MODE === 'optimized' ? 'optimized' : 'baseline')

  const scenario: LoadScenarioConfig = {
    mode,
    concurrency: Number(env.H12_CONCURRENCY ?? 24),
    warmupSeconds: Number(env.H12_WARMUP_SECONDS ?? 3),
    warmupConcurrency: Number(env.H12_WARMUP_CONCURRENCY ?? 4),
    rampupSeconds: Number(env.H12_RAMPUP_SECONDS ?? 4),
    steadySeconds: Number(env.H12_STEADY_SECONDS ?? 12),
    maxOperations: Number(env.H12_MAX_OPERATIONS ?? 5000),
    abortErrorRate: Number(env.H12_ABORT_ERROR_RATE ?? 0.5),
    requestTimeoutMs: Number(env.H12_REQUEST_TIMEOUT_MS ?? 5000),
    seed: Number(env.H12_SEED ?? 203012),
    virtualSessionsCount: Number(env.H12_VIRTUAL_SESSIONS ?? 20),
  }

  const sessions = generateVirtualUserSessions(
    scenario.virtualSessionsCount,
    scenario.seed,
  )
  const server = await startBenchmarkServer(mode, 0)

  try {
    // 1. Fase de Calentamiento (Warm-up)
    const warmupPrng = createDeterministicPrng(scenario.seed + 1)
    const warmupStart = performance.now()
    const warmupDeadline = warmupStart + scenario.warmupSeconds * 1000
    let warmupSeq = 0
    let warmupSuccess = 0
    const warmupLatencies: number[] = []

    const warmupWorker = async () => {
      while (performance.now() < warmupDeadline) {
        const idx = warmupSeq++
        const op = nextWorkloadOperation(idx, warmupPrng, sessions.length)
        const token = sessions[op.virtualUserIndex]?.accessToken ?? ''
        const reqStart = performance.now()
        try {
          const res = await fetch(`${server.baseUrl}${op.path}`, {
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(scenario.requestTimeoutMs),
          })
          await res.text()
          if (res.status === 200) warmupSuccess++
          warmupLatencies.push(performance.now() - reqStart)
        } catch {
          warmupLatencies.push(performance.now() - reqStart)
        }
      }
    }

    await Promise.all(
      Array.from({ length: scenario.warmupConcurrency }, () => warmupWorker()),
    )
    const warmupDurationMs = Math.round((performance.now() - warmupStart) * 100) / 100
    const warmupAvgMs =
      warmupLatencies.length > 0
        ? Math.round(
            (warmupLatencies.reduce((a, b) => a + b, 0) /
              warmupLatencies.length) *
              1000,
          ) / 1000
        : 0

    // 2. Preparar instantáneas antes del período medido
    const envMeta = collectEnvironmentMetadata()
    const redisBefore = collectRedisEngineMetrics()
    const procBefore = takeProcessSnapshot()

    server.startRecordingTelemetry()

    // 3. Período Medido: Rampa de Incremento (Ramp-up) + Sostenimiento (Steady-state)
    const prng = createDeterministicPrng(scenario.seed)
    const measuredStartedAt = new Date().toISOString()
    const measuredStartPerf = performance.now()
    const totalMeasuredMs =
      (scenario.rampupSeconds + scenario.steadySeconds) * 1000
    const measuredDeadline = measuredStartPerf + totalMeasuredMs

    let sequenceIndex = 0
    let totalRequestsGenerated = 0
    let successfulRequests = 0
    let failedRequests = 0
    let payloadIntegrityVerified = 0
    let payloadIntegrityErrors = 0
    let totalBytesTransferred = 0
    let abortedEarly = false
    let abortReason: string | null = null
    const errorsByType: Record<string, number> = {}

    const allSamples: number[] = []
    const hotSamples: number[] = []
    const coldSamples: number[] = []

    const profileBuckets: Record<
      WorkloadProfileId,
      {
        endpointTemplate: string
        expectedSources: string[]
        total: number
        success: number
        failed: number
        integrityOk: number
        integrityFail: number
        bytes: number
        samples: number[]
        hotSamples: number[]
        coldSamples: number[]
      }
    > = {
      match_composite: {
        endpointTemplate: 'GET /partidos/:id',
        expectedSources: ['Redis', 'Neo4j', 'MongoDB'],
        total: 0,
        success: 0,
        failed: 0,
        integrityOk: 0,
        integrityFail: 0,
        bytes: 0,
        samples: [],
        hotSamples: [],
        coldSamples: [],
      },
      team_players: {
        endpointTemplate: 'GET /equipos/:codigo/jugadores?page=1&limit=24',
        expectedSources: ['Redis', 'MongoDB'],
        total: 0,
        success: 0,
        failed: 0,
        integrityOk: 0,
        integrityFail: 0,
        bytes: 0,
        samples: [],
        hotSamples: [],
        coldSamples: [],
      },
      match_events: {
        endpointTemplate: 'GET /partidos/:id/eventos?limit=20',
        expectedSources: ['Redis', 'Neo4j'],
        total: 0,
        success: 0,
        failed: 0,
        integrityOk: 0,
        integrityFail: 0,
        bytes: 0,
        samples: [],
        hotSamples: [],
        coldSamples: [],
      },
      team_profile: {
        endpointTemplate: 'GET /equipos/:codigo',
        expectedSources: ['Redis', 'MongoDB'],
        total: 0,
        success: 0,
        failed: 0,
        integrityOk: 0,
        integrityFail: 0,
        bytes: 0,
        samples: [],
        hotSamples: [],
        coldSamples: [],
      },
    }

    const runVirtualUser = async (workerIndex: number) => {
      // Escalonamiento de Ramp-up lineal para usuarios virtuales adicionales
      if (workerIndex >= scenario.warmupConcurrency && scenario.rampupSeconds > 0) {
        const extraWorkers = Math.max(
          1,
          scenario.concurrency - scenario.warmupConcurrency,
        )
        const delayMs =
          ((workerIndex - scenario.warmupConcurrency) / extraWorkers) *
          scenario.rampupSeconds *
          1000
        await new Promise((r) => setTimeout(r, delayMs))
      }

      while (
        !abortedEarly &&
        performance.now() < measuredDeadline &&
        totalRequestsGenerated < scenario.maxOperations
      ) {
        const opIdx = sequenceIndex++
        totalRequestsGenerated++
        const op = nextWorkloadOperation(opIdx, prng, sessions.length)
        const token = sessions[op.virtualUserIndex]?.accessToken ?? ''
        const pBucket = profileBuckets[op.profileId]
        pBucket.total++

        const reqStart = performance.now()
        try {
          const response = await fetch(`${server.baseUrl}${op.path}`, {
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(scenario.requestTimeoutMs),
          })
          const text = await response.text()
          const durationMs = performance.now() - reqStart
          const byteLen = Buffer.byteLength(text)

          allSamples.push(durationMs)
          pBucket.samples.push(durationMs)
          if (op.isHotKey) {
            hotSamples.push(durationMs)
            pBucket.hotSamples.push(durationMs)
          } else {
            coldSamples.push(durationMs)
            pBucket.coldSamples.push(durationMs)
          }

          if (response.status === 200) {
            successfulRequests++
            pBucket.success++
            totalBytesTransferred += byteLen
            pBucket.bytes += byteLen
            let parsed: unknown = null
            try {
              parsed = JSON.parse(text)
            } catch {
              parsed = null
            }
            if (verifyPayloadIntegrity(op.profileId, op.targetKey, parsed)) {
              payloadIntegrityVerified++
              pBucket.integrityOk++
            } else {
              payloadIntegrityErrors++
              pBucket.integrityFail++
              errorsByType['PAYLOAD_INTEGRITY_MISMATCH'] =
                (errorsByType['PAYLOAD_INTEGRITY_MISMATCH'] ?? 0) + 1
            }
          } else {
            failedRequests++
            pBucket.failed++
            const key = `HTTP_${response.status}`
            errorsByType[key] = (errorsByType[key] ?? 0) + 1
          }
        } catch (err: unknown) {
          const durationMs = performance.now() - reqStart
          allSamples.push(durationMs)
          pBucket.samples.push(durationMs)
          failedRequests++
          pBucket.failed++
          const isTimeout =
            err instanceof Error &&
            (err.name === 'TimeoutError' || err.name === 'AbortError')
          const key = isTimeout ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR'
          errorsByType[key] = (errorsByType[key] ?? 0) + 1
        }

        // Condición de interrupción segura (5.2)
        if (
          totalRequestsGenerated >= 100 &&
          failedRequests / totalRequestsGenerated > scenario.abortErrorRate
        ) {
          abortedEarly = true
          abortReason = `Tasa de error superó umbral de seguridad (${Math.round((failedRequests / totalRequestsGenerated) * 100)}% > ${scenario.abortErrorRate * 100}%)`
          break
        }
      }
    }

    await Promise.all(
      Array.from({ length: scenario.concurrency }, (_, i) => runVirtualUser(i)),
    )

    const measuredDurationSec =
      Math.round(((performance.now() - measuredStartPerf) / 1000) * 1000) / 1000
    const measuredFinishedAt = new Date().toISOString()

    server.stopRecordingTelemetry()
    const layerTelemetry = server.getTelemetrySummary()
    const procAfter = takeProcessSnapshot(procBefore.rawCpu)
    const dockerAfter = collectDockerContainerStats()
    const redisAfter = collectRedisEngineMetrics()

    const round2 = (n: number) => Math.round(n * 100) / 100
    const profilesSummary: ProfileResultSummary[] = (
      Object.keys(profileBuckets) as WorkloadProfileId[]
    ).map((pid) => {
      const b = profileBuckets[pid]
      return {
        profileId: pid,
        endpointTemplate: b.endpointTemplate,
        expectedSources: b.expectedSources,
        totalRequests: b.total,
        successfulRequests: b.success,
        failedRequests: b.failed,
        payloadIntegrityValid: b.integrityOk,
        payloadIntegrityFailed: b.integrityFail,
        throughputOpsPerSec:
          measuredDurationSec > 0 ? round2(b.total / measuredDurationSec) : 0,
        bytesReceivedTotal: b.bytes,
        latencyE2E: calculateLatencyDistribution(b.samples),
        hotKeysLatency: calculateLatencyDistribution(b.hotSamples),
        coldKeysLatency: calculateLatencyDistribution(b.coldSamples),
      }
    })

    return {
      reportType: 'HITO_12_LOAD_TEST',
      mode,
      environment: envMeta,
      scenario,
      warmupSummary: {
        durationMs: warmupDurationMs,
        requestsExecuted: warmupLatencies.length,
        successfulRequests: warmupSuccess,
        avgLatencyMs: warmupAvgMs,
      },
      measuredWindow: {
        startedAt: measuredStartedAt,
        finishedAt: measuredFinishedAt,
        durationSeconds: measuredDurationSec,
        abortedEarly,
        abortReason,
        totalRequestsGenerated,
        successfulRequests,
        failedRequests,
        errorRatePct:
          totalRequestsGenerated > 0
            ? round2((failedRequests / totalRequestsGenerated) * 100)
            : 0,
        errorsByType,
        payloadIntegrityVerified,
        payloadIntegrityErrors,
        totalBytesTransferred,
        throughputOpsPerSec:
          measuredDurationSec > 0
            ? round2(totalRequestsGenerated / measuredDurationSec)
            : 0,
        overallLatencyE2E: calculateLatencyDistribution(allSamples),
        hotKeysLatencyE2E: calculateLatencyDistribution(hotSamples),
        coldKeysLatencyE2E: calculateLatencyDistribution(coldSamples),
        profiles: profilesSummary,
      },
      layerTelemetry,
      resources: {
        processBefore: procBefore.snapshot,
        processAfter: procAfter.snapshot,
        dockerContainersAfter: dockerAfter,
        redisMetricsBefore: redisBefore,
        redisMetricsAfter: redisAfter,
      },
    }
  } finally {
    await server.close().catch(() => undefined)
  }
}

export function formatLoadReportMarkdown(report: LoadExecutionReport): string {
  const w = report.measuredWindow
  const lat = w.overallLatencyE2E
  const apiLat = report.layerTelemetry.apiInternalLatency
  const dep = report.layerTelemetry.dependencies
  const title =
    report.mode === 'baseline'
      ? '# Resultados de Prueba de Carga — Línea Base (Hito 12)'
      : '# Resultados de Prueba de Carga — Flujo Optimizado (Hito 12)'

  const profileRows = w.profiles
    .map(
      (p) =>
        `| \`${p.endpointTemplate}\` | ${p.expectedSources.join(' + ')} | ${p.totalRequests} | ${p.successfulRequests} | ${p.failedRequests} | **${p.throughputOpsPerSec}** | ${p.latencyE2E.minMs} | ${p.latencyE2E.avgMs} | **${p.latencyE2E.p50Ms}** | **${p.latencyE2E.p95Ms}** | **${p.latencyE2E.p99Ms}** | ${p.latencyE2E.maxMs} |`,
    )
    .join('\n')

  const containerRows =
    report.resources.dockerContainersAfter.length > 0
      ? report.resources.dockerContainersAfter
          .map(
            (c) =>
              `| \`${c.container}\` | ${c.cpuPercent} | ${c.memUsage} | ${c.memPercent} | ${c.netIO} | ${c.blockIO} |`,
          )
          .join('\n')
      : '| *(No disponible)* | - | - | - | - | - |'

  return [
    title,
    '',
    `- **Modo ejecutado:** \`${report.mode}\``,
    `- **Fecha de ejecución:** \`${report.environment.timestamp}\``,
    `- **Commit Git:** \`${report.environment.gitCommit}\` (rama \`${report.environment.gitBranch}\`)`,
    `- **Hardware / SO:** ${report.environment.host.platform} (${report.environment.host.arch}) — ${report.environment.host.cpuModel} (${report.environment.host.logicalCpus} CPUs lógicas, ${report.environment.host.totalMemoryGiB} GiB RAM) — Node.js \`${report.environment.host.nodeVersion}\``,
    `- **Versiones observadas:** MongoDB (\`${report.environment.products.mongodbVersion}\`), Neo4j (\`${report.environment.products.neo4jVersion}\`), Redis (\`${report.environment.products.redisVersion}\`)`,
    '',
    '---',
    '',
    '## 1. Parámetros del Escenario y Ventana Medida (RF2, RF4, RNF5)',
    '',
    '| Parámetro | Valor |',
    '|:---|---:|',
    `| Usuarios virtuales concurrentes | **${report.scenario.concurrency}** |`,
    `| Sesiones virtuales pre-sembradas en Redis | **${report.scenario.virtualSessionsCount}** |`,
    `| Período de calentamiento (excluido de métricas) | ${report.scenario.warmupSeconds} s (${report.warmupSummary.requestsExecuted} ops, media ${report.warmupSummary.avgLatencyMs} ms) |`,
    `| Rampa de incremento (Ramp-up) | ${report.scenario.rampupSeconds} s |`,
    `| Período de sostenimiento (Steady-state) | ${report.scenario.steadySeconds} s |`,
    `| Duración total medida | **${w.durationSeconds} s** |`,
    `| Semilla PRNG determinística (\`H12_SEED\`) | \`${report.scenario.seed}\` |`,
    `| Operaciones medidas generadas | **${w.totalRequestsGenerated}** |`,
    `| Operaciones exitosas (\`HTTP 200\`) | **${w.successfulRequests}** |`,
    `| Operaciones con error | **${w.failedRequests}** (${w.errorRatePct} %) |`,
    `| Respuestas con integridad de payload validada | **${w.payloadIntegrityVerified} / ${w.successfulRequests}** |`,
    `| Throughput global sostenido | **${w.throughputOpsPerSec} ops/s** |`,
    `| Volumen HTTP transferido | ${(w.totalBytesTransferred / 1024).toFixed(2)} KiB |`,
    '',
    '---',
    '',
    '## 2. Distribución de Latencia Extremo a Extremo (Generador de Carga) (RF5)',
    '',
    '| Segmento | Muestras | Mín (ms) | Media (ms) | Desv. Est. (ms) | p50 / Mediana (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |',
    '|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    `| **Global (Todas las operaciones)** | ${lat.count} | ${lat.minMs} | ${lat.avgMs} | ${lat.stdDevMs} | **${lat.p50Ms}** | ${lat.p90Ms} | **${lat.p95Ms}** | **${lat.p99Ms}** | ${lat.maxMs} |`,
    `| **Claves Calientes (Hotspot 80 %)** | ${w.hotKeysLatencyE2E.count} | ${w.hotKeysLatencyE2E.minMs} | ${w.hotKeysLatencyE2E.avgMs} | ${w.hotKeysLatencyE2E.stdDevMs} | **${w.hotKeysLatencyE2E.p50Ms}** | ${w.hotKeysLatencyE2E.p90Ms} | **${w.hotKeysLatencyE2E.p95Ms}** | **${w.hotKeysLatencyE2E.p99Ms}** | ${w.hotKeysLatencyE2E.maxMs} |`,
    `| **Claves Frías (Long-tail 20 %)** | ${w.coldKeysLatencyE2E.count} | ${w.coldKeysLatencyE2E.minMs} | ${w.coldKeysLatencyE2E.avgMs} | ${w.coldKeysLatencyE2E.stdDevMs} | **${w.coldKeysLatencyE2E.p50Ms}** | ${w.coldKeysLatencyE2E.p90Ms} | **${w.coldKeysLatencyE2E.p95Ms}** | **${w.coldKeysLatencyE2E.p99Ms}** | ${w.coldKeysLatencyE2E.maxMs} |`,
    '',
    '### Histograma de Latencias E2E',
    '',
    '| Rango de Latencia | Operaciones | Porcentaje |',
    '|:---|---:|---:|',
    `| \`< 2 ms\` | ${lat.buckets.under2ms} | ${lat.count ? ((lat.buckets.under2ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`2 - 5 ms\` | ${lat.buckets.from2To5ms} | ${lat.count ? ((lat.buckets.from2To5ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`5 - 10 ms\` | ${lat.buckets.from5To10ms} | ${lat.count ? ((lat.buckets.from5To10ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`10 - 25 ms\` | ${lat.buckets.from10To25ms} | ${lat.count ? ((lat.buckets.from10To25ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`25 - 50 ms\` | ${lat.buckets.from25To50ms} | ${lat.count ? ((lat.buckets.from25To50ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`50 - 100 ms\` | ${lat.buckets.from50To100ms} | ${lat.count ? ((lat.buckets.from50To100ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    `| \`>= 100 ms\` | ${lat.buckets.over100ms} | ${lat.count ? ((lat.buckets.over100ms / lat.count) * 100).toFixed(1) : '0.0'} % |`,
    '',
    '---',
    '',
    '## 3. Desglose por Perfil de Endpoint HTTP (RF1, RF5)',
    '',
    '| Endpoint | Fuentes | Ops | Éxitos | Errores | Throughput (ops/s) | Mín (ms) | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) |',
    '|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    profileRows,
    '',
    '---',
    '',
    '## 4. Diferenciación por Capa: Generador vs. API vs. Motores NoSQL (RF6)',
    '',
    '| Capa / Dependencia | Operaciones Ejecutadas | Configuración Relevante | Media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Máx (ms) | Observaciones |',
    '|:---|---:|:---|---:|---:|---:|---:|---:|:---|',
    `| **Cliente Generador (HTTP E2E)** | ${lat.count} | ${report.scenario.concurrency} VUs concurrentes (\`fetch\`) | ${lat.avgMs} | ${lat.p50Ms} | **${lat.p95Ms}** | **${lat.p99Ms}** | ${lat.maxMs} | Incluye socket cliente, HTTP y parseo JSON |`,
    `| **API Fastify (Handler interno)** | ${apiLat.count} | Zod validation + serialización | ${apiLat.avgMs} | ${apiLat.p50Ms} | **${apiLat.p95Ms}** | **${apiLat.p99Ms}** | ${apiLat.maxMs} | Tiempo interno \`reply.elapsedTime\` |`,
    `| **Redis (Sesiones Lua)** | ${dep.redisSession.operationsCount} | Escrituras renovación: ${dep.redisSession.renewWritesExecuted} (omitidas: ${dep.redisSession.renewWritesSkippedByThrottle}) | ${dep.redisSession.latency.avgMs} | ${dep.redisSession.latency.p50Ms} | **${dep.redisSession.latency.p95Ms}** | **${dep.redisSession.latency.p99Ms}** | ${dep.redisSession.latency.maxMs} | Autorización Bearer en cada request |`,
    `| **Redis (Caché Read-Aside)** | ${dep.redisCache.lookupsCount} | Activo: \`${dep.redisCache.enabled}\` — Hit Ratio: **${dep.redisCache.hitRatioPct} %** (${dep.redisCache.cacheHits} hits / ${dep.redisCache.cacheMisses} misses) | ${dep.redisCache.latency.avgMs} | ${dep.redisCache.latency.p50Ms} | **${dep.redisCache.latency.p95Ms}** | **${dep.redisCache.latency.p99Ms}** | ${dep.redisCache.latency.maxMs} | Escrituras a caché: ${dep.redisCache.cacheWrites} |`,
    `| **MongoDB 7.0 (Driver)** | ${dep.mongodb.operationsCount} | \`maxPoolSize=${dep.mongodb.poolSizeConfigured}\` | ${dep.mongodb.latency.avgMs} | ${dep.mongodb.latency.p50Ms} | **${dep.mongodb.latency.p95Ms}** | **${dep.mongodb.latency.p99Ms}** | ${dep.mongodb.latency.maxMs} | Fallos: ${dep.mongodb.failuresCount} |`,
    `| **Neo4j 5.x (Driver Bolt)** | ${dep.neo4j.operationsCount} | \`maxConnectionPoolSize=${dep.neo4j.poolSizeConfigured}\` | ${dep.neo4j.latency.avgMs} | ${dep.neo4j.latency.p50Ms} | **${dep.neo4j.latency.p95Ms}** | **${dep.neo4j.latency.p99Ms}** | ${dep.neo4j.latency.maxMs} | Fallos: ${dep.neo4j.failuresCount} |`,
    '',
    '---',
    '',
    '## 5. Recursos del Entorno y Contenedores Docker (RF5, RF6, RNF9)',
    '',
    '### Proceso Node.js (API + Generador)',
    `- **Memoria RSS (Antes -> Después):** \`${report.resources.processBefore.rssMiB} MiB\` -> \`${report.resources.processAfter.rssMiB} MiB\``,
    `- **Heap V8 Usado (Antes -> Después):** \`${report.resources.processBefore.heapUsedMiB} MiB\` -> \`${report.resources.processAfter.heapUsedMiB} MiB\``,
    `- **Tiempo de CPU consumido en ventana medida:** User \`${report.resources.processAfter.cpuUserMs} ms\`, System \`${report.resources.processAfter.cpuSystemMs} ms\``,
    '',
    '### Contenedores Docker (`docker stats --no-stream`)',
    '',
    '| Contenedor | CPU % | Uso de Memoria | Mem % | Red I/O | Bloque I/O |',
    '|:---|---:|---:|---:|---:|---:|',
    containerRows,
    '',
    '---',
    '*Reporte generado automáticamente sin intervención manual ni exposición de credenciales (RNF8, RNF14).*',
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--smoke')) {
    const prng = createDeterministicPrng(203012)
    const sampleOps = Array.from({ length: 10 }, (_, i) =>
      nextWorkloadOperation(i, prng, 20),
    )
    console.log(
      JSON.stringify(
        {
          smokeTest: 'OK',
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
  const mode: BenchmarkMode = modeArg === 'optimized' ? 'optimized' : 'baseline'
  const outJsonArg = args
    .find((a) => a.startsWith('--output-json='))
    ?.split('=')[1]
  const outMdArg = args.find((a) => a.startsWith('--output-md='))?.split('=')[1]

  const report = await runLoadScenario(mode)
  const markdown = formatLoadReportMarkdown(report)

  if (outJsonArg) {
    const p = resolve(process.cwd(), outJsonArg)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, JSON.stringify(report, null, 2), 'utf8')
  }
  if (outMdArg) {
    const p = resolve(process.cwd(), outMdArg)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, markdown, 'utf8')
  }

  console.log(markdown)
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  main().catch((err: unknown) => {
    console.error(
      'Error en ejecución de prueba de carga:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
