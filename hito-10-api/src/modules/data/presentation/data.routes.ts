import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { ApiError } from '../../../app/errors/api-error.js'
import { errorSchema } from '../../../app/schemas.js'
import type { AuthService } from '../../auth/application/auth.service.js'
import { sessionHeadersSchema } from '../../auth/presentation/auth.schemas.js'
import type { DataService } from '../application/data.service.js'
import { commentCursorSchema } from '../application/data.service.js'

const code = z.string().regex(/^[A-Z]{3}$/)
const matchId = z.string().regex(/^F2030-[A-Z0-9-]{1,40}$/)
const irisCode = z.string().regex(/^F2030-[A-Z0-9-]{1,40}$/)
const uuid = z.uuid()
const cqlUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const page = z.coerce.number().int().min(1).max(100000).default(1)
const limit = z.coerce.number().int().min(1).max(100).default(20)
const authResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  500: errorSchema,
  503: errorSchema,
}
const teamSchema = z.object({
  id: uuid,
  code,
  name: z.string(),
  confederation: z.string(),
  selectionOrigin: z.string(),
  qualificationStage: z.string(),
  participates: z.boolean(),
  trainingBase: z.string().optional(),
})
const playerSchema = z.object({
  id: uuid,
  teamId: uuid,
  teamCode: code,
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string(),
  position: z.string(),
  number: z.number().int(),
  heightCm: z.number().int(),
  preferredFoot: z.string(),
  selected: z.boolean(),
  available: z.boolean(),
  synthetic: z.boolean(),
})
const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  minute: z.number().int(),
  detail: z.string(),
  player: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    teamCode: code,
  }),
})
const commentSchema = z.object({
  matchId,
  createdAt: z.iso.datetime(),
  id: cqlUuid,
  userId: cqlUuid,
  username: z.string(),
  content: z.string(),
  state: z.string(),
  likes: z.number().int(),
  replies: z.number().int(),
})
const personSchema = z.object({
  code: z.string(),
  name: z.string(),
  nationality: z.string(),
  license: z.string(),
})
const irisMatchSchema = z.object({
  code: irisCode,
  dateTime: z.string(),
  homeCode: code,
  awayCode: code,
  state: z.string(),
  referee: personSchema.extend({ category: z.string() }),
  homeCoach: personSchema.extend({ teamCode: code }),
  awayCoach: personSchema.extend({ teamCode: code }),
  events: z.array(
    z.object({
      code: z.string(),
      type: z.string(),
      minute: z.number().int(),
      detail: z.string(),
    }),
  ),
})

function token(authorization: string | undefined) {
  if (!authorization) throw new ApiError('UNAUTHENTICATED')
  return authorization.slice('Bearer '.length)
}

export async function registerDataRoutes(
  app: FastifyInstance,
  data: DataService,
  auth: AuthService,
) {
  await app.register(async (instance) => {
    const routes = instance.withTypeProvider<ZodTypeProvider>()
    routes.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-store')
    })
    const user = (
      authorization: string | undefined,
      log: Parameters<AuthService['authorize']>[1],
      role?: 'admin',
    ) => auth.authorize(token(authorization), log, role)

    routes.get(
      '/equipos/:codigo',
      {
        schema: {
          tags: ['MongoDB'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ codigo: code }),
          querystring: z.strictObject({}),
          response: { 200: teamSchema, ...authResponses },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.team(request.params.codigo, { log: request.log })
      },
    )
    routes.get(
      '/equipos/:codigo/jugadores',
      {
        schema: {
          tags: ['MongoDB'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ codigo: code }),
          querystring: z.strictObject({
            page,
            limit: limit.pipe(z.number().max(50)),
          }),
          response: {
            200: z.object({
              items: z.array(playerSchema),
              total: z.number().int(),
              page: z.number().int(),
              limit: z.number().int(),
            }),
            ...authResponses,
          },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.players(
          request.params.codigo,
          request.query.page,
          request.query.limit,
          { log: request.log },
        )
      },
    )
    routes.get(
      '/partidos/:id',
      {
        schema: {
          tags: ['Neo4j', 'MongoDB'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ id: matchId }),
          querystring: z.strictObject({}),
          response: {
            200: z.object({
              id: matchId,
              date: z.string(),
              time: z.string(),
              phase: z.string(),
              homeCode: code,
              awayCode: code,
              venue: z.object({
                id: z.string(),
                name: z.string(),
                city: z.string(),
                country: z.string(),
                region: z.string(),
              }),
              home: teamSchema,
              away: teamSchema,
            }),
            ...authResponses,
          },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.match(request.params.id, { log: request.log })
      },
    )
    routes.get(
      '/partidos/:id/eventos',
      {
        schema: {
          tags: ['Neo4j'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ id: matchId }),
          querystring: z.strictObject({ limit }),
          response: {
            200: z.object({
              items: z.array(eventSchema),
              limit: z.number().int(),
            }),
            ...authResponses,
          },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.events(request.params.id, request.query.limit, {
          log: request.log,
        })
      },
    )
    routes.get(
      '/partidos/:id/comentarios',
      {
        schema: {
          tags: ['Cassandra'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ id: matchId }),
          querystring: z.strictObject({
            minute: z.iso.datetime(),
            limit,
            cursor: commentCursorSchema.optional(),
          }),
          response: {
            200: z.object({
              items: z.array(commentSchema),
              nextCursor: z.string().nullable(),
            }),
            ...authResponses,
          },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.commentsPage(
          request.params.id,
          request.query.minute,
          request.query.limit,
          request.query.cursor,
          { log: request.log },
        )
      },
    )
    routes.post(
      '/partidos/:id/comentarios',
      {
        schema: {
          tags: ['Cassandra'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ id: matchId }),
          querystring: z.strictObject({}),
          body: z.strictObject({
            commentId: uuid,
            createdAt: z.iso.datetime(),
            content: z.string().trim().min(1).max(500),
          }),
          response: {
            201: z.object({
              commentId: uuid,
              createdAt: z.iso.datetime(),
              content: z.string(),
              matchId,
              user: z.object({ id: uuid, username: z.string() }),
              state: z.literal('visible'),
            }),
            ...authResponses,
          },
        },
      },
      async (request, reply) => {
        const current = await user(request.headers.authorization, {
          log: request.log,
        })
        const result = await data.createComment(
          request.params.id,
          request.body,
          current,
          { log: request.log },
        )
        return reply.code(201).send(result)
      },
    )
    routes.get(
      '/partidos/:id/estadisticas',
      {
        schema: {
          tags: ['InfluxDB'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ id: matchId }),
          querystring: z.strictObject({
            start: z.iso.datetime(),
            end: z.iso.datetime(),
          }),
          response: {
            200: z.object({
              matchId,
              start: z.iso.datetime(),
              end: z.iso.datetime(),
              teams: z.array(z.record(z.string(), z.unknown())),
            }),
            ...authResponses,
          },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.statisticsSummary(
          request.params.id,
          request.query.start,
          request.query.end,
          { log: request.log },
        )
      },
    )
    routes.get(
      '/partidos/:codigo/detalle',
      {
        schema: {
          tags: ['IRIS'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ codigo: irisCode }),
          querystring: z.strictObject({}),
          response: { 200: irisMatchSchema, ...authResponses },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log })
        return data.objectDetail(request.params.codigo, { log: request.log })
      },
    )
    routes.patch(
      '/partidos/:codigo/estado',
      {
        schema: {
          tags: ['IRIS'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ codigo: irisCode }),
          querystring: z.strictObject({}),
          body: z.strictObject({ state: z.enum(['EnJuego', 'Finalizado']) }),
          response: { 200: irisMatchSchema, ...authResponses },
        },
      },
      async (request) => {
        await user(request.headers.authorization, { log: request.log }, 'admin')
        return data.changeState(request.params.codigo, request.body.state, {
          log: request.log,
        })
      },
    )
    routes.post(
      '/partidos/:codigo/eventos',
      {
        schema: {
          tags: ['IRIS'],
          security: [{ bearerSession: [] }],
          headers: sessionHeadersSchema,
          params: z.object({ codigo: irisCode }),
          querystring: z.strictObject({}),
          body: z.strictObject({
            code: z.string().regex(/^EVT-[A-Z0-9-]{1,40}$/),
            type: z.enum(['Gol', 'TarjetaAmarilla', 'TarjetaRoja', 'Cambio']),
            minute: z.number().int().min(0).max(130),
            detail: z.string().max(250).default(''),
          }),
          response: { 201: irisMatchSchema, ...authResponses },
        },
      },
      async (request, reply) => {
        await user(request.headers.authorization, { log: request.log }, 'admin')
        const result = await data.addObjectEvent(
          request.params.codigo,
          request.body,
          { log: request.log },
        )
        return reply.code(201).send(result)
      },
    )
  })
}
