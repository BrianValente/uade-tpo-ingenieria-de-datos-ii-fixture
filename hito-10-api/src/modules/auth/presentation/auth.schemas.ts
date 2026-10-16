import { z } from 'zod'

export const userSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    role: z.enum(['user', 'admin']),
  })
  .meta({ id: 'User' })

export const loginBodySchema = z.strictObject({
  username: z.string().regex(/^[a-z][a-z0-9._-]{2,31}$/),
  password: z.string().min(1).max(128),
})

export const loginResponseSchema = z.object({
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  tokenType: z.literal('Bearer'),
  expiresIn: z.literal(1800),
  user: userSchema,
})

export const sessionResponseSchema = z.object({
  user: userSchema,
  createdAt: z.iso.datetime(),
  lastActivity: z.iso.datetime(),
  ttlSeconds: z.number().int().min(1).max(1800),
})

export const sessionHeadersSchema = z.object({
  authorization: z
    .string()
    .regex(/^Bearer [A-Za-z0-9_-]{43}$/i)
    .optional(),
})
