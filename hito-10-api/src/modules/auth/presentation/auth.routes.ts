import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { ApiError } from '../../../app/errors/api-error.js'
import { errorSchema } from '../../../app/schemas.js'
import type { AuthService } from '../application/auth.service.js'
import {
  loginBodySchema,
  loginResponseSchema,
  sessionHeadersSchema,
  sessionResponseSchema,
} from './auth.schemas.js'

function tokenFrom(authorization: string | undefined) {
  if (!authorization) throw new ApiError('UNAUTHENTICATED')
  return authorization.slice('Bearer '.length)
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
) {
  await app.register(async (instance) => {
    const routes = instance.withTypeProvider<ZodTypeProvider>()
    routes.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-store')
    })

    routes.post(
      '/auth/login',
      {
        schema: {
          tags: ['Autenticación'],
          operationId: 'login',
          summary: 'Inicia una sesión de laboratorio',
          description:
            'Valida Argon2id contra MongoDB y crea una sesión Redis de 1800 segundos. Cada login crea otra sesión. El token se muestra solo en esta respuesta.',
          querystring: z.strictObject({}),
          body: loginBodySchema,
          response: {
            200: loginResponseSchema,
            400: errorSchema,
            401: errorSchema,
            413: errorSchema,
            415: errorSchema,
            500: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (request) => service.login(request.body, { log: request.log }),
    )

    routes.get(
      '/auth/session',
      {
        schema: {
          tags: ['Autenticación'],
          operationId: 'getCurrentSession',
          summary: 'Consulta la sesión actual',
          description:
            'Lee un hash Redis con TTL positivo. No renueva el vencimiento. Una sesión ausente o expirada produce 401; Redis inaccesible produce 503.',
          security: [{ bearerSession: [] }],
          querystring: z.strictObject({}),
          headers: sessionHeadersSchema,
          response: {
            200: sessionResponseSchema,
            400: errorSchema,
            401: errorSchema,
            500: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (request) =>
        service.currentSession(tokenFrom(request.headers.authorization), {
          log: request.log,
        }),
    )

    routes.delete(
      '/auth/session',
      {
        schema: {
          tags: ['Autenticación'],
          operationId: 'logout',
          summary: 'Cierra la sesión actual',
          description:
            'Elimina solo la sesión del token Bearer. Devuelve 204 aunque ya no exista: repetir el cierre es idempotente. No confirma el cierre si Redis falla.',
          security: [{ bearerSession: [] }],
          querystring: z.strictObject({}),
          headers: sessionHeadersSchema,
          response: {
            204: z.null().describe('Sesión cerrada o ya ausente.'),
            400: errorSchema,
            401: errorSchema,
            500: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (request, reply) => {
        await service.logout(tokenFrom(request.headers.authorization), {
          log: request.log,
        })
        return reply.code(204).send(null)
      },
    )
  })
}
