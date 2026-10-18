import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

import { runTcpChecks, formatTcpResultsTable, type TcpCheckResult } from './prueba_tcp.js'
import { runAllNativeChecks, formatNativeResultsTable, type NativeCheckResult } from './prueba_clientes_nativos.js'
import { runLiveApiChecks, runInProcessApiChecks, formatApiResultsTable, type ApiTestResult } from './prueba_api.js'

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
): MatrixEntry[] {
  const products = [
    { id: 'mongodb', name: 'MongoDB 7.0', role: 'Módulo Documental / Cuentas' },
    { id: 'redis', name: 'Redis', role: 'Sesiones / Caché' },
    { id: 'neo4j', name: 'Neo4j (Bolt/HTTP)', role: 'Módulo Grafos / Partidos' },
    { id: 'cassandra', name: 'Cassandra', role: 'Módulo Comentarios' },
    { id: 'influxdb', name: 'InfluxDB 3 Core', role: 'Módulo Series Temporales' },
    { id: 'iris', name: 'InterSystems IRIS', role: 'Módulo Multimodelo / Objetos' },
    { id: 'api', name: 'API Fastify Integrada', role: 'Capa de Servicio HTTP' },
  ]

  return products.map((prod) => {
    // 1. TCP State
    let tcpState = 'NO PROBADO'
    if (tcp) {
      const match = tcp.find((t) => t.endpoint.id.startsWith(prod.id))
      tcpState = match ? match.status : 'N/A'
    }

    // 2. Native State
    let nativeState = 'NO PROBADO'
    if (native) {
      const matches = native.filter((n) => n.product.toLowerCase().includes(prod.id))
      if (matches.length > 0) {
        if (matches.every((m) => m.status === 'UP')) {
          nativeState = 'UP'
        } else if (matches.some((m) => m.status === 'NOT_CONFIGURED' || m.status === 'SKIP')) {
          nativeState = 'NOT_CONFIGURED'
        } else if (matches.some((m) => m.status === 'DOWN')) {
          nativeState = 'DOWN'
        } else {
          nativeState = 'DEGRADED'
        }
      }
    }

    // 3. API State
    let apiState = 'NO PROBADO'
    if (api) {
      const matches = api.filter((a) =>
        a.route.expectedDependency.toLowerCase().includes(prod.id) ||
        (prod.id === 'api' && a.route.path === '/health'),
      )
      if (matches.length > 0) {
        if (matches.every((m) => m.resultSummary === 'SUCCESS' || m.resultSummary === 'NOT_FOUND_VALID')) {
          apiState = 'UP'
        } else if (matches.some((m) => m.resultSummary === 'API_UNREACHABLE')) {
          apiState = 'API INALCANZABLE'
        } else if (matches.some((m) => m.resultSummary === 'UNAUTHENTICATED')) {
          apiState = 'REQUIERE SESIÓN'
        } else {
          apiState = 'DOWN / ERROR'
        }
      }
    }

    // Overall State Calculation
    let overallState: MatrixEntry['overallState'] = 'UNKNOWN'
    let nextStep = 'Verificar configuración de entorno y levantar el contenedor correspondiente.'

    if (prod.id === 'api') {
      if (tcpState === 'UP' && (apiState === 'UP' || apiState === 'REQUIERE SESIÓN')) {
        overallState = 'UP'
        nextStep = 'Servicio HTTP activo y respondiendo rutas correctamente.'
      } else {
        overallState = 'DOWN'
        nextStep = 'Iniciar la API con `pnpm dev` en el puerto configurado.'
      }
    } else {
      if (tcpState === 'DOWN') {
        overallState = 'DOWN'
        nextStep = `Verificar puerto del contenedor y ejecutar docker compose up -d ${prod.id}.`
      } else if (nativeState === 'NOT_CONFIGURED') {
        overallState = 'NOT_CONFIGURED'
        nextStep = 'Configurar credenciales requeridas en el archivo .env.'
      } else if (nativeState === 'UP' && (apiState === 'UP' || apiState === 'REQUIERE SESIÓN')) {
        overallState = 'UP'
        nextStep = 'Dependencia totalmente validada desde TCP hasta la API.'
      } else if (nativeState === 'UP' && apiState === 'NO PROBADO') {
        overallState = 'UP'
        nextStep = 'Driver y protocolo nativo validados exitosamente.'
      } else if (tcpState === 'UP' && nativeState === 'DOWN') {
        overallState = 'DEGRADED'
        nextStep = 'Puerto TCP abierto pero falla el handshake/autenticación del driver.'
      } else {
        overallState = 'DOWN'
        nextStep = 'Revisar logs del servicio y validar conectividad de red.'
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
    const badge =
      m.overallState === 'UP'
        ? '**UP (OK)**'
        : m.overallState === 'NOT_CONFIGURED'
          ? '**NOT_CONFIGURED**'
          : m.overallState === 'DEGRADED'
            ? '**DEGRADED**'
            : m.overallState === 'SKIP'
              ? '**SKIP**'
              : '**DOWN**'
    return `| ${m.product} | ${m.role} | ${m.tcpState} | ${m.nativeState} | ${m.apiState} | ${badge} | ${m.nextStep} |`
  })
  return [...header, ...rows].join('\n')
}

export async function main() {
  const args = process.argv.slice(2)
  const runAll = args.length === 0 || args.includes('--all')
  const runTcp = runAll || args.includes('--tcp')
  const runNative = runAll || args.includes('--nativos')
  const runApi = runAll || args.includes('--api')

  const outputArg = args.find((a) => a.startsWith('--output='))
  const outputPath = outputArg ? outputArg.split('=')[1] : null

  console.log('='.repeat(80))
  console.log('Hito 11 — Diagnóstico de Conectividad a los Productos del Fixture 2030')
  console.log(`Fecha de evaluación: ${new Date().toISOString()}`)
  console.log(`Plataforma / SO: ${process.platform} (${process.arch})`)
  console.log(`Modos seleccionados: TCP=${runTcp}, NATIVOS=${runNative}, API=${runApi}`)
  console.log('='.repeat(80))

  let tcpResults: TcpCheckResult[] | undefined
  let nativeResults: NativeCheckResult[] | undefined
  let apiResults: ApiTestResult[] | undefined

  if (runTcp) {
    console.log('\n[1/3] Ejecutando Pruebas de Transporte TCP...')
    tcpResults = await runTcpChecks()
    console.log(formatTcpResultsTable(tcpResults))
  }

  if (runNative) {
    console.log('\n[2/3] Ejecutando Pruebas de Drivers y Clientes Nativos...')
    nativeResults = await runAllNativeChecks()
    console.log(formatNativeResultsTable(nativeResults))
  }

  if (runApi) {
    const inProcess = args.includes('--in-process')
    console.log(`\n[3/3] Ejecutando Pruebas de Endpoints de la API (${inProcess ? 'Modo In-Process' : 'Modo Live HTTP'})...`)
    apiResults = inProcess ? await runInProcessApiChecks() : await runLiveApiChecks()
    console.log(formatApiResultsTable(apiResults))
  }

  const matrix = buildSummaryMatrix(tcpResults, nativeResults, apiResults)

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
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  main().catch((err) => {
    console.error('Error fatal al ejecutar evaluación de conectividad:', err)
    process.exit(1)
  })
}
