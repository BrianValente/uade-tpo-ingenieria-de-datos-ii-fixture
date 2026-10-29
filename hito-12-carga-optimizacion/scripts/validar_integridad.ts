import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadMongo,
  loadNeo4j,
  loadRedis,
} from '../../hito-11-conectividad/scripts/driver_loader.js'
import { generateVirtualUserSessions } from '../datos-o-generadores/generador_escenario.js'
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
  validationTarget: 'post-carga' | 'post-limpieza'
  allChecksPassed: boolean
  totalChecks: number
  passedChecks: number
  failedChecks: number
  checks: IntegrityCheckItem[]
}

export async function validateDataIntegrity(
  targetOverride?: 'post-carga' | 'post-limpieza',
): Promise<IntegrityValidationReport> {
  const env = await loadLocalEnvironment()
  const validationTarget: 'post-carga' | 'post-limpieza' =
    targetOverride ??
    (env.H12_STAGE === 'post-limpieza' ||
    process.argv.includes('--post-limpieza')
      ? 'post-limpieza'
      : 'post-carga')

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
  const expectedSessionsCount = Number(env.H12_VIRTUAL_SESSIONS ?? 20)
  const seed = Number(env.H12_SEED ?? 203012)

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
  const mongoSquadsMap = new Map<
    string,
    Array<{
      id: string
      firstName: string
      lastName: string
      number: number
      position: string
      teamCode: string
    }>
  >()

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

    // Cargar todos los planteles ordenados para contraste de contenido en caché (H12-01)
    const allPlayers = (await db
      .collection('jugadores')
      .find({})
      .sort({ posicion: 1, dorsal: 1 })
      .toArray()) as Record<string, unknown>[]

    for (const p of allPlayers) {
      const code = String(p.equipoCodigo)
      if (!mongoSquadsMap.has(code)) {
        mongoSquadsMap.set(code, [])
      }
      mongoSquadsMap.get(code)!.push({
        id: String(p._id),
        firstName: String(p.nombre),
        lastName: String(p.apellido),
        number: Number(p.dorsal),
        position: String(p.posicion),
        teamCode: code,
      })
    }
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
  const neoMatchEventsMap = new Map<
    string,
    Array<{ eventId: string; tipo: string; minuto: number }>
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

    // Detectar eventos huérfanos sin relación hacia :Partido (H12-02)
    const orphanRes = await neoDriver.executeQuery(`
      MATCH (e:Evento)
      WHERE NOT (e)-[:OCURRE_EN]->(:Partido)
      RETURN count(e) AS huerfanosCount
    `)
    const rawHuerfanos = orphanRes.records[0]?.get('huerfanosCount')
    const toNum = (v: unknown) =>
      typeof v === 'number'
        ? v
        : v && typeof (v as { toNumber?: () => number }).toNumber === 'function'
          ? (v as { toNumber: () => number }).toNumber()
          : Number(v ?? 0)
    const huerfanosCount = toNum(rawHuerfanos)

    // Total absoluto de eventos en el grafo
    const totalEventsRes = await neoDriver.executeQuery(`
      MATCH (e:Evento) RETURN count(e) AS totalEventosGrafo
    `)
    const totalEventosGrafo = toNum(totalEventsRes.records[0]?.get('totalEventosGrafo'))

    // Agregación de eventos por partido
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
    const partidosCount = toNum(evRec?.get('partidosCount'))
    const sumaEventos = toNum(evRec?.get('sumaEventos'))
    const sumaH12 = toNum(evRec?.get('sumaH12'))
    const minPorPartido = toNum(evRec?.get('minPorPartido'))
    const maxPorPartido = toNum(evRec?.get('maxPorPartido'))

    const isPostCarga = validationTarget === 'post-carga'
    const expectedEventsTotal = isPostCarga ? 384 : 64
    const expectedH12Total = isPostCarga ? 320 : 0
    const expectedMinEv = isPostCarga ? 12 : 2
    const expectedMaxEv = isPostCarga ? 12 : 2

    const validEventState =
      partidosCount === 32 &&
      huerfanosCount === 0 &&
      totalEventosGrafo === expectedEventsTotal &&
      sumaEventos === expectedEventsTotal &&
      sumaH12 === expectedH12Total &&
      minPorPartido === expectedMinEv &&
      maxPorPartido === expectedMaxEv

    checks.push({
      id: 'INT-04',
      category: 'Neo4j Grafo',
      description: `Integridad de conteos y distribución de eventos por partido (${validationTarget})`,
      expected: `32 partidos, ${expectedEventsTotal} eventos enlazados (${expectedH12Total} H12, min=${expectedMinEv}, max=${expectedMaxEv} por partido), 0 huérfanos, total grafo ${expectedEventsTotal}`,
      observed: `${partidosCount} partidos, ${sumaEventos} eventos (${sumaH12} H12, min=${minPorPartido}, max=${maxPorPartido} por partido), ${huerfanosCount} huérfanos, total grafo ${totalEventosGrafo}`,
      passed: validEventState,
    })

    // Cargar partidos y eventos enlazados ordenados para validación de caché (H12-01)
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

    const allEventsRes = await neoDriver.executeQuery(`
      MATCH (e:Evento)-[:OCURRE_EN]->(p:Partido)
      RETURN p.id AS matchId, e.id AS eventId, e.tipo AS tipo, e.minuto AS minuto
      ORDER BY p.id, e.minuto, e.id
    `)
    for (const r of allEventsRes.records) {
      const matchId = String(r.get('matchId'))
      if (!neoMatchEventsMap.has(matchId)) {
        neoMatchEventsMap.set(matchId, [])
      }
      neoMatchEventsMap.get(matchId)!.push({
        eventId: String(r.get('eventId')),
        tipo: String(r.get('tipo')),
        minuto: toNum(r.get('minuto')),
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

    // Verificar sesiones virtuales esperadas (H12-02: evita 0 === 0)
    const expectedSessions = generateVirtualUserSessions(
      expectedSessionsCount,
      seed,
    )
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
    let expectedSessionsFound = 0
    for (const expectedSession of expectedSessions) {
      const expectedKey = `fixture2030:h10:${redisScope}:sesion:${expectedSession.tokenDigest}`
      if (sessionKeys.includes(expectedKey)) {
        expectedSessionsFound++
        const pttl = await redisClient.pTTL(expectedKey)
        const status = await redisClient.hGet(expectedKey, 'estado_acceso')
        if (pttl > 0 && pttl <= 1800000 && status === 'autorizado') {
          validSessions++
        }
      }
    }

    const isPostCarga = validationTarget === 'post-carga'
    const expectedSessionsTotal = isPostCarga ? expectedSessionsCount : 0
    const sessionsPassed = isPostCarga
      ? sessionKeys.length === expectedSessionsCount &&
        expectedSessionsFound === expectedSessionsCount &&
        validSessions === expectedSessionsCount
      : sessionKeys.length === 0

    checks.push({
      id: 'INT-05',
      category: 'Redis Sesiones',
      description: `Integridad de sesiones activas del lote (${validationTarget})`,
      expected: isPostCarga
        ? `Exactamente ${expectedSessionsCount} sesiones esperadas presentes con estado_acceso=autorizado y PTTL en (0, 1800000]`
        : '0 sesiones sintéticas presentes en Redis post-limpieza',
      observed: `${validSessions}/${sessionKeys.length} sesiones válidas observadas (${expectedSessionsFound}/${expectedSessionsTotal} del lote identificadas)`,
      passed: sessionsPassed,
    })

    // Verificar consistencia estricta entre caché Read-Aside y fuentes operacionales (H12-01)
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
    let cacheCorruptionDetail: string | null = null
    const activeCacheKeys: string[] = []

    for (const ck of cacheKeys) {
      const pttl = await redisClient.pTTL(ck)
      if (pttl === -1) {
        cacheCorruptionDetail = `Clave ${ck} sin TTL configurado`
        activeCacheKeys.push(ck)
      } else if (pttl > 0) {
        cacheTtlValidCount++
        activeCacheKeys.push(ck)
      } else {
        // Expiró naturalmente entre scan y verificación
        continue
      }

      const raw = await redisClient.get(ck)
      if (!raw) continue

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        cacheCorruptionDetail = `Clave ${ck} con JSON inválido`
        continue
      }

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
        } else if (!cacheCorruptionDetail) {
          cacheCorruptionDetail = `Clave ${ck} inconsistente con Neo4j/MongoDB`
        }
      } else if (ck.includes(':equipo:')) {
        const code = ck.split(':equipo:')[1] ?? ''
        const truth = mongoTeamMap.get(code)
        if (truth && parsed.code === code && parsed.id === truth.id) {
          cacheContentConsistentCount++
        } else if (!cacheCorruptionDetail) {
          cacheCorruptionDetail = `Clave ${ck} inconsistente con MongoDB`
        }
      } else if (ck.includes(':plantel:')) {
        // H12-01: Contraste campo por campo contra MongoDB (IDs únicos, orden, dorsal, nombre, posición)
        const parts = ck.split(':plantel:')[1]?.split(':') ?? []
        const code = parts[0] ?? ''
        const page = Number(parts[1] ?? 1)
        const limit = Number(parts[2] ?? 24)
        const items = parsed.items as Record<string, unknown>[] | undefined
        const expectedSquad = mongoSquadsMap.get(code)

        if (
          expectedSquad &&
          Array.isArray(items) &&
          parsed.total === expectedSquad.length
        ) {
          const expectedSlice = expectedSquad.slice(
            (page - 1) * limit,
            page * limit,
          )
          const uniqueIds = new Set(items.map((it) => String(it.id)))
          const uniqueDorsals = new Set(items.map((it) => Number(it.number ?? it.dorsal)))

          const idsUnique = uniqueIds.size === items.length
          const dorsalsUnique = uniqueDorsals.size === items.length
          const lengthMatches = items.length === expectedSlice.length

          const fieldsMatchOrder = items.every((it, idx) => {
            const exp = expectedSlice[idx]!
            const itTeam = String(it.teamCode ?? it.equipoCodigo ?? '')
            const itPos = String(it.position ?? it.posicion ?? '')
            const itFirst = String(it.firstName ?? it.name ?? it.nombre ?? '')
            const itNum = Number(it.number ?? it.dorsal)
            return (
              String(it.id) === exp.id &&
              itTeam === exp.teamCode &&
              itNum === exp.number &&
              itPos === exp.position &&
              itFirst === exp.firstName
            )
          })

          if (idsUnique && dorsalsUnique && lengthMatches && fieldsMatchOrder) {
            cacheContentConsistentCount++
          } else if (!cacheCorruptionDetail) {
            cacheCorruptionDetail = `Plantel ${code} cacheado contiene duplicados o discrepa con MongoDB (idsUnique=${idsUnique}, dorsalsUnique=${dorsalsUnique}, fieldsMatch=${fieldsMatchOrder})`
          }
        } else if (!cacheCorruptionDetail) {
          cacheCorruptionDetail = `Plantel ${code} ausente en MongoDB o con estructura corrupta`
        }
      } else if (ck.includes(':eventos:')) {
        // H12-01: Contraste contra eventos enlazados reales de Neo4j
        const parts = ck.split(':eventos:')[1]?.split(':') ?? []
        const matchId = parts[0] ?? ''
        const limit = Number(parts[1] ?? 20)
        const items = parsed.items as Record<string, unknown>[] | undefined
        const expectedEvents = neoMatchEventsMap.get(matchId) ?? []

        if (neoMatchMap.has(matchId) && Array.isArray(items)) {
          const expectedSlice = expectedEvents.slice(0, limit)
          const uniqueIds = new Set(items.map((it) => String(it.id)))
          const idsUnique = uniqueIds.size === items.length
          const lengthMatches = items.length === expectedSlice.length

          const eventsMatchOrder = items.every((it, idx) => {
            const exp = expectedSlice[idx]!
            const itType = String(it.tipo ?? it.type ?? '')
            const itMin = Number(it.minuto ?? it.minute ?? 0)
            return (
              String(it.id) === exp.eventId &&
              itType === exp.tipo &&
              itMin === exp.minuto
            )
          })

          if (idsUnique && lengthMatches && eventsMatchOrder) {
            cacheContentConsistentCount++
          } else if (!cacheCorruptionDetail) {
            cacheCorruptionDetail = `Eventos de ${matchId} cacheados contienen duplicados o discrepan con Neo4j`
          }
        } else if (!cacheCorruptionDetail) {
          cacheCorruptionDetail = `Partido ${matchId} de eventos ausente en Neo4j`
        }
      }
    }

    const cachePassed = isPostCarga
      ? activeCacheKeys.length > 0 &&
        cacheTtlValidCount === activeCacheKeys.length &&
        cacheContentConsistentCount === activeCacheKeys.length
      : cacheKeys.length === 0

    checks.push({
      id: 'INT-06',
      category: 'Consistencia Fuente Operacional <-> Proyección Caché',
      description: `Todas las proyecciones cacheadas coinciden exactamente con MongoDB y Neo4j (${validationTarget})`,
      expected: isPostCarga
        ? `Al menos 1 clave activa cacheada; 100% con TTL > 0 y contenido íntegro verificado contra MongoDB y Neo4j`
        : '0 claves de caché en Redis post-limpieza',
      observed: isPostCarga
        ? `${activeCacheKeys.length} claves activas en caché; ${cacheTtlValidCount} con TTL > 0; ${cacheContentConsistentCount} íntegras${cacheCorruptionDetail ? ` (${cacheCorruptionDetail})` : ''}`
        : `${cacheKeys.length} claves de caché en Redis`,
      passed: cachePassed,
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
    validationTarget,
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
    `- **Objetivo de validación:** \`${rep.validationTarget}\``,
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
