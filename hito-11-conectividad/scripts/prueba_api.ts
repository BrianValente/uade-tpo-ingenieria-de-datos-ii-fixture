import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { sanitizeSecrets } from './sanitizer.js'

export interface ApiTestRoute {
  name: string
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
  expectedDependency: string
  expectedStatus: number
  description: string
}

export interface ApiTestResult {
  route: ApiTestRoute
  statusHttp: number | 'UNREACHABLE'
  expectedStatus: number
  statusMatches: boolean
  responseTimeMs: number
  requestId: string
  resultSummary:
    | 'SUCCESS'
    | 'NOT_FOUND_VALID'
    | 'VALIDATION_ERROR'
    | 'RESOURCE_MISSING'
    | 'UNAUTHENTICATED'
    | 'DEPENDENCY_FAILED'
    | 'INTERNAL_ERROR'
    | 'TIMEOUT'
    | 'UNEXPECTED_STATUS'
    | 'API_UNREACHABLE'
  interpretation: string
  responseSnippet: string
}

export function getDefaultApiRoutes(): ApiTestRoute[] {
  const adminUsername = process.env.API_SEED_ADMIN_USERNAME || 'fixture-admin'
  const adminPassword = process.env.API_SEED_ADMIN_PASSWORD || 'PasswordDemo12345!'

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
      body: { username: adminUsername, password: adminPassword },
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
      expectedDependency: 'Neo4j (Nodo Partido) + MongoDB (Equipos)',
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

function classifyResult(
  route: ApiTestRoute,
  statusHttp: number,
  bodyText = '',
): { resultSummary: ApiTestResult['resultSummary']; interpretation: string } {
  const statusMatches = statusHttp === route.expectedStatus

  if (statusHttp === 401) {
    return {
      resultSummary: 'UNAUTHENTICATED',
      interpretation: 'Petición rechazada: requiere sesión válida o credenciales no configuradas.',
    }
  }

  // R2-10 / R2-09 — Distinguir REQUEST_TIMEOUT de DEPENDENCY_UNAVAILABLE en 503
  if (statusHttp === 503) {
    if (bodyText.includes('REQUEST_TIMEOUT')) {
      return {
        resultSummary: 'TIMEOUT',
        interpretation: 'La operación superó el tiempo de espera (503 REQUEST_TIMEOUT).',
      }
    }
    return {
      resultSummary: 'DEPENDENCY_FAILED',
      interpretation: 'Dependencia subyacente no disponible (503 DEPENDENCY_UNAVAILABLE).',
    }
  }

  if (statusHttp === 500) {
    return {
      resultSummary: 'INTERNAL_ERROR',
      interpretation: 'Error interno del servidor API (HTTP 500).',
    }
  }

  if (statusMatches) {
    if (statusHttp === 200 || statusHttp === 201) {
      return {
        resultSummary: 'SUCCESS',
        interpretation: 'Operación completada exitosamente a través de la cadena completa.',
      }
    }
    if (statusHttp === 404) {
      return {
        resultSummary: 'NOT_FOUND_VALID',
        interpretation: 'Ausencia válida esperada: recurso inexistente retornó 404 correctamente.',
      }
    }
    if (statusHttp === 400) {
      return {
        resultSummary: 'VALIDATION_ERROR',
        interpretation: 'Error de validación sintáctica esperado: esquema Zod interceptó el parámetro inválido (400).',
      }
    }
    return {
      resultSummary: 'SUCCESS',
      interpretation: `Respuesta HTTP ${statusHttp} conforme con el estado esperado.`,
    }
  }

  // F03 — Si no coincide con el estado esperado
  if (route.expectedStatus === 200 && statusHttp === 404) {
    return {
      resultSummary: 'RESOURCE_MISSING',
      interpretation: 'Recurso esperado no encontrado (404 Not Found); verificar datos o seed de la base.',
    }
  }

  return {
    resultSummary: 'UNEXPECTED_STATUS',
    interpretation: `Código HTTP ${statusHttp} no coincide con el estado esperado (${route.expectedStatus}).`,
  }
}

export async function runLiveApiChecks(
  baseUrl = (
    process.env.API_URL ||
    `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 8000}`
  ).replace(/\/$/, ''),
  routes: ApiTestRoute[] = getDefaultApiRoutes(),
  token?: string,
): Promise<ApiTestResult[]> {
  const results: ApiTestResult[] = []
  let activeToken = token || ''

  // R2-04 / S04 — Pre-flight login si las rutas a probar son protegidas y no se proveyó token
  if (
    !activeToken &&
    routes.some(
      (r) =>
        r.path !== '/health' &&
        r.path !== '/docs/json' &&
        r.path !== '/auth/login',
    )
  ) {
    try {
      const adminUsername = process.env.API_SEED_ADMIN_USERNAME || 'fixture-admin'
      const adminPassword = process.env.API_SEED_ADMIN_PASSWORD || 'PasswordDemo12345!'
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })
      if (loginRes.status === 200 || loginRes.status === 201) {
        const parsed = (await loginRes.json()) as any
        if (parsed && typeof parsed.accessToken === 'string') {
          activeToken = parsed.accessToken
        }
      }
    } catch {}
  }

  for (const route of routes) {
    const start = Date.now()
    const targetUrl = `${baseUrl}${route.path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(route.headers || {}),
    }

    if (activeToken) {
      headers.Authorization = `Bearer ${activeToken}`
    }

    // F08 — Timeout integral que cubre conexión y lectura del cuerpo
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    let responseReceived: Response | null = null
    let responseStatus: number | null = null
    let responseRequestId = 'none'

    try {
      const fetchOptions: RequestInit = {
        method: route.method,
        headers,
        signal: controller.signal,
        ...(route.body !== undefined ? { body: JSON.stringify(route.body) } : {}),
      }
      const response = await fetch(targetUrl, fetchOptions)
      responseReceived = response
      responseStatus = response.status
      responseRequestId = response.headers.get('x-request-id') || 'no-provisto'

      const text = await response.text()
      const responseTimeMs = Date.now() - start
      const requestId = responseRequestId
      const statusHttp = responseStatus

      // F02 — Si la ruta es login y fue exitosa, capturar el accessToken en memoria para siguientes rutas
      if (route.path === '/auth/login' && (statusHttp === 200 || statusHttp === 201)) {
        try {
          const parsed = JSON.parse(text)
          if (parsed && typeof parsed.accessToken === 'string') {
            activeToken = parsed.accessToken
          }
        } catch {}
      }

      const { resultSummary, interpretation } = classifyResult(route, statusHttp, text)

      // F09 — Sanitizar snippets para no exponer contraseñas ni tokens
      const sanitizedText = sanitizeSecrets(text)
      const responseSnippet =
        sanitizedText.length > 120 ? `${sanitizedText.slice(0, 117)}...` : sanitizedText

      results.push({
        route,
        statusHttp,
        expectedStatus: route.expectedStatus,
        statusMatches: statusHttp === route.expectedStatus,
        responseTimeMs,
        requestId,
        resultSummary,
        interpretation,
        responseSnippet,
      })
    } catch (err: unknown) {
      const error = err as Error
      const responseTimeMs = Date.now() - start
      const isAbort = controller.signal.aborted || error.name === 'AbortError'

      // R2-10 — Distinguir timeout en lectura del body (cuando ya hubo headers) de API inalcanzable
      if (isAbort && responseStatus !== null) {
        results.push({
          route,
          statusHttp: responseStatus,
          expectedStatus: route.expectedStatus,
          statusMatches: false,
          responseTimeMs,
          requestId: responseRequestId,
          resultSummary: 'TIMEOUT',
          interpretation: sanitizeSecrets(
            `Timeout de lectura de respuesta tras recibir HTTP ${responseStatus} (Request ID: ${responseRequestId})`,
          ),
          responseSnippet: 'Timeout al leer cuerpo de respuesta HTTP',
        })
      } else if (isAbort) {
        results.push({
          route,
          statusHttp: 'UNREACHABLE',
          expectedStatus: route.expectedStatus,
          statusMatches: false,
          responseTimeMs,
          requestId: 'none',
          resultSummary: 'TIMEOUT',
          interpretation: sanitizeSecrets(`Timeout de solicitud superado (4000ms): ${error.message}`),
          responseSnippet: 'Timeout de conexión o espera de respuesta',
        })
      } else {
        results.push({
          route,
          statusHttp: 'UNREACHABLE',
          expectedStatus: route.expectedStatus,
          statusMatches: false,
          responseTimeMs,
          requestId: 'none',
          resultSummary: 'API_UNREACHABLE',
          interpretation: sanitizeSecrets(`No se pudo alcanzar el endpoint de la API: ${error.message}`),
          responseSnippet: 'Sin respuesta (Connection Refused)',
        })
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return results
}

export async function runInProcessApiChecks(
  routes: ApiTestRoute[] = getDefaultApiRoutes(),
  token?: string,
): Promise<ApiTestResult[]> {
  const serverMod = (await import('../../hito-10-api/src/app/server.js' as string)) as any
  const envMod = (await import('../../hito-10-api/src/config/environment.js' as string)) as any
  const authMod = (await import('../../hito-10-api/src/modules/auth/auth.module.js' as string)) as any
  const dataMod = (await import('../../hito-10-api/src/modules/data/data.module.js' as string)) as any
  const authEnvMod = (await import('../../hito-10-api/src/config/auth-environment.js' as string)) as any
  const dataEnvMod = (await import('../../hito-10-api/src/config/data-environment.js' as string)) as any

  const { buildServer } = serverMod
  const { readEnvironment } = envMod
  const { createAuthModule } = authMod
  const { createDataModule } = dataMod
  const { readAuthEnvironment } = authEnvMod
  const { readDataEnvironment } = dataEnvMod

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
  let activeToken = token || ''

  // R2-04 / S04 — Pre-flight login si las rutas a probar son protegidas y no se proveyó token
  if (
    !activeToken &&
    routes.some(
      (r) =>
        r.path !== '/health' &&
        r.path !== '/docs/json' &&
        r.path !== '/auth/login',
    )
  ) {
    try {
      const adminUsername = process.env.API_SEED_ADMIN_USERNAME || 'fixture-admin'
      const adminPassword = process.env.API_SEED_ADMIN_PASSWORD || 'PasswordDemo12345!'
      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })
      if (loginRes.statusCode === 200 || loginRes.statusCode === 201) {
        const parsed = JSON.parse(loginRes.body)
        if (parsed && typeof parsed.accessToken === 'string') {
          activeToken = parsed.accessToken
        }
      }
    } catch {}
  }

  try {
    for (const route of routes) {
      const start = Date.now()
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(route.headers || {}),
      }
      if (activeToken) {
        headers.authorization = `Bearer ${activeToken}`
      }

      // F16 — Payload tipado como string para evitar errores de compilación TS
      const payloadStr = route.body !== undefined ? JSON.stringify(route.body) : undefined

      // F08 — Timeout en inject
      let timer: NodeJS.Timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout de 4000ms superado en inject')), 4000)
      })

      const injectPromise = app.inject({
        method: route.method,
        url: route.path,
        headers,
        ...(payloadStr !== undefined ? { payload: payloadStr } : {}),
      })

      let response: any
      try {
        response = await Promise.race([injectPromise, timeoutPromise])
      } finally {
        clearTimeout(timer!)
      }

      const responseTimeMs = Date.now() - start
      const requestId = String(response.headers['x-request-id'] || 'no-provisto')
      const statusHttp = response.statusCode
      const bodyText = typeof response.body === 'string' ? response.body : ''

      // F02 — Captura y propagación de accessToken en modo in-process
      if (route.path === '/auth/login' && (statusHttp === 200 || statusHttp === 201)) {
        try {
          const parsed = JSON.parse(bodyText)
          if (parsed && typeof parsed.accessToken === 'string') {
            activeToken = parsed.accessToken
          }
        } catch {}
      }

      const { resultSummary, interpretation } = classifyResult(route, statusHttp, bodyText)
      const sanitizedSnippet = sanitizeSecrets(bodyText)
      const responseSnippet =
        sanitizedSnippet.length > 100 ? `${sanitizedSnippet.slice(0, 97)}...` : sanitizedSnippet

      results.push({
        route,
        statusHttp,
        expectedStatus: route.expectedStatus,
        statusMatches: statusHttp === route.expectedStatus,
        responseTimeMs,
        requestId,
        resultSummary,
        interpretation,
        responseSnippet,
      })
    }
  } finally {
    await app.close()
  }

  return results
}

export function formatApiResultsTable(results: ApiTestResult[]): string {
  const header = [
    '| Operación / Endpoint | Dependencia | Status HTTP | Esperado | Conforme | Latencia | Request ID | Diagnóstico e Interpretación |',
    '|:---|:---|:---:|:---:|:---:|:---:|:---:|:---|',
  ]
  const rows = results.map((r) => {
    const statusLabel =
      r.statusHttp === 200 || r.statusHttp === 201
        ? `**${r.statusHttp} OK**`
        : r.statusHttp === 'UNREACHABLE'
          ? '**INACCESIBLE**'
          : `**${r.statusHttp}**`
    const conformLabel = r.statusMatches ? 'SÍ' : 'NO'
    const lat = typeof r.statusHttp === 'number' ? `${r.responseTimeMs}ms` : '-'
    const reqId = r.requestId !== 'none' && r.requestId.length > 10 ? `${r.requestId.slice(0, 8)}...` : r.requestId
    return `| \`${r.route.method} ${r.route.path}\` | ${r.route.expectedDependency} | ${statusLabel} | ${r.expectedStatus} | ${conformLabel} | ${lat} | \`${reqId}\` | ${r.interpretation} |`
  })
  return [...header, ...rows].join('\n')
}

// CLI Execution
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  const inProcess = process.argv.includes('--in-process')
  const baseUrlArg = process.argv.find((a) => a.startsWith('--base-url='))
  const baseUrl = baseUrlArg ? baseUrlArg.split('=')[1] : undefined

  const tokenArg = process.argv.find((a) => a.startsWith('--token='))
  const token = tokenArg ? tokenArg.split('=')[1] : process.env.API_AUTH_TOKEN || undefined

  const productArg = process.argv.find((a) => a.startsWith('--product='))
  const productFilter = productArg ? productArg.split('=')[1] : undefined

  console.log('='.repeat(80))
  console.log('Hito 11 — Evaluación de Rutas de la API Integrada Fixture 2030')
  console.log(`Fecha/Hora: ${new Date().toISOString()}`)
  console.log(`Modo de ejecución: ${inProcess ? 'In-Process (Fastify inject)' : 'Live HTTP'}`)
  if (productFilter) {
    console.log(`Filtro de producto activo: "${productFilter}"`)
  }
  if (token) {
    console.log('Token de sesión: provisto vía CLI/entorno')
  }
  console.log('='.repeat(80))
  console.log('Ejecutando pruebas sobre los endpoints HTTP...\n')

  const defaultRoutes = getDefaultApiRoutes()
  const targetRoutes = productFilter
    ? defaultRoutes.filter(
        (r) =>
          r.expectedDependency.toLowerCase().includes(productFilter.toLowerCase()) ||
          r.path.toLowerCase().includes(productFilter.toLowerCase()),
      )
    : defaultRoutes

  const runner = inProcess
    ? runInProcessApiChecks(targetRoutes, token)
    : runLiveApiChecks(baseUrl, targetRoutes, token)

  runner.then((results) => {
    console.log(formatApiResultsTable(results))
    console.log('\nResumen:')
    const matched = results.filter((r) => r.statusMatches).length
    const notMatched = results.filter((r) => !r.statusMatches).length
    const authRequired = results.filter((r) => r.resultSummary === 'UNAUTHENTICATED').length
    const depFailed = results.filter((r) => r.resultSummary === 'DEPENDENCY_FAILED').length
    const timeoutCount = results.filter((r) => r.resultSummary === 'TIMEOUT').length
    console.log(`- Rutas conformes con estado esperado: ${matched}`)
    console.log(`- Rutas no conformes / errores: ${notMatched}`)
    if (authRequired > 0) {
      console.log(`- Rutas que requieren sesión (401): ${authRequired}`)
    }
    if (depFailed > 0) {
      console.log(`- Rutas con dependencia no disponible (503): ${depFailed}`)
    }
    if (timeoutCount > 0) {
      console.log(`- Rutas con timeout (503 / lectura): ${timeoutCount}`)
    }
    console.log('='.repeat(80))
  })
}
