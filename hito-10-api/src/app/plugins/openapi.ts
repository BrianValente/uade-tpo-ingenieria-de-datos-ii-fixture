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
          'API integrada del Fixture 2030. Los ejemplos son ilustrativos de laboratorio; no contienen credenciales ni tokens de sesión utilizables. Las escrituras dependen del estado actual del recurso.',
      },
      servers: [
        { url: '/', description: 'Servidor que publica esta documentación' },
      ],
      tags: [
        { name: 'Sistema', description: 'Estado del proceso HTTP.' },
        {
          name: 'Autenticación',
          description: 'Cuentas de laboratorio en MongoDB y sesiones Redis.',
        },
      ],
      components: {
        securitySchemes: {
          bearerSession: {
            type: 'http',
            scheme: 'bearer',
            description:
              'Token opaco recibido al iniciar sesión. No es un JWT.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: (input) => {
      const specification = jsonSchemaTransformObject(input)
      if ('openapi' in specification) {
        for (const path of Object.values(specification.paths ?? {})) {
          for (const method of [
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'head',
            'options',
            'trace',
          ] as const) {
            const response = path?.[method]?.responses?.['204']
            if (response && !('$ref' in response)) delete response.content
          }
        }
      }
      return specification
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })
}
