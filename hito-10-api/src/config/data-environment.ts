import { isIP } from 'node:net'
import { z } from 'zod'

const hostname = z
  .string()
  .refine(
    (value) =>
      isIP(value) !== 0 || /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(value),
  )

const schema = z
  .object({
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
    NEO4J_HOST: hostname.default('127.0.0.1'),
    NEO4J_BOLT_PORT: z.coerce.number().int().min(1).max(65535).default(7687),
    NEO4J_USERNAME: z.string().default('neo4j'),
    NEO4J_PASSWORD: z.string().default(''),
    CASSANDRA_HOST: hostname.default('127.0.0.1'),
    CASSANDRA_PORT: z.coerce.number().int().min(1).max(65535).default(9042),
    CASSANDRA_DATACENTER: z.string().min(1).max(80).default('datacenter1'),
    CASSANDRA_KEYSPACE: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
      .default('fixture2030_comentarios'),
    INFLUXDB_URL: z.url().default('http://127.0.0.1:8181'),
    INFLUXDB_TOKEN: z.string().default(''),
    INFLUXDB_DATABASE: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default('fixture2030_h8_lab_detalle'),
    IRIS_HOST: hostname.default('127.0.0.1'),
    IRIS_PORT: z.coerce.number().int().min(1).max(65535).default(1972),
    IRIS_NAMESPACE: z
      .string()
      .regex(/^[a-zA-Z%][a-zA-Z0-9_-]*$/)
      .default('USER'),
    IRIS_USERNAME: z.string().default(''),
    IRIS_PASSWORD: z.string().default(''),
    DEPENDENCY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(10000)
      .default(2000),
  })
  .refine(
    (input) =>
      Boolean(input.MONGO_ROOT_USERNAME) === Boolean(input.MONGO_ROOT_PASSWORD),
    { path: ['MONGO_ROOT_PASSWORD'] },
  )
  .refine(
    (input) => Boolean(input.IRIS_USERNAME) === Boolean(input.IRIS_PASSWORD),
    { path: ['IRIS_PASSWORD'] },
  )

export type DataEnvironment = z.infer<typeof schema>

export function readDataEnvironment(
  input: NodeJS.ProcessEnv = process.env,
): DataEnvironment {
  const result = schema.safeParse(input)
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ]
    throw new Error(`Configuración inválida: ${fields.join(', ')}`)
  }
  return result.data
}
