import { isIP } from 'node:net'
import { z } from 'zod'

const hostname = z
  .string()
  .refine(
    (value) =>
      isIP(value) !== 0 || /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(value),
  )

const credentials = {
  MONGO_HOST: hostname.default('127.0.0.1'),
  MONGO_PORT: z.coerce.number().int().min(1).max(65535).default(27017),
  MONGO_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('fixture2030'),
  MONGO_ROOT_USERNAME: z.string().default(''),
  MONGO_ROOT_PASSWORD: z.string().default(''),
  MONGO_AUTH_SOURCE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('admin'),
  DEPENDENCY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(2000),
}

const authEnvironmentSchema = z
  .object({
    ...credentials,
    REDIS_HOST: hostname.default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    REDIS_USERNAME: z.string().default(''),
    REDIS_PASSWORD: z.string().default(''),
    REDIS_DATABASE: z.coerce.number().int().min(0).max(15).default(0),
    API_REDIS_SCOPE: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .default('api'),
  })
  .refine(
    (input) =>
      Boolean(input.MONGO_ROOT_USERNAME) === Boolean(input.MONGO_ROOT_PASSWORD),
    {
      path: ['MONGO_ROOT_PASSWORD'],
      message: 'Configurar usuario y contraseña juntos.',
    },
  )

const seedSchema = z
  .object({
    API_SEED_ADMIN_PASSWORD: z.string().min(16).max(128),
    API_SEED_USER_PASSWORD: z.string().min(16).max(128),
  })
  .refine(
    (input) => input.API_SEED_ADMIN_PASSWORD !== input.API_SEED_USER_PASSWORD,
    {
      path: ['API_SEED_USER_PASSWORD'],
      message: 'Usar contraseñas distintas.',
    },
  )

export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>
export type SeedPasswords = z.infer<typeof seedSchema>

function parse<S extends z.ZodType>(
  schema: S,
  input: NodeJS.ProcessEnv,
): z.infer<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ]
    throw new Error(`Configuración inválida: ${fields.join(', ')}`)
  }
  return result.data
}

export function readAuthEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): AuthEnvironment {
  return parse(authEnvironmentSchema, input)
}

export function readSeedPasswords(
  input: NodeJS.ProcessEnv = process.env,
): SeedPasswords {
  return parse(seedSchema, input)
}
