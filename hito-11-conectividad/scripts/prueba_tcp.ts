import { Socket } from 'node:net'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { sanitizeSecrets } from './sanitizer.js'

export interface TargetEndpoint {
  id: string
  name: string
  role: string
  host: string
  port: number
  protocol: string
  environmentVarHost: string
  environmentVarPort: string
  configError?: string | undefined
}

export interface TcpCheckResult {
  endpoint: TargetEndpoint
  status: 'UP' | 'DOWN' | 'TIMEOUT' | 'UNRESOLVED'
  latencyMs: number
  code: string
  detail: string
  interpretation: string
}

export function parsePort(
  val: string | undefined,
  defaultPort: number,
  varName: string,
): { port: number; configError?: string } {
  if (val === undefined || val.trim() === '') {
    return { port: defaultPort }
  }
  const trimmed = val.trim()
  const num = Number(trimmed)
  if (!/^\d+$/.test(trimmed) || !Number.isInteger(num) || num < 1 || num > 65535) {
    return {
      port: defaultPort,
      configError: `Variable ${varName} tiene un valor de puerto inválido ("${trimmed}"). Debe ser un entero entre 1 y 65535.`,
    }
  }
  return { port: num }
}

export function getDefaultTargets(productFilter?: string | undefined): TargetEndpoint[] {
  // Sincronización para InfluxDB: si existe INFLUXDB_URL pero no HOST/PORT específicos
  let influxHost = process.env.INFLUXDB_HOST || ''
  let influxPortRaw = process.env.INFLUXDB_PORT || ''
  if (process.env.INFLUXDB_URL) {
    try {
      const u = new URL(process.env.INFLUXDB_URL)
      if (!influxHost && u.hostname) influxHost = u.hostname
      if (!influxPortRaw && u.port) influxPortRaw = u.port
    } catch {
      // Ignorar error de parsing aquí; se reportará si es inválido
    }
  }
  if (!influxHost) influxHost = '127.0.0.1'

  const mongoPort = parsePort(process.env.MONGO_PORT, 27017, 'MONGO_PORT')
  const redisPort = parsePort(process.env.REDIS_PORT, 6379, 'REDIS_PORT')
  const neo4jBoltPort = parsePort(process.env.NEO4J_BOLT_PORT, 7687, 'NEO4J_BOLT_PORT')
  const neo4jHttpPort = parsePort(process.env.NEO4J_HTTP_PORT, 7474, 'NEO4J_HTTP_PORT')
  const cassandraPort = parsePort(process.env.CASSANDRA_PORT, 9042, 'CASSANDRA_PORT')
  const influxPort = parsePort(influxPortRaw || undefined, 8181, 'INFLUXDB_PORT')
  const irisPortRaw = process.env.IRIS_PORT || process.env.IRIS_SUPERSERVER_PORT
  const irisSuperPort = parsePort(irisPortRaw, 1972, 'IRIS_PORT / IRIS_SUPERSERVER_PORT')
  const irisWebPort = parsePort(process.env.IRIS_WEB_PORT, 52773, 'IRIS_WEB_PORT')
  const apiPort = parsePort(process.env.API_PORT, 8000, 'API_PORT')

  const allTargets: TargetEndpoint[] = [
    {
      id: 'mongodb',
      name: 'MongoDB',
      role: 'Módulo Documental / Cuentas',
      host: process.env.MONGO_HOST || '127.0.0.1',
      port: mongoPort.port,
      protocol: 'MongoDB Wire Protocol',
      environmentVarHost: 'MONGO_HOST',
      environmentVarPort: 'MONGO_PORT',
      configError: mongoPort.configError,
    },
    {
      id: 'redis',
      name: 'Redis',
      role: 'Sesiones / Caché',
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: redisPort.port,
      protocol: 'RESP',
      environmentVarHost: 'REDIS_HOST',
      environmentVarPort: 'REDIS_PORT',
      configError: redisPort.configError,
    },
    {
      id: 'neo4j_bolt',
      name: 'Neo4j (Bolt)',
      role: 'Módulo Grafos / Partidos',
      host: process.env.NEO4J_HOST || '127.0.0.1',
      port: neo4jBoltPort.port,
      protocol: 'Bolt',
      environmentVarHost: 'NEO4J_HOST',
      environmentVarPort: 'NEO4J_BOLT_PORT',
      configError: neo4jBoltPort.configError,
    },
    {
      id: 'neo4j_http',
      name: 'Neo4j (HTTP)',
      role: 'Portal / Browser Neo4j',
      host: process.env.NEO4J_HOST || '127.0.0.1',
      port: neo4jHttpPort.port,
      protocol: 'HTTP',
      environmentVarHost: 'NEO4J_HOST',
      environmentVarPort: 'NEO4J_HTTP_PORT',
      configError: neo4jHttpPort.configError,
    },
    {
      id: 'cassandra_cql',
      name: 'Cassandra (CQL)',
      role: 'Módulo Comentarios',
      host: process.env.CASSANDRA_HOST || '127.0.0.1',
      port: cassandraPort.port,
      protocol: 'CQL',
      environmentVarHost: 'CASSANDRA_HOST',
      environmentVarPort: 'CASSANDRA_PORT',
      configError: cassandraPort.configError,
    },
    {
      id: 'influxdb_http',
      name: 'InfluxDB 3 Core (HTTP)',
      role: 'Módulo Series Temporales',
      host: influxHost,
      port: influxPort.port,
      protocol: 'HTTP',
      environmentVarHost: 'INFLUXDB_HOST / INFLUXDB_URL',
      environmentVarPort: 'INFLUXDB_PORT',
      configError: influxPort.configError,
    },
    {
      id: 'iris_superserver',
      name: 'InterSystems IRIS (SuperServer)',
      role: 'Módulo Multimodelo / Objetos',
      host: process.env.IRIS_HOST || '127.0.0.1',
      port: irisSuperPort.port,
      protocol: 'SuperServer',
      environmentVarHost: 'IRIS_HOST',
      environmentVarPort: 'IRIS_PORT / IRIS_SUPERSERVER_PORT',
      configError: irisSuperPort.configError,
    },
    {
      id: 'iris_web',
      name: 'InterSystems IRIS (Web/Portal)',
      role: 'Management Portal IRIS',
      host: process.env.IRIS_HOST || '127.0.0.1',
      port: irisWebPort.port,
      protocol: 'HTTP',
      environmentVarHost: 'IRIS_HOST',
      environmentVarPort: 'IRIS_WEB_PORT',
      configError: irisWebPort.configError,
    },
    {
      id: 'api_http',
      name: 'API Integrada Fixture 2030',
      role: 'Servidor Fastify HTTP',
      host: process.env.API_HOST || '127.0.0.1',
      port: apiPort.port,
      protocol: 'HTTP',
      environmentVarHost: 'API_HOST',
      environmentVarPort: 'API_PORT',
      configError: apiPort.configError,
    },
  ]

  if (!productFilter) return allTargets

  const filterLower = productFilter.toLowerCase().trim()
  return allTargets.filter(
    (t) =>
      t.id.toLowerCase().includes(filterLower) ||
      t.name.toLowerCase().includes(filterLower),
  )
}

export function checkTcpPort(
  endpoint: TargetEndpoint,
  timeoutMs = 2000,
): Promise<TcpCheckResult> {
  return new Promise((resolve) => {
    // Si hay un error de configuración detectado en las variables, reportar inmediatamente
    if (endpoint.configError) {
      return resolve({
        endpoint,
        status: 'DOWN',
        latencyMs: 0,
        code: 'INVALID_CONFIG',
        detail: endpoint.configError,
        interpretation: 'Error de configuración: puerto inválido en variables de entorno.',
      })
    }

    const socket = new Socket()
    const startTime = Date.now()
    let settled = false

    const finish = (
      status: TcpCheckResult['status'],
      code: string,
      detail: string,
      interpretation: string,
    ) => {
      if (settled) return
      settled = true
      socket.destroy()
      const latencyMs = Date.now() - startTime
      resolve({
        endpoint,
        status,
        latencyMs,
        code: sanitizeSecrets(code),
        detail: sanitizeSecrets(detail),
        interpretation: sanitizeSecrets(interpretation),
      })
    }

    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      finish(
        'UP',
        'CONNECTED',
        'Conexión TCP establecida',
        'Existe un listener activo y accesible en el host y puerto probado.',
      )
    })

    socket.on('timeout', () => {
      finish(
        'TIMEOUT',
        'ETIMEDOUT',
        `No hubo respuesta dentro de ${timeoutMs}ms`,
        'Timeout: no hubo respuesta dentro del tiempo límite. Posible problema de firewall, ruta o servicio no respondiendo.',
      )
    })

    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        finish(
          'DOWN',
          'ECONNREFUSED',
          'Conexión rechazada por el host',
          'Connection refused: el host responde pero no hay un listener aceptando conexiones en este puerto.',
        )
      } else if (err.code === 'ENOTFOUND') {
        finish(
          'UNRESOLVED',
          'ENOTFOUND',
          'Nombre de host no resuelto por DNS',
          'Host no resuelto: el nombre no pudo convertirse en una dirección IP desde este entorno.',
        )
      } else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
        finish(
          'DOWN',
          err.code,
          'Host o red inalcanzable',
          'Ruta inalcanzable: no hay conectividad de red con la subred o IP destino.',
        )
      } else {
        finish(
          'DOWN',
          err.code || 'UNKNOWN_ERROR',
          err.message,
          'Fallo de conexión no clasificado.',
        )
      }
    })

    socket.connect(endpoint.port, endpoint.host)
  })
}

export async function runTcpChecks(
  targets: TargetEndpoint[] = getDefaultTargets(),
  timeoutMs = 2000,
): Promise<TcpCheckResult[]> {
  const results: TcpCheckResult[] = []
  for (const target of targets) {
    const res = await checkTcpPort(target, timeoutMs)
    results.push(res)
  }
  return results
}

export function formatTcpResultsTable(results: TcpCheckResult[]): string {
  const header = [
    '| Producto / Listener | Host:Puerto | Protocolo | Estado | Latencia | Diagnóstico Técnico |',
    '|:---|:---|:---|:---:|:---:|:---|',
  ]
  const rows = results.map((r) => {
    const statusLabel =
      r.status === 'UP'
        ? '**UP (OK)**'
        : r.status === 'TIMEOUT'
          ? '**TIMEOUT**'
          : r.status === 'UNRESOLVED'
            ? '**UNRESOLVED**'
            : '**DOWN**'
    const lat = r.status === 'UP' ? `${r.latencyMs}ms` : '-'
    return `| ${r.endpoint.name} | \`${r.endpoint.host}:${r.endpoint.port}\` | ${r.endpoint.protocol} | ${statusLabel} | ${lat} | ${r.interpretation} |`
  })
  return [...header, ...rows].join('\n')
}

// Ejecución directa si se invoca por CLI
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  const productArg = process.argv.find((a) => a.startsWith('--product='))
  const productFilter = productArg ? productArg.split('=')[1] : undefined

  console.log('='.repeat(80))
  console.log('Hito 11 — Prueba de Conectividad TCP a los Productos del Fixture 2030')
  console.log(`Fecha/Hora: ${new Date().toISOString()}`)
  if (productFilter) {
    console.log(`Filtro de producto activo: "${productFilter}"`)
  }
  console.log('='.repeat(80))
  console.log('Iniciando chequeo de sockets TCP...\n')

  runTcpChecks(getDefaultTargets(productFilter)).then((results) => {
    console.log(formatTcpResultsTable(results))
    console.log('\nResumen:')
    const upCount = results.filter((r) => r.status === 'UP').length
    const downCount = results.filter((r) => r.status !== 'UP').length
    console.log(`- Listeners alcanzables (UP): ${upCount}`)
    console.log(`- Listeners no alcanzables (DOWN/TIMEOUT): ${downCount}`)
    console.log('='.repeat(80))
  })
}
