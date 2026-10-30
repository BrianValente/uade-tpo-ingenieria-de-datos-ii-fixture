import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMongo, loadNeo4j, loadRedis } from '../../hito-11-conectividad/scripts/driver_loader.js'
import {
  generateSyntheticH12Events,
  generateVirtualUserSessions,
} from '../datos-o-generadores/generador_escenario.js'
import { loadLocalEnvironment } from './entorno_y_recursos.js'

export interface DataPreparationSummary {
  preparedAt: string
  mongodb: {
    database: string
    equiposCount: number
    jugadoresCount: number
  }
  neo4j: {
    equiposNodes: number
    jugadoresNodes: number
    partidosNodes: number
    sedesNodes: number
    canonicalEventosNodes: number
    h12SyntheticEventosNodes: number
    totalEventosNodes: number
  }
  redis: {
    scope: string
    virtualSessionsSeeded: number
    cacheKeysCleared: number
  }
}

export async function prepareTestData(): Promise<DataPreparationSummary> {
  const env = await loadLocalEnvironment()
  const mongoHost = env.MONGO_HOST ?? '127.0.0.1'
  const mongoPort = Number(env.MONGO_PORT ?? 27017)
  const mongoDbName = env.MONGO_DATABASE ?? 'fixture2030'
  const mongoUser = env.MONGO_ROOT_USERNAME ?? 'admin'
  const mongoPassword = env.MONGO_ROOT_PASSWORD ?? ''

  const neo4jHost = env.NEO4J_HOST ?? '127.0.0.1'
  const neo4jPort = Number(env.NEO4J_BOLT_PORT ?? 7687)
  const neo4jUser = env.NEO4J_USERNAME ?? 'neo4j'
  const neo4jPassword = env.NEO4J_PASSWORD ?? ''

  const redisHost = env.REDIS_HOST ?? '127.0.0.1'
  const redisPort = Number(env.REDIS_PORT ?? 6379)
  const redisScope = env.H12_REDIS_SCOPE ?? 'h12-bench'
  const extraEventsPerMatch = Number(env.H12_EXTRA_EVENTS_PER_MATCH ?? 10)
  const virtualSessionsCount = Number(env.H12_VIRTUAL_SESSIONS ?? 20)
  const seed = Number(env.H12_SEED ?? 203012)

  // 1. Verificar MongoDB
  const MongoClient = await loadMongo()
  const mongoClient = new MongoClient(`mongodb://${mongoHost}:${mongoPort}`, {
    appName: 'fixture2030-hito12-prep',
    ...(mongoUser
      ? {
          auth: { username: mongoUser, password: mongoPassword },
          authSource: env.MONGO_AUTH_SOURCE ?? 'admin',
        }
      : {}),
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  })

  let equiposCount = 0
  let jugadoresCount = 0
  try {
    await mongoClient.connect()
    const db = mongoClient.db(mongoDbName)
    equiposCount = await db
      .collection('equipos')
      .countDocuments({ participaFixture2030: true })
    jugadoresCount = await db.collection('jugadores').countDocuments({})
    if (equiposCount !== 64 || jugadoresCount < 1536) {
      throw new Error(
        `Dataset documental incompleto en MongoDB: equipos=${equiposCount} (esperado 64), jugadores=${jugadoresCount} (esperado >=1536).`,
      )
    }
  } finally {
    await mongoClient.close().catch(() => undefined)
  }

  // 2. Preparar y ampliar subgrafo de Neo4j con lote sintético HITO_12
  const neo4j = await loadNeo4j()
  const driver = neo4j.driver(
    `neo4j://${neo4jHost}:${neo4jPort}`,
    neo4j.auth.basic(neo4jUser, neo4jPassword),
    { connectionTimeout: 5000 },
  )

  const syntheticEvents = generateSyntheticH12Events(extraEventsPerMatch)
  let equiposNodes = 0
  let jugadoresNodes = 0
  let partidosNodes = 0
  let sedesNodes = 0
  let canonicalEventosNodes = 0
  let h12SyntheticEventosNodes = 0
  let totalEventosNodes = 0

  try {
    await driver.executeQuery(
      `
      UNWIND $events AS ev
      MATCH (p:Partido {id: ev.matchId})
      MATCH (j:Jugador {equipoCodigo: ev.teamCode, dorsal: toInteger(ev.dorsal)})
      MERGE (e:Evento {id: ev.id})
      SET e.tipo = ev.type,
          e.minuto = toInteger(ev.minute),
          e.detalle = ev.detail,
          e.datosSinteticos = true,
          e.lotePrueba = ev.lotePrueba
      MERGE (e)-[:OCURRE_EN]->(p)
      MERGE (e)-[r:INVOLUCRA]->(j)
      SET r.rol = 'protagonista'
      `,
      { events: syntheticEvents },
    )

    const countsRes = await driver.executeQuery(`
      CALL () { MATCH (eq:Equipo) RETURN count(eq) AS eqCount }
      CALL () { MATCH (jg:Jugador) RETURN count(jg) AS jgCount }
      CALL () { MATCH (pa:Partido) RETURN count(pa) AS paCount }
      CALL () { MATCH (se:Sede) RETURN count(se) AS seCount }
      CALL () {
        MATCH (ev:Evento)
        RETURN count(ev) AS totalEv,
               sum(CASE WHEN ev.lotePrueba = 'HITO_12' THEN 1 ELSE 0 END) AS h12Ev
      }
      RETURN eqCount, jgCount, paCount, seCount, totalEv, h12Ev
    `)
    const rec = countsRes.records[0]
    if (rec) {
      const toNum = (v: unknown) =>
        typeof v === 'number'
          ? v
          : v && typeof (v as { toNumber?: () => number }).toNumber === 'function'
            ? (v as { toNumber: () => number }).toNumber()
            : Number(v)
      equiposNodes = toNum(rec.get('eqCount'))
      jugadoresNodes = toNum(rec.get('jgCount'))
      partidosNodes = toNum(rec.get('paCount'))
      sedesNodes = toNum(rec.get('seCount'))
      totalEventosNodes = toNum(rec.get('totalEv'))
      h12SyntheticEventosNodes = toNum(rec.get('h12Ev'))
      canonicalEventosNodes = totalEventosNodes - h12SyntheticEventosNodes
    }
  } finally {
    await driver.close().catch(() => undefined)
  }

  // 3. Sembrar sesiones virtuales en Redis y limpiar caché previo del alcance H12
  const createClient = await loadRedis()
  const redisClient = createClient({
    socket: { host: redisHost, port: redisPort, connectTimeout: 5000 },
  })
  let virtualSessionsSeeded = 0
  let cacheKeysCleared = 0

  try {
    await redisClient.connect()
    // Limpiar claves de caché previas del alcance H12 mediante SCAN (sin KEYS ni FLUSHDB)
    let cursor = '0'
    do {
      const reply = await redisClient.scan(cursor, {
        MATCH: 'fixture2030:h12:cache:*',
        COUNT: 100,
      })
      cursor = String(reply.cursor)
      if (reply.keys.length > 0) {
        await redisClient.del(reply.keys)
        cacheKeysCleared += reply.keys.length
      }
    } while (cursor !== '0')

    const sessions = generateVirtualUserSessions(virtualSessionsCount, seed)
    const nowEpoch = `${Math.floor(Date.now() / 1000)}.000000`
    for (const s of sessions) {
      const key = `fixture2030:h10:${redisScope}:sesion:${s.tokenDigest}`
      await redisClient.hSet(key, {
        sesion_id: s.tokenDigest,
        usuario_id: s.userId,
        username: s.username,
        rol: s.role,
        estado_acceso: 'autorizado',
        creada_en: nowEpoch,
        ultima_actividad: nowEpoch,
      })
      await redisClient.expire(key, 1800)
      virtualSessionsSeeded++
    }
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit().catch(() => redisClient.destroy())
    }
  }

  return {
    preparedAt: new Date().toISOString(),
    mongodb: {
      database: mongoDbName,
      equiposCount,
      jugadoresCount,
    },
    neo4j: {
      equiposNodes,
      jugadoresNodes,
      partidosNodes,
      sedesNodes,
      canonicalEventosNodes,
      h12SyntheticEventosNodes,
      totalEventosNodes,
    },
    redis: {
      scope: redisScope,
      virtualSessionsSeeded,
      cacheKeysCleared,
    },
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  prepareTestData()
    .then((summary) => {
      console.log('='.repeat(76))
      console.log('Hito 12 — Preparación Reproducible de Datos de Prueba (RF3, RNF7, RNF11)')
      console.log('='.repeat(76))
      console.log(JSON.stringify(summary, null, 2))
    })
    .catch((err: unknown) => {
      console.error(
        'Error al preparar datos de prueba:',
        err instanceof Error ? err.message : String(err),
      )
      process.exit(1)
    })
}
