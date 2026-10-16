const errors = {
  VALIDATION_ERROR: { status: 400, message: 'La entrada no es válida.' },
  UNAUTHENTICATED: { status: 401, message: 'Se requiere una sesión vigente.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Credenciales incorrectas.' },
  FORBIDDEN: { status: 403, message: 'La operación no está permitida.' },
  RESOURCE_NOT_FOUND: { status: 404, message: 'El recurso no existe.' },
  CONFLICT: { status: 409, message: 'El estado actual impide la operación.' },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: 'El cuerpo supera el tamaño permitido.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: 'El tipo de contenido no está permitido.',
  },
  DEPENDENCY_UNAVAILABLE: {
    status: 503,
    message: 'Una dependencia no está disponible.',
  },
  REQUEST_TIMEOUT: {
    status: 503,
    message: 'La operación superó el tiempo de espera.',
  },
  INTERNAL_ERROR: { status: 500, message: 'Ocurrió un error interno.' },
} as const

export type ErrorCode = keyof typeof errors

export class ApiError extends Error {
  readonly statusCode: number

  constructor(readonly code: ErrorCode) {
    super(errors[code].message)
    this.name = 'ApiError'
    this.statusCode = errors[code].status
  }
}
