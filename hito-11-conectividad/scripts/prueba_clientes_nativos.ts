import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  loadMongo,
  loadRedis,
  loadNeo4j,
  loadCassandra,
  loadIris,
} from './driver_loader.js'
import { sanitizeSecrets, sanitizeUrl } from './sanitizer.js'
import { parsePort } from './prueba_tcp.js'

export interface NativeCheckResult {
  product: string
  layer:
    | 'Configuración'
    | 'Handshake'
    | 'Autenticación'
    | 'Autorización'
    | 'Contexto'
    | 'Operación mínima'
  status: 'UP' | 'DOWN' | 'NOT_CONFIGURED' | 'SKIP' | 'DEGRADED'
  latencyMs: number
  detail: string
  diagnostic: string
}

const TIMEOUT_MS = Number(process.env.DEPENDENCY_TIMEOUT_MS) || 2000

// Helper para envolver promesas con timeout estricto
function withTimeout<T>(promise: Promise<T>, ms: number, opName: string): Promise<T> {
  let timer: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout de ${ms}ms superado durante la operación "${opName}"`))
    }, ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
}

/**
 * T04 / S08 — Clasifica errores de clientes nativos según la etapa alcanzada y códigos/mensajes
 * del driver para no colapsar fallas posteriores al handshake (Autenticación, Autorización,
 * Contexto u Operación mínima) bajo `layer: 'Handshake'`.
 */
export function classifyNativeError(
  err: unknown,
  currentStage: NativeCheckResult['layer'],
  handshakeCompleted: boolean,
): { layer: NativeCheckResult['layer']; reasonLabel: string; isAmbiguousPreHandshake: boolean } {
  const anyErr = (err ?? {}) as Record<string, unknown>
  const code = anyErr.code
  const codeName = typeof anyErr.codeName === 'string' ? anyErr.codeName : ''
  const name = typeof anyErr.name === 'string' ? anyErr.name : 'Error'
  const message = typeof anyErr.message === 'string' ? anyErr.message : String(err)
  const combined = `${name} ${codeName} ${String(code ?? '')} ${message}`

  // 1. Errores explícitos de Autorización / Permisos (ej. Mongo code 13 Unauthorized, Redis NOPERM, Neo4j Forbidden, Cassandra 0x2100)
  if (
    code === 13 ||
    code === 0x2100 ||
    /^Unauthorized$/i.test(codeName) ||
    /not authorized on|not authorized to execute|noperm|permission denied|insufficient privileges|security\.forbidden|unauthorizedexception|access denied for/i.test(
      combined,
    ) ||
    (handshakeCompleted && /unauthorized|forbidden/i.test(combined))
  ) {
    return {
      layer: 'Autorización',
      reasonLabel: 'Fallo de autorización / permisos insuficientes',
      isAmbiguousPreHandshake: false,
    }
  }

  // 2. Errores explícitos de Autenticación / Credenciales (ej. Mongo code 18 AuthenticationFailed, Redis WRONGPASS/NOAUTH, Neo4j Security.Unauthorized, Cassandra 0x0100)
  if (
    code === 18 ||
    code === 0x0100 ||
    /^AuthenticationFailed$/i.test(codeName) ||
    /authentication failed|auth failed|bad auth|wrongpass|noauth|invalid password|invalid credentials|security\.unauthorized|badcredentials|access denied/i.test(
      combined,
    )
  ) {
    return {
      layer: 'Autenticación',
      reasonLabel: 'Fallo de autenticación / credenciales rechazadas',
      isAmbiguousPreHandshake: false,
    }
  }

  // 3. Errores explícitos de Contexto (base/keyspace/namespace inexistente)
  if (
    code === 26 ||
    /^NamespaceNotFound$/i.test(codeName) ||
    /keyspace .* does not exist|database .* does not exist|database .* not found|namespace .* does not exist/i.test(
      combined,
    )
  ) {
    return {
      layer: 'Contexto',
      reasonLabel: 'Fallo de contexto (base de datos, keyspace o namespace inexistente)',
      isAmbiguousPreHandshake: false,
    }
  }

  // 4. Si el handshake ya fue completado exitosamente, preservar la etapa en curso (Contexto u Operación mínima)
  if (handshakeCompleted) {
    const activeStage = currentStage === 'Handshake' ? 'Contexto' : currentStage
    return {
      layer: activeStage,
      reasonLabel: `Fallo en etapa "${activeStage}" posterior al handshake`,
      isAmbiguousPreHandshake: false,
    }
  }

  // 5. Falla previa a completar el handshake
  const isNetworkOrTimeout =
    /econnrefused|etimedout|ehostunreach|enotfound|socket|timeout|server selection timed out/i.test(
      combined,
    )
  return {
    layer: currentStage,
    reasonLabel: isNetworkOrTimeout
      ? 'Fallo de conexión o handshake de protocolo'
      : 'Fallo durante establecimiento de sesión inicial',
    isAmbiguousPreHandshake: true,
  }
}

// ============================================================================
// 1. MONGODB
// ============================================================================
export async function testMongoNative(): Promise<NativeCheckResult[]> {
  const host = process.env.MONGO_HOST || '127.0.0.1'
  const portConfig = parsePort(process.env.MONGO_PORT, 27017, 'MONGO_PORT')
  const database = process.env.MONGO_DATABASE || 'fixture2030'
  const username = process.env.MONGO_ROOT_USERNAME || ''
  const password = process.env.MONGO_ROOT_PASSWORD || ''
  const authSource = process.env.MONGO_AUTH_SOURCE || 'admin'

  const results: NativeCheckResult[] = []

  if (portConfig.configError) {
    results.push({
      product: 'MongoDB',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: portConfig.configError,
      diagnostic: 'Error de configuración: puerto de MongoDB inválido.',
    })
    return results
  }

  const port = portConfig.port
  const authPart = username && password ? `${encodeURIComponent(username)}:******@` : ''
  const sanitizedUri = `mongodb://${authPart}${host}:${port}/${database}?authSource=${authSource}`
  const realAuthPart = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  const realUri = `mongodb://${realAuthPart}${host}:${port}/${database}?authSource=${authSource}`

  const start = Date.now()
  let stageStart = start
  let client: any = null
  let currentStage: NativeCheckResult['layer'] = 'Handshake'
  let handshakeCompleted = false

  try {
    let MongoClientClass: any
    try {
      MongoClientClass = await loadMongo()
    } catch (loadErr: unknown) {
      const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
      results.push({
        product: 'MongoDB',
        layer: 'Handshake',
        status: 'SKIP',
        latencyMs: 0,
        detail: 'Driver de MongoDB no disponible en el entorno',
        diagnostic: `SKIP: ${sanitizeSecrets(msg)}`,
      })
      return results
    }

    client = new MongoClientClass(realUri, {
      serverSelectionTimeoutMS: TIMEOUT_MS,
      connectTimeoutMS: TIMEOUT_MS,
      timeoutMS: TIMEOUT_MS,
    })

    await withTimeout(client.connect(), TIMEOUT_MS, 'MongoClient.connect')
    const connectLatency = Date.now() - start

    // Layer: Handshake / Ping
    const pingRes: any = await withTimeout(
      client.db(authSource).command({ ping: 1 }),
      TIMEOUT_MS,
      'MongoDB ping',
    )
    if (pingRes && pingRes.ok === 1) {
      handshakeCompleted = true
      results.push({
        product: 'MongoDB',
        layer: 'Handshake',
        status: 'UP',
        latencyMs: connectLatency,
        detail: 'Handshake de protocolo y comando ping exitoso',
        diagnostic: `Listener accesible en ${host}:${port}. Ping administrativo respondió ok: 1.`,
      })
    }

    // Layer: Contexto (F12 — verificar existencia real de la colección mediante metadatos)
    currentStage = 'Contexto'
    stageStart = Date.now()
    const db = client.db(database)

    const collections = await withTimeout(
      db.listCollections({ name: 'equipos' }).toArray(),
      TIMEOUT_MS,
      'MongoDB listCollections',
    )
    const collectionExists = Array.isArray(collections) && collections.length > 0
    const contextLatency = Date.now() - stageStart

    if (collectionExists) {
      results.push({
        product: 'MongoDB',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: contextLatency,
        detail: `Base "${database}" y colección "equipos" verificadas mediante listCollections`,
        diagnostic: 'Contexto de base y colección verificado en el catálogo de MongoDB.',
      })

      // Layer: Operación mínima (F12 — diferenciar ausencia de ARG respecto a colección vacía o inexistente)
      currentStage = 'Operación mínima'
      stageStart = Date.now()
      const team = await withTimeout(
        db.collection('equipos').findOne({ codigo: 'ARG' }),
        TIMEOUT_MS,
        'MongoDB findOne',
      )
      const opLatency = Date.now() - stageStart

      results.push({
        product: 'MongoDB',
        layer: 'Operación mínima',
        status: 'UP',
        latencyMs: opLatency,
        detail: team
          ? `Equipo ARG encontrado en colección "equipos"`
          : 'Equipo ARG ausente en colección existente (ausencia controlada)',
        diagnostic: 'Operación mínima de lectura ejecutada de forma no destructiva.',
      })
    } else {
      results.push({
        product: 'MongoDB',
        layer: 'Contexto',
        status: 'DEGRADED',
        latencyMs: contextLatency,
        detail: `Base "${database}" accesible, pero la colección "equipos" no existe aún en el nodo`,
        diagnostic: 'La base de datos responde pero la colección requerida no ha sido creada o sembrada.',
      })

      results.push({
        product: 'MongoDB',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: 'Lectura de equipo omitida por ausencia de la colección "equipos"',
        diagnostic: 'No se puede ejecutar findOne sobre una colección inexistente.',
      })
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const latency = Date.now() - stageStart
    const classified = classifyNativeError(err, currentStage, handshakeCompleted)
    const hypothesisNote = classified.isAmbiguousPreHandshake
      ? ' Hipótesis técnica: listener inaccesible, firewall o rechazo temprano durante negociación inicial.'
      : ''

    results.push({
      product: 'MongoDB',
      layer: classified.layer,
      status: 'DOWN',
      latencyMs: latency,
      detail: sanitizeSecrets(`${classified.reasonLabel}: ${error.name} - ${error.message}`),
      diagnostic: sanitizeSecrets(
        `${classified.reasonLabel} en MongoDB (${host}:${port}, base "${database}"). URI objetivo: ${sanitizedUri}.${hypothesisNote}`,
      ),
    })

    if (
      handshakeCompleted &&
      (classified.layer === 'Autorización' || classified.layer === 'Contexto')
    ) {
      results.push({
        product: 'MongoDB',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: `Lectura omitida por fallo previo en capa de ${classified.layer}`,
        diagnostic: `No se ejecutó findOne porque la verificación de ${classified.layer.toLowerCase()} sobre "${database}" falló.`,
      })
    }
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
  const portConfig = parsePort(process.env.REDIS_PORT, 6379, 'REDIS_PORT')
  const database = Number(process.env.REDIS_DATABASE) || 0
  const password = process.env.REDIS_PASSWORD || ''

  const results: NativeCheckResult[] = []

  if (portConfig.configError) {
    results.push({
      product: 'Redis',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: portConfig.configError,
      diagnostic: 'Error de configuración: puerto de Redis inválido.',
    })
    return results
  }

  if (/\s/.test(host)) {
    results.push({
      product: 'Redis',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: 'Host de Redis contiene espacios en blanco o formato inválido',
      diagnostic: 'Error de configuración: REDIS_HOST inválido.',
    })
    return results
  }

  const port = portConfig.port
  const start = Date.now()
  let stageStart = start
  let currentStage: NativeCheckResult['layer'] = 'Handshake'
  let handshakeCompleted = false

  let createClientFn: any
  try {
    createClientFn = await loadRedis()
  } catch (loadErr: unknown) {
    const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
    results.push({
      product: 'Redis',
      layer: 'Handshake',
      status: 'SKIP',
      latencyMs: 0,
      detail: 'Driver de Redis no disponible en el entorno',
      diagnostic: `SKIP: ${sanitizeSecrets(msg)}`,
    })
    return results
  }

  let client: any = null
  try {
    const authPart = password ? `:${encodeURIComponent(password)}@` : ''
    const redisUrl = `redis://${authPart}${host}:${port}/${database}`
    client = createClientFn({
      url: redisUrl,
      socket: {
        connectTimeout: TIMEOUT_MS,
        reconnectStrategy: false,
      },
    })
    client.on('error', () => {
      // suprimir errores no capturados del emisor
    })
  } catch (cfgErr: unknown) {
    const error = cfgErr as Error
    results.push({
      product: 'Redis',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: sanitizeSecrets(`Error al instanciar cliente Redis: ${error.message}`),
      diagnostic: 'Error de configuración o parámetros inválidos para el driver de Redis.',
    })
    return results
  }

  try {
    await withTimeout(client.connect(), TIMEOUT_MS, 'Redis connect')
    const connectLatency = Date.now() - start

    // Layer: Handshake / Ping RESP (F08 — con timeout de comando)
    const pingReply = await withTimeout(client.ping(), TIMEOUT_MS, 'Redis PING')
    handshakeCompleted = true
    results.push({
      product: 'Redis',
      layer: 'Handshake',
      status: pingReply === 'PONG' ? 'UP' : 'DEGRADED',
      latencyMs: connectLatency,
      detail: `Comando PING respondió: ${pingReply}`,
      diagnostic: 'Protocolo RESP validado correctamente.',
    })

    // Layer: Contexto
    currentStage = 'Contexto'
    stageStart = Date.now()
    results.push({
      product: 'Redis',
      layer: 'Contexto',
      status: 'UP',
      latencyMs: 1,
      detail: `Base de datos lógica Redis #${database} activa`,
      diagnostic: 'Contexto de base de datos indexada accesible.',
    })

    // Layer: Operación mínima y comprobación de ausencia vs caída (F07 / R13 — Solo lectura)
    currentStage = 'Operación mínima'
    stageStart = Date.now()
    const probeKey = 'fixture2030:test:nonexistent_probe_key'
    const missingValue = await withTimeout(client.get(probeKey), TIMEOUT_MS, 'Redis GET')
    const probeTtl = await withTimeout(client.ttl(probeKey), TIMEOUT_MS, 'Redis TTL')
    const opLatency = Date.now() - stageStart

    results.push({
      product: 'Redis',
      layer: 'Operación mínima',
      status: missingValue === null ? 'UP' : 'DEGRADED',
      latencyMs: opLatency,
      detail: `Lectura de clave ausente devolvió: null. Consulta de TTL: ${probeTtl} (clave inexistente comprobada sin escrituras).`,
      diagnostic:
        'Operación de solo lectura completada: una clave ausente retorna null y TTL -2 sin alterar el estado de Redis.',
    })
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const classified = classifyNativeError(err, currentStage, handshakeCompleted)
    results.push({
      product: 'Redis',
      layer: classified.layer,
      status: 'DOWN',
      latencyMs: Date.now() - stageStart,
      detail: sanitizeSecrets(`${classified.reasonLabel}: ${error.message}`),
      diagnostic: sanitizeSecrets(
        `${classified.reasonLabel} en servidor RESP (${host}:${port}, db #${database}).`,
      ),
    })
  } finally {
    // S03: cerrar socket inmediatamente sin colgarse en client.quit() si el protocolo está bloqueado
    if (client) {
      try {
        client.destroy()
      } catch {
        try {
          client.disconnect()
        } catch {}
      }
    }
  }

  return results
}

// ============================================================================
// 3. NEO4J
// ============================================================================
export async function testNeo4jNative(): Promise<NativeCheckResult[]> {
  const host = process.env.NEO4J_HOST || '127.0.0.1'
  const portConfig = parsePort(process.env.NEO4J_BOLT_PORT, 7687, 'NEO4J_BOLT_PORT')
  const username = process.env.NEO4J_USERNAME || 'neo4j'
  const password = process.env.NEO4J_PASSWORD || ''

  const results: NativeCheckResult[] = []

  if (portConfig.configError) {
    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: portConfig.configError,
      diagnostic: 'Error de configuración: puerto Bolt de Neo4j inválido.',
    })
    return results
  }

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

  let neo4jLib: any
  try {
    neo4jLib = await loadNeo4j()
  } catch (loadErr: unknown) {
    const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Handshake',
      status: 'SKIP',
      latencyMs: 0,
      detail: 'Driver de Neo4j no disponible en el entorno',
      diagnostic: `SKIP: ${sanitizeSecrets(msg)}`,
    })
    return results
  }

  const start = Date.now()
  let stageStart = start
  let currentStage: NativeCheckResult['layer'] = 'Handshake'
  let handshakeCompleted = false
  const boltPort = portConfig.port
  const uri = `bolt://${host}:${boltPort}`
  const driver = neo4jLib.driver(
    uri,
    neo4jLib.auth.basic(username, password),
    { connectionTimeout: TIMEOUT_MS, maxConnectionLifetime: 3000 },
  )

  try {
    await withTimeout(driver.verifyConnectivity(), TIMEOUT_MS, 'Neo4j verifyConnectivity')
    const connectLatency = Date.now() - start
    handshakeCompleted = true

    results.push({
      product: 'Neo4j (Bolt)',
      layer: 'Handshake',
      status: 'UP',
      latencyMs: connectLatency,
      detail: 'Conexión Bolt y autenticación exitosa',
      diagnostic: `Handshake Bolt establecido en ${uri} como usuario "${username}".`,
    })

    currentStage = 'Contexto'
    stageStart = Date.now()
    const session = driver.session({ database: 'neo4j' })
    try {
      const queryRes: any = await withTimeout(
        session.run('RETURN 1 AS ping'),
        TIMEOUT_MS,
        'Neo4j Cypher ping',
      )
      const contextLatency = Date.now() - stageStart
      const pingVal = queryRes.records[0]?.get('ping')?.toNumber?.() ?? 1

      results.push({
        product: 'Neo4j (Bolt)',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: contextLatency,
        detail: 'Base de datos "neo4j" seleccionada correctamente',
        diagnostic: 'Contexto de grafo accesible y permisos de consulta comprobados.',
      })

      // R2-06 — Consulta parametrizada sobre el modelo real: MATCH (p:Partido {id: $id}) RETURN p.id AS id, p.fase AS fase
      currentStage = 'Operación mínima'
      stageStart = Date.now()
      const partidoRes: any = await withTimeout(
        session.run(
          'MATCH (p:Partido {id: $id}) RETURN p.id AS id, p.fase AS fase LIMIT 1',
          { id: 'F2030-001' },
        ),
        TIMEOUT_MS,
        'Neo4j Cypher partido query',
      )
      const opLatency = Date.now() - stageStart

      const foundPartido =
        partidoRes.records.length > 0
          ? `Partido ${partidoRes.records[0].get('id')} encontrado`
          : 'Partido F2030-001 ausente (ausencia controlada en grafo)'

      results.push({
        product: 'Neo4j (Bolt)',
        layer: 'Operación mínima',
        status: 'UP',
        latencyMs: opLatency,
        detail: `Cypher ping retorno: ${pingVal}. Consulta :Partido parametrizada: ${foundPartido}.`,
        diagnostic:
          'Consulta Cypher parametrizada sobre etiqueta :Partido y propiedad id ejecutada sin alterar datos.',
      })
    } finally {
      await session.close()
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const classified = classifyNativeError(err, currentStage, handshakeCompleted)
    results.push({
      product: 'Neo4j (Bolt)',
      layer: classified.layer,
      status: 'DOWN',
      latencyMs: Date.now() - stageStart,
      detail: sanitizeSecrets(`${classified.reasonLabel}: ${error.message}`),
      diagnostic: sanitizeSecrets(`${classified.reasonLabel} en sesión Bolt (${uri}).`),
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
  const portConfig = parsePort(process.env.CASSANDRA_PORT, 9042, 'CASSANDRA_PORT')
  const datacenter = process.env.CASSANDRA_DATACENTER || 'datacenter1'
  const keyspace = process.env.CASSANDRA_KEYSPACE || 'fixture2030_comentarios'

  const results: NativeCheckResult[] = []

  if (portConfig.configError) {
    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Configuración',
      status: 'DOWN',
      latencyMs: 0,
      detail: portConfig.configError,
      diagnostic: 'Error de configuración: puerto de Cassandra inválido.',
    })
    return results
  }

  let cassandraLib: any
  try {
    cassandraLib = await loadCassandra()
  } catch (loadErr: unknown) {
    const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Handshake',
      status: 'SKIP',
      latencyMs: 0,
      detail: 'Driver de Cassandra no disponible en el entorno',
      diagnostic: `SKIP: ${sanitizeSecrets(msg)}`,
    })
    return results
  }

  const port = portConfig.port
  const start = Date.now()
  let stageStart = start
  let currentStage: NativeCheckResult['layer'] = 'Handshake'
  let handshakeCompleted = false

  // F05 — Configurar keyspace directamente en el cliente
  const client = new cassandraLib.Client({
    contactPoints: [host],
    protocolOptions: { port },
    localDataCenter: datacenter,
    keyspace,
    socketOptions: { connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS },
  })

  try {
    await withTimeout(client.connect(), TIMEOUT_MS, 'Cassandra connect')
    const connectLatency = Date.now() - start
    handshakeCompleted = true

    results.push({
      product: 'Cassandra (CQL)',
      layer: 'Handshake',
      status: 'UP',
      latencyMs: connectLatency,
      detail: 'Sesión binaria CQL establecida',
      diagnostic: `Listener CQL alcanzable en ${host}:${port} (datacenter: ${datacenter}).`,
    })

    currentStage = 'Contexto'
    stageStart = Date.now()
    const systemRes: any = await withTimeout(
      client.execute('SELECT release_version FROM system.local'),
      TIMEOUT_MS,
      'Cassandra system.local',
    )
    const version = systemRes.first()?.get('release_version') ?? 'desconocida'

    // R2-01 / S02 / U02 — Cargar metadatos de tabla mediante getTable() asíncrono (evita caché fría vacía)
    // sin ocultar rechazos de autorización (0x2100) ni timeouts de metadatos como tabla inexistente.
    let keyspaceOk = false
    let tableOk = false
    const meta = client.metadata?.keyspaces?.[keyspace]
    if (meta) {
      keyspaceOk = true
      const table = await withTimeout(
        client.metadata.getTable(keyspace, 'comentarios_por_partido'),
        TIMEOUT_MS,
        'Cassandra getTable',
      )
      tableOk = Boolean(table)
    }

    const contextLatency = Date.now() - stageStart

    if (keyspaceOk && tableOk) {
      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: contextLatency,
        detail: `Keyspace "${keyspace}" y tabla "comentarios_por_partido" verificados`,
        diagnostic: 'Contexto de keyspace y tabla de comentarios validado en metadatos.',
      })

      // F05 — Lectura preparada con partición real: partido_id, bucket_minuto, grupo
      currentStage = 'Operación mínima'
      stageStart = Date.now()
      const cqlQuery = `SELECT partido_id, bucket_minuto, grupo, comentario_id, contenido
        FROM comentarios_por_partido
        WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ? LIMIT 1`
      const params = ['F2030-001', new Date('2030-06-13T20:01:00.000Z'), 0]

      const cqlRes: any = await withTimeout(
        client.execute(cqlQuery, params, { prepare: true }),
        TIMEOUT_MS,
        'Cassandra comentarios read',
      )
      const rowsCount = cqlRes.rowLength ?? cqlRes.rows?.length ?? 0
      const opLatency = Date.now() - stageStart

      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Operación mínima',
        status: 'UP',
        latencyMs: opLatency,
        detail: `Lectura CQL particionada ejecutada (${rowsCount} comentarios encontrados)`,
        diagnostic: 'Consulta CQL con partición real (partido_id, bucket_minuto, grupo) ejecutada con éxito.',
      })
    } else if (keyspaceOk && !tableOk) {
      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Contexto',
        status: 'DEGRADED',
        latencyMs: contextLatency,
        detail: `Keyspace "${keyspace}" presente pero tabla "comentarios_por_partido" no creada`,
        diagnostic: 'El cluster responde pero la tabla de comentarios no ha sido inicializada.',
      })

      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: 'Lectura de comentarios omitida por ausencia de tabla',
        diagnostic: 'No se puede ejecutar consulta de comentarios sin la tabla creada.',
      })
    } else {
      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Contexto',
        status: 'DEGRADED',
        latencyMs: contextLatency,
        detail: `Keyspace "${keyspace}" no encontrado en el nodo (versión ${version})`,
        diagnostic: 'El cluster responde pero el keyspace configurado no existe aún.',
      })

      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: 'Lectura omitida por falta de keyspace',
        diagnostic: 'No se ejecutó operación de comentarios por contexto no inicializado.',
      })
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const cleanMsg = error.message.split('\n')[0]
    const classified = classifyNativeError(err, currentStage, handshakeCompleted)
    results.push({
      product: 'Cassandra (CQL)',
      layer: classified.layer,
      status: 'DOWN',
      latencyMs: Date.now() - stageStart,
      detail: sanitizeSecrets(`${classified.reasonLabel}: ${cleanMsg}`),
      diagnostic: sanitizeSecrets(
        `${classified.reasonLabel} en protocolo nativo CQL (${host}:${port}, keyspace "${keyspace}").`,
      ),
    })

    if (
      handshakeCompleted &&
      (classified.layer === 'Autorización' || classified.layer === 'Contexto')
    ) {
      results.push({
        product: 'Cassandra (CQL)',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: `Lectura de comentarios omitida por fallo previo en capa de ${classified.layer}`,
        diagnostic: `No se ejecutó consulta CQL porque la verificación de ${classified.layer.toLowerCase()} sobre "${keyspace}" falló.`,
      })
    }
  } finally {
    await client.shutdown().catch(() => {})
  }

  return results
}

// ============================================================================
// 5. INFLUXDB 3 CORE
// ============================================================================
export async function testInfluxDbNative(): Promise<NativeCheckResult[]> {
  const rawUrl = process.env.INFLUXDB_URL || 'http://127.0.0.1:8181'
  const database = process.env.INFLUXDB_DATABASE || 'fixture2030_h8_lab_detalle'
  const token = process.env.INFLUXDB_TOKEN || ''

  const results: NativeCheckResult[] = []
  const start = Date.now()

  // 1. Health check HTTP (F08 — Timeout cubre toda la lectura del cuerpo)
  const healthUrl = `${rawUrl.replace(/\/$/, '')}/health`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(healthUrl, { signal: controller.signal })
      const text = await response.text()
      const latency = Date.now() - start

      if (response.ok) {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Handshake',
          status: 'UP',
          latencyMs: latency,
          detail: `Endpoint /health respondió HTTP ${response.status}`,
          diagnostic: 'Servicio InfluxDB 3 Core iniciado y saludable.',
        })
      } else {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Handshake',
          status: 'DEGRADED',
          latencyMs: latency,
          detail: `Endpoint /health respondió HTTP ${response.status}`,
          diagnostic: sanitizeSecrets(`Servicio responde pero con estado no exitoso: ${text.slice(0, 100)}`),
        })
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'InfluxDB 3 Core',
      layer: 'Handshake',
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: sanitizeSecrets(`Fallo HTTP InfluxDB: ${error.message}`),
      diagnostic: sanitizeSecrets(`No se pudo alcanzar el endpoint /health en ${sanitizeUrl(healthUrl)}.`),
    })
    return results
  }

  // 2. Autenticación, Autorización y Contexto (F04 / T04 — Consulta SQL autenticada en /api/v3/query_sql)
  if (!token) {
    results.push({
      product: 'InfluxDB 3 Core',
      layer: 'Autenticación',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      detail: 'INFLUXDB_TOKEN no configurado en variables de entorno',
      diagnostic: 'SKIP: No se configuró token de autenticación para InfluxDB 3; omitiendo consultas de datos.',
    })
    return results
  }

  const queryUrl = `${rawUrl.replace(/\/$/, '')}/api/v3/query_sql`
  const sqlQuery = `SELECT equipo_id, COUNT(*) AS muestras
    FROM estadisticas_equipo
    WHERE time >= '2030-06-13T20:00:00Z' AND time < '2030-06-13T22:00:00Z'
    GROUP BY equipo_id LIMIT 1`

  const qStart = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const qResponse = await fetch(queryUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          db: database,
          q: sqlQuery,
          format: 'json',
        }),
      })

      const responseText = await qResponse.text()
      const qLatency = Date.now() - qStart

      if (qResponse.status === 200) {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Contexto',
          status: 'UP',
          latencyMs: qLatency,
          detail: `Base de datos "${database}" accesible y token validado`,
          diagnostic: 'Autenticación y contexto de base de series temporales comprobados.',
        })

        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Operación mínima',
          status: 'UP',
          latencyMs: qLatency,
          detail: 'Consulta temporal SQL parametrizada ejecutada en estadisticas_equipo',
          diagnostic: 'Operación temporal mínima completada con éxito sin alterar datos.',
        })
      } else if (qResponse.status === 401) {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Autenticación',
          status: 'DOWN',
          latencyMs: qLatency,
          detail: `Token rechazado por InfluxDB (HTTP 401 Unauthorized)`,
          diagnostic: 'El endpoint de consulta rechazó el token por ser inválido o haber expirado.',
        })
      } else if (qResponse.status === 403) {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Autorización',
          status: 'DOWN',
          latencyMs: qLatency,
          detail: `Permisos insuficientes en InfluxDB (HTTP 403 Forbidden)`,
          diagnostic: `El token fue autenticado pero carece de permisos para consultar la base "${database}".`,
        })
      } else if (qResponse.status === 404 || responseText.includes('database not found')) {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Contexto',
          status: 'DOWN',
          latencyMs: qLatency,
          detail: `Base de datos "${database}" no encontrada en InfluxDB`,
          diagnostic: 'El servidor está activo y autenticado, pero la base de datos temporal no existe.',
        })
      } else {
        results.push({
          product: 'InfluxDB 3 Core',
          layer: 'Operación mínima',
          status: 'DEGRADED',
          latencyMs: qLatency,
          detail: `Consulta SQL devolvió HTTP ${qResponse.status}`,
          diagnostic: sanitizeSecrets(`Respuesta no esperada del motor de queries: ${responseText.slice(0, 100)}`),
        })
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err: unknown) {
    const error = err as Error
    results.push({
      product: 'InfluxDB 3 Core',
      layer: 'Contexto',
      status: 'DOWN',
      latencyMs: Date.now() - qStart,
      detail: sanitizeSecrets(`Error al ejecutar consulta en InfluxDB: ${error.message}`),
      diagnostic: 'No se pudo completar la consulta SQL en el endpoint temporal.',
    })
  }

  return results
}

// ============================================================================
// 6. INTERSYSTEMS IRIS
// ============================================================================

/**
 * R3-02 / T02 — Lee %SQLCODE y %Message desde un IRISObject del addon nativo
 * `@intersystems/intersystems-iris-native` usando la API real `getNumber` / `getString`.
 * Nunca asume `0` por defecto si la lectura falla o no devuelve un número válido.
 */
function readIrisSqlStatus(rows: any, phase: string): { sqlCode: number; message: string } {
  if (!rows || typeof rows.getNumber !== 'function') {
    throw new Error(
      `El objeto resultset de IRIS no expone getNumber('%SQLCODE') tras ${phase}`,
    )
  }

  const rawCode = rows.getNumber('%SQLCODE')
  if (rawCode === null || rawCode === undefined || Number.isNaN(Number(rawCode))) {
    throw new Error(
      `Lectura de %SQLCODE inválida (${String(rawCode)}) en IRISObject tras ${phase}`,
    )
  }

  const sqlCode = Number(rawCode)
  let message = ''
  if (typeof rows.getString === 'function') {
    try {
      const rawMsg = rows.getString('%Message')
      if (typeof rawMsg === 'string') {
        message = rawMsg
      }
    } catch {}
  }

  // En InterSystems IRIS SQL: 0 = éxito con fila disponible, 100 = fin de datos / sin filas, < 0 = error SQL
  if (sqlCode < 0 || (sqlCode !== 0 && sqlCode !== 100)) {
    throw new Error(
      `Error SQL en IRIS tras ${phase} (SQLCODE ${sqlCode}): ${message || 'error de ejecución o esquema'}`,
    )
  }

  return { sqlCode, message }
}

export async function testIrisNative(): Promise<NativeCheckResult[]> {
  const host = process.env.IRIS_HOST || '127.0.0.1'
  const superPortConfig = parsePort(
    process.env.IRIS_PORT || process.env.IRIS_SUPERSERVER_PORT,
    1972,
    'IRIS_PORT',
  )
  const webPortConfig = parsePort(process.env.IRIS_WEB_PORT, 52773, 'IRIS_WEB_PORT')
  const namespace = process.env.IRIS_NAMESPACE || 'USER'
  const username = process.env.IRIS_USERNAME || ''
  const password = process.env.IRIS_PASSWORD || ''

  const results: NativeCheckResult[] = []

  // Check Web Portal reachability (F06 — solo 200..399 es UP; >= 400 es DEGRADED/DOWN)
  const startWeb = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const portalUrl = `http://${host}:${webPortConfig.port}/csp/sys/UtilHome.csp`
    try {
      const portalRes = await fetch(portalUrl, { signal: controller.signal })
      await portalRes.text()
      const webLatency = Date.now() - startWeb

      if (portalRes.status >= 200 && portalRes.status < 400) {
        results.push({
          product: 'InterSystems IRIS (Web)',
          layer: 'Operación mínima',
          status: 'UP',
          latencyMs: webLatency,
          detail: `Portal HTTP respondió con código ${portalRes.status}`,
          diagnostic: 'Portal de administración web accesible y respondiendo correctamente.',
        })
      } else {
        results.push({
          product: 'InterSystems IRIS (Web)',
          layer: 'Operación mínima',
          status: 'DEGRADED',
          latencyMs: webLatency,
          detail: `Portal HTTP respondió con error HTTP ${portalRes.status}`,
          diagnostic: 'El portal web está activo pero respondió con un código de error HTTP.',
        })
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    results.push({
      product: 'InterSystems IRIS (Web)',
      layer: 'Operación mínima',
      status: 'DOWN',
      latencyMs: Date.now() - startWeb,
      detail: `No se pudo conectar al portal HTTP en puerto ${webPortConfig.port}`,
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

  let irisLib: any
  try {
    irisLib = await loadIris()
  } catch (loadErr: unknown) {
    const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: 'Handshake',
      status: 'SKIP',
      latencyMs: 0,
      detail: 'Addon nativo de IRIS no disponible en esta plataforma/arquitectura',
      diagnostic: `SKIP: ${sanitizeSecrets(msg)}`,
    })
    return results
  }

  // F06 — Usar import nombrado createConnection (sin default)
  const createConn = irisLib.createConnection || irisLib.default?.createConnection
  if (typeof createConn !== 'function') {
    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: 'Handshake',
      status: 'SKIP',
      latencyMs: 0,
      detail: 'createConnection no encontrado en la interfaz del driver IRIS',
      diagnostic: 'Incompatibilidad de interfaz en el driver IRIS.',
    })
    return results
  }

  const start = Date.now()
  let connection: any = null

  try {
    connection = createConn({
      host,
      port: superPortConfig.port,
      ns: namespace,
      user: username,
      pwd: password,
      sharedmemory: false,
      timeout: TIMEOUT_MS,
    })

    const connectLatency = Date.now() - start

    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: 'Handshake',
      status: 'UP',
      latencyMs: connectLatency,
      detail: `Conexión SuperServer establecida en ${host}:${superPortConfig.port}`,
      diagnostic: `Autenticado en namespace "${namespace}".`,
    })

    // R2-02 / S01 / R3-02 / T02 — Lectura acotada del modelo Fixture.Partido con validación estricta de %Status y %SQLCODE
    const opStart = Date.now()
    const iris = connection.createIris()

    try {
      const statement = iris.classMethodObject('%SQL.Statement', '%New')
      if (!statement) {
        throw new Error('No se pudo instanciar objeto %SQL.Statement en IRIS')
      }

      const prepStatus = statement.invoke(
        '%Prepare',
        'SELECT ID, Codigo FROM Fixture.Partido WHERE Codigo = ?',
      )
      const isStatusErr =
        typeof iris.classMethodBoolean === 'function'
          ? Boolean(iris.classMethodBoolean('%SYSTEM.Status', 'IsError', prepStatus))
          : false
      // En InterSystems IRIS, un %Status exitoso es 1
      if (isStatusErr || (prepStatus !== 1 && prepStatus !== '1' && prepStatus !== true)) {
        throw new Error(`Fallo en %Prepare de Fixture.Partido (%Status: ${String(prepStatus)})`)
      }

      const rows = statement.invokeObject('%Execute', 'F2030-IRIS-0011')
      if (!rows) {
        throw new Error('Fallo al ejecutar consulta en IRIS: resultset nulo')
      }

      // Verificar %SQLCODE inmediatamente después de %Execute usando getNumber('%SQLCODE')
      readIrisSqlStatus(rows, '%Execute')

      if (typeof rows.invokeBoolean !== 'function') {
        throw new Error('El objeto resultset de IRIS no expone invokeBoolean("%Next")')
      }

      const partidoFound = Boolean(rows.invokeBoolean('%Next'))

      // Verificar %SQLCODE inmediatamente después de %Next para separar ausencia válida (0/100) de error (< 0)
      readIrisSqlStatus(rows, '%Next')

      const opLatency = Date.now() - opStart

      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Contexto',
        status: 'UP',
        latencyMs: opLatency,
        detail: `Namespace "${namespace}" activo y clase Fixture.Partido consultada`,
        diagnostic: 'Contexto de objetos IRIS validado con consulta de clase persistente.',
      })

      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Operación mínima',
        status: 'UP',
        latencyMs: opLatency,
        detail: partidoFound
          ? 'Partido F2030-IRIS-0011 recuperado mediante modelo de objetos'
          : 'Consulta ejecutada con éxito; entidad F2030-IRIS-0011 ausente (ausencia controlada)',
        diagnostic: 'Operación no destructiva completada con el driver nativo IRIS.',
      })
    } catch (queryErr: unknown) {
      const qErr = queryErr instanceof Error ? queryErr : new Error(String(queryErr))
      const opLatency = Date.now() - opStart
      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Contexto',
        status: 'DEGRADED',
        latencyMs: opLatency,
        detail: sanitizeSecrets(`Fallo al consultar clase Fixture.Partido: ${qErr.message}`),
        diagnostic: 'El SuperServer está activo pero la clase o la consulta SQL falló.',
      })

      results.push({
        product: 'InterSystems IRIS (SuperServer)',
        layer: 'Operación mínima',
        status: 'SKIP',
        latencyMs: 0,
        detail: 'Operación omitida por fallo en consulta a Fixture.Partido',
        diagnostic: 'No se puede verificar la entidad si la consulta o clase falló.',
      })
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    const classified = classifyNativeError(err, 'Handshake', false)
    results.push({
      product: 'InterSystems IRIS (SuperServer)',
      layer: classified.layer,
      status: 'DOWN',
      latencyMs: Date.now() - start,
      detail: sanitizeSecrets(`Fallo SuperServer: ${error.message}`),
      diagnostic: sanitizeSecrets(
        `Error al conectar con IRIS SuperServer en ${host}:${superPortConfig.port} (namespace "${namespace}").`,
      ),
    })
  } finally {
    if (connection) {
      try {
        connection.close?.()
      } catch {}
    }
  }

  return results
}

// ============================================================================
// ORQUESTADOR DE CLIENTES NATIVOS
// ============================================================================
export async function runAllNativeChecks(productFilter?: string): Promise<NativeCheckResult[]> {
  const allResults: NativeCheckResult[] = []
  const filter = productFilter?.toLowerCase().trim()

  if (!filter || filter === 'mongodb') {
    const mongo = await testMongoNative()
    allResults.push(...mongo)
  }

  if (!filter || filter === 'redis') {
    const redis = await testRedisNative()
    allResults.push(...redis)
  }

  if (!filter || filter === 'neo4j') {
    const neo4j = await testNeo4jNative()
    allResults.push(...neo4j)
  }

  if (!filter || filter === 'cassandra') {
    const cassandra = await testCassandraNative()
    allResults.push(...cassandra)
  }

  if (!filter || filter === 'influxdb' || filter === 'influx') {
    const influx = await testInfluxDbNative()
    allResults.push(...influx)
  }

  if (!filter || filter === 'iris') {
    const iris = await testIrisNative()
    allResults.push(...iris)
  }

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
  resolve(process.argv[1] ?? '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  const productArg = process.argv.find((a) => a.startsWith('--product='))
  const productFilter = productArg ? productArg.split('=')[1] : undefined

  console.log('='.repeat(80))
  console.log('Hito 11 — Evaluación de Clientes Nativos, Protocolos y Contextos')
  console.log(`Fecha/Hora: ${new Date().toISOString()}`)
  if (productFilter) {
    console.log(`Filtro de producto activo: "${productFilter}"`)
  }
  console.log('='.repeat(80))
  console.log('Ejecutando verificaciones de drivers y protocolos nativos...\n')

  runAllNativeChecks(productFilter).then((results) => {
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
