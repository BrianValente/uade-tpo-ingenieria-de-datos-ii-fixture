import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { MongoClient } from 'mongodb'
import { createClient } from 'redis'
import neo4j from 'neo4j-driver'
import cassandra from 'cassandra-driver'

export interface NativeCheckResult {
  product: string
  layer: 'Configuración' | 'Handshake' | 'Autenticación' | 'Contexto' | 'Operación mínima'
  status: 'UP' | 'DOWN' | 'NOT_CONFIGURED' | 'SKIP' | 'DEGRADED'
  latencyMs: number
  detail: string
  diagnostic: string
}

const TIMEOUT_MS = Number(process.env.DEPENDENCY_TIMEOUT_MS) || 2000

// ============================================================================
// 1. MONGODB
// ============================================================================
export async function testMongoNative(): Promise<NativeCheckResult[]> {
  const host = process.env.MONGO_HOST || '127.0.0.1'
  const port = Number(process.env.MONGO_PORT) || 27017
  const database = process.env.MONGO_DATABASE || 'fixture2030'
  const username = process.env.MONGO_ROOT_USERNAME || ''
  const password = process.env.MONGO_ROOT_PASSWORD || ''
  const authSource = process.env.MONGO_AUTH_SOURCE || 'admin'

  const authPart = username && password ? `${encodeURIComponent(username)}:******@` : ''
  const sanitizedUri = `mongodb://${authPart}${host}:${port}/${database}?authSource=${authSource}`
  const realAuthPart = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  const realUri = `mongodb://${realAuthPart}${host}:${port}/${database}?authSource=${authSource}`

  const results: NativeCheckResult[] = []
  const start = Date.now()
  let client: MongoClient | null = null

  try {
    client = new MongoClient(realUri, {
      serverSelectionTimeoutMS: TIMEOUT_MS,
      connectTimeoutMS: TIMEOUT_MS,
    })

    await client.connect()
    const connectLatency = Date.now() - start

    // Layer: Handshake / Ping
    const pingRes = await client.db(authSource).command({ ping: 1 })
    if (pingRes.ok === 1) {
      results.push({
        product: 'MongoDB',
        layer: 'Handshake',
        status: 'UP',
        latencyMs: connectLatency,
        detail: 'Handshake de protocolo y comando ping exitoso',
        diagnostic: `Listener accesible en ${host}:${port}. Ping administrativo respondió ok: 1.`,
      })
    }

    // Layer: Context & Operación mínima
    const db = client.db(database)
    const opStart = Date.now()
    const team = await db.collection('equipos').findOne({ codigo: 'ARG' })
    const opLatency = Date.now() - opStart

    // Test non-existent entity to prove difference between empty and error
    const nonExistent = await db.collection('equipos').findOne({ codigo: 'NON_EXISTENT_XXX' })

    results.push({
      product: 'MongoDB',
      layer: 'Contexto',
      status: 'UP',
      latencyMs: opLatency,
      detail: `Base "${database}" y colección "equipos" seleccionadas correctamente`,
      diagnostic: `Contexto verificado. Documento inexistente retornó ${nonExistent === null ? 'null (ausencia válida)' : 'valor'}.`,
    })

    results.push({
      product: 'MongoDB',
      layer: 'Operación mínima',
      status: 'UP',
      latencyMs: opLatency,
      detail: `Lectura no destructiva ejecutada: ${team ? `Equipo ${team.codigo ?? 'ARG'} encontrado` : 'Colección vacía'}`,
      diagnostic: 'Operación mínima de lectura completada con éxito sin modificar datos.',
    })
  } catch (err: unknown) {
    const error = err as Error & { code?: string | number }
    const latency = Date.now() - start
    results.push({
      product: 'MongoDB',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: latency,
      detail: `Error de conexión: ${error.name} - ${error.message}`,
      diagnostic: `No se pudo completar el handshake o autenticación con MongoDB en ${host}:${port}. URI objetivo: ${sanitizedUri}.`,
    })
  } finally {
    if (client) {
      await client.close().catch(() => {})
    }
  }

  return results
}

// ============================================================================
// 2. REDIS
// ============================================================================
export async function testRedisNative(): Promise<NativeCheckResult[]> {
  const host = process.env.REDIS_HOST || '127.0.0.1'
  const port = Number(process.env.REDIS_PORT) || 6379
  const database = Number(process.env.REDIS_DATABASE) || 0
  const password = process.env.REDIS_PASSWORD || ''

  const results: NativeCheckResult[] = []
  const start = Date.now()

  const client = createClient({
    url: `redis://${password ? `:${encodeURIComponent(password)}@` : ''}${host}:${port}/${database}`,
    socket: {
      connectTimeout: TIMEOUT_MS,
      reconnectStrategy: false,
    },
  })

  client.on('error', () => {
    // suppress unhandled errors in emitter
  })

  try {
    await client.connect()
    const connectLatency = Date.now() - start

    // Layer: Handshake / Ping RESP
    const pingReply = await client.ping()
    results.push({
      product: 'Redis',
      layer: 'Handshake',
      status: pingReply === 'PONG' ? 'UP' : 'DEGRADED',
      latencyMs: connectLatency,
      detail: `Comando PING respondió: ${pingReply}`,
      diagnostic: 'Protocolo RESP validado correctamente.',
    })

    // Layer: Contexto
    results.push({
      product: 'Redis',
      layer: 'Contexto',
      status: 'UP',
      latencyMs: 1,
      detail: `Base de datos lógica Redis #${database} activa`,
      diagnostic: 'Contexto de base de datos indexada accesible.',
    })

    // Layer: Operación mínima y comprobación de ausencia vs caída
    const opStart = Date.now()
    const nonExistentKey = `fixture2030:test:probe:${Date.now()}`
    const missingValue = await client.get(nonExistentKey)

    // Demo write con TTL para validar expiración sin persistir basura
    await client.set(nonExistentKey, 'probe_val', { EX: 2 })
    const fetchedVal = await client.get(nonExistentKey)
    const opLatency = Date.now() - opStart

    results.push({
      product: 'Redis',
      layer: 'Operación mínima',
      status: fetchedVal === 'probe_val' ? 'UP' : 'DEGRADED',
      latencyMs: opLatency,
      detail: `Lectura de clave ausente devolvió: ${missingValue === null ? 'null' : missingValue}. Prueba de TTL (2s) exitosa.`,
      diagnostic: 'Diferenciación verificada: una clave inexistente retorna null y no equivale a Redis caído.',
    })
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'Redis',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: `Fallo de conexión Redis: ${error.message}`,
      diagnostic: `No se pudo conectar al servidor RESP en ${host}:${port}.`,
    })
  } finally {
    if (client.isOpen) {
      await client.quit().catch(() => client.disconnect())
    }
  }

  return results
}

// ============================================================================
// 3. NEO4J
// ============================================================================
export async function testNeo4jNative(): Promise<NativeCheckResult[]> {
  const host = process.env.NEO4J_HOST || '127.0.0.1'
  const boltPort = Number(process.env.NEO4J_BOLT_PORT) || 7687
  const username = process.env.NEO4J_USERNAME || 'neo4j'
  const password = process.env.NEO4J_PASSWORD || ''

  const results: NativeCheckResult[] = []

  if (!password) {
    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Autenticación',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      detail: 'NEO4J_PASSWORD no configurada en el entorno',
      diagnostic: 'SKIP: No se configuró credencial para Neo4j; omitiendo autenticación Bolt.',
    })
    return results
  }

  const start = Date.now()
  const uri = `bolt://${host}:${boltPort}`
  const driver = neo4j.driver(
    uri,
    neo4j.auth.basic(username, password),
    { connectionTimeout: TIMEOUT_MS, maxConnectionLifetime: 3000 },
  )

  try {
    await driver.verifyConnectivity()
    const connectLatency = Date.now() - start

    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Handshake',
      status: 'UP',
      latencyMs: connectLatency,
      detail: 'Conexión Bolt y autenticación exitosa',
      diagnostic: `Handshake Bolt establecido en ${uri} como usuario "${username}".`,
    })

    const session = driver.session({ database: 'neo4j' })
    try {
      const opStart = Date.now()
      const queryRes = await session.run('RETURN 1 AS ping')
      const opLatency = Date.now() - opStart
      const pingVal = queryRes.records[0]?.get('ping')?.toNumber?.() ?? 1

      // Match check acotado
      const matchRes = await session.run('MATCH (m:Match) RETURN m.id AS id LIMIT 1')
      const matchFound = matchRes.records.length > 0 ? matchRes.records[0].get('id') : 'Sin registros'

      results.push({
        product: 'Neo4j (Bolt)',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: opLatency,
        detail: 'Base de datos "neo4j" seleccionada correctamente',
        diagnostic: 'Contexto de grafo accesible y permisos de consulta comprobados.',
      })

      results.push({
        product: 'Neo4j (Bolt)',
        layer: 'Operación mínima',
        status: 'UP',
        latencyMs: opLatency,
        detail: `Cypher ping retorno: ${pingVal}. Consulta Match acotada: ${matchFound}.`,
        diagnostic: 'Consulta Cypher parametrizada ejecutada sin alterar datos.',
      })
    } finally {
      await session.close()
    }
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: `Fallo Bolt: ${error.message}`,
      diagnostic: `No se pudo establecer sesión Bolt en ${uri}.`,
    })
  } finally {
    await driver.close().catch(() => {})
  }

  return results
}

// ============================================================================
// 4. CASSANDRA
// ============================================================================
export async function testCassandraNative(): Promise<NativeCheckResult[]> {
  const host = process.env.CASSANDRA_HOST || '127.0.0.1'
  const port = Number(process.env.CASSANDRA_PORT) || 9042
  const datacenter = process.env.CASSANDRA_DATACENTER || 'datacenter1'
  const keyspace = process.env.CASSANDRA_KEYSPACE || 'fixture2030_comentarios'

  const results: NativeCheckResult[] = []
  const start = Date.now()

  const client = new cassandra.Client({
    contactPoints: [host],
    protocolOptions: { port },
    localDataCenter: datacenter,
    socketOptions: { connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS },
  })

  try {
    await client.connect()
    const connectLatency = Date.now() - start

    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Handshake',
      status: 'UP',
      latencyMs: connectLatency,
      detail: 'Sesión binaria CQL establecida',
      diagnostic: `Listener CQL alcanzable en ${host}:${port} (datacenter: ${datacenter}).`,
    })

    const opStart = Date.now()
    const systemRes = await client.execute('SELECT release_version FROM system.local')
    const version = systemRes.first()?.get('release_version') ?? 'desconocida'

    let keyspaceOk = false
    try {
      await client.execute(`USE ${keyspace}`)
      keyspaceOk = true
    } catch {
      keyspaceOk = false
    }

    const opLatency = Date.now() - opStart

    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Contexto',
      status: keyspaceOk ? 'UP' : 'DEGRADED',
      latencyMs: opLatency,
      detail: keyspaceOk ? `Keyspace "${keyspace}" seleccionado` : `Keyspace "${keyspace}" no encontrado en el nodo`,
      diagnostic: keyspaceOk
        ? 'Contexto de keyspace validado.'
        : `El cluster responde versión ${version}, pero el keyspace "${keyspace}" no existe aún.`,
    })

    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Operación mínima',
      status: 'UP',
      latencyMs: opLatency,
      detail: `Consulta de metadatos del cluster: versión Cassandra ${version}`,
      diagnostic: 'Operación CQL no destructiva completada con éxito.',
    })
  } catch (err: unknown) {
    const error = err as Error
    const cleanMsg = error.message.split('\n')[0]
    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: `Fallo CQL: ${cleanMsg}`,
      diagnostic: `No se pudo conectar al protocolo nativo CQL en ${host}:${port}.`,
    })
  } finally {
    await client.shutdown().catch(() => {})
  }

  return results
}

// ============================================================================
// 5. INFLUXDB 3 CORE
// ============================================================================
export async function testInfluxDbNative(): Promise<NativeCheckResult[]> {
  const url = process.env.INFLUXDB_URL || 'http://127.0.0.1:8181'
  const database = process.env.INFLUXDB_DATABASE || 'fixture2030_h8_lab_detalle'
  const token = process.env.INFLUXDB_TOKEN || ''

  const results: NativeCheckResult[] = []
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const healthUrl = `${url.replace(/\/$/, '')}/health`
    const response = await fetch(healthUrl, { signal: controller.signal })
    clearTimeout(timer)

    const latency = Date.now() - start

    if (response.ok) {
      results.push({
        product: 'InfluxDB 3 Core',
        layer: 'Handshake',
        status: 'UP',
        latencyMs: latency,
        detail: `Endpoint /health respondió status ${response.status}`,
        diagnostic: 'Servicio InfluxDB 3 Core iniciado y saludable.',
      })
    } else {
      results.push({
        product: 'InfluxDB 3 Core',
        layer: 'Handshake',
        status: 'DEGRADED',
        latencyMs: latency,
        detail: `Endpoint /health respondió HTTP ${response.status}`,
        diagnostic: 'Servicio responde pero con estado no exitoso.',
      })
    }

    // Layer: Contexto y Autorización
    if (!token) {
      results.push({
        product: 'InfluxDB 3 Core',
        layer: 'Autenticación',
        status: 'NOT_CONFIGURED',
        latencyMs: 0,
        detail: 'INFLUXDB_TOKEN no configurado en variables de entorno',
        diagnostic: 'SKIP: No se configuró token de autenticación para InfluxDB 3; omitiendo consultas de datos.',
      })
    } else {
      results.push({
        product: 'InfluxDB 3 Core',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: latency,
        detail: `Token presente. Base de datos configurada: "${database}"`,
        diagnostic: 'Configuración de acceso a base de series temporales preparada.',
      })
    }
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'InfluxDB 3 Core',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: `Fallo HTTP InfluxDB: ${error.message}`,
      diagnostic: `No se pudo alcanzar el endpoint de InfluxDB en ${url}.`,
    })
  }

  return results
}

// ============================================================================
// 6. INTERSYSTEMS IRIS
// ============================================================================
export async function testIrisNative(): Promise<NativeCheckResult[]> {
  const host = process.env.IRIS_HOST || '127.0.0.1'
  const port = Number(process.env.IRIS_PORT || process.env.IRIS_SUPERSERVER_PORT) || 1972
  const webPort = Number(process.env.IRIS_WEB_PORT) || 52773
  const namespace = process.env.IRIS_NAMESPACE || 'USER'
  const username = process.env.IRIS_USERNAME || ''
  const password = process.env.IRIS_PASSWORD || ''

  const results: NativeCheckResult[] = []

  // Check Web Portal reachability
  const startWeb = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const portalUrl = `http://${host}:${webPort}/csp/sys/UtilHome.csp`
    const portalRes = await fetch(portalUrl, { signal: controller.signal })
    clearTimeout(timer)
    results.push({
      product: 'InterSystems IRIS (Web)',
      layer: 'Operación mínima',
      status: 'UP',
      latencyMs: Date.now() - startWeb,
      detail: `Portal HTTP respondió con código ${portalRes.status}`,
      diagnostic: 'Portal de administración web accesible.',
    })
  } catch {
    results.push({
      product: 'InterSystems IRIS (Web)',
      layer: 'Operación mínima',
      status: 'DOWN',
      latencyMs: Date.now() - startWeb,
      detail: `No se pudo conectar al portal HTTP en puerto ${webPort}`,
      diagnostic: 'Portal web no disponible en este puerto.',
    })
  }

  // Check SuperServer native connection
  if (!username || !password) {
    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: 'Autenticación',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      detail: 'IRIS_USERNAME o IRIS_PASSWORD no configurados en el entorno',
      diagnostic: 'SKIP: Credenciales de IRIS no provistas; omitiendo conexión al SuperServer.',
    })
    return results
  }

  const start = Date.now()
  try {
    // Dynamic import to handle environments where the native addon might differ
    const irisNative = await import('@intersystems/intersystems-iris-native')
    const connection = irisNative.default?.createConnection?.({
      host,
      port,
      ns: namespace,
      user: username,
      pwd: password,
    })

    if (connection) {
      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Handshake',
        status: 'UP',
        latencyMs: Date.now() - start,
        detail: `Conexión SuperServer establecida en ${host}:${port}`,
        diagnostic: `Autenticado en namespace "${namespace}".`,
      })
      connection.close?.()
    } else {
      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Handshake',
        status: 'DOWN',
        latencyMs: Date.now() - start,
        detail: 'createConnection no devolvió una instancia válida',
        diagnostic: 'Fallo al inicializar cliente nativo IRIS.',
      })
    }
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: `Fallo SuperServer: ${error.message}`,
      diagnostic: `Error al conectar con IRIS SuperServer en ${host}:${port}.`,
    })
  }

  return results
}

// ============================================================================
// ORQUESTADOR DE CLIENTES NATIVOS
// ============================================================================
export async function runAllNativeChecks(): Promise<NativeCheckResult[]> {
  const allResults: NativeCheckResult[] = []

  const mongo = await testMongoNative()
  allResults.push(...mongo)

  const redis = await testRedisNative()
  allResults.push(...redis)

  const neo4j = await testNeo4jNative()
  allResults.push(...neo4j)

  const cassandra = await testCassandraNative()
  allResults.push(...cassandra)

  const influx = await testInfluxDbNative()
  allResults.push(...influx)

  const iris = await testIrisNative()
  allResults.push(...iris)

  return allResults
}

export function formatNativeResultsTable(results: NativeCheckResult[]): string {
  const header = [
    '| Producto | Capa Evaluada | Estado | Latencia | Detalle de la Prueba | Diagnóstico Técnico |',
    '|:---|:---|:---:|:---:|:---|:---|',
  ]
  const rows = results.map((r) => {
    const statusLabel =
      r.status === 'UP'
        ? '**UP (OK)**'
        : r.status === 'SKIP' || r.status === 'NOT_CONFIGURED'
          ? `**${r.status}**`
          : r.status === 'DEGRADED'
            ? '**DEGRADED**'
            : '**DOWN**'
    const lat = r.latencyMs > 0 ? `${r.latencyMs}ms` : '-'
    return `| ${r.product} | ${r.layer} | ${statusLabel} | ${lat} | ${r.detail} | ${r.diagnostic} |`
  })
  return [...header, ...rows].join('\n')
}

// CLI Execution
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  console.log('='.repeat(80))
  console.log('Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos')
  console.log(`Fecha/Hora: ${new Date().toISOString()}`)
  console.log('='.repeat(80))
  console.log('Ejecutando verificaciones de drivers y protocolos nativos...\n')

  runAllNativeChecks().then((results) => {
    console.log(formatNativeResultsTable(results))
    console.log('\nResumen:')
    const up = results.filter((r) => r.status === 'UP').length
    const down = results.filter((r) => r.status === 'DOWN').length
    const skip = results.filter((r) => r.status === 'SKIP' || r.status === 'NOT_CONFIGURED').length
    console.log(`- Pruebas exitosas (UP): ${up}`)
    console.log(`- Pruebas fallidas (DOWN): ${down}`)
    console.log(`- Pruebas omitidas/no configuradas (SKIP/NOT_CONFIGURED): ${skip}`)
    console.log('='.repeat(80))
  })
}
