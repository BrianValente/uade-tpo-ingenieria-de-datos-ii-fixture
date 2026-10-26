import { createHash } from 'node:crypto'

/**
 * Generador determinístico de datos sintéticos y secuencias de operaciones
 * para el Hito 12 — Pruebas de Carga y Optimización del Fixture 2030 (RF2, RF3, RNF1).
 */

export interface MatchSeedEntry {
  id: string
  date: string
  time: string
  phase: string
  venueId: string
  homeCode: string
  awayCode: string
  isHotspot: boolean
}

export interface SyntheticEventEntry {
  id: string
  matchId: string
  teamCode: string
  dorsal: number
  type: string
  minute: number
  detail: string
  lotePrueba: 'HITO_12'
}

export interface VirtualUserSessionSeed {
  virtualUserIndex: number
  username: string
  userId: string
  role: 'user' | 'admin'
  accessToken: string
  tokenDigest: string
}

export type WorkloadProfileId =
  | 'match_composite'
  | 'team_players'
  | 'match_events'
  | 'team_profile'

export interface WorkloadOperationSpec {
  sequenceIndex: number
  profileId: WorkloadProfileId
  method: 'GET'
  path: string
  targetKey: string
  isHotKey: boolean
  virtualUserIndex: number
  expectedSources: string[]
}

export const CANONICAL_MATCHES: readonly MatchSeedEntry[] = [
  { id: 'F2030-001', date: '2030-06-13', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-001', homeCode: 'ARG', awayCode: 'BRA', isHotspot: true },
  { id: 'F2030-002', date: '2030-06-13', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-002', homeCode: 'AUS', awayCode: 'IRN', isHotspot: false },
  { id: 'F2030-003', date: '2030-06-13', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-003', homeCode: 'IRQ', awayCode: 'JPN', isHotspot: false },
  { id: 'F2030-004', date: '2030-06-14', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-004', homeCode: 'JOR', awayCode: 'QAT', isHotspot: false },
  { id: 'F2030-005', date: '2030-06-14', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-005', homeCode: 'KSA', awayCode: 'KOR', isHotspot: false },
  { id: 'F2030-006', date: '2030-06-14', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-006', homeCode: 'UZB', awayCode: 'ALG', isHotspot: false },
  { id: 'F2030-007', date: '2030-06-15', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-007', homeCode: 'CPV', awayCode: 'COD', isHotspot: false },
  { id: 'F2030-008', date: '2030-06-15', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-008', homeCode: 'EGY', awayCode: 'GHA', isHotspot: false },
  { id: 'F2030-009', date: '2030-06-15', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-001', homeCode: 'CIV', awayCode: 'MAR', isHotspot: false },
  { id: 'F2030-010', date: '2030-06-16', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-002', homeCode: 'SEN', awayCode: 'RSA', isHotspot: false },
  { id: 'F2030-011', date: '2030-06-16', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-003', homeCode: 'TUN', awayCode: 'CAN', isHotspot: false },
  { id: 'F2030-012', date: '2030-06-16', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-004', homeCode: 'CUW', awayCode: 'HAI', isHotspot: false },
  { id: 'F2030-013', date: '2030-06-17', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-005', homeCode: 'MEX', awayCode: 'PAN', isHotspot: false },
  { id: 'F2030-014', date: '2030-06-17', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-006', homeCode: 'USA', awayCode: 'COL', isHotspot: true },
  { id: 'F2030-015', date: '2030-06-17', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-007', homeCode: 'ECU', awayCode: 'PAR', isHotspot: false },
  { id: 'F2030-016', date: '2030-06-18', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-008', homeCode: 'URU', awayCode: 'NZL', isHotspot: false },
  { id: 'F2030-017', date: '2030-06-18', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-001', homeCode: 'AUT', awayCode: 'BEL', isHotspot: false },
  { id: 'F2030-018', date: '2030-06-18', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-002', homeCode: 'BIH', awayCode: 'CRO', isHotspot: false },
  { id: 'F2030-019', date: '2030-06-19', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-003', homeCode: 'CZE', awayCode: 'ENG', isHotspot: false },
  { id: 'F2030-020', date: '2030-06-19', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-004', homeCode: 'FRA', awayCode: 'GER', isHotspot: true },
  { id: 'F2030-021', date: '2030-06-19', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-005', homeCode: 'NED', awayCode: 'NOR', isHotspot: false },
  { id: 'F2030-022', date: '2030-06-20', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-006', homeCode: 'POR', awayCode: 'SCO', isHotspot: false },
  { id: 'F2030-023', date: '2030-06-20', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-007', homeCode: 'ESP', awayCode: 'SWE', isHotspot: true },
  { id: 'F2030-024', date: '2030-06-20', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-008', homeCode: 'SUI', awayCode: 'TUR', isHotspot: false },
  { id: 'F2030-025', date: '2030-06-21', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-001', homeCode: 'JAM', awayCode: 'NCL', isHotspot: false },
  { id: 'F2030-026', date: '2030-06-21', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-002', homeCode: 'BOL', awayCode: 'SUR', isHotspot: false },
  { id: 'F2030-027', date: '2030-06-21', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-003', homeCode: 'ITA', awayCode: 'WAL', isHotspot: false },
  { id: 'F2030-028', date: '2030-06-22', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-004', homeCode: 'NIR', awayCode: 'POL', isHotspot: false },
  { id: 'F2030-029', date: '2030-06-22', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-005', homeCode: 'UKR', awayCode: 'ALB', isHotspot: false },
  { id: 'F2030-030', date: '2030-06-22', time: '21:00', phase: 'Fase de grupos', venueId: 'SED-006', homeCode: 'KVX', awayCode: 'SVK', isHotspot: false },
  { id: 'F2030-031', date: '2030-06-23', time: '16:00', phase: 'Fase de grupos', venueId: 'SED-007', homeCode: 'ROU', awayCode: 'DEN', isHotspot: false },
  { id: 'F2030-032', date: '2030-06-23', time: '19:00', phase: 'Fase de grupos', venueId: 'SED-008', homeCode: 'IRL', awayCode: 'MKD', isHotspot: false },
]

export const HOT_MATCHES = CANONICAL_MATCHES.filter((m) => m.isHotspot)
export const COLD_MATCHES = CANONICAL_MATCHES.filter((m) => !m.isHotspot)

export const ALL_TEAM_CODES: readonly string[] = CANONICAL_MATCHES.flatMap((m) => [
  m.homeCode,
  m.awayCode,
])

export const HOT_TEAM_CODES: readonly string[] = HOT_MATCHES.flatMap((m) => [
  m.homeCode,
  m.awayCode,
])

export const COLD_TEAM_CODES: readonly string[] = COLD_MATCHES.flatMap((m) => [
  m.homeCode,
  m.awayCode,
])

/**
 * Generador pseudoaleatorio determinístico Mulberry32 para reproducibilidad exacta (RNF1, RNF3).
 */
export function createDeterministicPrng(seed = 203012): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const EVENT_TYPES = [
  'Gol',
  'Tarjeta amarilla',
  'Cambio',
  'Asistencia',
  'Atajada',
  'Tiro al arco',
] as const

/**
 * Genera el conjunto de 320 eventos adicionales de laboratorio (10 por partido)
 * con identificadores `F2030-H12-EVT-XXXX` para aumentar la densidad de relaciones
 * `:OCURRE_EN` e `:INVOLUCRA` en Neo4j sin alterar los 64 eventos canónicos del Hito 5.
 */
export function generateSyntheticH12Events(
  eventsPerMatch = 10,
): SyntheticEventEntry[] {
  const entries: SyntheticEventEntry[] = []
  let counter = 1
  for (let mIdx = 0; mIdx < CANONICAL_MATCHES.length; mIdx++) {
    const match = CANONICAL_MATCHES[mIdx]!
    for (let eIdx = 0; eIdx < eventsPerMatch; eIdx++) {
      const id = `F2030-H12-EVT-${String(counter).padStart(4, '0')}`
      const isHome = eIdx % 2 === 0
      const teamCode = isHome ? match.homeCode : match.awayCode
      // Dorsales entre 1 y 24 existen garantizados en cada plantel de 24 jugadores
      const dorsal = ((mIdx * 3 + eIdx * 5) % 24) + 1
      const type = EVENT_TYPES[(mIdx + eIdx) % EVENT_TYPES.length]!
      const minute = Math.min(90, Math.max(1, 5 + eIdx * 8 + (mIdx % 4)))
      const detail = `Evento sintético Hito 12 (${type}) de ${teamCode} #${dorsal} en ${match.id}`
      entries.push({
        id,
        matchId: match.id,
        teamCode,
        dorsal,
        type,
        minute,
        detail,
        lotePrueba: 'HITO_12',
      })
      counter++
    }
  }
  return entries
}

/**
 * Genera N sesiones determinísticas de usuarios virtuales para el laboratorio del Hito 12.
 * Los tokens son sintéticos de laboratorio y nunca se imprimen en reportes públicos (RNF8).
 */
export function generateVirtualUserSessions(
  count = 20,
  seed = 203012,
): VirtualUserSessionSeed[] {
  const sessions: VirtualUserSessionSeed[] = []
  for (let i = 0; i < count; i++) {
    const rawToken = createHash('sha256')
      .update(`hito12-vu-token:${seed}:${i}`)
      .digest('base64url')
    const digest = createHash('sha256').update(rawToken).digest('hex')
    // UUID v5-like determinístico para cada usuario virtual
    const hashHex = createHash('sha256')
      .update(`hito12-vu-user:${i}`)
      .digest('hex')
    const userId = `${hashHex.slice(0, 8)}-${hashHex.slice(8, 12)}-5${hashHex.slice(13, 16)}-9${hashHex.slice(17, 20)}-${hashHex.slice(20, 32)}`
    sessions.push({
      virtualUserIndex: i,
      username: `vu-h12-${String(i + 1).padStart(2, '0')}`,
      userId,
      role: i === 0 ? 'admin' : 'user',
      accessToken: rawToken,
      tokenDigest: digest,
    })
  }
  return sessions
}

/**
 * Construye una operación determinística para el índice `sequenceIndex` siguiendo:
 * - Proporción de endpoints (RF2, 5.2):
 *   - 40% `GET /partidos/:id` (Neo4j + 2x MongoDB + Redis)
 *   - 30% `GET /equipos/:codigo/jugadores?page=1&limit=24` (MongoDB + Redis)
 *   - 20% `GET /partidos/:id/eventos?limit=20` (Neo4j + Redis)
 *   - 10% `GET /equipos/:codigo` (MongoDB + Redis)
 * - Distribución de claves calientes 80/20 (RF3, 5.3):
 *   - 80% sobre los 4 partidos / 8 selecciones calientes (`ARG`, `BRA`, `USA`, `COL`, `FRA`, `GER`, `ESP`, `SWE`)
 *   - 20% sobre los 28 partidos / 56 selecciones restantes
 */
export function nextWorkloadOperation(
  sequenceIndex: number,
  prng: () => number,
  virtualUsersCount: number,
): WorkloadOperationSpec {
  const opRoll = prng()
  const hotRoll = prng()
  const itemRoll = prng()
  const isHotKey = hotRoll < 0.8
  const virtualUserIndex = sequenceIndex % Math.max(1, virtualUsersCount)

  if (opRoll < 0.4) {
    const pool = isHotKey ? HOT_MATCHES : COLD_MATCHES
    const match = pool[Math.floor(itemRoll * pool.length)] ?? HOT_MATCHES[0]!
    return {
      sequenceIndex,
      profileId: 'match_composite',
      method: 'GET',
      path: `/partidos/${match.id}`,
      targetKey: match.id,
      isHotKey,
      virtualUserIndex,
      expectedSources: ['Redis', 'Neo4j', 'MongoDB'],
    }
  }

  if (opRoll < 0.7) {
    const pool = isHotKey ? HOT_TEAM_CODES : COLD_TEAM_CODES
    const code = pool[Math.floor(itemRoll * pool.length)] ?? 'ARG'
    return {
      sequenceIndex,
      profileId: 'team_players',
      method: 'GET',
      path: `/equipos/${code}/jugadores?page=1&limit=24`,
      targetKey: code,
      isHotKey,
      virtualUserIndex,
      expectedSources: ['Redis', 'MongoDB'],
    }
  }

  if (opRoll < 0.9) {
    const pool = isHotKey ? HOT_MATCHES : COLD_MATCHES
    const match = pool[Math.floor(itemRoll * pool.length)] ?? HOT_MATCHES[0]!
    return {
      sequenceIndex,
      profileId: 'match_events',
      method: 'GET',
      path: `/partidos/${match.id}/eventos?limit=20`,
      targetKey: match.id,
      isHotKey,
      virtualUserIndex,
      expectedSources: ['Redis', 'Neo4j'],
    }
  }

  const pool = isHotKey ? HOT_TEAM_CODES : COLD_TEAM_CODES
  const code = pool[Math.floor(itemRoll * pool.length)] ?? 'ARG'
  return {
    sequenceIndex,
    profileId: 'team_profile',
    method: 'GET',
    path: `/equipos/${code}`,
    targetKey: code,
    isHotKey,
    virtualUserIndex,
    expectedSources: ['Redis', 'MongoDB'],
  }
}
