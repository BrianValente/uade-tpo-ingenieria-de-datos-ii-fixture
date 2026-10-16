import { z } from 'zod'

const userExample = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'fixture-user',
  role: 'user' as const,
}

export const userSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    role: z.enum(['user', 'admin']),
  })
  .meta({ id: 'User', example: userExample })

export const loginBodySchema = z
  .strictObject({
    username: z.string().regex(/^[a-z][a-z0-9._-]{2,31}$/),
    password: z.string().min(1).max(128),
  })
  .meta({
    examples: [
      {
        username: 'fixture-user',
        password: '<usar API_SEED_USER_PASSWORD del .env local>',
      },
    ],
    description:
      'El password del ejemplo es un marcador, no una credencial utilizable.',
  })

export const loginResponseSchema = z
  .object({
    accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    tokenType: z.literal('Bearer'),
    expiresIn: z.literal(1800),
    user: userSchema,
  })
  .meta({
    examples: [
      {
        accessToken: 'EJEMPLO_SIN_VALIDEZ_'.padEnd(43, '_'),
        tokenType: 'Bearer',
        expiresIn: 1800,
        user: userExample,
      },
    ],
    description:
      'Respuesta ilustrativa. El token de ejemplo no corresponde a una sesión.',
  })

export const sessionResponseSchema = z
  .object({
    user: userSchema,
    createdAt: z.iso.datetime(),
    lastActivity: z.iso.datetime(),
    ttlSeconds: z.number().int().min(1).max(1800),
  })
  .meta({
    examples: [
      {
        user: userExample,
        createdAt: '2030-06-13T20:00:00.000000Z',
        lastActivity: '2030-06-13T20:00:00.000000Z',
        ttlSeconds: 1770,
      },
    ],
  })

export const sessionHeadersSchema = z.object({
  authorization: z
    .string()
    .regex(/^Bearer [A-Za-z0-9_-]{43}$/i)
    .optional(),
})
