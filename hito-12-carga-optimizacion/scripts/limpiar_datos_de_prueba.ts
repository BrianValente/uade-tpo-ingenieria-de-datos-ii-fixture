import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadNeo4j,
  loadRedis,
} from '../../hito-11-conectividad/scripts/driver_loader.js'
import { loadLocalEnvironment } from './entorno_y_recursos.js'

/**
 * Limpieza segura y no destructiva de los datos de prueba del Hito 12 (RNF11).
 * Elimina únicamente:
 * 1. Nodos (:Evento {lotePrueba: 'HITO_12'}) en Neo4j, preservando los 64 eventos canónicos del Hito 5.
 * 2. Claves de sesión de usuarios virtuales `fixture2030:h10:h12-bench:sesion:*` en Redis.
 * 3. Claves de caché `fixture2030:h12:cache:*` en Redis.
 * No ejecuta FLUSHDB, FLUSHALL ni borra volúmenes o colecciones canónicas.
 */
export async function cleanTestData() {
  const env = await loadLocalEnvironment()
  const neo4jHost = env.NEO4J_HOST ?? '127.0.0.1'
  const neo4jPort = Number(env.NEO4J_BOLT_PORT ?? 7687)
  const neo4jUser = env.NEO4J_USERNAME ?? 'neo4j'
  const neo4jPassword = env.NEO4J_PASSWORD ?? ''

  const redisHost = env.REDIS_HOST ?? '127.0.0.1'
  const redisPort = Number(env.REDIS_PORT ?? 6379)
  const redisScope = env.H12_REDIS_SCOPE ?? 'h12-bench'

  let neo4jDeletedEvents = 0
  let neo4jRemainingCanonicalEvents = 0

  const neo4j = await loadNeo4j()
  const driver = neo4j.driver(
    `neo4j://${neo4jHost}:${neo4jPort}`,
    neo4j.auth.basic(neo4jUser, neo4jPassword),
    { connectionTimeout: 5000 },
  )

  try {
    const delRes = await driver.executeQuery(`
      MATCH (e:Evento {lotePrueba: 'HITO_12'})
      WITH collect(e) AS targetNodes, count(e) AS deletedCount
      FOREACH (n IN targetNodes | DETACH DELETE n)
      RETURN deletedCount
    `)
    const rawDel = delRes.records[0]?.get('deletedCount')
    neo4jDeletedEvents =
      typeof rawDel === 'number'
        ? rawDel
        : rawDel && typeof (rawDel as { toNumber?: () => number }).toNumber === 'function'
          ? (rawDel as { toNumber: () => number }).toNumber()
          : Number(rawDel ?? 0)

    const remRes = await driver.executeQuery(
      `MATCH (e:Evento) RETURN count(e) AS remaining`,
    )
    const rawRem = remRes.records[0]?.get('remaining')
    neo4jRemainingCanonicalEvents =
      typeof rawRem === 'number'
        ? rawRem
        : rawRem && typeof (rawRem as { toNumber?: () => number }).toNumber === 'function'
          ? (rawRem as { toNumber: () => number }).toNumber()
          : Number(rawRem ?? 0)
  } finally {
    await driver.close().catch(() => undefined)
  }

  let redisSessionsRemoved = 0
  let redisCacheRemoved = 0

  const createRedisClient = await loadRedis()
  const redisClient = createRedisClient({
    socket: { host: redisHost, port: redisPort, connectTimeout: 5000 },
  })

  try {
    await redisClient.connect()
    for (const pattern of [
      `fixture2030:h10:${redisScope}:sesion:*`,
      'fixture2030:h12:cache:*',
    ]) {
      let cursor = '0'
      do {
        const reply = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        })
        cursor = String(reply.cursor)
        if (reply.keys.length > 0) {
          await redisClient.del(reply.keys)
          if (pattern.includes(':sesion:')) {
            redisSessionsRemoved += reply.keys.length
          } else {
            redisCacheRemoved += reply.keys.length
          }
        }
      } while (cursor !== '0')
    }
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit().catch(() => redisClient.destroy())
    }
  }

  return {
    cleanedAt: new Date().toISOString(),
    neo4j: {
      deletedH12SyntheticEvents: neo4jDeletedEvents,
      remainingCanonicalEvents: neo4jRemainingCanonicalEvents,
    },
    redis: {
      removedVirtualSessions: redisSessionsRemoved,
      removedCacheEntries: redisCacheRemoved,
    },
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  cleanTestData()
    .then((res) => {
      console.log('='.repeat(76))
      console.log('Hito 12 — Limpieza Segura y No Destructiva de Datos de Prueba (RNF11)')
      console.log('='.repeat(76))
      console.log(JSON.stringify(res, null, 2))
    })
    .catch((err: unknown) => {
      console.error(
        'Error al limpiar datos de prueba:',
        err instanceof Error ? err.message : String(err),
      )
      process.exit(1)
    })
}
