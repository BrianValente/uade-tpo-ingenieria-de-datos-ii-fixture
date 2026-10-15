import { isIP } from 'node:net'
import { z } from 'zod'

const environmentSchema = z.object({
  API_HOST: z
    .string()
    .refine((value) => value === 'localhost' || isIP(value) !== 0)
    .default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  API_LOG_LEVEL: z
    .enum(['silent', 'error', 'warn', 'info', 'debug'])
    .default('info'),
  API_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120000)
    .default(10000),
  API_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1048576)
    .default(16384),
})

export type Environment = z.infer<typeof environmentSchema>

export function readEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(input)
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ]
    throw new Error(`Configuración inválida: ${fields.join(', ')}`)
  }
  return result.data
}
