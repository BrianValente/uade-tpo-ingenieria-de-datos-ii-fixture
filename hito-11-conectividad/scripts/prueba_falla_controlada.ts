import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as nodeModule from 'node:module'
import { performance } from 'node:perf_hooks'
import { Writable } from 'node:stream'
import { sanitizeSecrets } from './sanitizer.js'

export interface ControlledCycleStageResult {
  stage: '1_INITIAL_SIMULATED_OK' | '2_REAL_ADAPTER_FAILURE' | '3_RECOVERY_SIMULATED_OK'
  title: string
  mechanism: string
  statusHttp: number
  requestId: string
  latencyMs: number
  responseBody: string
  pinoLogs: string[]
}

function getGitCommitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Si el addon binario `@intersystems/intersystems-iris-native` no puede cargarse en la distribución
 * o arquitectura actual al importar `server.ts` (que referencia `IrisObjectRepository`), registra
 * un fallback seguro solo para ese paquete no utilizado por este ciclo documental.
 */
async function ensureIrisImportFallbackIfNeeded(): Promise<void> {
  try {
    await import('@intersystems/intersystems-iris-native' as string)
  } catch {
    const regHooks = (nodeModule as unknown as Record<string, unknown>).registerHooks
    if (typeof regHooks === 'function') {
      try {
        ;(regHooks as (hooks: Record<string, unknown>) => void)({
          resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
            if (specifier === '@intersystems/intersystems-iris-native') {
              return { url: 'fallback:iris-native-unavailable', shortCircuit: true }
            }
            return nextResolve(specifier, context)
          },
          load(url: string, context: unknown, nextLoad: (u: string, c: unknown) => unknown) {
            if (url === 'fallback:iris-native-unavailable') {
              return {
                format: 'module',
                shortCircuit: true,
                source: [
                  'export function createConnection() { throw new Error("IRIS native addon unavailable on this platform"); }',
                  'export class IRISReference { static Type = { STRING: 0 }; constructor() {} getString() { return ""; } }',
                  'export default { createConnection, IRISReference };',
                ].join('\n'),
              }
            }
            return nextLoad(url, context)
          },
        })
      } catch {}
    }
  }
}

export async function runControlledFailureCycle(): Promise<{
  timestamp: string
  gitCommit: string
  environment: string
  stages: ControlledCycleStageResult[]
}> {
  await ensureIrisImportFallbackIfNeeded()

  const serverMod = (await import('../../hito-10-api/src/app/server.js' as string)) as any
  const envMod = (await import('../../hito-10-api/src/config/environment.js' as string)) as any
  const dataEnvMod = (await import('../../hito-10-api/src/config/data-environment.js' as string)) as any
  const apiErrorMod = (await import('../../hito-10-api/src/app/errors/api-error.js' as string)) as any
  const dataServiceMod = (await import('../../hito-10-api/src/modules/data/application/data.service.js' as string)) as any
  const mongoRepoMod = (await import(
    '../../hito-10-api/src/modules/data/infrastructure/mongo-document.repository.js' as string
  )) as any

  const { buildServer } = serverMod
  const { readEnvironment } = envMod
  const { readDataEnvironment } = dataEnvMod
  const { ApiError } = apiErrorMod
  const { DataService } = dataServiceMod
  const { MongoDocumentRepository } = mongoRepoMod

  const capturedLogLines: string[] = []
  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) {
          capturedLogLines.push(sanitizeSecrets(trimmed))
        }
      }
      callback()
    },
  })

  // Instancia real de MongoDocumentRepository apuntando a un puerto local sin listener (27099)
  // con DEPENDENCY_TIMEOUT_MS=500ms para ejercer el fallo de conexión real del driver Mongo en la Etapa 2
  const realDownMongoRepo = new MongoDocumentRepository(
    readDataEnvironment({
      MONGO_HOST: '127.0.0.1',
      MONGO_PORT: '27099',
      DEPENDENCY_TIMEOUT_MS: '500',
    }),
  )

  let useSimulatedHealthyDouble = true
  // Token opaco de 43 caracteres base64url conforme con sessionHeadersSchema (/^Bearer [A-Za-z0-9_-]{43}$/i)
  const validToken = randomBytes(32).toString('base64url')
  const testUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'fixture-admin',
    role: 'admin' as const,
  }

  // Doble de autenticación en memoria para permitir alcanzar la ruta protegida sin Redis/Mongo activos
  const authModule = {
    service: {
      async login() {
        return {
          accessToken: validToken,
          tokenType: 'Bearer' as const,
          expiresIn: 1800,
          user: testUser,
        }
      },
      async currentSession() {
        return { user: testUser, expiresAt: new Date(Date.now() + 1800_000).toISOString() }
      },
      async authorize(token: string) {
        if (token === validToken) {
          return testUser
        }
        throw new ApiError('UNAUTHENTICATED')
      },
      async logout() {},
    },
    async close() {},
  }

  const documentsRepo = {
    async findTeam(code: string, context: any) {
      if (!useSimulatedHealthyDouble) {
        // Etapa 2: Ejecuta el método real de MongoDocumentRepository contra el puerto local sin listener
        return realDownMongoRepo.findTeam(code, context)
      }
      // Etapas 1 y 3: Doble en memoria con entidad fija (no consulta ni reconecta a MongoDB real)
      const started = performance.now()
      try {
        if (code === 'ARG') {
          return {
            id: '550e8400-e29b-41d4-a716-446655440001',
            code: 'ARG',
            name: 'Argentina',
            confederation: 'CONMEBOL',
            selectionOrigin: 'Anfitrión conmemorativo',
            qualificationStage: 'Clasificado directo',
            participates: true,
            trainingBase: 'Predio Lionel Andrés Messi (Ezeiza)',
          }
        }
        return null
      } finally {
        context.log.info(
          {
            dependency: 'MongoDB',
            operation: 'findTeam',
            result: 'simulated_double_success',
            source: 'in-memory-double',
            durationMs: performance.now() - started,
          },
          'Operación simulada en doble de prueba (sin conexión a MongoDB)',
        )
      }
    },
    async listPlayers(teamId: string, page: number, limit: number, context: any) {
      if (!useSimulatedHealthyDouble) {
        return realDownMongoRepo.listPlayers(teamId, page, limit, context)
      }
      return { items: [], total: 0 }
    },
    async close() {
      await realDownMongoRepo.close().catch(() => {})
    },
  }

  const noopRepo = new Proxy(
    {},
    {
      get() {
        return async () => null
      },
    },
  )

  const dataModule = {
    service: new DataService(
      documentsRepo as any,
      noopRepo as any,
      noopRepo as any,
      noopRepo as any,
      noopRepo as any,
    ),
    async close() {
      await documentsRepo.close()
    },
  }

  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'info' }),
    logStream,
    authModule as any,
    dataModule as any,
  )

  const stages: ControlledCycleStageResult[] = []

  try {
    // Etapa 1: Respuesta inicial servida por doble en memoria
    useSimulatedHealthyDouble = true
    capturedLogLines.length = 0
    const start1 = Date.now()
    const res1 = await app.inject({
      method: 'GET',
      url: '/equipos/ARG',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    })
    const lat1 = Date.now() - start1
    stages.push({
      stage: '1_INITIAL_SIMULATED_OK',
      title: '1. Estado Inicial Simulado en API (Doble en memoria -> HTTP 200 OK)',
      mechanism: 'Doble en memoria (entidad ARG fija y sesión simulada; sin conexión a MongoDB)',
      statusHttp: res1.statusCode,
      requestId: String(res1.headers['x-request-id'] || ''),
      latencyMs: lat1,
      responseBody: sanitizeSecrets(res1.body),
      pinoLogs: [...capturedLogLines],
    })

    // Etapa 2: Falla de conexión real ejecutando MongoDocumentRepository contra puerto local sin listener (127.0.0.1:27099)
    useSimulatedHealthyDouble = false
    capturedLogLines.length = 0
    const start2 = Date.now()
    const res2 = await app.inject({
      method: 'GET',
      url: '/equipos/ARG',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    })
    const lat2 = Date.now() - start2
    stages.push({
      stage: '2_REAL_ADAPTER_FAILURE',
      title:
        '2. Falla de Conexión Real en Adaptador (MongoDocumentRepository contra 127.0.0.1:27099 -> HTTP 503 DEPENDENCY_UNAVAILABLE)',
      mechanism:
        'Adaptador real MongoDocumentRepository + driver mongodb contra 127.0.0.1:27099 sin listener (timeout 500ms)',
      statusHttp: res2.statusCode,
      requestId: String(res2.headers['x-request-id'] || ''),
      latencyMs: lat2,
      responseBody: sanitizeSecrets(res2.body),
      pinoLogs: [...capturedLogLines],
    })

    // Etapa 3: Retorno de la capa HTTP al conmutar nuevamente al doble en memoria (sin reiniciar Fastify)
    useSimulatedHealthyDouble = true
    capturedLogLines.length = 0
    const start3 = Date.now()
    const res3 = await app.inject({
      method: 'GET',
      url: '/equipos/ARG',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    })
    const lat3 = Date.now() - start3
    stages.push({
      stage: '3_RECOVERY_SIMULATED_OK',
      title: '3. Retorno Simulado en API al Conmutar Doble (Doble en memoria -> HTTP 200 OK)',
      mechanism:
        'Conmutación al doble en memoria sin reiniciar Fastify (no reconecta ni lee MongoDB real)',
      statusHttp: res3.statusCode,
      requestId: String(res3.headers['x-request-id'] || ''),
      latencyMs: lat3,
      responseBody: sanitizeSecrets(res3.body),
      pinoLogs: [...capturedLogLines],
    })
  } finally {
    await app.close()
  }

  return {
    timestamp: new Date().toISOString(),
    gitCommit: getGitCommitSha(),
    environment: `${process.platform} (${process.arch}) — Node.js ${process.version}`,
    stages,
  }
}

export function formatControlledCycleMarkdown(data: {
  timestamp: string
  gitCommit: string
  environment: string
  stages: ControlledCycleStageResult[]
}): string {
  const lines: string[] = [
    '# Evidencia de Simulación Híbrida In-Process de Falla y Retorno en la API — Hito 11',
    '',
    `**Fecha de generación:** ${data.timestamp}  `,
    `**Entorno:** ${data.environment}  `,
    `**Commit base:** \`${data.gitCommit}\`  `,
    `**Comando ejecutado:** \`pnpm --dir hito-10-api exec tsx ../hito-11-conectividad/scripts/prueba_falla_controlada.ts --output=../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion.md\`  `,
    `**Naturaleza de la prueba:** **Simulación híbrida in-process** sobre instancia real de Fastify (\`buildServer\`) y \`registerErrorHandler\`.  `,
    '',
    '## Alcance y Límites de la Simulación Híbrida (RNF17, RNF18)',
    '',
    '- **Partes simuladas (dobles en memoria):** La autorización Bearer (`authModule`) y las respuestas `200 OK` de las **Etapas 1 y 3** son servidas por dobles en memoria que devuelven una entidad `ARG` fija y registran un evento explícitamente rotulado como `source: "in-memory-double"`. **No leen ni reconectan una instancia real de MongoDB.**',
    '- **Parte ejercida contra adaptador y driver reales:** Únicamente la **Etapa 2** invoca una instancia real de `MongoDocumentRepository` (y el driver oficial `mongodb`) apuntando al puerto local sin listener `127.0.0.1:27099` (`DEPENDENCY_TIMEOUT_MS=500ms`), provocando un `MongoServerSelectionError` (`ECONNREFUSED`) real que atraviesa `DataService` y `registerErrorHandler` hasta responder `HTTP 503 DEPENDENCY_UNAVAILABLE`.',
    '- **Límite explícito de la conclusión:** Esta prueba certifica exclusivamente el contrato HTTP de degradación controlada (`503 DEPENDENCY_UNAVAILABLE`), la correlación de `x-request-id`, el formato de logs Pino y que el servidor Fastify continúa procesando peticiones tras un rechazo del adaptador. **No comprueba restauración del servicio MongoDB, lectura de datos persistidos ni conservación de volúmenes** (cuya verificación requiere un motor MongoDB activo según la guía operativa de `docs/diagnostico_de_fallas.md` §3.2).',
    '',
    '## Resumen del Ciclo Híbrido Ejecutado',
    '',
    '| Etapa | Endpoint | Mecanismo Activo | HTTP Status | Request ID (`x-request-id`) | Latencia | Resultado Observado |',
    '|:---|:---|:---|:---:|:---|:---:|:---|',
  ]

  for (const s of data.stages) {
    const label = s.statusHttp === 200 ? '**200 OK**' : `**${s.statusHttp} Service Unavailable**`
    const summary =
      s.statusHttp === 200
        ? 'Respuesta 200 OK desde doble en memoria (entidad `ARG` fija; sin lectura real a MongoDB)'
        : 'Degradación controlada (`DEPENDENCY_UNAVAILABLE`) tras rechazo TCP real en `MongoDocumentRepository`'
    lines.push(
      `| ${s.title} | \`GET /equipos/ARG\` | ${s.mechanism} | ${label} | \`${s.requestId}\` | ${s.latencyMs}ms | ${summary} |`,
    )
  }

  lines.push('', '## Detalle por Etapa (Cuerpos HTTP y Logs Estructurados Pino)', '')

  for (const s of data.stages) {
    lines.push(`### ${s.title}`, '')
    lines.push(`- **Mecanismo activo:** ${s.mechanism}`)
    lines.push(`- **Status HTTP:** \`${s.statusHttp}\``)
    lines.push(`- **Header \`x-request-id\`:** \`${s.requestId}\``)
    lines.push(`- **Latencia medida:** \`${s.latencyMs}ms\``)
    lines.push('', '**Respuesta HTTP capturada:**', '```json')
    try {
      lines.push(JSON.stringify(JSON.parse(s.responseBody), null, 2))
    } catch {
      lines.push(s.responseBody)
    }
    lines.push('```', '', '**Logs estructurados Pino emitidos por el servidor Fastify:**', '```json')
    for (const log of s.pinoLogs) {
      lines.push(log)
    }
    lines.push('```', '')
  }

  lines.push(
    '---',
    '*Reporte generado automáticamente por `prueba_falla_controlada.ts` sin edición manual posterior.*',
  )
  return lines.join('\n')
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  const outputArg = process.argv.find((a) => a.startsWith('--output='))
  const outputPath = outputArg ? outputArg.split('=')[1] : null

  runControlledFailureCycle()
    .then(async (data) => {
      const md = formatControlledCycleMarkdown(data)
      console.log(md)
      if (outputPath) {
        const fullOutPath = resolve(process.cwd(), outputPath)
        await mkdir(dirname(fullOutPath), { recursive: true })
        await writeFile(fullOutPath, md, 'utf8')
        console.log(`\nEvidencia guardada en: ${fullOutPath}`)
      }
    })
    .catch((err) => {
      console.error('Error en prueba de falla controlada:', err)
      process.exit(1)
    })
}
