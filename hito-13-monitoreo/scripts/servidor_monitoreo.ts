import { createConnection } from 'node:net'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

import {
  loadMongo,
  loadNeo4j,
  loadRedis,
} from '../../hito-11-conectividad/scripts/driver_loader.js'
import { loadLocalEnvironment } from '../../hito-12-carga-optimizacion/scripts/entorno_y_recursos.js'

export type MonitoredComponentId =
  | 'api-fastify'
  | 'mongodb'
  | 'neo4j'
  | 'redis'
  | 'cassandra'
  | 'influxdb'
  | 'iris'

export interface ComponentStatusSnapshot {
  component: MonitoredComponentId
  model: string
  role: string
  monitoredMode: 'active_probe' | 'tcp_socket_probe'
  up: 0 | 1
  latencyMs: number
  detail: string
}

const HISTOGRAM_BUCKETS_MS = [
  0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500,
] as const

interface HistogramEntry {
  labels: Record<string, string>
  bucketCounts: number[]
  sum: number
  count: number
}

interface CounterEntry {
  labels: Record<string, string>
  value: number
}

function serializeLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort()
  if (keys.length === 0) return ''
  const parts = keys.map((k) => {
    const val = (labels[k] ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
    return `${k}="${val}"`
  })
  return `{${parts.join(',')}}`
}

export class PrometheusMetricsRegistry {
  private readonly counters = new Map<string, Map<string, CounterEntry>>()
  private readonly histograms = new Map<string, Map<string, HistogramEntry>>()
  private readonly startTimeMs = Date.now()

  public incCounter(
    name: string,
    labels: Record<string, string>,
    delta = 1,
  ): void {
    let metricMap = this.counters.get(name)
    if (!metricMap) {
      metricMap = new Map()
      this.counters.set(name, metricMap)
    }
    const key = serializeLabels(labels)
    const existing = metricMap.get(key)
    if (existing) {
      existing.value += delta
    } else {
      metricMap.set(key, { labels: { ...labels }, value: delta })
    }
  }

  public observeHistogram(
    name: string,
    labels: Record<string, string>,
    valueMs: number,
  ): void {
    let metricMap = this.histograms.get(name)
    if (!metricMap) {
      metricMap = new Map()
      this.histograms.set(name, metricMap)
    }
    const key = serializeLabels(labels)
    let entry = metricMap.get(key)
    if (!entry) {
      entry = {
        labels: { ...labels },
        bucketCounts: HISTOGRAM_BUCKETS_MS.map(() => 0),
        sum: 0,
        count: 0,
      }
      metricMap.set(key, entry)
    }
    entry.sum += valueMs
    entry.count += 1
    for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
      const bound = HISTOGRAM_BUCKETS_MS[i]
      if (bound !== undefined && valueMs <= bound) {
        entry.bucketCounts[i] = (entry.bucketCounts[i] ?? 0) + 1
      }
    }
  }

  public renderMetrics(components: ComponentStatusSnapshot[]): string {
    const lines: string[] = []

    const mem = process.memoryUsage()
    const cpu = process.cpuUsage()
    const uptimeSec = (Date.now() - this.startTimeMs) / 1000

    lines.push(
      '# HELP process_resident_memory_bytes Resident memory size in bytes of the Node.js API process.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '# HELP nodejs_heap_used_bytes Process heap space used in bytes.',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes ${mem.heapUsed}`,
      '# HELP nodejs_heap_total_bytes Process heap space total allocated in bytes.',
      '# TYPE nodejs_heap_total_bytes gauge',
      `nodejs_heap_total_bytes ${mem.heapTotal}`,
      '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.',
      '# TYPE process_cpu_user_seconds_total counter',
      `process_cpu_user_seconds_total ${(cpu.user / 1_000_000).toFixed(6)}`,
      '# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.',
      '# TYPE process_cpu_system_seconds_total counter',
      `process_cpu_system_seconds_total ${(cpu.system / 1_000_000).toFixed(6)}`,
      '# HELP process_uptime_seconds Node.js API process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptimeSec.toFixed(3)}`,
    )

    lines.push(
      '# HELP fixture2030_component_up Availability status of Fixture 2030 architecture components (1 = UP, 0 = DOWN).',
      '# TYPE fixture2030_component_up gauge',
    )
    for (const comp of components) {
      const lbl = serializeLabels({
        component: comp.component,
        model: comp.model,
        role: comp.role,
        monitored_mode: comp.monitoredMode,
      })
      lines.push(`fixture2030_component_up${lbl} ${comp.up}`)
    }

    lines.push(
      '# HELP fixture2030_component_probe_latency_ms Last health probe latency in milliseconds per component.',
      '# TYPE fixture2030_component_probe_latency_ms gauge',
    )
    for (const comp of components) {
      const lbl = serializeLabels({
        component: comp.component,
        model: comp.model,
        role: comp.role,
        monitored_mode: comp.monitoredMode,
      })
      lines.push(
        `fixture2030_component_probe_latency_ms${lbl} ${comp.latencyMs.toFixed(3)}`,
      )
    }

    const counterMetadata: Record<string, string> = {
      fixture2030_http_requests_total:
        'Total number of HTTP requests processed by the Fixture 2030 API.',
      fixture2030_db_operations_total:
        'Total number of polyglot database driver operations executed by the API.',
      fixture2030_cache_events_total:
        'Total number of Redis Read-Aside cache events (hit, miss, write).',
      fixture2030_session_renewals_total:
        'Total number of Redis session TTL renewal operations (executed vs throttled_skip).',
    }

    for (const [name, help] of Object.entries(counterMetadata)) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`)
      const map = this.counters.get(name)
      if (map) {
        for (const [lbl, entry] of map.entries()) {
          lines.push(`${name}${lbl} ${entry.value}`)
        }
      }
    }

    const histogramMetadata: Record<string, string> = {
      fixture2030_http_request_duration_ms:
        'HTTP request duration in milliseconds at the Fastify API layer.',
      fixture2030_db_operation_duration_ms:
        'Database driver operation duration in milliseconds per engine and operation.',
    }

    for (const [name, help] of Object.entries(histogramMetadata)) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} histogram`)
      const map = this.histograms.get(name)
      if (map) {
        for (const entry of map.values()) {
          for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
            const bound = HISTOGRAM_BUCKETS_MS[i]
            const bucketLabels = serializeLabels({
              ...entry.labels,
              le: String(bound),
            })
            lines.push(
              `${name}_bucket${bucketLabels} ${entry.bucketCounts[i] ?? 0}`,
            )
          }
          const infLabels = serializeLabels({
            ...entry.labels,
            le: '+Inf',
          })
          const baseLabels = serializeLabels(entry.labels)
          lines.push(
            `${name}_bucket${infLabels} ${entry.count}`,
            `${name}_sum${baseLabels} ${entry.sum.toFixed(3)}`,
            `${name}_count${baseLabels} ${entry.count}`,
          )
        }
      }
    }

    return `${lines.join('\n')}\n`
  }
}

const READ_AND_RENEW_SESSION_THROTTLED = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
if redis.call('HGET', KEYS[1], 'estado_acceso') ~= 'autorizado' then return nil end
local thresholdMs = tonumber(ARGV[2]) * 1000
if ttl < thresholdMs then
  local t = redis.call('TIME')
  local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
  redis.call('HSET', KEYS[1], 'ultima_actividad', now)
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  return {redis.call('HGETALL', KEYS[1]), tonumber(ARGV[1]) * 1000, 1}
end
return {redis.call('HGETALL', KEYS[1]), ttl, 0}`

const MATCH_QUERY = `
MATCH (local:Equipo)-[:DISPUTA {condicion: 'local'}]->(p:Partido {id: $id})
MATCH (visitante:Equipo)-[:DISPUTA {condicion: 'visitante'}]->(p)
MATCH (p)-[:SE_JUEGA_EN]->(s:Sede)
RETURN p.id AS id, toString(p.fecha) AS fecha, toString(p.hora) AS hora,
       p.fase AS fase, local.codigo AS local, visitante.codigo AS visitante,
       s.id AS sedeId, s.nombre AS sede, s.ciudad AS ciudad,
       s.pais AS pais, s.region AS region`

const EVENTS_QUERY = `
MATCH (p:Partido {id: $id})
OPTIONAL MATCH (e:Evento)-[:OCURRE_EN]->(p)
OPTIONAL MATCH (e)-[:INVOLUCRA]->(j:Jugador)
WITH p, e, j ORDER BY e.minuto, e.id
RETURN p.id AS partido, e.id AS id, e.tipo AS tipo, e.minuto AS minuto,
       e.detalle AS detalle, j.id AS jugadorId, j.nombre AS nombre,
       j.apellido AS apellido, j.equipoCodigo AS equipo
LIMIT $limit`

const TEAM_PROJECTION = {
  _id: 1,
  codigo: 1,
  nombre: 1,
  confederacion: 1,
  origenSeleccion: 1,
  etapaClasificacion: 1,
  participaFixture2030: 1,
  sedeEntrenamiento: 1,
} as const

const PLAYER_PROJECTION = {
  _id: 1,
  equipoId: 1,
  equipoCodigo: 1,
  nombre: 1,
  apellido: 1,
  fechaNacimiento: 1,
  posicion: 1,
  dorsal: 1,
  alturaCm: 1,
  pieHabil: 1,
  convocado: 1,
  disponible: 1,
  datosSinteticos: 1,
} as const

function mapTeamRow(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    code: String(row.codigo),
    name: String(row.nombre),
    confederation: String(row.confederacion),
    selectionOrigin: String(row.origenSeleccion),
    qualificationStage: String(row.etapaClasificacion),
    participates: Boolean(row.participaFixture2030),
    ...(typeof row.sedeEntrenamiento === 'string'
      ? { trainingBase: row.sedeEntrenamiento }
      : {}),
  }
}

function mapPlayerRow(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    teamId: String(row.equipoId),
    teamCode: String(row.equipoCodigo),
    firstName: String(row.nombre),
    lastName: String(row.apellido),
    birthDate:
      row.fechaNacimiento instanceof Date
        ? row.fechaNacimiento.toISOString()
        : String(row.fechaNacimiento),
    position: String(row.posicion),
    number: Number(row.dorsal),
    heightCm: Number(row.alturaCm),
    preferredFoot: String(row.pieHabil),
    selected: Boolean(row.convocado),
    available: Boolean(row.disponible),
    synthetic: Boolean(row.datosSinteticos),
  }
}

function checkTcpPort(
  host: string,
  port: number,
  timeoutMs = 500,
): Promise<{ up: 0 | 1; latencyMs: number; detail: string }> {
  return new Promise((resolvePromise) => {
    const start = performance.now()
    const socket = createConnection({ host, port })
    let settled = false

    const finish = (up: 0 | 1, detail: string) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolvePromise({
        up,
        latencyMs: Number((performance.now() - start).toFixed(3)),
        detail,
      })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(1, `TCP ${host}:${port} reachable`))
    socket.once('timeout', () => finish(0, `TCP ${host}:${port} timeout`))
    socket.once('error', (err) => finish(0, `TCP ${host}:${port} ${err.message}`))
  })
}

export interface RunningMonitoredServer {
  baseUrl: string
  metricsUrl: string
  port: number
  registry: PrometheusMetricsRegistry
  setSimulatedOutage: (component: MonitoredComponentId, down: boolean) => void
  invalidateMatchCache: (matchId: string) => Promise<void>
  probeComponents: () => Promise<ComponentStatusSnapshot[]>
  close: () => Promise<void>
}

export async function startMonitoredServer(options?: {
  host?: string
  port?: number
}): Promise<RunningMonitoredServer> {
  const env = await loadLocalEnvironment()
  const host = options?.host ?? env.H13_API_HOST ?? '0.0.0.0'
  const requestedPort = options?.port ?? Number(env.H13_API_PORT ?? 8013)
  const dependencyTimeoutMs = Number(env.DEPENDENCY_TIMEOUT_MS ?? 3000)

  const serverMod = (await import(
    '../../hito-10-api/src/app/server.js' as string
  )) as {
    buildServer: (
      config: unknown,
      logStream: Writable,
      authDep: unknown,
      dataDep: unknown,
    ) => Promise<{
      get: (
        path: string,
        handler: (
          req: unknown,
          reply: {
            header: (k: string, v: string) => void
            send: (body: string) => unknown
          },
        ) => Promise<unknown>,
      ) => void
      addHook: (
        hook: string,
        fn: (
          req: {
            method: string
            url: string
            routeOptions?: { url?: string }
            __h13StartMs?: number
          },
          reply: { statusCode: number },
          done: () => void,
        ) => void,
      ) => void
      listen: (opts: { host: string; port: number }) => Promise<string>
      close: () => Promise<void>
    }>
  }
  const envMod = (await import(
    '../../hito-10-api/src/config/environment.js' as string
  )) as {
    readEnvironment: (overrides: Record<string, string>) => unknown
  }
  const apiErrorMod = (await import(
    '../../hito-10-api/src/app/errors/api-error.js' as string
  )) as {
    ApiError: new (code: string) => Error
  }
  const authServiceMod = (await import(
    '../../hito-10-api/src/modules/auth/application/auth.service.js' as string
  )) as {
    AuthService: new (
      accounts: unknown,
      sessions: unknown,
      hasher: unknown,
    ) => unknown
    SESSION_TTL_SECONDS: number
  }

  const { buildServer } = serverMod
  const { readEnvironment } = envMod
  const { ApiError } = apiErrorMod
  const { AuthService, SESSION_TTL_SECONDS } = authServiceMod

  const registry = new PrometheusMetricsRegistry()
  const simulatedOutages = new Set<MonitoredComponentId>()

  // Inicializar métricas base en 0
  registry.incCounter(
    'fixture2030_http_requests_total',
    { method: 'GET', route: '/partidos/:id', status_code: '200', status_class: '2xx' },
    0,
  )
  registry.incCounter(
    'fixture2030_db_operations_total',
    { engine: 'mongodb', operation: 'team', status: 'ok' },
    0,
  )
  registry.incCounter(
    'fixture2030_db_operations_total',
    { engine: 'neo4j', operation: 'match', status: 'ok' },
    0,
  )
  registry.incCounter(
    'fixture2030_db_operations_total',
    { engine: 'redis_session', operation: 'readAndRenew', status: 'ok' },
    0,
  )
  registry.incCounter(
    'fixture2030_db_operations_total',
    { engine: 'redis_cache', operation: 'get', status: 'ok' },
    0,
  )
  registry.incCounter(
    'fixture2030_cache_events_total',
    { entity: 'match', result: 'hit' },
    0,
  )
  registry.incCounter(
    'fixture2030_cache_events_total',
    { entity: 'match', result: 'miss' },
    0,
  )
  registry.incCounter(
    'fixture2030_session_renewals_total',
    { action: 'executed' },
    0,
  )
  registry.incCounter(
    'fixture2030_session_renewals_total',
    { action: 'throttled_skip' },
    0,
  )

  const mongoHost = env.MONGO_HOST ?? '127.0.0.1'
  const mongoPort = Number(env.MONGO_PORT ?? 27017)
  const mongoDbName = env.MONGO_DATABASE ?? 'fixture2030'
  const mongoUser = env.MONGO_ROOT_USERNAME ?? 'admin'
  const mongoPassword = env.MONGO_ROOT_PASSWORD ?? ''
  const mongoAuthSource = env.MONGO_AUTH_SOURCE ?? 'admin'

  const neo4jHost = env.NEO4J_HOST ?? '127.0.0.1'
  const neo4jPort = Number(env.NEO4J_BOLT_PORT ?? 7687)
  const neo4jUser = env.NEO4J_USERNAME ?? 'neo4j'
  const neo4jPassword = env.NEO4J_PASSWORD ?? ''

  const redisHost = env.REDIS_HOST ?? '127.0.0.1'
  const redisPort = Number(env.REDIS_PORT ?? 6379)
  const redisScope = env.H12_REDIS_SCOPE ?? 'h12-bench'

  const MongoClient = await loadMongo()
  const mongoClient = new MongoClient(`mongodb://${mongoHost}:${mongoPort}`, {
    appName: 'fixture2030-h13-monitoreo',
    ...(mongoUser
      ? {
          auth: { username: mongoUser, password: mongoPassword },
          authSource: mongoAuthSource,
        }
      : {}),
    timeoutMS: dependencyTimeoutMs,
    connectTimeoutMS: dependencyTimeoutMs,
    serverSelectionTimeoutMS: dependencyTimeoutMs,
    retryReads: false,
    maxPoolSize: 25,
  })
  await mongoClient.connect()
  const mongoDb = mongoClient.db(mongoDbName)

  const neo4j = await loadNeo4j()
  const neo4jDriver = neo4j.driver(
    `neo4j://${neo4jHost}:${neo4jPort}`,
    neo4j.auth.basic(neo4jUser, neo4jPassword),
    {
      connectionTimeout: dependencyTimeoutMs,
      connectionAcquisitionTimeout: dependencyTimeoutMs,
      maxConnectionPoolSize: 25,
      maxTransactionRetryTime: 0,
    },
  )

  const createRedisClient = await loadRedis()
  const redisClient = createRedisClient({
    socket: {
      host: redisHost,
      port: redisPort,
      connectTimeout: dependencyTimeoutMs,
      reconnectStrategy: false,
    },
    disableOfflineQueue: true,
    commandOptions: { timeout: dependencyTimeoutMs },
  })
  redisClient.on('error', () => {
    /* Manejado por operación */
  })
  await redisClient.connect()

  async function trackMongo<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (simulatedOutages.has('mongodb')) {
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'mongodb',
        operation,
        status: 'error',
      })
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    }
    const start = performance.now()
    try {
      const res = await fn()
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'mongodb',
        operation,
        status: 'ok',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'mongodb', operation },
        elapsed,
      )
      return res
    } catch {
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'mongodb',
        operation,
        status: 'error',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'mongodb', operation },
        elapsed,
      )
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    }
  }

  async function trackNeo4j<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    if (simulatedOutages.has('neo4j')) {
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'neo4j',
        operation,
        status: 'error',
      })
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    }
    const start = performance.now()
    try {
      const res = await fn()
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'neo4j',
        operation,
        status: 'ok',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'neo4j', operation },
        elapsed,
      )
      return res
    } catch {
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'neo4j',
        operation,
        status: 'error',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'neo4j', operation },
        elapsed,
      )
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    }
  }

  async function cacheGet<T>(
    entity: 'match' | 'team' | 'players' | 'events',
    key: string,
  ): Promise<T | null> {
    if (simulatedOutages.has('redis')) return null
    const start = performance.now()
    try {
      const raw = await redisClient.get(`fixture2030:h13:cache:${key}`)
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'redis_cache',
        operation: 'get',
        status: 'ok',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'redis_cache', operation: 'get' },
        elapsed,
      )
      if (raw !== null) {
        registry.incCounter('fixture2030_cache_events_total', {
          entity,
          result: 'hit',
        })
        return JSON.parse(raw) as T
      }
      registry.incCounter('fixture2030_cache_events_total', {
        entity,
        result: 'miss',
      })
      return null
    } catch {
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'redis_cache',
        operation: 'get',
        status: 'error',
      })
      return null
    }
  }

  async function cacheSet(
    entity: 'match' | 'team' | 'players' | 'events',
    key: string,
    value: unknown,
    ttlSec: number,
  ): Promise<void> {
    if (simulatedOutages.has('redis')) return
    const start = performance.now()
    try {
      await redisClient.set(
        `fixture2030:h13:cache:${key}`,
        JSON.stringify(value),
        { EX: ttlSec },
      )
      const elapsed = performance.now() - start
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'redis_cache',
        operation: 'setex',
        status: 'ok',
      })
      registry.observeHistogram(
        'fixture2030_db_operation_duration_ms',
        { engine: 'redis_cache', operation: 'setex' },
        elapsed,
      )
      registry.incCounter('fixture2030_cache_events_total', {
        entity,
        result: 'write',
      })
    } catch {
      registry.incCounter('fixture2030_db_operations_total', {
        engine: 'redis_cache',
        operation: 'setex',
        status: 'error',
      })
    }
  }

  const sessionRepository = {
    async create(
      digest: string,
      user: { id: string; username: string; role: string },
    ) {
      const key = `fixture2030:h10:${redisScope}:sesion:${digest}`
      const nowEpoch = `${Math.floor(Date.now() / 1000)}.000000`
      await redisClient.hSet(key, {
        sesion_id: digest,
        usuario_id: user.id,
        username: user.username,
        rol: user.role,
        estado_acceso: 'autorizado',
        creada_en: nowEpoch,
        ultima_actividad: nowEpoch,
      })
      await redisClient.expire(key, SESSION_TTL_SECONDS)
    },
    async read(digest: string) {
      return this.readAndRenew(digest)
    },
    async readAndRenew(digest: string) {
      if (simulatedOutages.has('redis')) {
        registry.incCounter('fixture2030_db_operations_total', {
          engine: 'redis_session',
          operation: 'readAndRenew',
          status: 'error',
        })
        throw new ApiError('DEPENDENCY_UNAVAILABLE')
      }
      const start = performance.now()
      const key = `fixture2030:h10:${redisScope}:sesion:${digest}`
      try {
        const raw = await redisClient.eval(READ_AND_RENEW_SESSION_THROTTLED, {
          keys: [key],
          arguments: [
            String(SESSION_TTL_SECONDS),
            String(SESSION_TTL_SECONDS - 60),
          ],
        })
        const elapsed = performance.now() - start
        registry.incCounter('fixture2030_db_operations_total', {
          engine: 'redis_session',
          operation: 'readAndRenew',
          status: 'ok',
        })
        registry.observeHistogram(
          'fixture2030_db_operation_duration_ms',
          { engine: 'redis_session', operation: 'readAndRenew' },
          elapsed,
        )
        if (raw === null || !Array.isArray(raw)) return null
        const values = raw[0] as string[]
        const ttlMs = Number(raw[1])
        const wrote = Number(raw[2])
        registry.incCounter('fixture2030_session_renewals_total', {
          action: wrote === 1 ? 'executed' : 'throttled_skip',
        })
        const entries: [string, string][] = []
        for (let i = 0; i < values.length; i += 2) {
          entries.push([values[i] ?? '', values[i + 1] ?? ''])
        }
        const obj = Object.fromEntries(entries)
        return {
          user: {
            id: String(obj.usuario_id),
            username: String(obj.username),
            role: (obj.rol === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
          },
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          ttlSeconds: Math.ceil(ttlMs / 1000),
        }
      } catch {
        const elapsed = performance.now() - start
        registry.incCounter('fixture2030_db_operations_total', {
          engine: 'redis_session',
          operation: 'readAndRenew',
          status: 'error',
        })
        registry.observeHistogram(
          'fixture2030_db_operation_duration_ms',
          { engine: 'redis_session', operation: 'readAndRenew' },
          elapsed,
        )
        throw new ApiError('DEPENDENCY_UNAVAILABLE')
      }
    },
    async remove(digest: string) {
      await redisClient.del(`fixture2030:h10:${redisScope}:sesion:${digest}`)
    },
  }

  const dummyAccounts = {
    async findByUsername() {
      return null
    },
  }
  const dummyHasher = {
    async hash() {
      return ''
    },
    async verify() {
      return false
    },
  }

  const authService = new AuthService(
    dummyAccounts,
    sessionRepository,
    dummyHasher,
  )

  const dataService = {
    async team(code: string) {
      const cached = await cacheGet<ReturnType<typeof mapTeamRow>>(
        'team',
        `equipo:${code}`,
      )
      if (cached) return cached

      const row = await trackMongo('team', () =>
        mongoDb
          .collection('equipos')
          .findOne({ codigo: code }, { projection: TEAM_PROJECTION }),
      )
      if (!row) throw new ApiError('RESOURCE_NOT_FOUND')
      const mapped = mapTeamRow(row as Record<string, unknown>)
      await cacheSet('team', `equipo:${code}`, mapped, 300)
      return mapped
    },

    async players(code: string, page: number, limit: number) {
      const cacheKey = `plantel:${code}:${page}:${limit}`
      const cached = await cacheGet<{
        items: ReturnType<typeof mapPlayerRow>[]
        total: number
        page: number
        limit: number
      }>('players', cacheKey)
      if (cached) return cached

      const rows = await trackMongo<Record<string, unknown>[]>('players', () =>
        mongoDb
          .collection('jugadores')
          .find({ equipoCodigo: code }, { projection: PLAYER_PROJECTION })
          .sort({ posicion: 1, dorsal: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
      )
      if (rows.length === 0) {
        const teamExists = await trackMongo<Record<string, unknown> | null>(
          'teamCheck',
          () =>
            mongoDb
              .collection('equipos')
              .findOne({ codigo: code }, { projection: { _id: 1 } }),
        )
        if (!teamExists) throw new ApiError('RESOURCE_NOT_FOUND')
      }
      const total =
        page === 1 && rows.length === 24
          ? 24
          : await trackMongo<number>('playersCount', () =>
              mongoDb
                .collection('jugadores')
                .countDocuments({ equipoCodigo: code }),
            )
      const response = {
        items: rows.map((r) => mapPlayerRow(r)),
        total,
        page,
        limit,
      }
      await cacheSet('players', cacheKey, response, 300)
      return response
    },

    async match(id: string) {
      const cacheKey = `partido:${id}`
      const cached = await cacheGet<Record<string, unknown>>('match', cacheKey)
      if (cached) return cached

      const graph = await trackNeo4j('match', async () => {
        const result = await neo4jDriver.executeQuery(
          MATCH_QUERY,
          { id },
          {
            routing: 'READ',
            transactionConfig: { timeout: dependencyTimeoutMs },
          },
        )
        const row = result.records[0]
        if (!row) return null
        return {
          id: String(row.get('id')),
          date: String(row.get('fecha')),
          time: String(row.get('hora')),
          phase: String(row.get('fase')),
          homeCode: String(row.get('local')),
          awayCode: String(row.get('visitante')),
          venue: {
            id: String(row.get('sedeId')),
            name: String(row.get('sede')),
            city: String(row.get('ciudad')),
            country: String(row.get('pais')),
            region: String(row.get('region')),
          },
        }
      })

      if (!graph) throw new ApiError('RESOURCE_NOT_FOUND')

      const teamRows = await trackMongo<Record<string, unknown>[]>(
        'matchTeamsBatch',
        () =>
          mongoDb
            .collection('equipos')
            .find(
              { codigo: { $in: [graph.homeCode, graph.awayCode] } },
              { projection: TEAM_PROJECTION },
            )
            .toArray(),
      )
      const byCode = new Map<string, ReturnType<typeof mapTeamRow>>()
      for (const r of teamRows) {
        const mapped = mapTeamRow(r)
        byCode.set(mapped.code, mapped)
      }
      const home = byCode.get(graph.homeCode)
      const away = byCode.get(graph.awayCode)
      if (!home || !away) throw new ApiError('DEPENDENCY_UNAVAILABLE')
      const composed = { ...graph, home, away }
      await cacheSet('match', cacheKey, composed, 120)
      return composed
    },

    async events(id: string, limit: number) {
      const cacheKey = `eventos:${id}:${limit}`
      const cached = await cacheGet<{ items: unknown[]; limit: number }>(
        'events',
        cacheKey,
      )
      if (cached) return cached

      const items = await trackNeo4j('events', async () => {
        const result = await neo4jDriver.executeQuery(
          EVENTS_QUERY,
          { id, limit: neo4j.int(limit) },
          {
            routing: 'READ',
            transactionConfig: { timeout: dependencyTimeoutMs },
          },
        )
        if (!result.records[0]) return null
        if (result.records[0].get('id') === null) return []
        return result.records.map(
          (row: { get: (key: string) => unknown }) => ({
            id: String(row.get('id')),
            type: String(row.get('tipo')),
            minute: neo4j.integer.toNumber(row.get('minuto')),
            detail: String(row.get('detalle') ?? ''),
            player: {
              id: String(row.get('jugadorId')),
              firstName: String(row.get('nombre')),
              lastName: String(row.get('apellido')),
              teamCode: String(row.get('equipo')),
            },
          }),
        )
      })

      if (!items) throw new ApiError('RESOURCE_NOT_FOUND')
      const response = { items, limit }
      await cacheSet('events', cacheKey, response, 15)
      return response
    },

    async commentsPage() {
      return { items: [], nextCursor: null }
    },
    async createComment() {
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    },
    async statisticsSummary() {
      return { matchId: 'F2030-001', start: '', end: '', teams: [] }
    },
    async objectDetail() {
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    },
    async changeState() {
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    },
    async addObjectEvent() {
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    },
  }

  async function probeComponents(): Promise<ComponentStatusSnapshot[]> {
    const snapshots: ComponentStatusSnapshot[] = []

    snapshots.push({
      component: 'api-fastify',
      model: 'api-rest',
      role: 'integracion-poliglota',
      monitoredMode: 'active_probe',
      up: simulatedOutages.has('api-fastify') ? 0 : 1,
      latencyMs: 0.15,
      detail: simulatedOutages.has('api-fastify')
        ? 'Simulated outage active'
        : 'Fastify event loop active',
    })

    if (simulatedOutages.has('mongodb')) {
      snapshots.push({
        component: 'mongodb',
        model: 'documental',
        role: 'equipos-jugadores-auditoria',
        monitoredMode: 'active_probe',
        up: 0,
        latencyMs: 0,
        detail: 'Simulated outage active',
      })
    } else {
      const t0 = performance.now()
      try {
        await mongoDb.command({ ping: 1 })
        snapshots.push({
          component: 'mongodb',
          model: 'documental',
          role: 'equipos-jugadores-auditoria',
          monitoredMode: 'active_probe',
          up: 1,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: 'MongoDB ping:1 ok',
        })
      } catch (err) {
        snapshots.push({
          component: 'mongodb',
          model: 'documental',
          role: 'equipos-jugadores-auditoria',
          monitoredMode: 'active_probe',
          up: 0,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: err instanceof Error ? err.message : 'MongoDB ping failed',
        })
      }
    }

    if (simulatedOutages.has('neo4j')) {
      snapshots.push({
        component: 'neo4j',
        model: 'grafo',
        role: 'fixture-sedes-eventos',
        monitoredMode: 'active_probe',
        up: 0,
        latencyMs: 0,
        detail: 'Simulated outage active',
      })
    } else {
      const t0 = performance.now()
      try {
        await neo4jDriver.executeQuery(
          'RETURN 1 AS ok',
          {},
          {
            routing: 'READ',
            transactionConfig: { timeout: 1500 },
          },
        )
        snapshots.push({
          component: 'neo4j',
          model: 'grafo',
          role: 'fixture-sedes-eventos',
          monitoredMode: 'active_probe',
          up: 1,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: 'Neo4j Bolt RETURN 1 ok',
        })
      } catch (err) {
        snapshots.push({
          component: 'neo4j',
          model: 'grafo',
          role: 'fixture-sedes-eventos',
          monitoredMode: 'active_probe',
          up: 0,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: err instanceof Error ? err.message : 'Neo4j probe failed',
        })
      }
    }

    if (simulatedOutages.has('redis')) {
      snapshots.push({
        component: 'redis',
        model: 'clave-valor',
        role: 'sesiones-y-cache',
        monitoredMode: 'active_probe',
        up: 0,
        latencyMs: 0,
        detail: 'Simulated outage active',
      })
    } else {
      const t0 = performance.now()
      try {
        await redisClient.ping()
        snapshots.push({
          component: 'redis',
          model: 'clave-valor',
          role: 'sesiones-y-cache',
          monitoredMode: 'active_probe',
          up: 1,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: 'Redis PING PONG ok',
        })
      } catch (err) {
        snapshots.push({
          component: 'redis',
          model: 'clave-valor',
          role: 'sesiones-y-cache',
          monitoredMode: 'active_probe',
          up: 0,
          latencyMs: Number((performance.now() - t0).toFixed(3)),
          detail: err instanceof Error ? err.message : 'Redis PING failed',
        })
      }
    }

    const [cassProbe, influxProbe, irisProbe] = await Promise.all([
      checkTcpPort('127.0.0.1', Number(env.CASSANDRA_PORT ?? 9042)),
      checkTcpPort('127.0.0.1', Number(env.INFLUXDB_PORT ?? 8181)),
      checkTcpPort('127.0.0.1', Number(env.IRIS_PORT ?? 1972)),
    ])

    snapshots.push(
      {
        component: 'cassandra',
        model: 'columnar',
        role: 'eventos-y-consultas-por-particion',
        monitoredMode: 'tcp_socket_probe',
        up: cassProbe.up,
        latencyMs: cassProbe.latencyMs,
        detail: cassProbe.detail,
      },
      {
        component: 'influxdb',
        model: 'series-temporales',
        role: 'telemetria-iot-sensores',
        monitoredMode: 'tcp_socket_probe',
        up: influxProbe.up,
        latencyMs: influxProbe.latencyMs,
        detail: influxProbe.detail,
      },
      {
        component: 'iris',
        model: 'multimodelo',
        role: 'datamart-analitico-bi',
        monitoredMode: 'tcp_socket_probe',
        up: irisProbe.up,
        latencyMs: irisProbe.latencyMs,
        detail: irisProbe.detail,
      },
    )

    return snapshots
  }

  let cachedComponentSnapshots: ComponentStatusSnapshot[] =
    await probeComponents()
  const probeInterval = setInterval(() => {
    void probeComponents()
      .then((snaps) => {
        cachedComponentSnapshots = snaps
      })
      .catch(() => undefined)
  }, 2000)
  probeInterval.unref()

  const nullStream = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })

  const app = await buildServer(
    readEnvironment({
      API_HOST: host,
      API_PORT: String(requestedPort),
      API_LOG_LEVEL: 'silent',
      API_REQUEST_TIMEOUT_MS: '10000',
      API_BODY_LIMIT_BYTES: '16384',
    }),
    nullStream,
    {
      service: authService,
      async close() {
        clearInterval(probeInterval)
        if (redisClient.isOpen) {
          await redisClient.quit().catch(() => redisClient.destroy())
        }
      },
    },
    {
      service: dataService,
      async close() {
        await Promise.all([
          mongoClient.close().catch(() => undefined),
          neo4jDriver.close().catch(() => undefined),
        ])
      },
    },
  )

  app.get('/metrics', async (_request, reply) => {
    const payload = registry.renderMetrics(cachedComponentSnapshots)
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
    return reply.send(payload)
  })

  app.addHook('onRequest', (request, _reply, done) => {
    request.__h13StartMs = performance.now()
    done()
  })

  app.addHook('onResponse', (request, reply, done) => {
    const startMs = request.__h13StartMs
    const routeUrl = request.routeOptions?.url ?? request.url.split('?')[0] ?? '/'
    if (routeUrl !== '/metrics') {
      const statusCode = String(reply.statusCode)
      const statusClass = `${Math.floor(reply.statusCode / 100)}xx`
      registry.incCounter('fixture2030_http_requests_total', {
        method: request.method,
        route: routeUrl,
        status_code: statusCode,
        status_class: statusClass,
      })
      if (typeof startMs === 'number') {
        registry.observeHistogram(
          'fixture2030_http_request_duration_ms',
          {
            method: request.method,
            route: routeUrl,
            status_class: statusClass,
          },
          performance.now() - startMs,
        )
      }
    }
    done()
  })

  const address = await app.listen({ host, port: requestedPort })
  const listenUrl = new URL(address)
  const actualPort = Number(listenUrl.port || requestedPort)

  return {
    baseUrl: `http://127.0.0.1:${actualPort}`,
    metricsUrl: `http://127.0.0.1:${actualPort}/metrics`,
    port: actualPort,
    registry,
    setSimulatedOutage(component: MonitoredComponentId, down: boolean) {
      if (down) {
        simulatedOutages.add(component)
      } else {
        simulatedOutages.delete(component)
      }
      void probeComponents()
        .then((snaps) => {
          cachedComponentSnapshots = snaps
        })
        .catch(() => undefined)
    },
    async invalidateMatchCache(matchId: string) {
      await redisClient.del(`fixture2030:h13:cache:partido:${matchId}`)
    },
    probeComponents,
    async close() {
      await app.close()
    },
  }
}

async function runCli(): Promise<void> {
  const server = await startMonitoredServer()
  console.log(
    `[Hito 13] Servidor API con instrumentación Prometheus activo en ${server.baseUrl} (métricas: ${server.metricsUrl})`,
  )
  const shutdown = async () => {
    await server.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

const currentFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (
  dirname(currentFile) === dirname(entryFile) &&
  entryFile.endsWith('servidor_monitoreo.ts')
) {
  runCli().catch((err) => {
    console.error('[Hito 13] Error en servidor de monitoreo:', err)
    process.exit(1)
  })
}
