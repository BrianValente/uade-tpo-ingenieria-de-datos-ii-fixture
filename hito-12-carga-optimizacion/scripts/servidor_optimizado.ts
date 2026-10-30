import { performance } from 'node:perf_hooks'
import { Writable } from 'node:stream'

import {
  loadMongo,
  loadNeo4j,
  loadRedis,
} from '../../hito-11-conectividad/scripts/driver_loader.js'
import {
  calculateLatencyDistribution,
  loadLocalEnvironment,
  type LatencyDistribution,
} from './entorno_y_recursos.js'

export type BenchmarkMode = 'baseline' | 'optimized'

export interface ServerTelemetrySummary {
  mode: BenchmarkMode
  recordingActive: boolean
  apiInternalLatency: LatencyDistribution
  dependencies: {
    mongodb: {
      operationsCount: number
      failuresCount: number
      poolSizeConfigured: number
      latency: LatencyDistribution
    }
    neo4j: {
      operationsCount: number
      failuresCount: number
      poolSizeConfigured: number
      latency: LatencyDistribution
    }
    redisSession: {
      operationsCount: number
      renewWritesExecuted: number
      renewWritesSkippedByThrottle: number
      failuresCount: number
      latency: LatencyDistribution
    }
    redisCache: {
      enabled: boolean
      lookupsCount: number
      cacheHits: number
      cacheMisses: number
      cacheWrites: number
      hitRatioPct: number
      latency: LatencyDistribution
    }
  }
}

export interface BenchmarkServerEffectiveConfig {
  mode: BenchmarkMode
  dependencyTimeoutMs: number
  mongoMaxPoolSize: number
  neo4jMaxConnectionPoolSize: number
  cacheTtlSeconds: {
    match: number
    team: number
    events: number
  }
  sessionRenewThrottleSeconds: number
}

export function resolveBenchmarkServerConfig(
  mode: BenchmarkMode,
  env: Record<string, string | undefined>,
): BenchmarkServerEffectiveConfig {
  return {
    mode,
    dependencyTimeoutMs: Number(env.DEPENDENCY_TIMEOUT_MS ?? 3000),
    mongoMaxPoolSize:
      mode === 'optimized'
        ? Number(env.H12_MONGO_POOL_SIZE_OPTIMIZED ?? 25)
        : Number(env.H12_MONGO_POOL_SIZE_BASELINE ?? 5),
    neo4jMaxConnectionPoolSize:
      mode === 'optimized'
        ? Number(env.H12_NEO4J_POOL_SIZE_OPTIMIZED ?? 25)
        : Number(env.H12_NEO4J_POOL_SIZE_BASELINE ?? 5),
    cacheTtlSeconds: {
      match:
        mode === 'optimized' ? Number(env.H12_CACHE_TTL_MATCH_SECONDS ?? 120) : 0,
      team:
        mode === 'optimized' ? Number(env.H12_CACHE_TTL_TEAM_SECONDS ?? 300) : 0,
      events:
        mode === 'optimized' ? Number(env.H12_CACHE_TTL_EVENTS_SECONDS ?? 15) : 0,
    },
    sessionRenewThrottleSeconds:
      mode === 'optimized'
        ? Number(env.H12_SESSION_RENEW_THROTTLE_SECONDS ?? 60)
        : 0,
  }
}

export interface RunningBenchmarkServer {
  mode: BenchmarkMode
  baseUrl: string
  port: number
  effectiveConfig: BenchmarkServerEffectiveConfig
  startRecordingTelemetry: () => void
  stopRecordingTelemetry: () => void
  getTelemetrySummary: () => ServerTelemetrySummary
  close: () => Promise<void>
}

const READ_AND_RENEW_SESSION_BASELINE = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return nil end
if redis.call('HGET', KEYS[1], 'estado_acceso') ~= 'autorizado' then return nil end
local t = redis.call('TIME')
local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
redis.call('HSET', KEYS[1], 'ultima_actividad', now)
redis.call('EXPIRE', KEYS[1], ARGV[1])
return {redis.call('HGETALL', KEYS[1]), tonumber(ARGV[1]) * 1000, 1}`

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

export async function startBenchmarkServer(
  mode: BenchmarkMode,
  portOverride = 0,
): Promise<RunningBenchmarkServer> {
  const env = await loadLocalEnvironment()
  const serverMod = (await import('../../hito-10-api/src/app/server.js' as string)) as any
  const envMod = (await import('../../hito-10-api/src/config/environment.js' as string)) as any
  const apiErrorMod = (await import('../../hito-10-api/src/app/errors/api-error.js' as string)) as any
  const authServiceMod = (await import('../../hito-10-api/src/modules/auth/application/auth.service.js' as string)) as any

  const { buildServer } = serverMod
  const { readEnvironment } = envMod
  const { ApiError } = apiErrorMod
  const { AuthService, SESSION_TTL_SECONDS } = authServiceMod

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
  const effectiveConfig = resolveBenchmarkServerConfig(mode, env)
  const dependencyTimeoutMs = effectiveConfig.dependencyTimeoutMs
  const mongoPoolSize = effectiveConfig.mongoMaxPoolSize
  const neo4jPoolSize = effectiveConfig.neo4jMaxConnectionPoolSize
  const cacheTtlTeamSec = effectiveConfig.cacheTtlSeconds.team
  const cacheTtlMatchSec = effectiveConfig.cacheTtlSeconds.match
  const cacheTtlEventsSec = effectiveConfig.cacheTtlSeconds.events
  const sessionThrottleSec = effectiveConfig.sessionRenewThrottleSeconds

  // Telemetría por capa (RF6)
  let recordingActive = false
  const apiSamples: number[] = []
  const mongoSamples: number[] = []
  let mongoFailures = 0
  const neo4jSamples: number[] = []
  let neo4jFailures = 0
  const redisSessionSamples: number[] = []
  let redisSessionRenewWrites = 0
  let redisSessionRenewSkipped = 0
  let redisSessionFailures = 0
  const redisCacheSamples: number[] = []
  let cacheHits = 0
  let cacheMisses = 0
  let cacheWrites = 0

  // 1. Conexiones a motores reales
  const MongoClient = await loadMongo()
  const mongoClient = new MongoClient(`mongodb://${mongoHost}:${mongoPort}`, {
    appName: `fixture2030-h12-${mode}`,
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
    maxPoolSize: mongoPoolSize,
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
      maxConnectionPoolSize: neo4jPoolSize,
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

  // Helpers de telemetría por motor
  async function trackMongo<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      return await fn()
    } catch (err) {
      if (recordingActive) mongoFailures++
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      if (recordingActive) mongoSamples.push(performance.now() - start)
    }
  }

  async function trackNeo4j<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      return await fn()
    } catch {
      if (recordingActive) neo4jFailures++
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      if (recordingActive) neo4jSamples.push(performance.now() - start)
    }
  }

  async function cacheGet<T>(key: string): Promise<T | null> {
    if (mode !== 'optimized') return null
    const start = performance.now()
    try {
      const raw = await redisClient.get(`fixture2030:h12:cache:${key}`)
      if (recordingActive) {
        redisCacheSamples.push(performance.now() - start)
        if (raw !== null) cacheHits++
        else cacheMisses++
      }
      return raw !== null ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }

  async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (mode !== 'optimized') return
    const start = performance.now()
    try {
      await redisClient.set(`fixture2030:h12:cache:${key}`, JSON.stringify(value), {
        EX: ttlSec,
      })
      if (recordingActive) {
        redisCacheSamples.push(performance.now() - start)
        cacheWrites++
      }
    } catch {
      /* En Read-Aside, un fallo de escritura en caché no aborta la respuesta desde fuente */
    }
  }

  // Repositorio de sesiones con soporte para Línea Base vs. Throttled Sliding Window (O3)
  const sessionRepository = {
    async create(digest: string, user: { id: string; username: string; role: string }) {
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
      const start = performance.now()
      const key = `fixture2030:h10:${redisScope}:sesion:${digest}`
      try {
        const raw =
          mode === 'optimized'
            ? await redisClient.eval(READ_AND_RENEW_SESSION_THROTTLED, {
                keys: [key],
                arguments: [
                  String(SESSION_TTL_SECONDS),
                  String(SESSION_TTL_SECONDS - sessionThrottleSec),
                ],
              })
            : await redisClient.eval(READ_AND_RENEW_SESSION_BASELINE, {
                keys: [key],
                arguments: [String(SESSION_TTL_SECONDS)],
              })

        if (raw === null || !Array.isArray(raw)) return null
        const values = raw[0] as string[]
        const ttlMs = Number(raw[1])
        const wrote = Number(raw[2])
        if (recordingActive) {
          if (wrote === 1) redisSessionRenewWrites++
          else redisSessionRenewSkipped++
        }
        const entries: [string, string][] = []
        for (let i = 0; i < values.length; i += 2) {
          entries.push([values[i]!, values[i + 1]!])
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
        if (recordingActive) redisSessionFailures++
        throw new ApiError('DEPENDENCY_UNAVAILABLE')
      } finally {
        if (recordingActive) redisSessionSamples.push(performance.now() - start)
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

  // Servicio de datos con comportamiento diferenciado: Línea Base vs Optimizado (O1 + O2)
  const dataService = {
    async team(code: string) {
      if (mode === 'optimized') {
        const cached = await cacheGet<ReturnType<typeof mapTeamRow>>(`equipo:${code}`)
        if (cached) return cached
      }
      const row = await trackMongo(() =>
        mongoDb
          .collection('equipos')
          .findOne(
            { codigo: code },
            mode === 'optimized' ? { projection: TEAM_PROJECTION } : undefined,
          ),
      )
      if (!row) throw new ApiError('RESOURCE_NOT_FOUND')
      const mapped = mapTeamRow(row as Record<string, unknown>)
      if (mode === 'optimized') {
        await cacheSet(`equipo:${code}`, mapped, cacheTtlTeamSec)
      }
      return mapped
    },

    async players(code: string, page: number, limit: number) {
      const cacheKey = `plantel:${code}:${page}:${limit}`
      if (mode === 'optimized') {
        const cached = await cacheGet<{
          items: ReturnType<typeof mapPlayerRow>[]
          total: number
          page: number
          limit: number
        }>(cacheKey)
        if (cached) return cached
      }

      if (mode === 'baseline') {
        // Línea base Hito 10: 1 consulta a equipos + 2 consultas en paralelo a jugadores (find + countDocuments) sin proyección
        const teamRow = await trackMongo<Record<string, unknown> | null>(() =>
          mongoDb.collection('equipos').findOne({ codigo: code }),
        )
        if (!teamRow) throw new ApiError('RESOURCE_NOT_FOUND')
        const teamId = String(teamRow._id)
        const [rows, total] = await Promise.all([
          trackMongo<Record<string, unknown>[]>(() =>
            mongoDb
              .collection('jugadores')
              .find({ equipoId: teamId })
              .sort({ posicion: 1, dorsal: 1 })
              .skip((page - 1) * limit)
              .limit(limit)
              .toArray(),
          ),
          trackMongo<number>(() =>
            mongoDb.collection('jugadores').countDocuments({ equipoId: teamId }),
          ),
        ])
        return {
          items: rows.map((r) => mapPlayerRow(r)),
          total,
          page,
          limit,
        }
      }

      // Modo Optimizado (O1 + O2): consulta por equipoCodigo con proyección explícita + caché Read-Aside
      const rows = await trackMongo<Record<string, unknown>[]>(() =>
        mongoDb
          .collection('jugadores')
          .find({ equipoCodigo: code }, { projection: PLAYER_PROJECTION })
          .sort({ posicion: 1, dorsal: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
      )
      if (rows.length === 0) {
        const teamExists = await trackMongo<Record<string, unknown> | null>(() =>
          mongoDb
            .collection('equipos')
            .findOne({ codigo: code }, { projection: { _id: 1 } }),
        )
        if (!teamExists) throw new ApiError('RESOURCE_NOT_FOUND')
      }
      const total =
        page === 1 && rows.length === 24
          ? 24
          : await trackMongo<number>(() =>
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
      await cacheSet(cacheKey, response, cacheTtlTeamSec)
      return response
    },

    async match(id: string) {
      const cacheKey = `partido:${id}`
      if (mode === 'optimized') {
        const cached = await cacheGet<Record<string, unknown>>(cacheKey)
        if (cached) return cached
      }

      const graph = await trackNeo4j(async () => {
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

      if (mode === 'baseline') {
        // Línea base Hito 10: 2 consultas findOne en paralelo a MongoDB sin proyección
        const [homeRow, awayRow] = await Promise.all([
          trackMongo(() =>
            mongoDb.collection('equipos').findOne({ codigo: graph.homeCode }),
          ),
          trackMongo(() =>
            mongoDb.collection('equipos').findOne({ codigo: graph.awayCode }),
          ),
        ])
        if (!homeRow || !awayRow) throw new ApiError('DEPENDENCY_UNAVAILABLE')
        return {
          ...graph,
          home: mapTeamRow(homeRow as Record<string, unknown>),
          away: mapTeamRow(awayRow as Record<string, unknown>),
        }
      }

      // Modo Optimizado (O1 + O2): 1 sola consulta por lote ($in) con proyección BSON + caché Read-Aside
      const teamRows = await trackMongo<Record<string, unknown>[]>(() =>
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
      await cacheSet(cacheKey, composed, cacheTtlMatchSec)
      return composed
    },

    async events(id: string, limit: number) {
      const cacheKey = `eventos:${id}:${limit}`
      if (mode === 'optimized') {
        const cached = await cacheGet<{ items: unknown[]; limit: number }>(
          cacheKey,
        )
        if (cached) return cached
      }

      const items = await trackNeo4j(async () => {
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
        return result.records.map((row: any) => ({
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
        }))
      })

      if (!items) throw new ApiError('RESOURCE_NOT_FOUND')
      const response = { items, limit }
      if (mode === 'optimized') {
        await cacheSet(cacheKey, response, cacheTtlEventsSec)
      }
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

  // Stream de logs para capturar reply.elapsedTime interno de Fastify (RF6)
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      if (recordingActive) {
        try {
          const parsed = JSON.parse(String(chunk)) as {
            msg?: string
            durationMs?: number
          }
          if (
            parsed.msg === 'Solicitud finalizada' &&
            typeof parsed.durationMs === 'number'
          ) {
            apiSamples.push(parsed.durationMs)
          }
        } catch {
          /* Ignorar líneas no JSON */
        }
      }
      callback()
    },
  })

  const app = await buildServer(
    readEnvironment({
      API_HOST: '127.0.0.1',
      API_PORT: String(portOverride || 8012),
      API_LOG_LEVEL: 'info',
      API_REQUEST_TIMEOUT_MS: '10000',
      API_BODY_LIMIT_BYTES: '16384',
    }),
    logStream,
    {
      service: authService,
      async close() {
        if (redisClient.isOpen) {
          await redisClient.quit().catch(() => redisClient.destroy())
        }
      },
    },
    {
      service: dataService as any,
      async close() {
        await Promise.all([
          mongoClient.close().catch(() => undefined),
          neo4jDriver.close().catch(() => undefined),
        ])
      },
    },
  )

  const address = await app.listen({ host: '127.0.0.1', port: portOverride })
  const listenUrl = new URL(address)

  return {
    mode,
    baseUrl: listenUrl.origin,
    port: Number(listenUrl.port),
    effectiveConfig,
    startRecordingTelemetry() {
      apiSamples.length = 0
      mongoSamples.length = 0
      mongoFailures = 0
      neo4jSamples.length = 0
      neo4jFailures = 0
      redisSessionSamples.length = 0
      redisSessionRenewWrites = 0
      redisSessionRenewSkipped = 0
      redisSessionFailures = 0
      redisCacheSamples.length = 0
      cacheHits = 0
      cacheMisses = 0
      cacheWrites = 0
      recordingActive = true
    },
    stopRecordingTelemetry() {
      recordingActive = false
    },
    getTelemetrySummary(): ServerTelemetrySummary {
      const totalLookups = cacheHits + cacheMisses
      const hitRatioPct =
        totalLookups > 0
          ? Math.round((cacheHits / totalLookups) * 10000) / 100
          : 0
      return {
        mode,
        recordingActive,
        apiInternalLatency: calculateLatencyDistribution(apiSamples),
        dependencies: {
          mongodb: {
            operationsCount: mongoSamples.length,
            failuresCount: mongoFailures,
            poolSizeConfigured: mongoPoolSize,
            latency: calculateLatencyDistribution(mongoSamples),
          },
          neo4j: {
            operationsCount: neo4jSamples.length,
            failuresCount: neo4jFailures,
            poolSizeConfigured: neo4jPoolSize,
            latency: calculateLatencyDistribution(neo4jSamples),
          },
          redisSession: {
            operationsCount: redisSessionSamples.length,
            renewWritesExecuted: redisSessionRenewWrites,
            renewWritesSkippedByThrottle: redisSessionRenewSkipped,
            failuresCount: redisSessionFailures,
            latency: calculateLatencyDistribution(redisSessionSamples),
          },
          redisCache: {
            enabled: mode === 'optimized',
            lookupsCount: totalLookups,
            cacheHits,
            cacheMisses,
            cacheWrites,
            hitRatioPct,
            latency: calculateLatencyDistribution(redisCacheSamples),
          },
        },
      }
    },
    async close() {
      await app.close()
    },
  }
}
