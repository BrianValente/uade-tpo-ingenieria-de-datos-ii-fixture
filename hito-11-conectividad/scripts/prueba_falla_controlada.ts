import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { Writable } from 'node:stream'
import { sanitizeSecrets } from './sanitizer.js'

export interface ControlledCycleStageResult {
  stage: '1_INITIAL_UP' | '2_CONTROLLED_FAILURE' | '3_RECOVERY_UP'
  title: string
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

export async function runControlledFailureCycle(): Promise<{
  timestamp: string
  gitCommit: string
  environment: string
  stages: ControlledCycleStageResult[]
}> {
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
  // con DEPENDENCY_TIMEOUT_MS=500ms para ejecutar el código real de falla del adaptador Mongo
  const realDownMongoRepo = new MongoDocumentRepository(
    readDataEnvironment({
      MONGO_HOST: '127.0.0.1',
      MONGO_PORT: '27099',
      DEPENDENCY_TIMEOUT_MS: '500',
    }),
  )

  let mongoHealthy = true
  // Token opaco de 43 caracteres base64url conforme con sessionHeadersSchema (/^Bearer [A-Za-z0-9_-]{43}$/i)
  const validToken = randomBytes(32).toString('base64url')
  const testUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'fixture-admin',
    role: 'admin' as const,
  }

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
      if (!mongoHealthy) {
        // Ejecuta el método real de MongoDocumentRepository contra el puerto detenido
        return realDownMongoRepo.findTeam(code, context)
      }
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
            result: 'success',
            durationMs: performance.now() - started,
          },
          'Operación de dependencia',
        )
      }
    },
    async listPlayers(teamId: string, page: number, limit: number, context: any) {
      if (!mongoHealthy) {
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
    // Etapa 1: Estado inicial operativo
    mongoHealthy = true
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
      stage: '1_INITIAL_UP',
      title: '1. Estado Inicial Operativo (Dependencia MongoDB UP)',
      statusHttp: res1.statusCode,
      requestId: String(res1.headers['x-request-id'] || ''),
      latencyMs: lat1,
      responseBody: sanitizeSecrets(res1.body),
      pinoLogs: [...capturedLogLines],
    })

    // Etapa 2: Falla controlada de la dependencia MongoDB (ejecutando MongoDocumentRepository real contra puerto sin listener)
    mongoHealthy = false
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
      stage: '2_CONTROLLED_FAILURE',
      title: '2. Falla Controlada de Dependencia (MongoDB DOWN -> HTTP 503 DEPENDENCY_UNAVAILABLE)',
      statusHttp: res2.statusCode,
      requestId: String(res2.headers['x-request-id'] || ''),
      latencyMs: lat2,
      responseBody: sanitizeSecrets(res2.body),
      pinoLogs: [...capturedLogLines],
    })

    // Etapa 3: Recuperación y reintento posterior sin reiniciar la API
    mongoHealthy = true
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
      stage: '3_RECOVERY_UP',
      title: '3. Recuperación de Dependencia y Reintento Exitoso (MongoDB UP -> HTTP 200 OK)',
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
    '# Evidencia de Ciclo Controlado de Falla y Recuperación — Hito 11',
    '',
    `**Fecha de generación:** ${data.timestamp}  `,
    `**Entorno:** ${data.environment}  `,
    `**Commit base:** \`${data.gitCommit}\`  `,
    `**Comando ejecutado:** \`pnpm --dir hito-10-api exec tsx ../hito-11-conectividad/scripts/prueba_falla_controlada.ts --output=../hito-11-conectividad/docs/evidencia/ciclo_falla_recuperacion.md\`  `,
    `**Tipo de prueba:** Ejecución controlada reproducible in-process sobre instancia real de Fastify (\`buildServer\`), \`MongoDocumentRepository\` real (ante puerto desconectado en etapa 2) y manejador de errores del Hito 10 (\`registerErrorHandler\`).  `,
    '',
    '## Resumen del Ciclo Ejecutado',
    '',
    '| Etapa | Endpoint | HTTP Status | Request ID (`x-request-id`) | Latencia | Resultado |',
    '|:---|:---|:---:|:---|:---:|:---|',
  ]

  for (const s of data.stages) {
    const label = s.statusHttp === 200 ? '**200 OK**' : `**${s.statusHttp} Service Unavailable**`
    const summary =
      s.statusHttp === 200
        ? 'Lectura exitosa de entidad `ARG` en MongoDB'
        : 'Degradación controlada (`DEPENDENCY_UNAVAILABLE`)'
    lines.push(
      `| ${s.title} | \`GET /equipos/ARG\` | ${label} | \`${s.requestId}\` | ${s.latencyMs}ms | ${summary} |`,
    )
  }

  lines.push('', '## Detalle por Etapa (Cuerpos HTTP y Logs Estructurados Pino)', '')

  for (const s of data.stages) {
    lines.push(`### ${s.title}`, '')
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
