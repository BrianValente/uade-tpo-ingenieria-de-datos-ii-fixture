import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
} from 'fastify-type-provider-zod'

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Fixture 2030 API',
        version: '0.1.0',
        description:
          'Base del Hito 10. El estado HTTP no comprueba la conectividad de las bases NoSQL.',
      },
      servers: [
        { url: '/', description: 'Servidor que publica esta documentación' },
      ],
      tags: [{ name: 'Sistema', description: 'Estado del proceso HTTP.' }],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })
}
