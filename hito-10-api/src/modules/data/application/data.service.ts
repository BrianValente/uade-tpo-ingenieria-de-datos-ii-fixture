import { z } from 'zod'

import { ApiError } from '../../../app/errors/api-error.js'
import type { OperationContext, User } from '../../auth/domain/ports.js'
import type {
  CommentCursor,
  CommentRepository,
  DocumentRepository,
  GraphRepository,
  ObjectRepository,
  StatisticsRepository,
} from '../domain/ports.js'

export class DataService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly graph: GraphRepository,
    private readonly comments: CommentRepository,
    private readonly statistics: StatisticsRepository,
    private readonly objects: ObjectRepository,
  ) {}

  async team(code: string, context: OperationContext) {
    const team = await this.documents.findTeam(code, context)
    if (!team) throw new ApiError('RESOURCE_NOT_FOUND')
    return team
  }

  async players(
    code: string,
    page: number,
    limit: number,
    context: OperationContext,
  ) {
    const team = await this.documents.findTeam(code, context)
    if (!team) throw new ApiError('RESOURCE_NOT_FOUND')
    const result = await this.documents.listPlayers(
      team.id,
      page,
      limit,
      context,
    )
    return { ...result, page, limit }
  }

  async match(id: string, context: OperationContext) {
    const graph = await this.graph.findMatch(id, context)
    if (!graph) throw new ApiError('RESOURCE_NOT_FOUND')
    const [home, away] = await Promise.all([
      this.documents.findTeam(graph.homeCode, context),
      this.documents.findTeam(graph.awayCode, context),
    ])
    if (!home || !away) throw new ApiError('DEPENDENCY_UNAVAILABLE')
    return { ...graph, home, away }
  }

  async events(id: string, limit: number, context: OperationContext) {
    const items = await this.graph.listEvents(id, limit, context)
    if (!items) throw new ApiError('RESOURCE_NOT_FOUND')
    return { items, limit }
  }

  commentsPage(
    matchId: string,
    minute: string,
    limit: number,
    cursor: string | undefined,
    context: OperationContext,
  ) {
    return this.comments
      .list(matchId, new Date(minute), limit + 1, decodeCursor(cursor), context)
      .then((rows) => {
        const hasMore = rows.length > limit
        const items = rows.slice(0, limit)
        const last = items.at(-1)
        return {
          items,
          nextCursor:
            hasMore && last
              ? encodeCursor({ createdAt: last.createdAt, id: last.id })
              : null,
        }
      })
  }

  async createComment(
    matchId: string,
    input: { commentId: string; createdAt: string; content: string },
    user: User,
    context: OperationContext,
  ) {
    await this.comments.create(
      {
        matchId,
        createdAt: input.createdAt,
        id: input.commentId,
        userId: user.id,
        username: user.username,
        content: input.content,
        state: 'visible',
        likes: 0,
        replies: 0,
      },
      context,
    )
    return {
      ...input,
      matchId,
      user: { id: user.id, username: user.username },
      state: 'visible' as const,
    }
  }

  async statisticsSummary(
    matchId: string,
    start: string,
    end: string,
    context: OperationContext,
  ) {
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    if (endMs <= startMs || endMs - startMs > 24 * 60 * 60 * 1000)
      throw new ApiError('VALIDATION_ERROR')
    return {
      matchId,
      start,
      end,
      teams: await this.statistics.summary(matchId, start, end, context),
    }
  }

  async objectDetail(code: string, context: OperationContext) {
    const value = await this.objects.find(code, context)
    if (!value) throw new ApiError('RESOURCE_NOT_FOUND')
    return value
  }

  async changeState(code: string, state: string, context: OperationContext) {
    const value = await this.objects.changeState(code, state, context)
    if (!value) throw new ApiError('RESOURCE_NOT_FOUND')
    return value
  }

  async addObjectEvent(
    code: string,
    event: { code: string; type: string; minute: number; detail: string },
    context: OperationContext,
  ) {
    const value = await this.objects.addEvent(code, event, context)
    if (!value) throw new ApiError('RESOURCE_NOT_FOUND')
    return value
  }
}

export function commentGroup(id: string) {
  // Hito 6: UUID entero módulo 16, equivalente a su último dígito hexadecimal.
  return Number.parseInt(id.at(-1)!, 16)
}

function encodeCursor(cursor: CommentCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export const commentCursorSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => {
    try {
      decodeCursor(value)
      return true
    } catch {
      return false
    }
  }, 'Cursor de comentarios inválido.')

const cursorPayload = z.strictObject({
  createdAt: z.iso.datetime(),
  // CQL uuid también admite los UUID de laboratorio anteriores, incluso versión cero.
  id: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
})

function decodeCursor(value: string | undefined): CommentCursor | undefined {
  if (value === undefined) return undefined
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 300) throw new Error()
    const bytes = Buffer.from(value, 'base64url')
    if (bytes.toString('base64url') !== value) throw new Error()
    const parsed = cursorPayload.parse(JSON.parse(bytes.toString()))
    return {
      createdAt: new Date(parsed.createdAt).toISOString(),
      id: parsed.id.toLowerCase(),
    }
  } catch {
    /* Se traduce abajo a un error público estable. */
  }
  throw new ApiError('VALIDATION_ERROR')
}
