import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

import {
  runTcpChecks,
  formatTcpResultsTable,
  getDefaultTargets,
  type TcpCheckResult,
} from './prueba_tcp.js'
import {
  runAllNativeChecks,
  formatNativeResultsTable,
  type NativeCheckResult,
} from './prueba_clientes_nativos.js'
import {
  runLiveApiChecks,
  runInProcessApiChecks,
  formatApiResultsTable,
  getDefaultApiRoutes,
  type ApiTestResult,
} from './prueba_api.js'

export interface MasterReport {
  timestamp: string
  environment: string
  tcpResults?: TcpCheckResult[]
  nativeResults?: NativeCheckResult[]
  apiResults?: ApiTestResult[]
  summaryMatrix: MatrixEntry[]
}

export interface MatrixEntry {
  product: string
  role: string
  tcpState: string
  nativeState: string
  apiState: string
  overallState: 'UP' | 'DOWN' | 'DEGRADED' | 'NOT_CONFIGURED' | 'SKIP' | 'UNKNOWN'
  nextStep: string
}

export function buildSummaryMatrix(
  tcp?: TcpCheckResult[],
  native?: NativeCheckResult[],
  api?: ApiTestResult[],
  productFilter?: string,
): MatrixEntry[] {
  const allProducts = [
    { id: 'mongodb', name: 'MongoDB 7.0', role: 'Módulo Documental / Cuentas' },
    { id: 'redis', name: 'Redis', role: 'Sesiones / Caché' },
    { id: 'neo4j', name: 'Neo4j (Bolt/HTTP)', role: 'Módulo Grafos / Partidos' },
    { id: 'cassandra', name: 'Cassandra', role: 'Módulo Comentarios' },
    { id: 'influxdb', name: 'InfluxDB 3 Core', role: 'Módulo Series Temporales' },
    { id: 'iris', name: 'InterSystems IRIS', role: 'Módulo Multimodelo / Objetos' },
    { id: 'api', name: 'API Fastify Integrada', role: 'Capa de Servicio HTTP' },
  ]

  const products = productFilter
    ? allProducts.filter((p) => p.id.includes(productFilter.toLowerCase()) || p.name.toLowerCase().includes(productFilter.toLowerCase()))
    : allProducts

  return products.map((prod) => {
    // 1. TCP State
    let tcpState = 'NO PROBADO'
    if (tcp) {
      const matches = tcp.filter((t) => t.endpoint.id.startsWith(prod.id))
      if (matches.length === 1) {
        tcpState = matches[0]!.status
      } else if (matches.length > 1) {
        // Manejo explícito de productos con múltiples listeners (Bolt/HTTP, SuperServer/Web)
        // R2-07 / S05 — Usar <br> en vez de pipe para evitar romper columnas en tablas Markdown
        const parts = matches.map((m) => `${m.endpoint.protocol}: ${m.status}`)
        tcpState = parts.join('<br>')
      } else {
        tcpState = 'N/A'
      }
    }

    // 2. Native State
    let nativeState = 'NO PROBADO'
    if (native) {
      const matches = native.filter((n) => n.product.toLowerCase().includes(prod.id))
      if (matches.length > 0) {
        if (matches.every((m) => m.status === 'UP')) {
          nativeState = 'UP'
        } else if (matches.some((m) => m.status === 'DOWN')) {
          nativeState = 'DOWN'
        } else if (matches.some((m) => m.status === 'DEGRADED')) {
          nativeState = 'DEGRADED'
        } else if (matches.some((m) => m.status === 'NOT_CONFIGURED')) {
          nativeState = 'NOT_CONFIGURED'
        } else if (matches.some((m) => m.status === 'SKIP')) {
          nativeState = 'SKIP'
        } else {
          nativeState = 'DEGRADED'
        }
      }
    }

    // 3. API State
    let apiState = 'NO PROBADO'
    if (api) {
      const matches = api.filter(
        (a) =>
          a.route.expectedDependency.toLowerCase().includes(prod.id) ||
          (prod.id === 'api' && a.route.path === '/health'),
      )
      if (matches.length > 0) {
        if (matches.every((m) => m.statusMatches && (m.resultSummary === 'SUCCESS' || m.resultSummary === 'NOT_FOUND_VALID'))) {
          apiState = 'UP'
        } else if (matches.some((m) => m.resultSummary === 'API_UNREACHABLE')) {
          apiState = 'API INALCANZABLE'
        } else if (matches.some((m) => m.resultSummary === 'UNAUTHENTICATED')) {
          apiState = 'REQUIERE SESIÓN'
        } else if (matches.some((m) => m.resultSummary === 'DEPENDENCY_FAILED')) {
          apiState = 'DOWN (503)'
        } else if (matches.some((m) => m.resultSummary === 'TIMEOUT')) {
          apiState = 'TIMEOUT'
        } else {
          apiState = 'DOWN / ERROR'
        }
      }
    }

    // Overall State Calculation (F06, F13, F03, R2-07)
    let overallState: MatrixEntry['overallState'] = 'UNKNOWN'
    let nextStep = 'Verificar configuración de entorno y levantar el servicio correspondiente.'

    const matchesTcp = tcp ? tcp.filter((t) => t.endpoint.id.startsWith(prod.id)) : []
    const tcpAllUp = matchesTcp.length > 0 && matchesTcp.every((m) => m.status === 'UP')
    const tcpAllDown = matchesTcp.length > 0 && matchesTcp.every((m) => m.status === 'DOWN')
    const tcpIsDegraded = matchesTcp.length > 1 && matchesTcp.some((m) => m.status === 'UP') && !tcpAllUp

    if (tcpState === 'NO PROBADO' && nativeState === 'NO PROBADO' && apiState === 'NO PROBADO') {
      overallState = 'UNKNOWN'
      nextStep = 'Capa no evaluada en este modo de ejecución.'
    } else if (prod.id === 'api') {
      if (apiState === 'UP') {
        overallState = 'UP'
        nextStep = 'Servicio HTTP activo y respondiendo rutas correctamente.'
      } else if (apiState === 'API INALCANZABLE' || tcpAllDown) {
        overallState = 'DOWN'
        nextStep = 'Iniciar la API con `pnpm dev` en el puerto configurado.'
      } else {
        overallState = 'DEGRADED'
        nextStep = 'Revisar rutas de la API y dependencias del servicio.'
      }
    } else {
      // Modo solo TCP ejecutado
      if (tcp && !native && !api) {
        if (tcpAllUp) {
          overallState = 'UP'
          nextStep = 'Listener(s) TCP alcanzable(s); capas lógicas de driver y API no evaluadas.'
        } else if (tcpIsDegraded) {
          // R2-07 / S05 — Si Bolt es DOWN y HTTP es UP, marcar DEGRADED, no UP
          overallState = 'DEGRADED'
          nextStep = 'Conectividad TCP parcial: uno o más listeners no responden (revisar puertos de servicio).'
        } else {
          overallState = 'DOWN'
          nextStep = `Verificar puerto del contenedor y ejecutar docker compose up -d ${prod.id}.`
        }
      } else if (nativeState === 'NOT_CONFIGURED') {
        overallState = 'NOT_CONFIGURED'
        nextStep = 'Configurar credenciales requeridas en el archivo .env.'
      } else if (nativeState === 'SKIP') {
        overallState = 'SKIP'
        nextStep = 'Prueba omitida intencionalmente o herramienta no disponible en el host.'
      } else if (tcpAllDown || nativeState === 'DOWN') {
        overallState = 'DOWN'
        nextStep = `Revisar logs del contenedor y ejecutar docker compose up -d ${prod.id}.`
      } else if (tcpIsDegraded || nativeState === 'DEGRADED') {
        overallState = 'DEGRADED'
        nextStep = 'Listener TCP parcial o falta inicializar el contexto, keyspace o colección.'
      } else if (nativeState === 'UP') {
        if (tcpIsDegraded) {
          overallState = 'DEGRADED'
          nextStep = 'Driver nativo operativo pero uno de los listeners TCP (portal/secundario) no responde.'
        } else if (apiState === 'UP') {
          overallState = 'UP'
          nextStep = 'Dependencia totalmente validada desde TCP hasta la API.'
        } else if (apiState === 'REQUIERE SESIÓN') {
          // F03 — REQUIERE SESIÓN no puede certificar integración plena UP
          overallState = 'DEGRADED'
          nextStep = 'Driver nativo operativo, pero la API requiere autenticación para validar la consulta de negocio.'
        } else if (apiState === 'NO PROBADO') {
          overallState = 'UP'
          nextStep = 'Driver y protocolo nativo validados exitosamente; API no evaluada.'
        } else {
          overallState = 'DEGRADED'
          nextStep = 'Driver nativo exitoso pero la ruta correspondiente de la API devolvió error.'
        }
      } else {
        overallState = 'UNKNOWN'
        nextStep = 'Revisar conectividad y logs de la dependencia.'
      }
    }

    return {
      product: prod.name,
      role: prod.role,
      tcpState,
      nativeState,
      apiState,
      overallState,
      nextStep,
    }
  })
}

export function formatMatrixMarkdown(matrix: MatrixEntry[]): string {
  const header = [
    '| Producto / Dependencia | Rol en el Fixture 2030 | Estado TCP | Driver / Protocolo | Endpoint API | Estado Global | Próximo Paso Recomendado |',
    '|:---|:---|:---:|:---:|:---:|:---:|:---|',
  ]
  const rows = matrix.map((m) => {
    // F06 — Representar UNKNOWN explícitamente sin caer en DOWN
    const badge =
      m.overallState === 'UP'
        ? '**UP (OK)**'
        : m.overallState === 'NOT_CONFIGURED'
          ? '**NOT_CONFIGURED**'
          : m.overallState === 'DEGRADED'
            ? '**DEGRADED**'
            : m.overallState === 'SKIP'
              ? '**SKIP**'
              : m.overallState === 'UNKNOWN'
                ? '**UNKNOWN**'
                : '**DOWN**'
    return `| ${m.product} | ${m.role} | ${m.tcpState} | ${m.nativeState} | ${m.apiState} | ${badge} | ${m.nextStep} |`
  })
  return [...header, ...rows].join('\n')
}

export async function main() {
  const args = process.argv.slice(2)

  // F13 — Si no se pasan selectores específicos de capa, ejecutar todo por defecto
  const hasLayerSelector = args.includes('--tcp') || args.includes('--nativos') || args.includes('--api')
  const runAll = args.includes('--all') || !hasLayerSelector
  const runTcp = runAll || args.includes('--tcp')
  const runNative = runAll || args.includes('--nativos')
  const runApi = runAll || args.includes('--api')

  const productArg = args.find((a) => a.startsWith('--product='))
  const productFilter = productArg ? productArg.split('=')[1] : undefined

  const tokenArg = args.find((a) => a.startsWith('--token='))
  const token = tokenArg ? tokenArg.split('=')[1] : process.env.API_AUTH_TOKEN || undefined

  const outputArg = args.find((a) => a.startsWith('--output='))
  const outputPath = outputArg ? outputArg.split('=')[1] : null

  console.log('='.repeat(80))
  console.log('Hito 11 — Diagnóstico de Conectividad a los Productos del Fixture 2030')
  console.log(`Fecha de evaluación: ${new Date().toISOString()}`)
  console.log(`Plataforma / SO: ${process.platform} (${process.arch}) — Node.js ${process.version}`)
  console.log(`Modos seleccionados: TCP=${runTcp}, NATIVOS=${runNative}, API=${runApi}`)
  if (productFilter) {
    console.log(`Filtro de producto activo: "${productFilter}"`)
  }
  if (token) {
    console.log('Token de sesión: provisto vía CLI/entorno')
  }
  console.log('='.repeat(80))

  let tcpResults: TcpCheckResult[] | undefined
  let nativeResults: NativeCheckResult[] | undefined
  let apiResults: ApiTestResult[] | undefined

  if (runTcp) {
    console.log('\n[1/3] Ejecutando Pruebas de Transporte TCP...')
    tcpResults = await runTcpChecks(getDefaultTargets(productFilter))
    console.log(formatTcpResultsTable(tcpResults))
  }

  if (runNative) {
    console.log('\n[2/3] Ejecutando Pruebas de Drivers y Clientes Nativos...')
    nativeResults = await runAllNativeChecks(productFilter)
    console.log(formatNativeResultsTable(nativeResults))
  }

  if (runApi) {
    const inProcess = args.includes('--in-process')
    console.log(`\n[3/3] Ejecutando Pruebas de Endpoints de la API (${inProcess ? 'Modo In-Process' : 'Modo Live HTTP'})...`)
    const routes = getDefaultApiRoutes()
    const filteredRoutes = productFilter
      ? routes.filter((r) => r.expectedDependency.toLowerCase().includes(productFilter.toLowerCase()) || r.path.toLowerCase().includes(productFilter.toLowerCase()))
      : routes

    apiResults = inProcess ? await runInProcessApiChecks(filteredRoutes, token) : await runLiveApiChecks(undefined, filteredRoutes, token)
    console.log(formatApiResultsTable(apiResults))
  }

  const matrix = buildSummaryMatrix(tcpResults, nativeResults, apiResults, productFilter)

  console.log('\n' + '='.repeat(80))
  console.log('MATRIZ CONSOLIDADA DE CONECTIVIDAD')
  console.log('='.repeat(80))
  console.log(formatMatrixMarkdown(matrix))
  console.log('='.repeat(80))

  console.log('\nConvenciones de Estados:')
  console.log(' - UP: La prueba configurada terminó exitosamente en la capa probada.')
  console.log(' - DOWN: Se intentó la conexión y falló por rechazo, timeout o error.')
  console.log(' - DEGRADED: El puerto responde pero el driver o contexto no opera normalmente.')
  console.log(' - NOT_CONFIGURED / SKIP: Prueba no ejecutada por falta de credencial o variable opcional.')
  console.log(' - UNKNOWN: No se dispone de información suficiente para dictaminar estado.')

  if (outputPath) {
    const fullOutPath = resolve(process.cwd(), outputPath)
    await mkdir(dirname(fullOutPath), { recursive: true })

    const markdownDoc = [
      '# Reporte de Evaluación de Conectividad — Hito 11',
      '',
      `**Fecha de generación:** ${new Date().toISOString()}  `,
      `**Entorno:** ${process.platform} (${process.arch}) — Node.js ${process.version}  `,
      '',
      '## Matriz Consolidada de Conectividad',
      '',
      formatMatrixMarkdown(matrix),
      '',
      tcpResults ? '## Detalle de Conectividad TCP\n\n' + formatTcpResultsTable(tcpResults) + '\n' : '',
      nativeResults ? '## Detalle de Protocolos y Clientes Nativos\n\n' + formatNativeResultsTable(nativeResults) + '\n' : '',
      apiResults ? '## Detalle de Verificación desde la API\n\n' + formatApiResultsTable(apiResults) + '\n' : '',
      '---',
      '*Reporte generado automáticamente por la suite de evaluación del Hito 11. Todas las credenciales y secretos fueron redactados.*',
    ].filter(Boolean).join('\n')

    await writeFile(fullOutPath, markdownDoc, 'utf8')
    console.log(`\nReporte guardado exitosamente en: ${fullOutPath}`)
  }
}

// CLI Execution
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  main().catch((err) => {
    console.error('Error fatal al ejecutar evaluación de conectividad:', err)
    process.exit(1)
  })
}
