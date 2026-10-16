import { performance } from 'node:perf_hooks'
import cassandra from 'cassandra-driver'

import { ApiError } from '../../../app/errors/api-error.js'
import type { DataEnvironment } from '../../../config/data-environment.js'
import type { OperationContext } from '../../auth/domain/ports.js'
import { commentGroup } from '../application/data.service.js'
import type {
  Comment,
  CommentCursor,
  CommentRepository,
} from '../domain/ports.js'

const LIST = `SELECT partido_id, creado_en, comentario_id, usuario_id, usuario_nombre,
 contenido, estado, likes, respuestas FROM comentarios_por_partido
 WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ? LIMIT ?`
const LIST_SAME_TIME = `SELECT partido_id, creado_en, comentario_id, usuario_id, usuario_nombre,
 contenido, estado, likes, respuestas FROM comentarios_por_partido
 WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ?
 AND creado_en = ? AND comentario_id > ? LIMIT ?`
const LIST_OLDER = `SELECT partido_id, creado_en, comentario_id, usuario_id, usuario_nombre,
 contenido, estado, likes, respuestas FROM comentarios_por_partido
 WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ?
 AND creado_en < ? LIMIT ?`
const FIND_KEY = `SELECT partido_id, creado_en, comentario_id, usuario_id, usuario_nombre,
 contenido, estado, likes, respuestas FROM comentarios_por_partido
 WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ? AND creado_en = ? AND comentario_id = ? LIMIT 1`
const INSERT_MATCH = `INSERT INTO comentarios_por_partido
 (partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
  usuario_nombre, contenido, estado, likes, respuestas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS`
const INSERT_USER = `INSERT INTO comentarios_por_usuario
 (usuario_id, bucket_mes, creado_en, comentario_id, partido_id, usuario_nombre,
  contenido, estado, likes, respuestas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS`

export class CassandraCommentRepository implements CommentRepository {
  private readonly client: cassandra.Client
  constructor(config: DataEnvironment) {
    this.client = new cassandra.Client({
      contactPoints: [config.CASSANDRA_HOST],
      localDataCenter: config.CASSANDRA_DATACENTER,
      keyspace: config.CASSANDRA_KEYSPACE,
      protocolOptions: { port: config.CASSANDRA_PORT },
      socketOptions: {
        connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
        readTimeout: config.DEPENDENCY_TIMEOUT_MS,
      },
      pooling: { maxRequestsPerConnection: 64 },
    })
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
    } catch (error) {
      result = 'failure'
      if (error instanceof ApiError) throw error
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    } finally {
      context.log.info(
        {
          dependency: 'Cassandra',
          operation,
          result,
          durationMs: performance.now() - started,
        },
        'Operación de dependencia',
      )
    }
  }

  async list(
    matchId: string,
    minute: Date,
    limit: number,
    cursor: CommentCursor | undefined,
    context: OperationContext,
  ) {
    minute.setUTCSeconds(0, 0)
    const rows = await this.run('listComments', context, async () => {
      const results = await Promise.all(
        Array.from({ length: 16 }, async (_, group) => {
          const partition = [matchId, minute, group]
          const options = { prepare: true, isIdempotent: true }
          if (!cursor)
            return (
              await this.client.execute(LIST, [...partition, limit], options)
            ).rows
          const date = new Date(cursor.createdAt)
          const same = await this.client.execute(
            LIST_SAME_TIME,
            [
              ...partition,
              date,
              cassandra.types.Uuid.fromString(cursor.id),
              limit,
            ],
            options,
          )
          const remaining = limit - same.rows.length
          if (remaining === 0) return same.rows
          const older = await this.client.execute(
            LIST_OLDER,
            [...partition, date, remaining],
            options,
          )
          return [...same.rows, ...older.rows]
        }),
      )
      return results.flat()
    })
    return rows
      .map(toComment)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || compareCqlUuid(a.id, b.id),
      )
      .slice(0, limit)
  }

  async create(input: Comment, context: OperationContext) {
    await this.run('createComment', context, async () => {
      const createdAt = new Date(input.createdAt)
      const minute = new Date(createdAt)
      minute.setUTCSeconds(0, 0)
      const id = cassandra.types.Uuid.fromString(input.id)
      const userId = cassandra.types.Uuid.fromString(input.userId)
      let canonical = input
      // Compatibilidad sin migración: una clave pudo cargarse con la distribución
      // del Hito 6 o con el hash del primer prototipo. Solo son lecturas de PK completa.
      const existing = (
        await Promise.all(
          Array.from({ length: 16 }, (_, group) =>
            this.client.execute(
              FIND_KEY,
              [input.matchId, minute, group, createdAt, id],
              { prepare: true, isIdempotent: true },
            ),
          ),
        )
      ).flatMap((result) => [...result.rows])
      if (existing.length > 1) throw new ApiError('CONFLICT')
      if (existing[0]) {
        canonical = toComment(existing[0])
        ensureSameCreation(canonical, input)
      } else {
        const reserved = await this.client.execute(
          INSERT_MATCH,
          [
            input.matchId,
            minute,
            commentGroup(input.id),
            createdAt,
            id,
            userId,
            input.username,
            input.content,
            input.state,
            input.likes,
            input.replies,
          ],
          { prepare: true, isIdempotent: true },
        )
        if (!reserved.wasApplied()) {
          if (!reserved.rows[0]) throw new ApiError('INTERNAL_ERROR')
          canonical = toComment(reserved.rows[0])
          ensureSameCreation(canonical, input)
        }
      }
      const month = cassandra.types.LocalDate.fromString(
        input.createdAt.slice(0, 7) + '-01',
      )
      const indexed = await this.client.execute(
        INSERT_USER,
        [
          userId,
          month,
          createdAt,
          id,
          input.matchId,
          canonical.username,
          canonical.content,
          canonical.state,
          canonical.likes,
          canonical.replies,
        ],
        { prepare: true, isIdempotent: true },
      )
      if (!indexed.wasApplied()) {
        if (!indexed.rows[0]) throw new ApiError('INTERNAL_ERROR')
        ensureSameCreation(toComment(indexed.rows[0]), input)
      }
    })
  }

  close() {
    return this.client.shutdown()
  }
}

function toComment(row: Record<string, unknown>): Comment {
  return {
    matchId: String(row.partido_id),
    createdAt: (row.creado_en as Date).toISOString(),
    id: String(row.comentario_id),
    userId: String(row.usuario_id),
    username: String(row.usuario_nombre),
    content: String(row.contenido),
    state: String(row.estado),
    likes: Number(row.likes),
    replies: Number(row.respuestas),
  }
}

function ensureSameCreation(stored: Comment, input: Comment) {
  if (
    stored.matchId !== input.matchId ||
    stored.id !== input.id.toLowerCase() ||
    stored.userId !== input.userId.toLowerCase() ||
    stored.username !== input.username ||
    Date.parse(stored.createdAt) !== Date.parse(input.createdAt) ||
    stored.content !== input.content
  ) {
    throw new ApiError('CONFLICT')
  }
}

// UUIDType de Cassandra 5 ordena por versión, timestamp para v1 y bytes sin signo.
// Fuente: apache/cassandra, UUIDType.compareCustom(). No es orden textual entre versiones.
export function compareCqlUuid(left: string, right: string) {
  const a = Buffer.from(left.replaceAll('-', ''), 'hex')
  const b = Buffer.from(right.replaceAll('-', ''), 'hex')
  const version = (a[6]! >>> 4) - (b[6]! >>> 4)
  if (version) return version
  if (a[6]! >>> 4 === 1) {
    const order = [6, 7, 4, 5, 0, 1, 2, 3]
    const timestamp = Buffer.compare(
      Buffer.from(
        order.map((index) => (index === 6 ? a[index]! & 15 : a[index]!)),
      ),
      Buffer.from(
        order.map((index) => (index === 6 ? b[index]! & 15 : b[index]!)),
      ),
    )
    return timestamp || Buffer.compare(a.subarray(8), b.subarray(8))
  }
  return Buffer.compare(a, b)
}
