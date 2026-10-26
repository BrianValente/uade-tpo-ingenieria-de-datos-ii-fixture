import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadMongo,
  loadNeo4j,
  loadRedis,
} from '../../hito-11-conectividad/scripts/driver_loader.js'
import type { LoadExecutionReport } from './ejecutar_carga.js'
import { HITO12_ROOT, loadLocalEnvironment } from './entorno_y_recursos.js'

export interface IntegrityCheckItem {
  id: string
  category: string
  description: string
  expected: string
  observed: string
  passed: boolean
}

export interface IntegrityValidationReport {
  validatedAt: string
  allChecksPassed: boolean
  totalChecks: number
  passedChecks: number
  failedChecks: number
  checks: IntegrityCheckItem[]
}

export async function validateDataIntegrity(): Promise<IntegrityValidationReport> {
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

  const checks: IntegrityCheckItem[] = []

  // 1. Validación en MongoDB
  const MongoClient = await loadMongo()
  const mongoClient = new MongoClient(`mongodb://${mongoHost}:${mongoPort}`, {
    appName: 'fixture2030-hito12-integrity',
    ...(mongoUser
      ? {
          auth: { username: mongoUser, password: mongoPassword },
          authSource: env.MONGO_AUTH_SOURCE ?? 'admin',
        }
      : {}),
    connectTimeoutMS: 5000,
  })

  const mongoTeamMap = new Map<string, { id: string; name: string }>()
  try {
    await mongoClient.connect()
    const db = mongoClient.db(mongoDbName)
    const teams = (await db
      .collection('equipos')
      .find({ participaFixture2030: true })
      .toArray()) as Record<string, unknown>[]
    const uniqueTeamCodes = new Set(teams.map((t: Record<string, unknown>) => String(t.codigo)))
    for (const t of teams) {
      mongoTeamMap.set(String(t.codigo), {
        id: String(t._id),
        name: String(t.nombre),
      })
    }

    checks.push({
      id: 'INT-01',
      category: 'MongoDB Documental',
      description: 'Unicidad y conteo de equipos participantes (sin duplicados ni pérdidas)',
      expected: '64 equipos, 64 códigos únicos',
      observed: `${teams.length} equipos, ${uniqueTeamCodes.size} códigos únicos`,
      passed: teams.length === 64 && uniqueTeamCodes.size === 64,
    })

    const squadAgg = (await db
      .collection('jugadores')
      .aggregate([
        {
          $group: {
            _id: '$equipoCodigo',
            count: { $sum: 1 },
            minDorsal: { $min: '$dorsal' },
            maxDorsal: { $max: '$dorsal' },
            minHeight: { $min: '$alturaCm' },
            maxHeight: { $max: '$alturaCm' },
          },
        },
      ])
      .toArray()) as Record<string, unknown>[]

    const totalPlayers = squadAgg.reduce(
      (acc: number, s: Record<string, unknown>) => acc + Number(s.count),
      0,
    )
    const allSquadsHave24 =
      squadAgg.length === 64 &&
      squadAgg.every((s: Record<string, unknown>) => Number(s.count) === 24)
    const rangesValid = squadAgg.every(
      (s: Record<string, unknown>) =>
        Number(s.minDorsal) >= 1 &&
        Number(s.maxDorsal) <= 99 &&
        Number(s.minHeight) >= 150 &&
        Number(s.maxHeight) <= 220,
    )

    checks.push({
      id: 'INT-02',
      category: 'MongoDB Documental',
      description: 'Conteo exacto por plantel (24 jugadores/equipo) y rangos de atributos (dorsal 1..99, altura 150..220 cm)',
      expected: '1536 jugadores totales, 64 planteles de 24, rangos válidos=true',
      observed: `${totalPlayers} jugadores totales, 64 planteles de 24=${allSquadsHave24}, rangos válidos=${rangesValid}`,
      passed: totalPlayers === 1536 && allSquadsHave24 && rangesValid,
    })
  } finally {
    await mongoClient.close().catch(() => undefined)
  }

  // 2. Validación en Neo4j y consistencia cruzada con MongoDB
  const neo4j = await loadNeo4j()
  const neoDriver = neo4j.driver(
    `neo4j://${neo4jHost}:${neo4jPort}`,
    neo4j.auth.basic(neo4jUser, neo4jPassword),
    { connectionTimeout: 5000 },
  )

  const neoMatchMap = new Map<
    string,
    { homeCode: string; awayCode: string; venueId: string }
  >()
  try {
    const graphTeamsRes = await neoDriver.executeQuery(
      `MATCH (e:Equipo) RETURN e.codigo AS codigo, e.id AS id`,
    )
    let crossMatches = 0
    for (const r of graphTeamsRes.records) {
      const code = String(r.get('codigo'))
      const id = String(r.get('id'))
      if (mongoTeamMap.get(code)?.id === id) crossMatches++
    }
    checks.push({
      id: 'INT-03',
      category: 'Consistencia Cruzada MongoDB <-> Neo4j',
      description: 'Correspondencia 1 a 1 de UUID v5 entre equipos de MongoDB y nodos :Equipo de Neo4j',
      expected: '64 coincidencias exactas de UUID v5',
      observed: `${crossMatches} coincidencias exactas de UUID v5`,
      passed: crossMatches === 64,
    })

    const eventsAggRes = await neoDriver.executeQuery(`
      MATCH (p:Partido)
      OPTIONAL MATCH (e:Evento)-[:OCURRE_EN]->(p)
      WITH p.id AS partidoId,
           count(e) AS totalEv,
           sum(CASE WHEN e.lotePrueba = 'HITO_12' THEN 1 ELSE 0 END) AS h12Ev
      RETURN count(partidoId) AS partidosCount,
             sum(totalEv) AS sumaEventos,
             sum(h12Ev) AS sumaH12,
             min(totalEv) AS minPorPartido,
             max(totalEv) AS maxPorPartido
    `)
    const evRec = eventsAggRes.records[0]
    const toNum = (v: unknown) =>
      typeof v === 'number'
        ? v
        : v && typeof (v as { toNumber?: () => number }).toNumber === 'function'
          ? (v as { toNumber: () => number }).toNumber()
          : Number(v)

    const partidosCount = toNum(evRec?.get('partidosCount'))
    const sumaEventos = toNum(evRec?.get('sumaEventos'))
    const sumaH12 = toNum(evRec?.get('sumaH12'))
    const minPorPartido = toNum(evRec?.get('minPorPartido'))
    const maxPorPartido = toNum(evRec?.get('maxPorPartido'))

    // Aceptamos tanto el estado con lote H12 (384 eventos, 12/partido) como el estado limpio post-limpieza (64 eventos, 2/partido)
    const validEventState =
      partidosCount === 32 &&
      ((sumaEventos === 384 &&
        sumaH12 === 320 &&
        minPorPartido === 12 &&
        maxPorPartido === 12) ||
        (sumaEventos === 64 &&
          sumaH12 === 0 &&
          minPorPartido === 2 &&
          maxPorPartido === 2))

    checks.push({
      id: 'INT-04',
      category: 'Neo4j Grafo',
      description: 'Integridad de conteos y distribución de eventos por partido (sin duplicados ni eventos huérfanos)',
      expected: '32 partidos; 384 eventos (12/partido con lote H12) o 64 eventos (2/partido limpio)',
      observed: `${partidosCount} partidos; ${sumaEventos} eventos (${sumaH12} H12; min=${minPorPartido}, max=${maxPorPartido} por partido)`,
      passed: validEventState,
    })

    const matchDetailsRes = await neoDriver.executeQuery(`
      MATCH (local:Equipo)-[:DISPUTA {condicion: 'local'}]->(p:Partido)
      MATCH (visitante:Equipo)-[:DISPUTA {condicion: 'visitante'}]->(p)
      MATCH (p)-[:SE_JUEGA_EN]->(s:Sede)
      RETURN p.id AS id, local.codigo AS homeCode, visitante.codigo AS awayCode, s.id AS venueId
    `)
    for (const r of matchDetailsRes.records) {
      neoMatchMap.set(String(r.get('id')), {
        homeCode: String(r.get('homeCode')),
        awayCode: String(r.get('awayCode')),
        venueId: String(r.get('venueId')),
      })
    }
  } finally {
    await neoDriver.close().catch(() => undefined)
  }

  // 3. Validación de Proyecciones en Caché y Sesiones en Redis
  const createRedisClient = await loadRedis()
  const redisClient = createRedisClient({
    socket: { host: redisHost, port: redisPort, connectTimeout: 5000 },
  })
  try {
    await redisClient.connect()

    // Verificar sesiones virtuales
    const sessionKeys: string[] = []
    let cursor = '0'
    do {
      const reply = await redisClient.scan(cursor, {
        MATCH: `fixture2030:h10:${redisScope}:sesion:*`,
        COUNT: 100,
      })
      cursor = String(reply.cursor)
      sessionKeys.push(...reply.keys)
    } while (cursor !== '0')

    let validSessions = 0
    for (const sk of sessionKeys) {
      const pttl = await redisClient.pTTL(sk)
      const status = await redisClient.hGet(sk, 'estado_acceso')
      if (pttl > 0 && pttl <= 1800000 && status === 'autorizado') {
        validSessions++
      }
    }

    checks.push({
      id: 'INT-05',
      category: 'Redis Sesiones',
      description: 'Integridad de sesiones activas y preservación de TTL tras renovaciones concurrentes',
      expected: 'Todas las sesiones presentes tienen estado_acceso=autorizado y PTTL en (0, 1800000]',
      observed: `${validSessions}/${sessionKeys.length} sesiones válidas con TTL activo`,
      passed: sessionKeys.length === validSessions,
    })

    // Verificar consistencia entre caché Read-Aside en Redis y fuentes operacionales (MongoDB/Neo4j)
    const cacheKeys: string[] = []
    cursor = '0'
    do {
      const reply = await redisClient.scan(cursor, {
        MATCH: 'fixture2030:h12:cache:*',
        COUNT: 100,
      })
      cursor = String(reply.cursor)
      cacheKeys.push(...reply.keys)
    } while (cursor !== '0')

    let cacheTtlValidCount = 0
    let cacheContentConsistentCount = 0
    for (const ck of cacheKeys) {
      const pttl = await redisClient.pTTL(ck)
      if (pttl > 0) cacheTtlValidCount++
      const raw = await redisClient.get(ck)
      if (!raw) continue
      const parsed = JSON.parse(raw) as Record<string, unknown>

      if (ck.includes(':partido:')) {
        const matchId = ck.split(':partido:')[1] ?? ''
        const truth = neoMatchMap.get(matchId)
        const home = parsed.home as Record<string, unknown> | undefined
        const away = parsed.away as Record<string, unknown> | undefined
        if (
          truth &&
          parsed.id === matchId &&
          home?.code === truth.homeCode &&
          away?.code === truth.awayCode &&
          home?.id === mongoTeamMap.get(truth.homeCode)?.id &&
          away?.id === mongoTeamMap.get(truth.awayCode)?.id
        ) {
          cacheContentConsistentCount++
        }
      } else if (ck.includes(':equipo:')) {
        const code = ck.split(':equipo:')[1] ?? ''
        const truth = mongoTeamMap.get(code)
        if (truth && parsed.code === code && parsed.id === truth.id) {
          cacheContentConsistentCount++
        }
      } else if (ck.includes(':plantel:')) {
        const parts = ck.split(':plantel:')[1]?.split(':') ?? []
        const code = parts[0] ?? ''
        const items = parsed.items as Record<string, unknown>[] | undefined
        if (
          mongoTeamMap.has(code) &&
          Array.isArray(items) &&
          items.length === 24 &&
          parsed.total === 24
        ) {
          cacheContentConsistentCount++
        }
      } else if (ck.includes(':eventos:')) {
        const items = parsed.items as unknown[] | undefined
        if (Array.isArray(items) && items.length > 0) {
          cacheContentConsistentCount++
        }
      }
    }

    checks.push({
      id: 'INT-06',
      category: 'Consistencia Fuente Operacional <-> Proyección Caché',
      description: 'Todas las proyecciones cacheadas en Redis tienen TTL positivo y coinciden exactamente con MongoDB y Neo4j',
      expected: `${cacheKeys.length}/${cacheKeys.length} claves con TTL > 0 y contenido íntegro respecto de la fuente`,
      observed: `${cacheTtlValidCount}/${cacheKeys.length} con TTL > 0; ${cacheContentConsistentCount}/${cacheKeys.length} consistentes con MongoDB/Neo4j`,
      passed:
        cacheTtlValidCount === cacheKeys.length &&
        cacheContentConsistentCount === cacheKeys.length,
    })
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit().catch(() => redisClient.destroy())
    }
  }

  // 4. Verificación de artefactos de corridas de carga (generados vs aceptados vs rechazados)
  for (const [checkId, label, relPath] of [
    [
      'INT-07',
      'Corrida Línea Base (resultados_linea_base.json)',
      'docs/evidencia/resultados_linea_base.json',
    ],
    [
      'INT-08',
      'Corrida Optimizada (resultados_optimizados.json)',
      'docs/evidencia/resultados_optimizados.json',
    ],
  ] as const) {
    try {
      const raw = await readFile(resolve(HITO12_ROOT, relPath), 'utf8')
      const rep = JSON.parse(raw) as LoadExecutionReport
      const w = rep.measuredWindow
      const accountingExact =
        w.totalRequestsGenerated > 0 &&
        w.totalRequestsGenerated === w.successfulRequests + w.failedRequests &&
        w.payloadIntegrityVerified === w.successfulRequests &&
        w.payloadIntegrityErrors === 0
      checks.push({
        id: checkId,
        category: 'Contabilidad de Operaciones de Carga',
        description: `Verificación de solicitudes generadas vs aceptadas vs validadas en ${label}`,
        expected: 'generadas == exitosas + fallidas; 100% payloads HTTP 200 íntegros',
        observed: `generadas=${w.totalRequestsGenerated}, exitosas=${w.successfulRequests}, fallidas=${w.failedRequests}, íntegros=${w.payloadIntegrityVerified}, corruptos=${w.payloadIntegrityErrors}`,
        passed: accountingExact,
      })
    } catch {
      checks.push({
        id: checkId,
        category: 'Contabilidad de Operaciones de Carga',
        description: `Verificación de solicitudes generadas vs aceptadas en ${label}`,
        expected: 'Archivo de evidencia presente y consistente',
        observed: 'Archivo aún no generado',
        passed: false,
      })
    }
  }

  const passedChecks = checks.filter((c) => c.passed).length
  const failedChecks = checks.length - passedChecks
  return {
    validatedAt: new Date().toISOString(),
    allChecksPassed: failedChecks === 0,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    checks,
  }
}

export function formatIntegrityMarkdown(rep: IntegrityValidationReport): string {
  const rows = rep.checks
    .map(
      (c) =>
        `| \`${c.id}\` | ${c.category} | ${c.description} | ${c.expected} | ${c.observed} | **${c.passed ? 'CUMPLE (OK)' : 'FALLA'}** |`,
    )
    .join('\n')

  return [
    '# Reporte de Validación de Integridad Post-Carga (Hito 12)',
    '',
    `- **Fecha de verificación:** \`${rep.validatedAt}\``,
    `- **Estado global:** **${rep.allChecksPassed ? 'ÍNTEGRO — TODOS LOS CONTROLES APROBADOS' : 'OBSERVACIONES DETECTADAS'}** (${rep.passedChecks}/${rep.totalChecks} controles exitosos)`,
    '',
    '## Matriz de Controles de Integridad (RF15, RNF4, §5.8)',
    '',
    '| ID | Categoría | Control Ejecutado | Valor Esperado | Valor Observado | Resultado |',
    '|:---|:---|:---|:---|:---|:---:|',
    rows,
    '',
    '---',
    '*Reporte generado automáticamente por `scripts/validar_integridad.ts` comprobando las bases reales y los artefactos de evidencia.*',
  ].join('\n')
}

async function main() {
  const report = await validateDataIntegrity()
  const md = formatIntegrityMarkdown(report)

  const jsonPath = resolve(
    HITO12_ROOT,
    'docs/evidencia/validacion_integridad.json',
  )
  const mdPath = resolve(HITO12_ROOT, 'docs/evidencia/validacion_integridad.md')
  await mkdir(dirname(jsonPath), { recursive: true })
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
  await writeFile(mdPath, md, 'utf8')

  console.log(md)
  if (!report.allChecksPassed) {
    process.exitCode = 1
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] ?? '').toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()

if (isMain) {
  main().catch((err: unknown) => {
    console.error(
      'Error en validación de integridad:',
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  })
}
