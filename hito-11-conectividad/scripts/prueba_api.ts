import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export interface ApiTestRoute {
  name: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: unknown
  headers?: Record<string, string>
  expectedDependency: string
  expectedStatus: number
  description: string
}

export interface ApiTestResult {
  route: ApiTestRoute
  statusHttp: number | 'UNREACHABLE'
  responseTimeMs: number
  requestId: string
  resultSummary: 'SUCCESS' | 'NOT_FOUND_VALID' | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'DEPENDENCY_FAILED' | 'TIMEOUT' | 'API_UNREACHABLE'
  interpretation: string
  responseSnippet: string
}

export function getDefaultApiRoutes(): ApiTestRoute[] {
  return [
    {
      name: 'Salud HTTP del Proceso (Liveness)',
      method: 'GET',
      path: '/health',
      expectedDependency: 'Ninguna (Solo proceso HTTP)',
      expectedStatus: 200,
      description: 'Comprueba que el proceso de la API está iniciado y acepta peticiones.',
    },
    {
      name: 'Contrato OpenAPI de la API',
      method: 'GET',
      path: '/docs/json',
      expectedDependency: 'Ninguna (Esquemas estáticos Zod)',
      expectedStatus: 200,
      description: 'Comprueba que el catálogo y esquemas de la API son servidos.',
    },
    {
      name: 'Autenticación y Generación de Sesión (MongoDB + Redis)',
      method: 'POST',
      path: '/auth/login',
      body: { username: 'fixture-admin', password: 'PasswordDemo12345!' },
      expectedDependency: 'MongoDB (Colección accounts) + Redis (Tokens de sesión)',
      expectedStatus: 200,
      description: 'Verifica el flujo de login, hash Argon2id y creación de token opaco en Redis.',
    },
    {
      name: 'Consulta de Equipo Existente (MongoDB)',
      method: 'GET',
      path: '/equipos/ARG',
      expectedDependency: 'MongoDB (Colección equipos)',
      expectedStatus: 200,
      description: 'Cadena completa de lectura documental para un equipo participante válido.',
    },
    {
      name: 'Consulta de Equipo Inexistente (404 - Ausencia Válida)',
      method: 'GET',
      path: '/equipos/ZZZ',
      expectedDependency: 'MongoDB',
      expectedStatus: 404,
      description: 'Diferencia un código 404 de ausencia legítima respecto a una falla de infraestructura.',
    },
    {
      name: 'Error de Validación de Entrada (400 - Parámetro Inválido)',
      method: 'GET',
      path: '/equipos/CODIGO_INVALIDO_MUY_LARGO',
      expectedDependency: 'Zod Validator (Sin llamada a base)',
      expectedStatus: 400,
      description: 'Diferencia el rechazo sintáctico en la API de una consulta rechazada por la base.',
    },
    {
      name: 'Plantel de Jugadores Paginado (MongoDB)',
      method: 'GET',
      path: '/equipos/ARG/jugadores?page=1&limit=5',
      expectedDependency: 'MongoDB (Colección jugadores)',
      expectedStatus: 200,
      description: 'Lectura paginada con límite y proyección en MongoDB.',
    },
    {
      name: 'Ficha de Partido Compuesta (Neo4j + MongoDB)',
      method: 'GET',
      path: '/partidos/F2030-001',
      expectedDependency: 'Neo4j (Nodo Match) + MongoDB (Equipos)',
      expectedStatus: 200,
      description: 'Consulta coordinada multimodelo sin permitir estados inconsistentes.',
    },
    {
      name: 'Eventos de Partido (Neo4j)',
      method: 'GET',
      path: '/partidos/F2030-001/eventos?limit=10',
      expectedDependency: 'Neo4j (Relaciones en Grafo)',
      expectedStatus: 200,
      description: 'Consulta Cypher acotada sobre eventos asociados al partido.',
    },
    {
      name: 'Comentarios de Partido (Cassandra)',
      method: 'GET',
      path: '/partidos/F2030-001/comentarios?minute=2030-06-13T20:01:00.000Z&limit=10',
      expectedDependency: 'Cassandra (Keyspace fixture2030_comentarios)',
      expectedStatus: 200,
      description: 'Consulta CQL particionada por partido y minuto.',
    },
    {
      name: 'Resumen de Estadísticas (InfluxDB 3)',
      method: 'GET',
      path: '/partidos/F2030-001/estadisticas?start=2030-06-13T20:00:00.000Z&end=2030-06-13T22:00:00.000Z',
      expectedDependency: 'InfluxDB 3 (Base fixture2030_h8_lab_detalle)',
      expectedStatus: 200,
      description: 'Consulta temporal agregada acotada por rango de tiempo.',
    },
    {
      name: 'Detalle de Partido de Modelo Objeto (IRIS)',
      method: 'GET',
      path: '/partidos/F2030-IRIS-0011/detalle',
      expectedDependency: 'InterSystems IRIS (Namespace USER)',
      expectedStatus: 200,
      description: 'Lectura de entidad persistente mediante modelo de objetos IRIS.',
    },
  ]
}

export async function runLiveApiChecks(
  baseUrl = (process.env.API_URL || `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 8000}`).replace(/\/$/, ''),
  routes: ApiTestRoute[] = getDefaultApiRoutes(),
  token?: string,
): Promise<ApiTestResult[]> {
  const results: ApiTestResult[] = []

  for (const route of routes) {
    const start = Date.now()
    const targetUrl = `${baseUrl}${route.path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(route.headers || {}),
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)

      const response = await fetch(targetUrl, {
        method: route.method,
        headers,
        body: route.body ? JSON.stringify(route.body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timer)

      const responseTimeMs = Date.now() - start
      const requestId = response.headers.get('x-request-id') || 'no-provisto'
      const statusHttp = response.status

      let text = ''
      try {
        text = await response.text()
      } catch {
        text = ''
      }
      const responseSnippet = text.length > 120 ? `${text.slice(0, 117)}...` : text

      let resultSummary: ApiTestResult['resultSummary'] = 'SUCCESS'
      let interpretation = ''

      if (statusHttp === 200 || statusHttp === 201) {
        resultSummary = 'SUCCESS'
        interpretation = 'Operación completada exitosamente a través de la cadena completa.'
      } else if (statusHttp === 404) {
        resultSummary = 'NOT_FOUND_VALID'
        interpretation = 'Ausencia válida: el recurso solicitado no existe en la base. Código 404 correcto.'
      } else if (statusHttp === 400) {
        resultSummary = 'VALIDATION_ERROR'
        interpretation = 'Error de validación sintáctica/esquema Zod interceptado por la API.'
      } else if (statusHttp === 401) {
        resultSummary = 'UNAUTHENTICATED'
        interpretation = 'Petición rechazada por falta de sesión o token no suministrado.'
      } else if (statusHttp === 503) {
        resultSummary = 'DEPENDENCY_FAILED'
        interpretation = 'Dependencia subyacente no disponible (503 Service Unavailable).'
      } else if (statusHttp === 504) {
        resultSummary = 'TIMEOUT'
        interpretation = 'Timeout al consultar la dependencia requerida.'
      } else {
        resultSummary = 'DEPENDENCY_FAILED'
        interpretation = `Respuesta con error HTTP ${statusHttp}.`
      }

      results.push({
        route,
        statusHttp,
        responseTimeMs,
        requestId,
        resultSummary,
        interpretation,
        responseSnippet,
      })
    } catch (err: unknown) {
      const error = err as Error
      const responseTimeMs = Date.now() - start
      results.push({
        route,
        statusHttp: 'UNREACHABLE',
        responseTimeMs,
        requestId: 'none',
        resultSummary: 'API_UNREACHABLE',
        interpretation: `No se pudo alcanzar el endpoint de la API: ${error.message}`,
        responseSnippet: 'Sin respuesta (Connection Refused o Timeout)',
      })
    }
  }

  return results
}

export async function runInProcessApiChecks(
  routes: ApiTestRoute[] = getDefaultApiRoutes(),
  token?: string,
): Promise<ApiTestResult[]> {
  const { buildServer } = await import('../../hito-10-api/src/app/server.js')
  const { readEnvironment } = await import('../../hito-10-api/src/config/environment.js')
  const { createAuthModule } = await import('../../hito-10-api/src/modules/auth/auth.module.js')
  const { createDataModule } = await import('../../hito-10-api/src/modules/data/data.module.js')
  const { readAuthEnvironment } = await import('../../hito-10-api/src/config/auth-environment.js')
  const { readDataEnvironment } = await import('../../hito-10-api/src/config/data-environment.js')

  let auth
  let data
  try {
    auth = createAuthModule(readAuthEnvironment())
  } catch {
    auth = undefined
  }
  try {
    data = createDataModule(readDataEnvironment())
  } catch {
    data = undefined
  }

  const app = await buildServer(
    readEnvironment({ API_LOG_LEVEL: 'silent' }),
    undefined,
    auth,
    data,
  )

  const results: ApiTestResult[] = []

  try {
    for (const route of routes) {
      const start = Date.now()
      const headers: Record<string, string> = {
        ...(route.headers || {}),
      }
      if (token) {
        headers.authorization = `Bearer ${token}`
      }

      const response = await app.inject({
        method: route.method,
        url: route.path,
        payload: route.body,
        headers,
      })

      const responseTimeMs = Date.now() - start
      const requestId = String(response.headers['x-request-id'] || 'no-provisto')
      const statusHttp = response.statusCode

      let resultSummary: ApiTestResult['resultSummary'] = 'SUCCESS'
      let interpretation = ''

      if (statusHttp === 200 || statusHttp === 201) {
        resultSummary = 'SUCCESS'
        interpretation = 'Operación completada exitosamente a través de la cadena completa.'
      } else if (statusHttp === 404) {
        resultSummary = 'NOT_FOUND_VALID'
        interpretation = 'Ausencia válida: el recurso solicitado no existe en la base. Código 404 correcto.'
      } else if (statusHttp === 400) {
        resultSummary = 'VALIDATION_ERROR'
        interpretation = 'Error de validación sintáctica/esquema Zod interceptado por la API.'
      } else if (statusHttp === 401) {
        resultSummary = 'UNAUTHENTICATED'
        interpretation = 'Petición rechazada por falta de sesión o token no suministrado.'
      } else if (statusHttp === 503) {
        resultSummary = 'DEPENDENCY_FAILED'
        interpretation = 'Dependencia subyacente no disponible (503 Service Unavailable).'
      } else if (statusHttp === 504) {
        resultSummary = 'TIMEOUT'
        interpretation = 'Timeout al consultar la dependencia requerida.'
      } else {
        resultSummary = 'DEPENDENCY_FAILED'
        interpretation = `Respuesta con error HTTP ${statusHttp}.`
      }

      results.push({
        route,
        statusHttp,
        responseTimeMs,
        requestId,
        resultSummary,
        interpretation,
        responseSnippet: response.body.slice(0, 100),
      })
    }
  } finally {
    await app.close()
  }

  return results
}

export function formatApiResultsTable(results: ApiTestResult[]): string {
  const header = [
    '| Operación / Endpoint | Dependencia Evaluada | Status HTTP | Latencia | Request ID | Diagnóstico e Interpretación |',
    '|:---|:---|:---:|:---:|:---:|:---|',
  ]
  const rows = results.map((r) => {
    const statusLabel =
      r.statusHttp === 200 || r.statusHttp === 201
        ? `**${r.statusHttp} OK**`
        : r.statusHttp === 404
          ? '**404 (Ausencia válida)**'
          : r.statusHttp === 400
            ? '**400 (Validación)**'
            : r.statusHttp === 401
              ? '**401 (Auth requerida)**'
              : r.statusHttp === 'UNREACHABLE'
                ? '**INALCANZABLE**'
                : `**${r.statusHttp}**`
    const lat = r.responseTimeMs >= 0 ? `${r.responseTimeMs}ms` : '-'
    const req = r.requestId !== 'none' && r.requestId !== 'no-provisto' ? `\`${r.requestId.slice(0, 8)}...\`` : '-'
    return `| \`${r.route.method} ${r.route.path}\` | ${r.route.expectedDependency} | ${statusLabel} | ${lat} | ${req} | ${r.interpretation} |`
  })
  return [...header, ...rows].join('\n')
}

// CLI Execution
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  const inProcess = process.argv.includes('--in-process')
  console.log('='.repeat(80))
  console.log('Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030')
  console.log(`Fecha/Hora: ${new Date().toISOString()}`)
  console.log(`Modo de ejecución: ${inProcess ? 'In-Process (Fastify inject)' : 'Live HTTP'}`)
  console.log('='.repeat(80))
  console.log('Ejecutando pruebas sobre los endpoints HTTP...\n')

  const runner = inProcess ? runInProcessApiChecks() : runLiveApiChecks()
  runner.then((results) => {
    console.log(formatApiResultsTable(results))
    console.log('\nResumen:')
    const success = results.filter((r) => r.resultSummary === 'SUCCESS' || r.resultSummary === 'NOT_FOUND_VALID').length
    const failed = results.filter((r) => r.resultSummary === 'DEPENDENCY_FAILED' || r.resultSummary === 'API_UNREACHABLE').length
    const other = results.length - success - failed
    console.log(`- Rutas operativas o con respuestas esperadas: ${success}`)
    console.log(`- Rutas fallidas o inalcanzables: ${failed}`)
    console.log(`- Otras (validación / auth): ${other}`)
    console.log('='.repeat(80))
  })
}
