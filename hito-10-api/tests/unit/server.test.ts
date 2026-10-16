import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiError } from '../../src/app/errors/api-error.js'
import { errorSchema } from '../../src/app/schemas.js'
import { buildServer } from '../../src/app/server.js'
import { readEnvironment } from '../../src/config/environment.js'

describe('Contrato HTTP de la base', () => {
  let app: Awaited<ReturnType<typeof buildServer>>

  beforeEach(async () => {
    app = await buildServer(readEnvironment({ API_LOG_LEVEL: 'silent' }))
  })
  afterEach(async () => {
    await app.close()
  })

  it('sirve Swagger UI y publica solo las operaciones reales', async () => {
    const ui = await app.inject('/docs/')
    const contract = await app.inject('/docs/json')
    const health = await app.inject('/health')
    expect(ui.statusCode).toBe(200)
    expect(ui.body).toContain('swagger-ui')
    expect(contract.statusCode).toBe(200)
    const specification = contract.json()
    expect(Object.keys(specification.paths).sort()).toEqual([
      '/auth/login',
      '/auth/session',
      '/health',
    ])
    expect(specification.paths['/health'].get.responses).toHaveProperty('200')
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ status: 'ok', service: 'fixture2030-api' })
    expect(app.server.listening).toBe(false)
  })

  it('genera UUID propios y correlaciona el error con el header', async () => {
    const first = await app.inject({
      url: '/no-existe?password=secreto',
      headers: { 'x-request-id': 'dato-no-confiable' },
    })
    const second = await app.inject('/no-existe')
    expect(first.statusCode).toBe(404)
    expect(errorSchema.safeParse(first.json()).success).toBe(true)
    expect(first.json().requestId).toBe(first.headers['x-request-id'])
    expect(first.headers['x-request-id']).not.toBe(
      second.headers['x-request-id'],
    )
    expect(first.body).not.toContain('dato-no-confiable')
    expect(first.body).not.toContain('secreto')
  })

  it.each([
    { url: '/prueba/xx?limit=1', payload: { texto: 'válido' } },
    { url: '/prueba/ARG?limit=0', payload: { texto: 'válido' } },
    { url: '/prueba/ARG?limit=1', payload: { texto: '' } },
    { url: '/prueba/ARG?limit=1', payload: { texto: 'válido', rol: 'admin' } },
  ])(
    'valida ruta, query y cuerpo antes de ejecutar el caso de uso: $url',
    async (input) => {
      const execute = vi.fn(() => ({ ok: true }))
      app.post('/prueba/:codigo', {
        schema: {
          params: z.object({ codigo: z.string().regex(/^[A-Z]{3}$/) }),
          querystring: z.object({
            limit: z.coerce.number().int().min(1).max(100),
          }),
          body: z.strictObject({ texto: z.string().min(1).max(500) }),
          response: { 200: z.object({ ok: z.boolean() }), 400: errorSchema },
        },
        handler: async () => execute(),
      })
      const response = await app.inject({ method: 'POST', ...input })
      expect(response.statusCode).toBe(400)
      expect(response.json().code).toBe('VALIDATION_ERROR')
      expect(execute).not.toHaveBeenCalled()
    },
  )

  it('rechaza JSON mal formado, cuerpos grandes y tipos no admitidos', async () => {
    const execute = vi.fn()
    app.post('/prueba', async () => execute())
    const malformed = await app.inject({
      method: 'POST',
      url: '/prueba',
      headers: { 'content-type': 'application/json' },
      payload: '{"password":"secreto"',
    })
    const large = await app.inject({
      method: 'POST',
      url: '/prueba',
      payload: { texto: 'x'.repeat(20000) },
    })
    const unsupported = await app.inject({
      method: 'POST',
      url: '/prueba',
      headers: { 'content-type': 'application/xml' },
      payload: '<password>secreto</password>',
    })
    for (const [response, status] of [
      [malformed, 400],
      [large, 413],
      [unsupported, 415],
    ] as const) {
      expect(response.statusCode).toBe(status)
      expect(errorSchema.safeParse(response.json()).success).toBe(true)
      expect(response.body).not.toContain('secreto')
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('distingue una lista vacía válida de una dependencia fallida simulada', async () => {
    app.get('/vacio', async () => ({ items: [] }))
    app.get('/dependencia', async () => {
      throw new ApiError('DEPENDENCY_UNAVAILABLE')
    })
    const empty = await app.inject('/vacio')
    const unavailable = await app.inject('/dependencia')
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ items: [] })
    expect(unavailable.statusCode).toBe(503)
    expect(unavailable.json().code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(errorSchema.safeParse(unavailable.json()).success).toBe(true)
  })

  it.each([
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['CONFLICT', 409],
  ] as const)('traduce %s al código HTTP %s', async (code, status) => {
    app.get('/prueba', async () => {
      throw new ApiError(code)
    })
    const response = await app.inject('/prueba')
    expect(response.statusCode).toBe(status)
    expect(response.json().code).toBe(code)
  })

  it('oculta mensajes de errores inesperados aunque traigan un statusCode', async () => {
    app.get('/prueba', async () => {
      throw Object.assign(new Error('mongodb://admin:secreto@host/interna'), {
        statusCode: 503,
      })
    })
    const response = await app.inject('/prueba')
    expect(response.statusCode).toBe(500)
    expect(response.json().code).toBe('INTERNAL_ERROR')
    expect(response.body).not.toContain('secreto')
    expect(response.body).not.toContain('mongodb')
  })

  it('aplica el esquema de salida y no publica campos internos adicionales', async () => {
    app.get('/prueba', {
      schema: { response: { 200: z.object({ codigo: z.string() }) } },
      handler: async () => ({ codigo: 'ARG', passwordHash: 'hash-interno' }),
    })
    const response = await app.inject('/prueba')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ codigo: 'ARG' })
  })

  it('devuelve un error seguro si la respuesta incumple el esquema', async () => {
    app.get('/prueba', {
      schema: {
        response: { 200: z.object({ codigo: z.string() }), 500: errorSchema },
      },
      // Se fuerza el fallo de contrato sin eludir la comprobación de tipos.
      handler: async (_request, reply) =>
        reply.send(JSON.parse('{"codigo":42}')),
    })
    const response = await app.inject('/prueba')
    expect(response.statusCode).toBe(500)
    expect(response.json().code).toBe('INTERNAL_ERROR')
    expect(errorSchema.safeParse(response.json()).success).toBe(true)
  })
})
