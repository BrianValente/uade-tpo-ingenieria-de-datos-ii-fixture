import { randomUUID } from 'node:crypto'
import type { Writable } from 'node:stream'
import Fastify, { LogController } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { Environment } from '../config/environment.js'
import {
  createAuthModule,
  type AuthModule,
} from '../modules/auth/auth.module.js'
import { registerAuthRoutes } from '../modules/auth/presentation/auth.routes.js'
import {
  createDataModule,
  type DataModule,
} from '../modules/data/data.module.js'
import { registerDataRoutes } from '../modules/data/presentation/data.routes.js'
import { registerErrorHandler } from './errors/error-handler.js'
import { registerOpenApi } from './plugins/openapi.js'
import { errorSchema } from './schemas.js'

export async function buildServer(
  config: Environment,
  logStream?: Writable,
  auth: AuthModule = createAuthModule(),
  data: DataModule = createDataModule(),
) {
  const app = Fastify({
    logger: {
      level: config.API_LOG_LEVEL,
      ...(logStream ? { stream: logStream } : {}),
    },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    requestTimeout: config.API_REQUEST_TIMEOUT_MS,
    bodyLimit: config.API_BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? '<ruta-no-registrada>',
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'Solicitud finalizada',
    )
  })

  await registerOpenApi(app)
  app.addHook('onClose', async () => {
    await Promise.all([auth.close(), data.close()])
  })
  await registerAuthRoutes(app, auth.service)
  await registerDataRoutes(app, data.service, auth.service)
  app.get(
    '/health',
    {
      schema: {
        tags: ['Sistema'],
        summary: 'Comprueba que el proceso HTTP responde',
        description:
          'No consulta bases ni demuestra que los adaptadores estén disponibles.',
        operationId: 'getHttpHealth',
        querystring: z.strictObject({}),
        response: {
          200: z.object({
            status: z.literal('ok'),
            service: z.literal('fixture2030-api'),
          }),
          400: errorSchema,
          500: errorSchema,
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'fixture2030-api' as const,
    }),
  )

  return app
}
