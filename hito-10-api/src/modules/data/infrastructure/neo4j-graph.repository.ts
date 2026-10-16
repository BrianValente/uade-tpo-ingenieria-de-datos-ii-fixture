import { performance } from 'node:perf_hooks'
import neo4j, { type Driver } from 'neo4j-driver'

import { ApiError } from '../../../app/errors/api-error.js'
import type { DataEnvironment } from '../../../config/data-environment.js'
import type { OperationContext } from '../../auth/domain/ports.js'
import type {
  GraphEvent,
  GraphRepository,
  MatchGraph,
} from '../domain/ports.js'

const MATCH_QUERY = `
MATCH (local:Equipo)-[:DISPUTA {condicion: 'local'}]->(p:Partido {id: $id})
MATCH (visitante:Equipo)-[:DISPUTA {condicion: 'visitante'}]->(p)
MATCH (p)-[:SE_JUEGA_EN]->(s:Sede)
RETURN p.id AS id, toString(p.fecha) AS fecha, toString(p.hora) AS hora,
       p.fase AS fase, local.codigo AS local, visitante.codigo AS visitante,
       s.id AS sedeId, s.nombre AS sede, s.ciudad AS ciudad,
       s.pais AS pais, s.region AS region`

const EVENTS_QUERY = `
MATCH (p:Partido {id: $id})
OPTIONAL MATCH (e:Evento)-[:OCURRE_EN]->(p)
OPTIONAL MATCH (e)-[:INVOLUCRA]->(j:Jugador)
WITH p, e, j ORDER BY e.minuto, e.id
RETURN p.id AS partido, e.id AS id, e.tipo AS tipo, e.minuto AS minuto,
       e.detalle AS detalle, j.id AS jugadorId, j.nombre AS nombre,
       j.apellido AS apellido, j.equipoCodigo AS equipo
LIMIT $limit`

export class Neo4jGraphRepository implements GraphRepository {
  private readonly driver: Driver

  constructor(config: DataEnvironment) {
    const host = config.NEO4J_HOST.includes(':')
      ? `[${config.NEO4J_HOST}]`
      : config.NEO4J_HOST
    this.driver = neo4j.driver(
      `neo4j://${host}:${config.NEO4J_BOLT_PORT}`,
      neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
      {
        connectionTimeout: config.DEPENDENCY_TIMEOUT_MS,
        maxConnectionPoolSize: 5,
        maxTransactionRetryTime: 0,
      },
    )
  }

  private async run<T>(
    operation: string,
    context: OperationContext,
    execute: () => Promise<T>,
  ) {
    const started = performance.now()
    let result = 'success'
    try {
      return await execute()
    } catch {
      result = 'failure'
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      context.log.info(
        {
          dependency: 'Neo4j',
          operation,
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }

  async findMatch(
    id: string,
    context: OperationContext,
  ): Promise<MatchGraph | null> {
    return this.run('findMatch', context, async () => {
      const result = await this.driver.executeQuery(
        MATCH_QUERY,
        { id },
        { routing: 'READ' },
      )
      const row = result.records[0]
      if (!row) return null
      return {
        id: String(row.get('id')),
        date: String(row.get('fecha')),
        time: String(row.get('hora')),
        phase: String(row.get('fase')),
        homeCode: String(row.get('local')),
        awayCode: String(row.get('visitante')),
        venue: {
          id: String(row.get('sedeId')),
          name: String(row.get('sede')),
          city: String(row.get('ciudad')),
          country: String(row.get('pais')),
          region: String(row.get('region')),
        },
      }
    })
  }

  async listEvents(
    id: string,
    limit: number,
    context: OperationContext,
  ): Promise<GraphEvent[] | null> {
    return this.run('listEvents', context, async () => {
      const result = await this.driver.executeQuery(
        EVENTS_QUERY,
        { id, limit: neo4j.int(limit) },
        { routing: 'READ' },
      )
      if (!result.records[0]) return null
      if (result.records[0].get('id') === null) return []
      return result.records.map((row) => ({
        id: String(row.get('id')),
        type: String(row.get('tipo')),
        minute: neo4j.integer.toNumber(row.get('minuto')),
        detail: String(row.get('detalle') ?? ''),
        player: {
          id: String(row.get('jugadorId')),
          firstName: String(row.get('nombre')),
          lastName: String(row.get('apellido')),
          teamCode: String(row.get('equipo')),
        },
      }))
    })
  }

  close() {
    return this.driver.close()
  }
}
