import { arch, cpus, platform, release, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'

import { readSeedPasswords } from '../src/config/auth-environment.js'
import { summarizeLatency } from './latency-summary.js'

const options = z
  .object({
    MEASURE_URL: z.url().default('http://127.0.0.1:8000'),
    MEASURE_REQUESTS: z.coerce.number().int().min(5).max(100).default(20),
    MEASURE_WARMUP: z.coerce.number().int().min(1).max(10).default(3),
    MEASURE_IRIS_CODE: z
      .string()
      .regex(/^F2030-[A-Z0-9-]{1,40}$/)
      .default('F2030-IRIS-0011'),
  })
  .parse(process.env)
const base = new URL(options.MEASURE_URL)
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
  base.protocol !== 'http:' ||
  base.username ||
  base.password
) {
  throw new Error(
    'La referencia de laboratorio requiere una URL HTTP local sin credenciales.',
  )
}
const userSchema = z.object({
  user: z.object({ username: z.string() }),
  ttlSeconds: z.number().positive(),
})
const teamSchema = z.object({ code: z.string() })
const playersSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number(),
})
const matchSchema = z.object({ home: teamSchema, away: teamSchema })
const itemsSchema = z.object({ items: z.array(z.unknown()) })
const statsSchema = z.object({ teams: z.array(z.unknown()) })
const objectSchema = z.object({
  state: z.string(),
  events: z.array(z.unknown()),
})
const profiles = [
  {
    source: 'Redis',
    path: '/auth/session',
    volume: (body: unknown) => {
      userSchema.parse(body)
      return { rows: 1 }
    },
  },
  {
    source: 'MongoDB',
    path: '/equipos/ARG',
    volume: (body: unknown) => {
      teamSchema.parse(body)
      return { rows: 1 }
    },
  },
  {
    source: 'MongoDB',
    path: '/equipos/ARG/jugadores?page=1&limit=5',
    volume: (body: unknown) => {
      const value = playersSchema.parse(body)
      return { rows: value.items.length, totalPlayers: value.total }
    },
  },
  {
    source: 'Neo4j + MongoDB',
    path: '/partidos/F2030-001',
    volume: (body: unknown) => {
      matchSchema.parse(body)
      return { rows: 1, teamDocuments: 2 }
    },
  },
  {
    source: 'Neo4j',
    path: '/partidos/F2030-001/eventos?limit=5',
    volume: (body: unknown) => ({ rows: itemsSchema.parse(body).items.length }),
  },
  {
    source: 'Cassandra',
    path: '/partidos/F2030-DEMO/comentarios?minute=2030-06-13T20:01:00.000Z&limit=2',
    volume: (body: unknown) => ({ rows: itemsSchema.parse(body).items.length }),
  },
  {
    source: 'InfluxDB',
    path: '/partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T20:01:00.000Z',
    volume: (body: unknown) => ({ rows: statsSchema.parse(body).teams.length }),
  },
  {
    source: 'IRIS',
    path: `/partidos/${options.MEASURE_IRIS_CODE}/detalle`,
    volume: (body: unknown) => {
      const value = objectSchema.parse(body)
      return { rows: 1, events: value.events.length, state: value.state }
    },
  },
]

const password = readSeedPasswords().API_SEED_ADMIN_PASSWORD
const timeoutMs = 10000
let token: string | undefined
let cleanupFailed = false
let httpRequests = 0
const results = []
try {
  httpRequests++
  const login = await fetch(new URL('/auth/login', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'fixture-admin', password }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (login.status !== 200)
    throw new Error(`Login de medición rechazado: HTTP ${login.status}.`)
  const authenticated = z
    .object({ accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .parse(await login.json())
  token = authenticated.accessToken
  for (const profile of profiles) {
    const samples: number[] = []
    const bytes: number[] = []
    const volumes = []
    for (
      let index = 0;
      index < options.MEASURE_WARMUP + options.MEASURE_REQUESTS;
      index++
    ) {
      httpRequests++
      const started = performance.now()
      const response = await fetch(new URL(profile.path, base), {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await response.text()
      if (response.status !== 200)
        throw new Error(
          `La medición se detuvo: ${profile.path}, HTTP ${response.status}.`,
        )
      const body: unknown = JSON.parse(text)
      const duration = performance.now() - started
      const volume = profile.volume(body)
      if (index >= options.MEASURE_WARMUP) {
        samples.push(duration)
        bytes.push(Buffer.byteLength(text))
        volumes.push(volume)
      }
    }
    results.push({
      source: profile.source,
      method: 'GET',
      path: profile.path,
      status: 200,
      ...summarizeLatency(samples),
      responseBytes: { min: Math.min(...bytes), max: Math.max(...bytes) },
      responseVolumes: [
        ...new Map(
          volumes.map((volume) => [JSON.stringify(volume), volume]),
        ).values(),
      ],
      samplesMs: samples.map((value) => Math.round(value * 1000) / 1000),
    })
  }
} finally {
  if (token) {
    httpRequests++
    const logout = await fetch(new URL('/auth/session', base), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => undefined)
    cleanupFailed = logout?.status !== 204
  }
}
if (cleanupFailed)
  throw new Error('No se confirmó el cierre de la sesión de medición.')

console.info(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      baseUrl: base.origin,
      environment: {
        clientNode: process.version,
        platform: platform(),
        release: release(),
        arch: arch(),
        cpuModel: cpus()[0]?.model,
        logicalCpus: cpus().length,
        memoryGiB: Math.round(totalmem() / 2 ** 30),
      },
      method: {
        tool: 'Node.js fetch + performance.now',
        concurrency: 1,
        measuredPerProfile: options.MEASURE_REQUESTS,
        warmupPerProfile: options.MEASURE_WARMUP,
        requestTimeoutMs: timeoutMs,
        duration: 'Desde antes de fetch hasta leer y parsear el JSON completo.',
        p95: 'Nearest rank: ordenar y elegir ceil(0.95 * N), con posiciones desde 1.',
        measuredRequests: results.reduce((sum, value) => sum + value.count, 0),
        warmupRequests: profiles.length * options.MEASURE_WARMUP,
        controlRequests: 2,
        httpRequests,
      },
      results,
      limitations: [
        'Referencia local secuencial con conexiones reutilizadas y calentamiento; no es una prueba de carga.',
        'Notebook y contenedores compartidos con otros procesos; no se aisló CPU ni memoria.',
        '20 muestras por perfil en la configuración predeterminada: p95 sensible a valores individuales.',
        'El perfil InfluxDB puede medir una respuesta vacía válida; consultar responseVolumes.',
        'No cuenta el tamaño global de las bases ni demuestra objetivos de producción o concurrencia distribuida.',
        'Login y logout son controles fuera de las estadísticas de los perfiles de lectura.',
      ],
    },
    null,
    2,
  ),
)
