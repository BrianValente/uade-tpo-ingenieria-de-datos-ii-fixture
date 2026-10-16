import type { FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

import { ApiError, type ErrorCode } from './api-error.js'

const frameworkErrors: Readonly<Record<string, ErrorCode>> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'VALIDATION_ERROR',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'VALIDATION_ERROR',
  FST_ERR_VALIDATION: 'VALIDATION_ERROR',
  FST_ERR_CTP_BODY_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  FST_ERR_HANDLER_TIMEOUT: 'REQUEST_TIMEOUT',
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    let publicError = new ApiError('INTERNAL_ERROR')
    if (error instanceof ApiError) {
      publicError = error
    } else if (hasZodFastifySchemaValidationErrors(error)) {
      publicError = new ApiError('VALIDATION_ERROR')
    } else if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      const code = Object.hasOwn(frameworkErrors, error.code)
        ? frameworkErrors[error.code]
        : undefined
      if (code) publicError = new ApiError(code)
    }

    // Los mensajes y las causas de drivers pueden incluir URI o valores sensibles.
    request.log[publicError.statusCode >= 500 ? 'error' : 'warn'](
      { code: publicError.code, statusCode: publicError.statusCode },
      'Solicitud rechazada',
    )
    if (publicError.statusCode === 401)
      reply.header('www-authenticate', 'Bearer realm="fixture2030"')
    return reply.code(publicError.statusCode).send({
      code: publicError.code,
      message: publicError.message,
      requestId: request.id,
    })
  })

  app.setNotFoundHandler(() => {
    throw new ApiError('RESOURCE_NOT_FOUND')
  })
}
