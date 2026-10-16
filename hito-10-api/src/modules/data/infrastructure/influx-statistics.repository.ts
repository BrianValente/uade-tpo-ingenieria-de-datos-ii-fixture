import { performance } from 'node:perf_hooks'

import { ApiError } from '../../../app/errors/api-error.js'
import type { DataEnvironment } from '../../../config/data-environment.js'
import type { OperationContext } from '../../auth/domain/ports.js'
import type { StatisticsRepository } from '../domain/ports.js'

const SQL = `SELECT equipo_id, COUNT(*) AS muestras,
 AVG(posesion_pct) AS posesion_promedio,
 MAX(tiros_acumulados) AS tiros_final,
 SUM(pases_intervalo) AS pases
 FROM estadisticas_equipo
 WHERE partido_id = $partido
 AND time >= CAST($inicio AS TIMESTAMP)
 AND time < CAST($fin AS TIMESTAMP)
 GROUP BY equipo_id ORDER BY equipo_id`

export class InfluxStatisticsRepository implements StatisticsRepository {
  constructor(private readonly config: DataEnvironment) {}

  async summary(
    matchId: string,
    start: string,
    end: string,
    context: OperationContext,
  ): Promise<Record<string, unknown>[]> {
    const started = performance.now()
    let result = 'success'
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      this.config.DEPENDENCY_TIMEOUT_MS,
    )
    try {
      const response = await fetch(
        new URL('/api/v3/query_sql', this.config.INFLUXDB_URL),
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            ...(this.config.INFLUXDB_TOKEN
              ? { authorization: `Bearer ${this.config.INFLUXDB_TOKEN}` }
              : {}),
          },
          body: JSON.stringify({
            db: this.config.INFLUXDB_DATABASE,
            q: SQL,
            format: 'json',
            params: { partido: matchId, inicio: start, fin: end },
          }),
        },
      )
      if (!response.ok) throw new Error('InfluxDB rechazó la consulta.')
      const rows: unknown = await response.json()
      if (
        !Array.isArray(rows) ||
        rows.length > 64 ||
        rows.some(
          (row) =>
            typeof row !== 'object' || row === null || Array.isArray(row),
        )
      )
        throw new Error('Respuesta de InfluxDB inválida.')
      return rows as Record<string, unknown>[]
    } catch {
      result = 'failure'
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      clearTimeout(timer)
      context.log.info(
        {
          dependency: 'InfluxDB',
          operation: 'statisticsSummary',
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }
}
