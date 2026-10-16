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
const LIST_CURSOR = `SELECT partido_id, creado_en, comentario_id, usuario_id, usuario_nombre,
 contenido, estado, likes, respuestas FROM comentarios_por_partido
 WHERE partido_id = ? AND bucket_minuto = ? AND grupo = ?
 AND (creado_en, comentario_id) < (?, ?) LIMIT ?`
const INSERT_MATCH = `INSERT INTO comentarios_por_partido
 (partido_id, bucket_minuto, grupo, creado_en, comentario_id, usuario_id,
 usuario_nombre, contenido, estado, likes, respuestas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
const INSERT_USER = `INSERT INTO comentarios_por_usuario
 (usuario_id, bucket_mes, creado_en, comentario_id, partido_id, usuario_nombre,
 contenido, estado, likes, respuestas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

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
    } catch {
      result = 'failure'
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
        Array.from({ length: 16 }, (_, group) => {
          const parameters: unknown[] = [matchId, minute, group]
          if (cursor)
            parameters.push(
              new Date(cursor.createdAt),
              cassandra.types.Uuid.fromString(cursor.id),
            )
          parameters.push(limit)
          return this.client.execute(cursor ? LIST_CURSOR : LIST, parameters, {
            prepare: true,
            isIdempotent: true,
          })
        }),
      )
      return results.flatMap((value) => [...value.rows])
    })
    return rows
      .map((row): Comment => ({
        matchId: String(row.partido_id),
        createdAt: (row.creado_en as Date).toISOString(),
        id: String(row.comentario_id),
        userId: String(row.usuario_id),
        username: String(row.usuario_nombre),
        content: String(row.contenido),
        state: String(row.estado),
        likes: Number(row.likes),
        replies: Number(row.respuestas),
      }))
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
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
      const common = [
        createdAt,
        id,
        userId,
        input.username,
        input.content,
        input.state,
        input.likes,
        input.replies,
      ]
      await this.client.execute(
        INSERT_MATCH,
        [input.matchId, minute, commentGroup(input.id), ...common],
        { prepare: true, isIdempotent: true },
      )
      const month = cassandra.types.LocalDate.fromString(
        input.createdAt.slice(0, 7) + '-01',
      )
      await this.client.execute(
        INSERT_USER,
        [
          userId,
          month,
          createdAt,
          id,
          input.matchId,
          input.username,
          input.content,
          input.state,
          input.likes,
          input.replies,
        ],
        { prepare: true, isIdempotent: true },
      )
    })
  }

  close() {
    return this.client.shutdown()
  }
}
